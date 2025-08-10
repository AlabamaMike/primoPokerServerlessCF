import { ProfileNotFoundError, ProfileAlreadyExistsError } from '@primo-poker/shared';
import { z } from 'zod';

export interface PlayerProfile {
  playerId: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  countryCode?: string;
  isPublic: boolean;
  statistics?: ProfileStatistics;
  achievements?: Achievement[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface ProfileStatistics {
  totalGamesPlayed: number;
  totalWinnings: number;
  biggestPot: number;
  favoriteGameType: string;
  winRate: number;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  unlockedAt: Date;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
}

// Zod validation schemas
export const ProfileStatisticsSchema = z.object({
  totalGamesPlayed: z.number().int().nonnegative(),
  totalWinnings: z.number().nonnegative(),
  biggestPot: z.number().nonnegative(),
  favoriteGameType: z.string(),
  winRate: z.number().min(0).max(100)
});

export const AchievementSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(50),
  description: z.string().min(1).max(200),
  unlockedAt: z.date(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary'])
});

export const CreateProfileDataSchema = z.object({
  playerId: z.string().uuid(),
  displayName: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'Display name can only contain letters, numbers, underscores, and hyphens'
  }),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/, {
    message: 'Country code must be a valid ISO 3166-1 alpha-2 code'
  }).optional(),
  isPublic: z.boolean()
});

export const UpdateProfileDataSchema = z.object({
  displayName: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_-]+$/, {
    message: 'Display name can only contain letters, numbers, underscores, and hyphens'
  }).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
  countryCode: z.string().length(2).regex(/^[A-Z]{2}$/, {
    message: 'Country code must be a valid ISO 3166-1 alpha-2 code'
  }).optional(),
  isPublic: z.boolean().optional()
});

export interface CreateProfileData {
  playerId: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  countryCode?: string;
  isPublic: boolean;
}

export interface UpdateProfileData {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  countryCode?: string;
  isPublic?: boolean;
}

export interface PublicPlayerProfile {
  playerId: string;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  countryCode?: string;
  isPublic: boolean;
  statistics?: ProfileStatistics;
  achievements?: Achievement[];
}

/**
 * Manages player profiles including CRUD operations, privacy settings,
 * and public profile views. Validates all input data using Zod schemas.
 */
export class ProfileManager {
  protected profiles: Map<string, PlayerProfile> = new Map();

  /**
   * Creates a new player profile after validation.
   * 
   * @param data - Profile creation data
   * @returns The created player profile
   * @throws {ProfileAlreadyExistsError} If profile already exists
   * @throws {ValidationError} If data validation fails
   */
  async createProfile(data: CreateProfileData): Promise<PlayerProfile> {
    // Validate input data
    const validatedData = CreateProfileDataSchema.parse(data);
    if (this.profiles.has(validatedData.playerId)) {
      throw new ProfileAlreadyExistsError(`Profile already exists for player ${validatedData.playerId}`);
    }

    const now = new Date();
    const profile: PlayerProfile = {
      playerId: validatedData.playerId,
      displayName: validatedData.displayName,
      bio: validatedData.bio || '',
      avatarUrl: validatedData.avatarUrl,
      countryCode: validatedData.countryCode,
      isPublic: validatedData.isPublic,
      createdAt: now,
      updatedAt: now
    };

    this.profiles.set(validatedData.playerId, profile);
    return profile;
  }

  /**
   * Retrieves a player profile.
   * 
   * @param playerId - The player ID to retrieve
   * @returns The player profile
   * @throws {ProfileNotFoundError} If profile not found or deleted
   */
  async getProfile(playerId: string): Promise<PlayerProfile> {
    const profile = this.profiles.get(playerId);
    if (!profile || profile.deletedAt) {
      throw new ProfileNotFoundError(`Profile not found for player ${playerId}`);
    }
    return profile;
  }

  /**
   * Updates an existing player profile after validation.
   * 
   * @param playerId - The player ID to update
   * @param data - Update data (partial)
   * @returns The updated player profile
   * @throws {ProfileNotFoundError} If profile doesn't exist
   * @throws {ValidationError} If data validation fails
   */
  async updateProfile(playerId: string, data: UpdateProfileData): Promise<PlayerProfile> {
    const profile = await this.getProfile(playerId);
    
    // Validate update data
    const validatedData = UpdateProfileDataSchema.parse(data);
    const { displayName, bio, avatarUrl, countryCode, isPublic } = validatedData;
    
    Object.assign(profile, {
      ...(displayName !== undefined && { displayName }),
      ...(bio !== undefined && { bio }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(countryCode !== undefined && { countryCode }),
      ...(isPublic !== undefined && { isPublic }),
      updatedAt: new Date()
    });

    return profile;
  }

  /**
   * Soft deletes a player profile.
   * 
   * @param playerId - The player ID to delete
   * @throws {ProfileNotFoundError} If profile not found
   */
  async deleteProfile(playerId: string): Promise<void> {
    const profile = await this.getProfile(playerId);
    profile.deletedAt = new Date();
  }

  /**
   * Lists all active (non-deleted) profiles.
   * 
   * @returns Array of active player profiles
   */
  async listProfiles(): Promise<PlayerProfile[]> {
    return Array.from(this.profiles.values())
      .filter(profile => !profile.deletedAt);
  }

  /**
   * Gets a public view of a player profile, respecting privacy settings.
   * 
   * @param playerId - The player ID to retrieve
   * @returns Public profile with privacy-filtered data
   * @throws {ProfileNotFoundError} If profile not found
   */
  async getPublicProfile(playerId: string): Promise<PublicPlayerProfile> {
    const profile = await this.getProfile(playerId);
    
    const publicProfile: PublicPlayerProfile = {
      playerId: profile.playerId,
      displayName: profile.displayName,
      isPublic: profile.isPublic,
      avatarUrl: profile.avatarUrl
    };

    // Only include sensitive fields if profile is public
    if (profile.isPublic) {
      publicProfile.bio = profile.bio;
      publicProfile.countryCode = profile.countryCode;
      publicProfile.statistics = profile.statistics;
      publicProfile.achievements = profile.achievements;
    }

    return publicProfile;
  }
}