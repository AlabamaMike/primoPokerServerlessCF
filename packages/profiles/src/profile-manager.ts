import { ProfileNotFoundError, ProfileAlreadyExistsError } from '@primo-poker/shared';

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

export class ProfileManager {
  private profiles: Map<string, PlayerProfile> = new Map();

  async createProfile(data: CreateProfileData): Promise<PlayerProfile> {
    if (this.profiles.has(data.playerId)) {
      throw new ProfileAlreadyExistsError(`Profile already exists for player ${data.playerId}`);
    }

    const now = new Date();
    const profile: PlayerProfile = {
      playerId: data.playerId,
      displayName: data.displayName,
      bio: data.bio || '',
      avatarUrl: data.avatarUrl,
      countryCode: data.countryCode,
      isPublic: data.isPublic,
      createdAt: now,
      updatedAt: now
    };

    this.profiles.set(data.playerId, profile);
    return profile;
  }

  async getProfile(playerId: string): Promise<PlayerProfile> {
    const profile = this.profiles.get(playerId);
    if (!profile || profile.deletedAt) {
      throw new ProfileNotFoundError(`Profile not found for player ${playerId}`);
    }
    return profile;
  }

  async updateProfile(playerId: string, data: UpdateProfileData): Promise<PlayerProfile> {
    const profile = await this.getProfile(playerId);
    
    // Filter out any invalid fields
    const { displayName, bio, avatarUrl, countryCode, isPublic } = data;
    
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

  async deleteProfile(playerId: string): Promise<void> {
    const profile = await this.getProfile(playerId);
    profile.deletedAt = new Date();
  }

  async listProfiles(): Promise<PlayerProfile[]> {
    return Array.from(this.profiles.values())
      .filter(profile => !profile.deletedAt);
  }

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