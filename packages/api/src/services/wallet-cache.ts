/**
 * Wallet Cache Service
 * 
 * Provides caching layer for wallet operations using Cloudflare KV
 * with optimistic updates and automatic invalidation
 */

import { PlayerWallet } from '@primo-poker/shared';
import { logger } from '@primo-poker/core';
import { WalletTransaction } from '@primo-poker/persistence';

export interface WalletCacheConfig {
  ttlSeconds: number;
  staleWhileRevalidateSeconds: number;
  negativeCacheTtlSeconds: number;
}

const DEFAULT_CONFIG: WalletCacheConfig = {
  ttlSeconds: 300, // 5 minutes
  staleWhileRevalidateSeconds: 60, // 1 minute
  negativeCacheTtlSeconds: 30 // 30 seconds for cache misses
};

interface CachedTransactionHistory {
  transactions: WalletTransaction[];
  timestamp: number;
  cursor?: string;
}

export class WalletCacheService {
  private kv: KVNamespace;
  private config: WalletCacheConfig;
  private pendingUpdates: Map<string, Promise<any>> = new Map();
  private readonly KV_TIMEOUT_MS = 5000; // 5 second timeout for KV operations

  constructor(kv: KVNamespace, config: Partial<WalletCacheConfig> = {}) {
    this.kv = kv;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Wrap a promise with a timeout
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number = this.KV_TIMEOUT_MS): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => 
        setTimeout(() => reject(new Error(`KV operation timed out after ${timeoutMs}ms`)), timeoutMs)
      )
    ]);
  }

  /**
   * Get cached wallet data with stale-while-revalidate support
   */
  async getCachedWallet(playerId: string): Promise<PlayerWallet | null> {
    const key = this.getWalletKey(playerId);
    
    try {
      const cached = await this.withTimeout(
        this.kv.get(key, { type: 'json' })
      ) as PlayerWallet | null;
      
      if (cached) {
        logger.debug('Wallet cache hit', { playerId });
        return cached;
      }
      
      logger.debug('Wallet cache miss', { playerId });
      return null;
    } catch (error) {
      logger.error('Error reading wallet cache', error as Error, { playerId });
      return null;
    }
  }

  /**
   * Set wallet data in cache with TTL
   */
  async setCachedWallet(wallet: PlayerWallet): Promise<void> {
    const key = this.getWalletKey(wallet.playerId);
    
    try {
      await this.withTimeout(
        this.kv.put(key, JSON.stringify(wallet), {
          expirationTtl: this.config.ttlSeconds,
          metadata: {
            lastUpdated: Date.now(),
            version: 1
          }
        })
      );
      
      logger.debug('Wallet cached', { playerId: wallet.playerId });
    } catch (error) {
      logger.error('Error caching wallet', error as Error, { playerId: wallet.playerId });
    }
  }

  /**
   * Optimistic update with rollback capability
   */
  async optimisticUpdate(
    playerId: string, 
    updateFn: (wallet: PlayerWallet) => PlayerWallet,
    actualUpdateFn: () => Promise<PlayerWallet>
  ): Promise<{ wallet: PlayerWallet; rollback: () => Promise<void> }> {
    // Get current wallet from cache
    const cachedWallet = await this.getCachedWallet(playerId);
    if (!cachedWallet) {
      // No cached data, perform actual update
      const actualWallet = await actualUpdateFn();
      await this.setCachedWallet(actualWallet);
      return {
        wallet: actualWallet,
        rollback: async () => {
          await this.invalidateWallet(playerId);
        }
      };
    }

    // Apply optimistic update
    const optimisticWallet = updateFn({ ...cachedWallet });
    await this.setCachedWallet(optimisticWallet);

    // Store original for rollback
    const originalWallet = cachedWallet;

    // Perform actual update in background
    const pendingUpdate = actualUpdateFn()
      .then(async (actualWallet) => {
        // Update cache with actual result
        await this.setCachedWallet(actualWallet);
        return actualWallet;
      })
      .catch(async (error) => {
        // Rollback on error
        logger.error('Optimistic update failed, rolling back', error, { playerId });
        await this.setCachedWallet(originalWallet);
        throw error;
      })
      .finally(() => {
        this.pendingUpdates.delete(playerId);
      });

    this.pendingUpdates.set(playerId, pendingUpdate);

    return {
      wallet: optimisticWallet,
      rollback: async () => {
        await this.setCachedWallet(originalWallet);
      }
    };
  }

  /**
   * Invalidate cached wallet data
   */
  async invalidateWallet(playerId: string): Promise<void> {
    const key = this.getWalletKey(playerId);
    
    try {
      await this.withTimeout(this.kv.delete(key));
      logger.debug('Wallet cache invalidated', { playerId });
    } catch (error) {
      logger.error('Error invalidating wallet cache', error as Error, { playerId });
    }
  }

  /**
   * Batch get wallets with single KV operation
   */
  async getBatchWallets(playerIds: string[]): Promise<Map<string, PlayerWallet | null>> {
    const results = new Map<string, PlayerWallet | null>();
    
    if (playerIds.length === 0) return results;

    try {
      // Cloudflare KV doesn't support true batch operations yet,
      // but we can use Promise.all for concurrent requests
      const promises = playerIds.map(async (playerId) => {
        const wallet = await this.getCachedWallet(playerId);
        return { playerId, wallet };
      });

      const batchResults = await Promise.all(promises);
      
      for (const { playerId, wallet } of batchResults) {
        results.set(playerId, wallet);
      }
    } catch (error) {
      logger.error('Error in batch wallet fetch', error as Error);
    }

    return results;
  }

  /**
   * Warm cache with frequently accessed wallets
   */
  async warmCache(playerIds: string[], fetchFn: (playerId: string) => Promise<PlayerWallet>): Promise<void> {
    const uncachedIds: string[] = [];
    
    // Check which wallets are not cached
    for (const playerId of playerIds) {
      const cached = await this.getCachedWallet(playerId);
      if (!cached) {
        uncachedIds.push(playerId);
      }
    }

    // Fetch and cache missing wallets
    if (uncachedIds.length > 0) {
      const promises = uncachedIds.map(async (playerId) => {
        try {
          const wallet = await fetchFn(playerId);
          await this.setCachedWallet(wallet);
        } catch (error) {
          logger.error('Error warming cache for player', error as Error, { playerId });
        }
      });

      await Promise.all(promises);
      logger.info('Cache warmed', { count: uncachedIds.length });
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    pendingUpdates: number;
    cacheKeys: string[];
  }> {
    // Note: Cloudflare KV doesn't provide built-in stats,
    // so we track what we can locally
    return {
      pendingUpdates: this.pendingUpdates.size,
      cacheKeys: Array.from(this.pendingUpdates.keys())
    };
  }

  /**
   * Wait for all pending updates to complete
   */
  async waitForPendingUpdates(): Promise<void> {
    if (this.pendingUpdates.size === 0) return;

    await Promise.all(Array.from(this.pendingUpdates.values()));
  }

  /**
   * Cache transaction history with pagination support
   */
  async cacheTransactionHistory(
    playerId: string, 
    transactions: WalletTransaction[], 
    cursor?: string
  ): Promise<void> {
    const key = this.getTransactionKey(playerId, cursor);
    
    try {
      await this.withTimeout(
        this.kv.put(key, JSON.stringify({
          transactions,
          timestamp: Date.now(),
          cursor
        }), {
          expirationTtl: this.config.ttlSeconds
        })
      );
    } catch (error) {
      logger.error('Error caching transaction history', error as Error, { playerId });
    }
  }

  /**
   * Get cached transaction history
   */
  async getCachedTransactionHistory(
    playerId: string, 
    cursor?: string
  ): Promise<{ transactions: WalletTransaction[]; nextCursor?: string } | null> {
    const key = this.getTransactionKey(playerId, cursor);
    
    try {
      const cached = await this.withTimeout(
        this.kv.get(key, { type: 'json' })
      ) as CachedTransactionHistory | null;
      
      if (!cached) {
        return null;
      }
      
      return {
        transactions: cached.transactions,
        nextCursor: cached.cursor
      };
    } catch (error) {
      logger.error('Error reading transaction cache', error as Error, { playerId });
      return null;
    }
  }

  private getWalletKey(playerId: string): string {
    return `wallet:${playerId}`;
  }

  private getTransactionKey(playerId: string, cursor?: string): string {
    return cursor ? `transactions:${playerId}:${cursor}` : `transactions:${playerId}:latest`;
  }
}