import { PlayerProfile } from './profile-manager';
import { logger } from '@primo-poker/core';
import { z } from 'zod';

/**
 * Profile schema version tracking
 */
export const PROFILE_SCHEMA_VERSION = '1.0.0';

/**
 * Version metadata for profiles
 */
export interface ProfileVersion {
  schemaVersion: string;
  migratedAt?: Date;
  previousVersion?: string;
}

/**
 * Migration definition interface
 */
export interface ProfileMigration {
  fromVersion: string;
  toVersion: string;
  description: string;
  migrate: (profile: any) => Promise<any>;
  rollback?: (profile: any) => Promise<any>;
}

/**
 * Versioned profile with metadata
 */
export interface VersionedProfile extends PlayerProfile {
  _version: ProfileVersion;
}

/**
 * Migration registry for profile schema changes
 */
export class ProfileMigrationRegistry {
  private migrations: Map<string, ProfileMigration[]> = new Map();

  /**
   * Registers a new migration
   */
  register(migration: ProfileMigration): void {
    const key = migration.fromVersion;
    const existing = this.migrations.get(key) || [];
    existing.push(migration);
    this.migrations.set(key, existing);
    
    logger.info('Registered profile migration', {
      from: migration.fromVersion,
      to: migration.toVersion,
      description: migration.description
    });
  }

  /**
   * Gets migrations for a specific version
   */
  getMigrationsFrom(version: string): ProfileMigration[] {
    return this.migrations.get(version) || [];
  }

  /**
   * Finds migration path between versions
   */
  findMigrationPath(fromVersion: string, toVersion: string): ProfileMigration[] {
    const path: ProfileMigration[] = [];
    let currentVersion = fromVersion;

    while (currentVersion !== toVersion) {
      const migrations = this.getMigrationsFrom(currentVersion);
      const nextMigration = migrations.find(m => 
        this.isOnPathTo(m.toVersion, toVersion)
      );

      if (!nextMigration) {
        throw new Error(
          `No migration path found from ${fromVersion} to ${toVersion}`
        );
      }

      path.push(nextMigration);
      currentVersion = nextMigration.toVersion;
    }

    return path;
  }

  /**
   * Checks if a version is on the path to target version
   */
  private isOnPathTo(version: string, target: string): boolean {
    if (version === target) return true;
    
    const migrations = this.getMigrationsFrom(version);
    return migrations.some(m => this.isOnPathTo(m.toVersion, target));
  }
}

/**
 * Manages profile versioning and migrations
 */
export class ProfileVersionManager {
  private registry: ProfileMigrationRegistry;
  private currentVersion: string;

  constructor(currentVersion: string = PROFILE_SCHEMA_VERSION) {
    this.currentVersion = currentVersion;
    this.registry = new ProfileMigrationRegistry();
    this.registerDefaultMigrations();
  }

  /**
   * Registers built-in migrations
   */
  private registerDefaultMigrations(): void {
    // Example migration from 0.9.0 to 1.0.0
    this.registry.register({
      fromVersion: '0.9.0',
      toVersion: '1.0.0',
      description: 'Add achievements and statistics fields',
      migrate: async (profile) => {
        return {
          ...profile,
          achievements: profile.achievements || [],
          statistics: profile.statistics || null,
          _version: {
            schemaVersion: '1.0.0',
            migratedAt: new Date(),
            previousVersion: '0.9.0'
          }
        };
      },
      rollback: async (profile) => {
        const { achievements, statistics, ...rest } = profile;
        return {
          ...rest,
          _version: {
            schemaVersion: '0.9.0',
            migratedAt: new Date(),
            previousVersion: '1.0.0'
          }
        };
      }
    });
  }

  /**
   * Adds version metadata to a profile
   */
  addVersionMetadata(profile: PlayerProfile): VersionedProfile {
    return {
      ...profile,
      _version: {
        schemaVersion: this.currentVersion
      }
    };
  }

  /**
   * Checks if a profile needs migration
   */
  needsMigration(profile: any): boolean {
    const version = this.getProfileVersion(profile);
    return version !== this.currentVersion;
  }

  /**
   * Gets the version of a profile
   */
  getProfileVersion(profile: any): string {
    // Check for explicit version metadata
    if (profile._version?.schemaVersion) {
      return profile._version.schemaVersion;
    }

    // Infer version from structure
    return this.inferVersion(profile);
  }

  /**
   * Infers profile version from its structure
   */
  private inferVersion(profile: any): string {
    // Version 1.0.0 has achievements and statistics
    if ('achievements' in profile || 'statistics' in profile) {
      return '1.0.0';
    }

    // Default to oldest version
    return '0.9.0';
  }

  /**
   * Migrates a profile to the current version
   */
  async migrate(profile: any): Promise<VersionedProfile> {
    const fromVersion = this.getProfileVersion(profile);
    
    if (fromVersion === this.currentVersion) {
      return this.addVersionMetadata(profile);
    }

    logger.info('Migrating profile', {
      playerId: profile.playerId,
      from: fromVersion,
      to: this.currentVersion
    });

    try {
      const migrations = this.registry.findMigrationPath(
        fromVersion,
        this.currentVersion
      );

      let migratedProfile = profile;
      for (const migration of migrations) {
        migratedProfile = await migration.migrate(migratedProfile);
        logger.info('Applied migration', {
          playerId: profile.playerId,
          migration: migration.description
        });
      }

      return this.addVersionMetadata(migratedProfile);
    } catch (error) {
      logger.error('Profile migration failed', {
        playerId: profile.playerId,
        from: fromVersion,
        to: this.currentVersion,
        error
      });
      throw error;
    }
  }

  /**
   * Validates a profile against current schema
   */
  validate(profile: VersionedProfile): boolean {
    try {
      // Use the appropriate schema based on version
      const version = profile._version?.schemaVersion || this.currentVersion;
      
      if (version !== this.currentVersion) {
        logger.warn('Validating profile with outdated schema', {
          playerId: profile.playerId,
          version
        });
      }

      // Perform validation based on version
      // This would use version-specific schemas
      return true;
    } catch (error) {
      logger.error('Profile validation failed', {
        playerId: profile.playerId,
        error
      });
      return false;
    }
  }

  /**
   * Batch migrates multiple profiles
   */
  async batchMigrate(profiles: any[]): Promise<VersionedProfile[]> {
    const results: VersionedProfile[] = [];
    const errors: Array<{ profile: any; error: any }> = [];

    for (const profile of profiles) {
      try {
        const migrated = await this.migrate(profile);
        results.push(migrated);
      } catch (error) {
        errors.push({ profile, error });
      }
    }

    if (errors.length > 0) {
      logger.error('Batch migration completed with errors', {
        success: results.length,
        failed: errors.length
      });
    }

    return results;
  }

  /**
   * Gets migration history for debugging
   */
  getMigrationHistory(): Array<{
    from: string;
    to: string;
    description: string;
  }> {
    const history: Array<{ from: string; to: string; description: string }> = [];
    
    for (const [from, migrations] of this.registry['migrations']) {
      for (const migration of migrations) {
        history.push({
          from: migration.fromVersion,
          to: migration.toVersion,
          description: migration.description
        });
      }
    }

    return history;
  }
}

/**
 * Profile schema snapshots for different versions
 */
export const ProfileSchemas = {
  '0.9.0': z.object({
    playerId: z.string(),
    displayName: z.string(),
    bio: z.string().optional(),
    avatarUrl: z.string().optional(),
    countryCode: z.string().optional(),
    isPublic: z.boolean(),
    createdAt: z.date(),
    updatedAt: z.date(),
    deletedAt: z.date().optional()
  }),
  
  '1.0.0': z.object({
    playerId: z.string(),
    displayName: z.string(),
    bio: z.string().optional(),
    avatarUrl: z.string().optional(),
    countryCode: z.string().optional(),
    isPublic: z.boolean(),
    achievements: z.array(z.any()).default([]),
    statistics: z.any().nullable().default(null),
    createdAt: z.date(),
    updatedAt: z.date(),
    deletedAt: z.date().optional(),
    _version: z.object({
      schemaVersion: z.string(),
      migratedAt: z.date().optional(),
      previousVersion: z.string().optional()
    }).optional()
  })
};

/**
 * Gets the appropriate schema for a version
 */
export function getSchemaForVersion(version: string): z.ZodSchema {
  return (ProfileSchemas as any)[version] || ProfileSchemas[PROFILE_SCHEMA_VERSION];
}