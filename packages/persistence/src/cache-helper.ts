/**
 * Cache Helper Utility
 * 
 * Provides convenient methods for interacting with the CacheDO
 */

import { WorkerEnvironment } from '@primo-poker/shared';

export class CacheHelper {
  private env: WorkerEnvironment;

  constructor(env: WorkerEnvironment) {
    this.env = env;
  }

  /**
   * Get a value from cache
   */
  async get(key: string, namespace?: string): Promise<any> {
    const cacheId = this.env.CACHE_DO.idFromName('global-cache');
    const cache = this.env.CACHE_DO.get(cacheId);
    
    const response = await cache.fetch(new Request('http://internal/get', {
      method: 'POST',
      body: JSON.stringify({ key, namespace }),
    }));
    
    const result = await response.json();
    return result.found ? result.value : null;
  }

  /**
   * Set a value in cache
   */
  async set(key: string, value: any, ttl?: number, namespace?: string): Promise<boolean> {
    const cacheId = this.env.CACHE_DO.idFromName('global-cache');
    const cache = this.env.CACHE_DO.get(cacheId);
    
    const response = await cache.fetch(new Request('http://internal/set', {
      method: 'POST',
      body: JSON.stringify({ key, value, ttl, namespace }),
    }));
    
    const result = await response.json();
    return result.success;
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string, namespace?: string): Promise<boolean> {
    const cacheId = this.env.CACHE_DO.idFromName('global-cache');
    const cache = this.env.CACHE_DO.get(cacheId);
    
    const response = await cache.fetch(new Request('http://internal/delete', {
      method: 'POST',
      body: JSON.stringify({ key, namespace }),
    }));
    
    const result = await response.json();
    return result.deleted;
  }

  /**
   * Check if a key exists in cache
   */
  async has(key: string, namespace?: string): Promise<boolean> {
    const cacheId = this.env.CACHE_DO.idFromName('global-cache');
    const cache = this.env.CACHE_DO.get(cacheId);
    
    const response = await cache.fetch(new Request('http://internal/has', {
      method: 'POST',
      body: JSON.stringify({ key, namespace }),
    }));
    
    const result = await response.json();
    return result.exists;
  }

  /**
   * Clear cache (optionally by namespace)
   */
  async clear(namespace?: string): Promise<void> {
    const cacheId = this.env.CACHE_DO.idFromName('global-cache');
    const cache = this.env.CACHE_DO.get(cacheId);
    
    await cache.fetch(new Request('http://internal/clear', {
      method: 'POST',
      body: JSON.stringify({ namespace }),
    }));
  }

  /**
   * Batch operations for efficiency
   */
  async batch(operations: Array<{
    key: string;
    value?: any;
    ttl?: number;
    namespace?: string;
  }>): Promise<any[]> {
    const cacheId = this.env.CACHE_DO.idFromName('global-cache');
    const cache = this.env.CACHE_DO.get(cacheId);
    
    const response = await cache.fetch(new Request('http://internal/batch', {
      method: 'POST',
      body: JSON.stringify({ operations }),
    }));
    
    const result = await response.json();
    return result.results;
  }

  /**
   * Warm cache with data
   */
  async warm(type: 'lobby' | 'player', data: any[]): Promise<void> {
    const cacheId = this.env.CACHE_DO.idFromName('global-cache');
    const cache = this.env.CACHE_DO.get(cacheId);
    
    await cache.fetch(new Request('http://internal/warm', {
      method: 'POST',
      body: JSON.stringify({ type, data }),
    }));
  }

  /**
   * Get cache statistics
   */
  async stats(): Promise<{
    totalEntries: number;
    namespaceStats: Record<string, number>;
    memoryUsage: number;
    hitRate: number;
    evictions: number;
  }> {
    const cacheId = this.env.CACHE_DO.idFromName('global-cache');
    const cache = this.env.CACHE_DO.get(cacheId);
    
    const response = await cache.fetch(new Request('http://internal/stats', {
      method: 'GET',
    }));
    
    return response.json();
  }
}