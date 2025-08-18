import { DurableObject } from '@cloudflare/workers-types';
import { ProfileManager } from './profile-manager';
import { AvatarHandler, AvatarConfig } from './avatar-handler';
import { StatisticsManager } from './statistics-manager';
import { AchievementManager } from './achievement-manager';
import { 
  PlayerProfile, 
  CreateProfileData, 
  UpdateProfileData,
  PublicPlayerProfile 
} from './profile-manager';

/**
 * Durable Object for managing player profiles with persistent storage.
 * Each instance manages profiles for all players, providing atomic operations
 * and consistent state management.
 */
export class ProfileDurableObject extends DurableObject {
  private profileManager: ProfileManager;
  private avatarHandler: AvatarHandler | null = null;
  private statisticsManager: StatisticsManager;
  private achievementManager: AchievementManager;
  private initialized = false;

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    this.profileManager = new ProfileManager();
    this.statisticsManager = new StatisticsManager();
    this.achievementManager = new AchievementManager();
  }

  /**
   * Initializes the Durable Object by loading persisted profiles.
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load persisted profiles from storage
    const storedProfiles = await this.state.storage.list<PlayerProfile>();
    for (const [key, profile] of storedProfiles) {
      // Reconstruct the in-memory map
      if (key.startsWith('profile:')) {
        const playerId = key.substring(8);
        (this.profileManager as any).profiles.set(playerId, profile);
      }
    }

    // Initialize avatar handler if R2 bucket is available
    if (this.env.AVATAR_BUCKET) {
      const avatarConfig: AvatarConfig = {
        maxFileSize: this.env.MAX_AVATAR_SIZE || 5 * 1024 * 1024, // 5MB default
        allowedFormats: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
        cdnBaseUrl: this.env.CDN_BASE_URL || '',
        minDimensions: { width: 100, height: 100 },
        maxDimensions: { width: 2000, height: 2000 }
      };
      this.avatarHandler = new AvatarHandler(this.env.AVATAR_BUCKET, avatarConfig);
    }

    this.initialized = true;
  }

  /**
   * Creates a new player profile and persists it.
   */
  async createProfile(data: CreateProfileData): Promise<PlayerProfile> {
    await this.initialize();
    
    const profile = await this.profileManager.createProfile(data);
    
    // Persist to Durable Object storage
    await this.state.storage.put(`profile:${profile.playerId}`, profile);
    
    return profile;
  }

  /**
   * Retrieves a player profile.
   */
  async getProfile(playerId: string): Promise<PlayerProfile> {
    await this.initialize();
    return this.profileManager.getProfile(playerId);
  }

  /**
   * Updates a player profile and persists changes.
   */
  async updateProfile(playerId: string, data: UpdateProfileData): Promise<PlayerProfile> {
    await this.initialize();
    
    const profile = await this.profileManager.updateProfile(playerId, data);
    
    // Persist updated profile
    await this.state.storage.put(`profile:${playerId}`, profile);
    
    return profile;
  }

  /**
   * Soft deletes a profile.
   */
  async deleteProfile(playerId: string): Promise<void> {
    await this.initialize();
    
    await this.profileManager.deleteProfile(playerId);
    
    // Update persisted profile with deletion timestamp
    const profile = await this.profileManager.getProfile(playerId).catch(() => null);
    if (profile) {
      await this.state.storage.put(`profile:${playerId}`, profile);
    }
  }

  /**
   * Lists all active profiles.
   */
  async listProfiles(): Promise<PlayerProfile[]> {
    await this.initialize();
    return this.profileManager.listProfiles();
  }

  /**
   * Gets public profile view.
   */
  async getPublicProfile(playerId: string): Promise<PublicPlayerProfile> {
    await this.initialize();
    return this.profileManager.getPublicProfile(playerId);
  }

  /**
   * Uploads an avatar for a player.
   */
  async uploadAvatar(playerId: string, file: ArrayBuffer, mimeType: string): Promise<string> {
    await this.initialize();
    
    if (!this.avatarHandler) {
      throw new Error('Avatar storage not configured');
    }

    // Upload avatar
    const result = await this.avatarHandler.uploadAvatar(playerId, file, mimeType);
    
    // Update profile with new avatar URL
    await this.updateProfile(playerId, { avatarUrl: result.url });
    
    return result.url;
  }

  /**
   * HTTP request handler for the Durable Object.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    try {
      // Profile CRUD operations
      if (path === '/profile' && request.method === 'POST') {
        const data = await request.json() as CreateProfileData;
        const profile = await this.createProfile(data);
        return new Response(JSON.stringify(profile), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path.startsWith('/profile/') && request.method === 'GET') {
        const playerId = path.substring(9);
        const isPublic = url.searchParams.get('public') === 'true';
        
        const profile = isPublic 
          ? await this.getPublicProfile(playerId)
          : await this.getProfile(playerId);
          
        return new Response(JSON.stringify(profile), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path.startsWith('/profile/') && request.method === 'PUT') {
        const playerId = path.substring(9);
        const data = await request.json() as UpdateProfileData;
        const profile = await this.updateProfile(playerId, data);
        return new Response(JSON.stringify(profile), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path.startsWith('/profile/') && request.method === 'DELETE') {
        const playerId = path.substring(9);
        await this.deleteProfile(playerId);
        return new Response(null, { status: 204 });
      }

      if (path === '/profiles' && request.method === 'GET') {
        const profiles = await this.listProfiles();
        return new Response(JSON.stringify(profiles), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Avatar upload
      if (path.startsWith('/profile/') && path.endsWith('/avatar') && request.method === 'POST') {
        const playerId = path.substring(9, path.length - 7);
        const formData = await request.formData();
        const file = formData.get('avatar') as File;
        
        if (!file) {
          return new Response('No file provided', { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const avatarUrl = await this.uploadAvatar(playerId, buffer, file.type);
        
        return new Response(JSON.stringify({ avatarUrl }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Statistics endpoints
      if (path === '/statistics/record-hand' && request.method === 'POST') {
        const handData = await request.json();
        const handStat = await this.statisticsManager.recordHand(handData);
        
        // Check for new achievements
        const stats = await this.statisticsManager.getPlayerStatistics(handData.playerId);
        if (stats) {
          const context = {
            playerId: handData.playerId,
            stats,
            currentHand: handStat,
            biggestPotWon: stats.biggestPotWon
          };
          const newAchievements = await this.achievementManager.checkAchievements(context);
          
          // Update profile with new achievements if any
          if (newAchievements.length > 0) {
            const profile = await this.getProfile(handData.playerId);
            profile.achievements = await this.achievementManager.getPlayerAchievements(handData.playerId);
            await this.state.storage.put(`profile:${handData.playerId}`, profile);
          }
        }
        
        return new Response(JSON.stringify({ handStat, newAchievements: [] }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path === '/statistics/start-session' && request.method === 'POST') {
        const sessionData = await request.json();
        const session = await this.statisticsManager.startSession(sessionData);
        return new Response(JSON.stringify(session), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path === '/statistics/end-session' && request.method === 'POST') {
        const { playerId, tableId, cashOutAmount } = await request.json();
        const session = await this.statisticsManager.endSession(playerId, tableId, cashOutAmount);
        return new Response(JSON.stringify(session), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path.startsWith('/statistics/player/') && request.method === 'GET') {
        const playerId = path.substring(18);
        const stats = await this.statisticsManager.getPlayerStatistics(playerId);
        return new Response(JSON.stringify(stats), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path.startsWith('/statistics/sessions/') && request.method === 'GET') {
        const playerId = path.substring(20);
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const sessions = await this.statisticsManager.getSessionHistory(playerId, limit);
        return new Response(JSON.stringify(sessions), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path.startsWith('/statistics/hands/') && request.method === 'GET') {
        const playerId = path.substring(17);
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const hands = await this.statisticsManager.getHandHistory(playerId, limit);
        return new Response(JSON.stringify(hands), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Achievement endpoints
      if (path.startsWith('/achievements/player/') && request.method === 'GET') {
        const playerId = path.substring(20);
        const achievements = await this.achievementManager.getPlayerAchievements(playerId);
        return new Response(JSON.stringify(achievements), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path.startsWith('/achievements/progress/') && request.method === 'GET') {
        const playerId = path.substring(22);
        const progress = await this.achievementManager.getAchievementProgress(playerId);
        return new Response(JSON.stringify(progress), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (path === '/achievements/stats' && request.method === 'GET') {
        const stats = await this.achievementManager.getAchievementStats();
        return new Response(JSON.stringify(stats), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      return new Response('Not Found', { status: 404 });
    } catch (error: any) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.httpStatus || 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}