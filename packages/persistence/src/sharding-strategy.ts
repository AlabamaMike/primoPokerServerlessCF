/**
 * Sharding Strategy for Durable Objects - Phase 2
 * 
 * Provides consistent hashing and sharding logic to distribute load across
 * multiple Durable Object instances for scalability.
 */

import { logger } from '@primo-poker/core'

export interface ShardingConfig {
  namespace: string
  shardCount: number
  replicationFactor?: number
  consistentHashVirtualNodes?: number
}

export interface ShardInfo {
  shardId: string
  shardIndex: number
  namespace: string
  isPrimary: boolean
  replicas?: string[]
}

export class ShardingStrategy {
  private readonly config: Required<ShardingConfig>
  private readonly hashRing: Map<number, number> = new Map()
  private sortedHashKeys: number[] = []

  constructor(config: ShardingConfig) {
    this.config = {
      replicationFactor: 1,
      consistentHashVirtualNodes: 150,
      ...config
    }

    this.initializeHashRing()
  }

  /**
   * Initialize consistent hash ring
   */
  private initializeHashRing(): void {
    const virtualNodes = this.config.consistentHashVirtualNodes

    for (let shard = 0; shard < this.config.shardCount; shard++) {
      for (let vnode = 0; vnode < virtualNodes; vnode++) {
        const key = `${this.config.namespace}:${shard}:${vnode}`
        const hash = this.hash(key)
        this.hashRing.set(hash, shard)
      }
    }

    // Sort hash keys for binary search
    this.sortedHashKeys = Array.from(this.hashRing.keys()).sort((a, b) => a - b)
  }

  /**
   * Get shard info for a given key
   */
  getShardForKey(key: string): ShardInfo {
    const hash = this.hash(key)
    const shardIndex = this.findShardForHash(hash)
    const shardId = this.generateShardId(shardIndex)

    const shardInfo: ShardInfo = {
      shardId,
      shardIndex,
      namespace: this.config.namespace,
      isPrimary: true
    }

    // Add replicas if replication factor > 1
    if (this.config.replicationFactor > 1) {
      shardInfo.replicas = this.getReplicaShards(shardIndex)
    }

    return shardInfo
  }

  /**
   * Get shard for a player ID (wallet operations)
   */
  getWalletShard(playerId: string): ShardInfo {
    return this.getShardForKey(`wallet:${playerId}`)
  }

  /**
   * Get shard for a channel ID (chat operations)
   */
  getChatShard(channelId: string): ShardInfo {
    return this.getShardForKey(`chat:${channelId}`)
  }

  /**
   * Get shard for lobby operations (may use geo-based sharding)
   */
  getLobbyShard(region?: string): ShardInfo {
    // For now, use simple region-based sharding
    const key = region ? `lobby:${region}` : 'lobby:global'
    return this.getShardForKey(key)
  }

  /**
   * Get all shard IDs for a namespace
   */
  getAllShardIds(): string[] {
    const shardIds: string[] = []
    for (let i = 0; i < this.config.shardCount; i++) {
      shardIds.push(this.generateShardId(i))
    }
    return shardIds
  }

  /**
   * Generate a Durable Object ID for a specific shard
   */
  generateDurableObjectId(env: any, shardInfo: ShardInfo): DurableObjectId {
    const namespace = this.getDurableObjectNamespace(env, shardInfo.namespace)
    return namespace.idFromName(shardInfo.shardId)
  }

  /**
   * Get Durable Object stub for a shard
   */
  getDurableObjectStub(env: any, shardInfo: ShardInfo): DurableObjectStub {
    const id = this.generateDurableObjectId(env, shardInfo)
    const namespace = this.getDurableObjectNamespace(env, shardInfo.namespace)
    return namespace.get(id)
  }

  /**
   * Rebalance shards (for future use when scaling)
   */
  async rebalanceShards(oldShardCount: number, newShardCount: number): Promise<Map<string, string>> {
    const migrationMap = new Map<string, string>()
    
    // This would contain logic to determine which keys need to move
    // from old shards to new shards when scaling up/down
    
    logger.info('Shard rebalancing', { 
      oldShardCount, 
      newShardCount, 
      namespace: this.config.namespace 
    })

    // For now, return empty map - actual implementation would calculate migrations
    return migrationMap
  }

  /**
   * Hash function using FNV-1a algorithm for better distribution
   */
  private hash(key: string): number {
    // FNV-1a 32-bit hash for better distribution
    const FNV_PRIME = 0x01000193
    const FNV_OFFSET_BASIS = 0x811c9dc5
    
    let hash = FNV_OFFSET_BASIS
    
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i)
      // Multiply by FNV prime with proper 32-bit arithmetic
      hash = Math.imul(hash, FNV_PRIME)
    }
    
    // Ensure positive value
    return hash >>> 0
  }

  /**
   * Find shard for a given hash using consistent hashing
   */
  private findShardForHash(hash: number): number {
    // Binary search to find the appropriate shard
    let left = 0
    let right = this.sortedHashKeys.length - 1

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      const midKey = this.sortedHashKeys[mid]
      
      if (midKey === undefined) {
        throw new Error(`No hash key found at index ${mid}`)
      }
      
      if (midKey === hash) {
        const shard = this.hashRing.get(midKey)
        if (shard === undefined) {
          throw new Error(`No shard found for hash key ${midKey}`)
        }
        return shard
      }
      
      if (midKey < hash) {
        left = mid + 1
      } else {
        right = mid - 1
      }
    }

    // If exact match not found, use the next higher hash (with wraparound)
    const index = left >= this.sortedHashKeys.length ? 0 : left
    const key = this.sortedHashKeys[index]
    
    if (key === undefined) {
      throw new Error(`No hash key found at index ${index}`)
    }
    
    const shard = this.hashRing.get(key)
    if (shard === undefined) {
      throw new Error(`No shard found for hash key ${key}`)
    }
    
    return shard
  }

  /**
   * Generate shard ID from index
   */
  private generateShardId(shardIndex: number): string {
    return `${this.config.namespace}_shard_${shardIndex}`
  }

  /**
   * Get replica shards for a primary shard
   */
  private getReplicaShards(primaryIndex: number): string[] {
    const replicas: string[] = []
    
    for (let i = 1; i < this.config.replicationFactor; i++) {
      const replicaIndex = (primaryIndex + i) % this.config.shardCount
      replicas.push(this.generateShardId(replicaIndex))
    }
    
    return replicas
  }

  /**
   * Get Durable Object namespace from environment
   */
  private getDurableObjectNamespace(env: any, namespace: string): DurableObjectNamespace {
    const namespaceMap: Record<string, string> = {
      'wallet': 'WALLET_MANAGER',
      'chat': 'CHAT_MODERATOR',
      'lobby': 'LOBBY_COORDINATOR'
    }

    const envKey = namespaceMap[namespace]
    if (!envKey || !env[envKey]) {
      throw new Error(`Durable Object namespace not found: ${namespace}`)
    }

    return env[envKey]
  }
}

/**
 * Sharding manager singleton for application-wide use
 */
export class ShardingManager {
  private static instances: Map<string, ShardingStrategy> = new Map()

  /**
   * Get or create sharding strategy for a namespace
   */
  static getStrategy(namespace: string, shardCount: number = 10): ShardingStrategy {
    const key = `${namespace}:${shardCount}`
    
    if (!this.instances.has(key)) {
      this.instances.set(key, new ShardingStrategy({
        namespace,
        shardCount
      }))
    }
    
    return this.instances.get(key)!
  }

  /**
   * Get wallet sharding strategy
   */
  static getWalletStrategy(shardCount: number = 10): ShardingStrategy {
    return this.getStrategy('wallet', shardCount)
  }

  /**
   * Get chat sharding strategy
   */
  static getChatStrategy(shardCount: number = 10): ShardingStrategy {
    return this.getStrategy('chat', shardCount)
  }

  /**
   * Get lobby sharding strategy
   */
  static getLobbyStrategy(shardCount: number = 5): ShardingStrategy {
    return this.getStrategy('lobby', shardCount)
  }
}

/**
 * Helper function to get sharded Durable Object stub
 */
export async function getShardedDurableObject(
  env: any,
  namespace: string,
  key: string,
  shardCount?: number
): Promise<DurableObjectStub> {
  const strategy = ShardingManager.getStrategy(namespace, shardCount)
  const shardInfo = strategy.getShardForKey(key)
  return strategy.getDurableObjectStub(env, shardInfo)
}

/**
 * Helper function for wallet operations
 */
export async function getWalletDurableObject(
  env: any,
  playerId: string
): Promise<DurableObjectStub> {
  const strategy = ShardingManager.getWalletStrategy()
  const shardInfo = strategy.getWalletShard(playerId)
  return strategy.getDurableObjectStub(env, shardInfo)
}

/**
 * Helper function for chat operations
 */
export async function getChatDurableObject(
  env: any,
  channelId: string
): Promise<DurableObjectStub> {
  const strategy = ShardingManager.getChatStrategy()
  const shardInfo = strategy.getChatShard(channelId)
  return strategy.getDurableObjectStub(env, shardInfo)
}

/**
 * Helper function for lobby operations
 */
export async function getLobbyDurableObject(
  env: any,
  region?: string
): Promise<DurableObjectStub> {
  const strategy = ShardingManager.getLobbyStrategy()
  const shardInfo = strategy.getLobbyShard(region)
  return strategy.getDurableObjectStub(env, shardInfo)
}