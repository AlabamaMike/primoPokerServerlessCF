import { ChatMessage } from '../components/Chat/types';

interface CachedMessage {
  sanitized: string;
  timestamp: number;
}

export class MessageCache {
  private cache: Map<string, CachedMessage> = new Map();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(maxSize = 1000, ttlMinutes = 30) {
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  /**
   * Get a cached sanitized message
   */
  get(messageId: string): string | null {
    const cached = this.cache.get(messageId);
    
    if (!cached) {
      return null;
    }

    // Check if cache entry has expired
    if (Date.now() - cached.timestamp > this.ttl) {
      this.cache.delete(messageId);
      return null;
    }

    return cached.sanitized;
  }

  /**
   * Cache a sanitized message
   */
  set(messageId: string, sanitized: string): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(messageId, {
      sanitized,
      timestamp: Date.now()
    });
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];

    this.cache.forEach((value, key) => {
      if (now - value.timestamp > this.ttl) {
        keysToDelete.push(key);
      }
    });

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Start periodic cleanup
   */
  startCleanupInterval(intervalMinutes = 5): void {
    this.stopCleanupInterval(); // Clear any existing interval
    this.cleanupIntervalId = setInterval(() => {
      this.cleanup();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanupInterval(): void {
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }
  }

  /**
   * Destroy the cache and clean up resources
   */
  destroy(): void {
    this.stopCleanupInterval();
    this.clear();
  }
}

// Export a factory function instead of a singleton
export const createMessageCache = (maxSize = 1000, ttlMinutes = 30): MessageCache => {
  const cache = new MessageCache(maxSize, ttlMinutes);
  cache.startCleanupInterval();
  return cache;
};