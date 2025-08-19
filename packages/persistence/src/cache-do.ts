/**
 * Distributed Cache Durable Object
 * 
 * Provides Redis-like distributed caching system for performance optimization.
 * Supports TTL, LRU eviction, namespacing, and batch operations.
 */

import { logger } from '@primo-poker/core';
import { WorkerEnvironment } from '@primo-poker/shared';

export interface CacheEntry {
  value: any;
  ttl: number;
  createdAt: number;
  lastAccessed: number;
  namespace?: string;
}

export interface CacheOptions {
  ttl?: number; // Time to live in milliseconds
  namespace?: string; // Optional namespace for grouping
}

export interface CacheBatchOperation {
  key: string;
  value?: any;
  ttl?: number;
  namespace?: string;
}

export interface CacheStats {
  totalEntries: number;
  namespaceStats: Record<string, number>;
  memoryUsage: number;
  hitRate: number;
  evictions: number;
}

export class CacheDO {
  private state: DurableObjectState;
  private env: WorkerEnvironment;
  private cache: Map<string, CacheEntry> = new Map();
  private accessOrder: string[] = []; // For LRU tracking
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  
  // Configuration
  private readonly maxEntries = 10000;
  private readonly defaultTTL = 300000; // 5 minutes
  private readonly cleanupInterval = 60000; // 1 minute
  private persistCounter = 0; // For deterministic persistence
  private readonly persistInterval = 10; // Persist every 10 operations
  private memorySizeCache = 0; // Cache for memory size
  private memorySizeDirty = true; // Flag to recalculate memory size
  
  constructor(state: DurableObjectState, env: WorkerEnvironment) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    
    try {
      switch (url.pathname) {
        case '/get':
          return this.handleGet(request);
        case '/set':
          return this.handleSet(request);
        case '/delete':
          return this.handleDelete(request);
        case '/has':
          return this.handleHas(request);
        case '/clear':
          return this.handleClear(request);
        case '/batch':
          return this.handleBatch(request);
        case '/warm':
          return this.handleWarm(request);
        case '/stats':
          return this.handleStats();
        default:
          return new Response('Not Found', { status: 404 });
      }
    } catch (error) {
      logger.error('Cache operation error', error as Error);
      return new Response(JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  private async handleGet(request: Request): Promise<Response> {
    const { key, namespace } = await request.json();
    const fullKey = this.getFullKey(key, namespace);
    
    const entry = this.cache.get(fullKey);
    if (!entry) {
      this.misses++;
      this.trackMetric('miss', namespace);
      return new Response(JSON.stringify({ value: null, found: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.cache.delete(fullKey);
      this.removeFromAccessOrder(fullKey);
      this.misses++;
      this.trackMetric('miss', namespace);
      return new Response(JSON.stringify({ value: null, found: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update access time for LRU
    entry.lastAccessed = Date.now();
    this.updateAccessOrder(fullKey);
    this.hits++;

    // Track metrics
    this.trackMetric('hit', namespace);

    return new Response(JSON.stringify({ value: entry.value, found: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleSet(request: Request): Promise<Response> {
    const { key, value, ttl, namespace } = await request.json();
    const fullKey = this.getFullKey(key, namespace);
    
    // Check if we need to evict entries
    if (this.cache.size >= this.maxEntries && !this.cache.has(fullKey)) {
      this.evictLRU();
    }

    const entry: CacheEntry = {
      value,
      ttl: ttl || this.defaultTTL,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      namespace
    };

    this.cache.set(fullKey, entry);
    this.updateAccessOrder(fullKey);
    this.trackMetric('set', namespace);
    this.memorySizeDirty = true; // Mark memory size for recalculation

    // Persist deterministically every N operations
    this.persistCounter++;
    if (this.persistCounter >= this.persistInterval) {
      await this.persistState();
      this.persistCounter = 0;
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleDelete(request: Request): Promise<Response> {
    const { key, namespace } = await request.json();
    const fullKey = this.getFullKey(key, namespace);
    
    const deleted = this.cache.delete(fullKey);
    if (deleted) {
      this.removeFromAccessOrder(fullKey);
      this.trackMetric('delete', namespace);
      this.memorySizeDirty = true; // Mark memory size for recalculation
    }

    return new Response(JSON.stringify({ deleted }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleHas(request: Request): Promise<Response> {
    const { key, namespace } = await request.json();
    const fullKey = this.getFullKey(key, namespace);
    
    const entry = this.cache.get(fullKey);
    const exists = entry ? !this.isExpired(entry) : false;

    return new Response(JSON.stringify({ exists }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleClear(request: Request): Promise<Response> {
    const { namespace } = await request.json();
    
    if (namespace) {
      // Clear only entries in the namespace
      for (const [key, entry] of this.cache) {
        if (entry.namespace === namespace) {
          this.cache.delete(key);
          this.removeFromAccessOrder(key);
        }
      }
    } else {
      // Clear all
      this.cache.clear();
      this.accessOrder = [];
    }
    this.memorySizeDirty = true; // Mark memory size for recalculation

    await this.persistState();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleBatch(request: Request): Promise<Response> {
    const { operations } = await request.json();
    const results: any[] = [];

    for (const op of operations) {
      if (op.value !== undefined) {
        // Set operation
        const fullKey = this.getFullKey(op.key, op.namespace);
        
        if (this.cache.size >= this.maxEntries && !this.cache.has(fullKey)) {
          this.evictLRU();
        }

        const entry: CacheEntry = {
          value: op.value,
          ttl: op.ttl || this.defaultTTL,
          createdAt: Date.now(),
          lastAccessed: Date.now(),
          namespace: op.namespace
        };

        this.cache.set(fullKey, entry);
        this.updateAccessOrder(fullKey);
        this.trackMetric('set', op.namespace);
        this.memorySizeDirty = true; // Mark memory size for recalculation
        results.push({ key: op.key, success: true });
      } else {
        // Get operation
        const fullKey = this.getFullKey(op.key, op.namespace);
        const entry = this.cache.get(fullKey);
        
        if (entry && !this.isExpired(entry)) {
          entry.lastAccessed = Date.now();
          this.updateAccessOrder(fullKey);
          this.hits++;
          this.trackMetric('hit', op.namespace);
          results.push({ key: op.key, value: entry.value, found: true });
        } else {
          this.misses++;
          this.trackMetric('miss', op.namespace);
          results.push({ key: op.key, value: null, found: false });
        }
      }
    }

    await this.persistState();

    return new Response(JSON.stringify({ results }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleWarm(request: Request): Promise<Response> {
    const { type, data } = await request.json();
    
    switch (type) {
      case 'lobby':
        // Cache lobby data with 5 minute TTL
        for (const item of data) {
          const key = `lobby:${item.id}`;
          const entry: CacheEntry = {
            value: item,
            ttl: 300000, // 5 minutes
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            namespace: 'lobby'
          };
          this.cache.set(key, entry);
          this.updateAccessOrder(key);
        }
        break;
        
      case 'player':
        // Cache player data with 1 hour TTL
        for (const item of data) {
          const key = `player:${item.id}`;
          const entry: CacheEntry = {
            value: item,
            ttl: 3600000, // 1 hour
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            namespace: 'player'
          };
          this.cache.set(key, entry);
          this.updateAccessOrder(key);
        }
        this.memorySizeDirty = true; // Mark memory size for recalculation after warming
        break;
    }

    await this.persistState();

    return new Response(JSON.stringify({ 
      success: true, 
      warmed: data.length 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  private async handleStats(): Promise<Response> {
    const namespaceStats: Record<string, number> = {};
    
    for (const entry of this.cache.values()) {
      const ns = entry.namespace || 'default';
      namespaceStats[ns] = (namespaceStats[ns] || 0) + 1;
    }

    const stats: CacheStats = {
      totalEntries: this.cache.size,
      namespaceStats,
      memoryUsage: this.estimateMemoryUsage(),
      hitRate: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
      evictions: this.evictions
    };

    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async alarm(): Promise<void> {
    // Clean up expired entries
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache) {
      if (this.isExpired(entry)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }
    
    if (keysToDelete.length > 0) {
      this.memorySizeDirty = true; // Mark memory size for recalculation
    }

    logger.info('Cache cleanup completed', { 
      removed: keysToDelete.length,
      remaining: this.cache.size 
    });

    await this.persistState();
    
    // Schedule next cleanup
    await this.state.storage.setAlarm(new Date(now + this.cleanupInterval));
  }

  async initialize(): Promise<void> {
    // Load persisted state
    const cacheData = await this.state.storage.get<[string, CacheEntry][]>('cache');
    if (cacheData) {
      this.cache = new Map(cacheData);
      
      // Rebuild access order with null checks
      this.accessOrder = Array.from(this.cache.keys())
        .sort((a, b) => {
          const entryA = this.cache.get(a);
          const entryB = this.cache.get(b);
          if (!entryA || !entryB) return 0;
          return entryA.lastAccessed - entryB.lastAccessed;
        })
        .filter(key => this.cache.has(key)); // Only keep valid keys
    }

    const stats = await this.state.storage.get<{ hits: number; misses: number; evictions: number }>('stats');
    if (stats) {
      this.hits = stats.hits;
      this.misses = stats.misses;
      this.evictions = stats.evictions;
    }

    // Set up cleanup alarm
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm) {
      await this.state.storage.setAlarm(new Date(Date.now() + this.cleanupInterval));
    }
  }

  private getFullKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.createdAt + entry.ttl;
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;
    
    const keyToEvict = this.accessOrder.shift()!;
    const entry = this.cache.get(keyToEvict);
    this.cache.delete(keyToEvict);
    this.evictions++;
    this.trackMetric('eviction', entry?.namespace);
    this.memorySizeDirty = true; // Mark memory size for recalculation
    
    logger.debug('Evicted LRU entry', { key: keyToEvict });
  }

  private async persistState(): Promise<void> {
    const cacheArray = Array.from(this.cache.entries());
    await this.state.storage.put('cache', cacheArray);
    await this.state.storage.put('stats', {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions
    });
  }

  private estimateMemoryUsage(): number {
    // Use cached value if available and not dirty
    if (!this.memorySizeDirty) {
      return this.memorySizeCache;
    }
    
    // Rough estimate of memory usage in bytes
    let size = 0;
    for (const [key, entry] of this.cache) {
      size += key.length * 2; // String characters
      // Use approximate size calculation instead of JSON serialization
      size += this.approximateValueSize(entry.value);
      size += 32; // Overhead for metadata
    }
    
    this.memorySizeCache = size;
    this.memorySizeDirty = false;
    return size;
  }
  
  private approximateValueSize(value: any): number {
    // Approximate size calculation without JSON serialization
    if (value === null || value === undefined) return 0;
    
    switch (typeof value) {
      case 'string':
        return value.length * 2;
      case 'number':
        return 8;
      case 'boolean':
        return 4;
      case 'object':
        if (Array.isArray(value)) {
          return value.reduce((acc, item) => acc + this.approximateValueSize(item), 20);
        } else {
          let size = 20; // Object overhead
          for (const key in value) {
            if (value.hasOwnProperty(key)) {
              size += key.length * 2 + this.approximateValueSize(value[key]);
            }
          }
          return size;
        }
      default:
        return 100; // Conservative estimate for unknown types
    }
  }

  private trackMetric(type: 'hit' | 'miss' | 'eviction' | 'set' | 'delete', namespace?: string): void {
    // Send metrics to Analytics Engine if available
    if (this.env?.ANALYTICS) {
      try {
        this.env.ANALYTICS.writeDataPoint({
          blobs: [
            'cache',
            type,
            namespace || 'default'
          ],
          doubles: [Date.now(), this.cache.size, this.estimateMemoryUsage()],
          indexes: ['cache_do', this.env.ENVIRONMENT || 'development']
        });
      } catch (error) {
        // Log metrics tracking errors at debug level to avoid impacting cache operations
        logger.debug('Failed to track cache metric', { error, type, namespace });
      }
    }
  }
}