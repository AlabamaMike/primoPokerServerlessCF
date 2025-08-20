import { ProfileCacheManager } from './profile-cache';
import { PlayerProfile, PublicPlayerProfile, ProfileStatistics, Achievement } from './profile-manager';
import { logger } from '@primo-poker/core';
import { WorkerEnvironment } from '@primo-poker/shared';

export interface GameHistory {
  gameId: string;
  tableName: string;
  playedAt: Date;
  position: number;
  totalPlayers: number;
  winnings: number;
  handsPlayed: number;
}

export interface PlayerBasicInfo {
  playerId: string;
  displayName: string;
  avatarUrl?: string;
  isOnline?: boolean;
  lastSeen?: Date;
}

export interface PlayerStats {
  totalGamesPlayed: number;
  totalWinnings: number;
  biggestPot: number;
  favoriteGameType: string;
  winRate: number;
  handsPlayed: number;
  vpip: number; // Voluntarily Put money In Pot
  pfr: number;  // Pre-Flop Raise
  aggression: number;
}

export interface LazyProfile {
  id: string;
  basicInfo: PlayerBasicInfo;
  stats?: PlayerStats;
  gameHistory?: GameHistory[];
  achievements?: Achievement[];
  lastUpdated: Date;
  fieldLoadStatus: Map<string, 'loaded' | 'loading' | 'pending'>;
}

export interface ProfileAccessPattern {
  playerId: string;
  field: string;
  accessCount: number;
  lastAccessed: Date;
  avgLoadTime: number;
}

interface CacheClient {
  get(key: string, namespace?: string): Promise<{ value: any; found: boolean }>;
  set(key: string, value: any, ttl?: number, namespace?: string): Promise<{ success: boolean }>;
  delete(key: string, namespace?: string): Promise<{ deleted: boolean }>;
  batch(operations: Array<{ key: string; value?: any; namespace?: string }>): Promise<{ results: any[] }>;
}

/**
 * Enhanced ProfileCacheManager with lazy loading capabilities
 */
export class LazyProfileCacheManager extends ProfileCacheManager {
  private cacheClient: CacheClient;
  private accessPatterns: Map<string, ProfileAccessPattern[]> = new Map();
  private prefetchQueue: Set<string> = new Set();
  private env: WorkerEnvironment;
  
  // Configuration
  private readonly gameHistoryPageSize = 50;
  private readonly maxPrefetchQueueSize = 100;
  private readonly prefetchThreshold = 3; // Prefetch after N accesses
  private readonly profileNamespace = 'profiles';
  private readonly accessPatternTTL = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  constructor(env: WorkerEnvironment, config?: any) {
    super(config);
    this.env = env;
    this.cacheClient = this.createCacheClient();
  }
  
  private createCacheClient(): CacheClient {
    if (!this.env.CACHE_DO) {
      throw new Error('CACHE_DO not configured');
    }
    
    const cacheId = this.env.CACHE_DO.idFromName('global');
    const cacheStub = this.env.CACHE_DO.get(cacheId);
    
    return {
      get: async (key: string, namespace?: string) => {
        const response = await cacheStub.fetch(new Request('https://cache.do/get', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, namespace })
        }));
        return response.json();
      },
      
      set: async (key: string, value: any, ttl?: number, namespace?: string) => {
        const response = await cacheStub.fetch(new Request('https://cache.do/set', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value, ttl, namespace })
        }));
        return response.json();
      },
      
      delete: async (key: string, namespace?: string) => {
        const response = await cacheStub.fetch(new Request('https://cache.do/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, namespace })
        }));
        return response.json();
      },
      
      batch: async (operations: Array<{ key: string; value?: any; namespace?: string }>) => {
        const response = await cacheStub.fetch(new Request('https://cache.do/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operations })
        }));
        return response.json();
      }
    };
  }
  
  /**
   * Get a profile with specified fields, loading them lazily
   */
  async getProfile(id: string, fields?: string[]): Promise<LazyProfile> {
    const cacheKey = `profile:${id}`;
    
    // Try to get cached profile
    const cached = await this.cacheClient.get(cacheKey, this.profileNamespace);
    let profile: LazyProfile;
    
    if (cached.found) {
      profile = cached.value;
      profile.fieldLoadStatus = new Map(profile.fieldLoadStatus);
    } else {
      // Create new lazy profile with just basic info
      profile = await this.createLazyProfile(id);
      await this.cacheClient.set(cacheKey, this.serializeProfile(profile), 3600000, this.profileNamespace);
    }
    
    // Track access pattern
    await this.trackAccess(id, fields || ['basicInfo']);
    
    // Load requested fields if not already loaded
    if (fields && fields.length > 0) {
      await this.loadFields(profile, fields);
    }
    
    // Check if we should prefetch additional fields
    this.checkPrefetchEligibility(id);
    
    return profile;
  }
  
  /**
   * Prefetch profiles that are likely to be accessed
   */
  async prefetchProfiles(ids: string[]): Promise<void> {
    // Add to prefetch queue
    ids.forEach(id => {
      if (this.prefetchQueue.size < this.maxPrefetchQueueSize) {
        this.prefetchQueue.add(id);
      }
    });
    
    // Process prefetch queue in batches
    const batchSize = 10;
    const batch = Array.from(this.prefetchQueue).slice(0, batchSize);
    
    if (batch.length > 0) {
      const operations = batch.map(id => ({
        key: `profile:${id}`,
        namespace: this.profileNamespace
      }));
      
      try {
        const results = await this.cacheClient.batch(operations);
        
        // Warm cache with basic info for profiles not found
        const missing = results.results
          .map((r, i) => ({ ...r, id: batch[i] }))
          .filter(r => !r.found);
          
        for (const { id } of missing) {
          const profile = await this.createLazyProfile(id);
          await this.cacheClient.set(
            `profile:${id}`, 
            this.serializeProfile(profile), 
            3600000, 
            this.profileNamespace
          );
          this.prefetchQueue.delete(id);
        }
      } catch (error) {
        logger.error('Prefetch failed', { error, batch });
      }
    }
  }
  
  /**
   * Load a specific field for a profile
   */
  async loadProfileField(id: string, field: string): Promise<any> {
    const profile = await this.getProfile(id, [field]);
    return profile[field as keyof LazyProfile];
  }
  
  /**
   * Get multiple profiles with specified fields
   */
  async getProfileBatch(ids: string[], fields?: string[]): Promise<LazyProfile[]> {
    const operations = ids.map(id => ({
      key: `profile:${id}`,
      namespace: this.profileNamespace
    }));
    
    const results = await this.cacheClient.batch(operations);
    const profiles: LazyProfile[] = [];
    
    for (let i = 0; i < ids.length; i++) {
      const result = results.results[i];
      let profile: LazyProfile;
      
      if (result.found) {
        profile = result.value;
        profile.fieldLoadStatus = new Map(profile.fieldLoadStatus);
      } else {
        profile = await this.createLazyProfile(ids[i]);
      }
      
      if (fields && fields.length > 0) {
        await this.loadFields(profile, fields);
      }
      
      profiles.push(profile);
    }
    
    // Track batch access
    ids.forEach(id => this.trackAccess(id, fields || ['basicInfo']));
    
    return profiles;
  }
  
  /**
   * Get game history with pagination
   */
  async getGameHistory(
    playerId: string, 
    page: number = 1, 
    pageSize: number = this.gameHistoryPageSize
  ): Promise<{ history: GameHistory[]; hasMore: boolean; total: number }> {
    const cacheKey = `gameHistory:${playerId}:${page}:${pageSize}`;
    
    const cached = await this.cacheClient.get(cacheKey, this.profileNamespace);
    if (cached.found) {
      return cached.value;
    }
    
    // Fetch from database/source
    const history = await this.fetchGameHistory(playerId, page, pageSize);
    
    // Cache the page
    await this.cacheClient.set(cacheKey, history, 300000, this.profileNamespace); // 5 min TTL
    
    return history;
  }
  
  /**
   * Get access pattern analytics
   */
  async getAccessPatterns(): Promise<Map<string, ProfileAccessPattern[]>> {
    return this.accessPatterns;
  }
  
  /**
   * Create a lazy profile with just basic info
   */
  private async createLazyProfile(id: string): Promise<LazyProfile> {
    const basicInfo = await this.fetchBasicInfo(id);
    
    return {
      id,
      basicInfo,
      lastUpdated: new Date(),
      fieldLoadStatus: new Map([
        ['basicInfo', 'loaded'],
        ['stats', 'pending'],
        ['gameHistory', 'pending'],
        ['achievements', 'pending']
      ])
    };
  }
  
  /**
   * Load specific fields for a profile
   */
  private async loadFields(profile: LazyProfile, fields: string[]): Promise<void> {
    const toLoad = fields.filter(field => 
      profile.fieldLoadStatus.get(field) === 'pending'
    );
    
    if (toLoad.length === 0) return;
    
    // Mark fields as loading
    toLoad.forEach(field => profile.fieldLoadStatus.set(field, 'loading'));
    
    // Load fields in parallel
    const loadPromises = toLoad.map(async field => {
      try {
        switch (field) {
          case 'stats':
            profile.stats = await this.fetchStats(profile.id);
            break;
          case 'gameHistory':
            const historyData = await this.getGameHistory(profile.id, 1);
            profile.gameHistory = historyData.history;
            break;
          case 'achievements':
            profile.achievements = await this.fetchAchievements(profile.id);
            break;
        }
        profile.fieldLoadStatus.set(field, 'loaded');
      } catch (error) {
        logger.error('Failed to load field', { playerId: profile.id, field, error });
        profile.fieldLoadStatus.set(field, 'pending');
      }
    });
    
    await Promise.all(loadPromises);
    profile.lastUpdated = new Date();
    
    // Update cache
    await this.cacheClient.set(
      `profile:${profile.id}`, 
      this.serializeProfile(profile), 
      3600000, 
      this.profileNamespace
    );
  }
  
  /**
   * Track access patterns for analytics and prefetching
   */
  private async trackAccess(playerId: string, fields: string[]): Promise<void> {
    const patterns = this.accessPatterns.get(playerId) || [];
    const now = new Date();
    
    fields.forEach(field => {
      const existing = patterns.find(p => p.field === field);
      if (existing) {
        existing.accessCount++;
        existing.lastAccessed = now;
      } else {
        patterns.push({
          playerId,
          field,
          accessCount: 1,
          lastAccessed: now,
          avgLoadTime: 0
        });
      }
    });
    
    this.accessPatterns.set(playerId, patterns);
    
    // Send to Analytics Engine
    if (this.env.ANALYTICS) {
      try {
        this.env.ANALYTICS.writeDataPoint({
          blobs: ['profile_access', playerId, ...fields],
          doubles: [Date.now(), fields.length],
          indexes: ['lazy_profile', this.env.ENVIRONMENT || 'development']
        });
      } catch (error) {
        logger.debug('Failed to track profile access', { error, playerId, fields });
      }
    }
  }
  
  /**
   * Check if a profile should be prefetched based on access patterns
   */
  private checkPrefetchEligibility(playerId: string): void {
    const patterns = this.accessPatterns.get(playerId);
    if (!patterns) return;
    
    const totalAccesses = patterns.reduce((sum, p) => sum + p.accessCount, 0);
    if (totalAccesses >= this.prefetchThreshold) {
      // Find commonly accessed fields
      const commonFields = patterns
        .filter(p => p.accessCount >= 2)
        .map(p => p.field);
        
      if (commonFields.length > 0) {
        this.prefetchQueue.add(playerId);
      }
    }
  }
  
  /**
   * Serialize profile for caching
   */
  private serializeProfile(profile: LazyProfile): any {
    return {
      ...profile,
      fieldLoadStatus: Array.from(profile.fieldLoadStatus.entries())
    };
  }
  
  // Data fetching methods (to be implemented with actual data sources)
  
  private async fetchBasicInfo(playerId: string): Promise<PlayerBasicInfo> {
    // TODO: Implement actual database fetch
    return {
      playerId,
      displayName: `Player${playerId.slice(0, 6)}`,
      isOnline: false,
      lastSeen: new Date()
    };
  }
  
  private async fetchStats(playerId: string): Promise<PlayerStats> {
    // TODO: Implement actual database fetch
    return {
      totalGamesPlayed: 0,
      totalWinnings: 0,
      biggestPot: 0,
      favoriteGameType: 'No Limit Hold\'em',
      winRate: 0,
      handsPlayed: 0,
      vpip: 0,
      pfr: 0,
      aggression: 0
    };
  }
  
  private async fetchGameHistory(
    playerId: string, 
    page: number, 
    pageSize: number
  ): Promise<{ history: GameHistory[]; hasMore: boolean; total: number }> {
    // TODO: Implement actual database fetch with pagination
    return {
      history: [],
      hasMore: false,
      total: 0
    };
  }
  
  private async fetchAchievements(playerId: string): Promise<Achievement[]> {
    // TODO: Implement actual database fetch
    return [];
  }
}