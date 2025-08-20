/**
 * Wallet Rate Limiting Middleware
 * 
 * Provides specialized rate limiting for wallet operations
 * with different limits for different operation types
 */

import { IRequest } from 'itty-router';
import { logger } from '@primo-poker/core';

export interface WalletRateLimitConfig {
  windowMs: number;
  limits: {
    deposit: number;
    withdraw: number;
    transfer: number;
    buyIn: number;
    cashOut: number;
    balance: number;
    transactions: number;
  };
  keyGenerator?: (req: IRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

const DEFAULT_CONFIG: WalletRateLimitConfig = {
  windowMs: 60000, // 1 minute
  limits: {
    deposit: 3,
    withdraw: 2,
    transfer: 5,
    buyIn: 10,
    cashOut: 10,
    balance: 60,
    transactions: 30
  }
};

interface RateLimitEntry {
  count: number;
  resetAt: number;
  operations: Record<string, number>;
}

export class WalletRateLimiter {
  private config: WalletRateLimitConfig;
  private storage: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<WalletRateLimitConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Note: In Cloudflare Workers, we don't use setInterval
    // Cleanup happens on each request to avoid memory leaks
  }

  /**
   * Rate limiting middleware
   */
  middleware() {
    return async (request: IRequest & { user?: any }, env: any, ctx: any) => {
      // Perform cleanup on each request (10% chance to avoid overhead)
      if (Math.random() < 0.1) {
        this.cleanup();
      }

      // Skip if no user (will be caught by auth middleware)
      if (!request.user?.userId) {
        return;
      }

      const operationType = this.getOperationType(request);
      if (!operationType) {
        return; // Not a wallet operation
      }

      const key = this.config.keyGenerator 
        ? this.config.keyGenerator(request)
        : request.user.userId;

      const entry = this.getOrCreateEntry(key);
      const now = Date.now();

      // Reset if window expired
      if (now > entry.resetAt) {
        entry.count = 0;
        entry.operations = {};
        entry.resetAt = now + this.config.windowMs;
      }

      // Check operation-specific limit
      const operationCount = entry.operations[operationType] || 0;
      const limit = this.config.limits[operationType as keyof typeof this.config.limits];

      if (operationCount >= limit) {
        logger.warn('Wallet rate limit exceeded', {
          userId: request.user.userId,
          operation: operationType,
          count: operationCount,
          limit
        });

        return new Response(JSON.stringify({
          success: false,
          error: `Rate limit exceeded for ${operationType} operations`,
          retryAfter: Math.ceil((entry.resetAt - now) / 1000)
        }), {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor(entry.resetAt / 1000))
          }
        });
      }

      // Increment counters
      entry.count++;
      entry.operations[operationType] = operationCount + 1;

      // Add rate limit headers to request for later use
      (request as any).rateLimitInfo = {
        limit,
        remaining: limit - operationCount - 1,
        reset: Math.floor(entry.resetAt / 1000)
      };
    };
  }

  /**
   * Get operation type from request
   */
  private getOperationType(request: IRequest): string | null {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith('/deposit')) return 'deposit';
    if (path.endsWith('/withdraw')) return 'withdraw';
    if (path.endsWith('/transfer')) return 'transfer';
    if (path.endsWith('/buyin')) return 'buyIn';
    if (path.endsWith('/cashout')) return 'cashOut';
    if (path.endsWith('/balance')) return 'balance';
    if (path.endsWith('/transactions')) return 'transactions';
    
    return null;
  }

  /**
   * Get or create rate limit entry
   */
  private getOrCreateEntry(key: string): RateLimitEntry {
    let entry = this.storage.get(key);
    
    if (!entry) {
      entry = {
        count: 0,
        resetAt: Date.now() + this.config.windowMs,
        operations: {}
      };
      this.storage.set(key, entry);
    }
    
    return entry;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.storage) {
      if (now > entry.resetAt + this.config.windowMs) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.storage.delete(key);
    }

    if (expiredKeys.length > 0) {
      logger.debug('Cleaned up expired rate limit entries', { count: expiredKeys.length });
    }
  }

  /**
   * Reset rate limits for a specific user
   */
  reset(userId: string): void {
    this.storage.delete(userId);
  }

  /**
   * Get current rate limit status for a user
   */
  getStatus(userId: string): Record<string, { used: number; limit: number; remaining: number }> {
    const entry = this.storage.get(userId);
    const status: Record<string, { used: number; limit: number; remaining: number }> = {};

    for (const [operation, limit] of Object.entries(this.config.limits)) {
      const used = entry?.operations[operation] || 0;
      status[operation] = {
        used,
        limit,
        remaining: Math.max(0, limit - used)
      };
    }

    return status;
  }

  /**
   * Destroy the rate limiter and clear all storage
   */
  destroy(): void {
    // Clear all stored rate limit entries
    this.storage.clear();
  }
}

// Export singleton instance
export const enhancedWalletRateLimiter = new WalletRateLimiter({
  windowMs: 60000, // 1 minute
  limits: {
    deposit: 5,      // Allow 5 deposits per minute
    withdraw: 3,     // Allow 3 withdrawals per minute
    transfer: 10,    // Allow 10 transfers per minute
    buyIn: 20,       // Allow 20 buy-ins per minute
    cashOut: 20,     // Allow 20 cash-outs per minute
    balance: 120,    // Allow 120 balance checks per minute
    transactions: 60 // Allow 60 transaction history queries per minute
  }
});