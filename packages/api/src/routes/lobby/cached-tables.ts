/**
 * Example of how to use CacheDO with lobby tables
 * 
 * This demonstrates caching lobby data for performance optimization
 */

import { IRequest } from 'itty-router';
import { WorkerEnvironment } from '@primo-poker/shared';
import { CacheHelper } from '@primo-poker/persistence';
import { logger } from '@primo-poker/core';

interface CachedLobbyRequest extends IRequest {
  env: WorkerEnvironment;
}

/**
 * Get cached lobby tables
 * 
 * This example shows how to use the cache for expensive database queries
 */
export async function getCachedLobbyTables(request: CachedLobbyRequest) {
  const { env } = request;
  const url = new URL(request.url);
  
  // Initialize cache helper
  const cache = new CacheHelper(env);
  
  // Generate cache key based on query parameters
  const cacheKey = `lobby:tables:${url.search}`;
  
  try {
    // Try to get from cache first
    const cachedData = await cache.get(cacheKey, 'lobby');
    if (cachedData) {
      logger.info('Lobby tables cache hit');
      return new Response(JSON.stringify(cachedData), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'HIT',
        },
      });
    }
  } catch (error) {
    logger.error('Cache read error', error as Error);
    // Continue without cache
  }
  
  // Cache miss - fetch from database
  logger.info('Lobby tables cache miss');
  
  // Simulate expensive database query
  const tables = await fetchTablesFromDatabase(env);
  
  // Prepare response data
  const responseData = {
    tables,
    timestamp: new Date().toISOString(),
    total: tables.length,
  };
  
  // Cache the result for 5 minutes
  try {
    await cache.set(cacheKey, responseData, 300000, 'lobby'); // 5 minute TTL
    logger.info('Cached lobby tables', { count: tables.length });
  } catch (error) {
    logger.error('Cache write error', error as Error);
    // Continue without caching
  }
  
  return new Response(JSON.stringify(responseData), {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
    },
  });
}

/**
 * Warm lobby cache
 * 
 * This can be called periodically to pre-populate the cache
 */
export async function warmLobbyCache(env: WorkerEnvironment) {
  const cache = new CacheHelper(env);
  
  try {
    // Fetch all active tables
    const tables = await fetchTablesFromDatabase(env);
    
    // Transform to cache format
    const cacheData = tables.map(table => ({
      id: table.id,
      name: table.name,
      stakes: table.stakes,
      seats: table.seats,
      players: table.players,
    }));
    
    // Warm the cache
    await cache.warm('lobby', cacheData);
    
    logger.info('Warmed lobby cache', { count: cacheData.length });
  } catch (error) {
    logger.error('Failed to warm lobby cache', error as Error);
  }
}

/**
 * Invalidate lobby cache
 * 
 * Call this when table data changes
 */
export async function invalidateLobbyCache(env: WorkerEnvironment) {
  const cache = new CacheHelper(env);
  
  try {
    await cache.clear('lobby');
    logger.info('Invalidated lobby cache');
  } catch (error) {
    logger.error('Failed to invalidate lobby cache', error as Error);
  }
}

// Mock function - replace with actual database query
async function fetchTablesFromDatabase(env: WorkerEnvironment): Promise<any[]> {
  // In a real implementation, this would query the database
  return [
    {
      id: 'table-1',
      name: 'High Stakes Table',
      stakes: { smallBlind: 5, bigBlind: 10 },
      seats: { total: 9, occupied: 5 },
      players: 5,
    },
    {
      id: 'table-2',
      name: 'Beginner Friendly',
      stakes: { smallBlind: 0.5, bigBlind: 1 },
      seats: { total: 6, occupied: 3 },
      players: 3,
    },
  ];
}