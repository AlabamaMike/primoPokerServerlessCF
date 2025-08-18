import {
  ProfileVersionManager,
  ProfileMigrationRegistry,
  PROFILE_SCHEMA_VERSION
} from '../profile-versioning';

describe('ProfileVersionManager', () => {
  let versionManager: ProfileVersionManager;

  beforeEach(() => {
    versionManager = new ProfileVersionManager();
  });

  describe('getProfileVersion', () => {
    it('should detect version from metadata', () => {
      const profile = {
        playerId: '123',
        _version: { schemaVersion: '1.0.0' }
      };
      
      expect(versionManager.getProfileVersion(profile)).toBe('1.0.0');
    });

    it('should infer version 1.0.0 from structure', () => {
      const profile = {
        playerId: '123',
        achievements: [],
        statistics: null
      };
      
      expect(versionManager.getProfileVersion(profile)).toBe('1.0.0');
    });

    it('should infer version 0.9.0 for legacy profiles', () => {
      const profile = {
        playerId: '123',
        displayName: 'Test'
      };
      
      expect(versionManager.getProfileVersion(profile)).toBe('0.9.0');
    });
  });

  describe('needsMigration', () => {
    it('should return true for outdated profiles', () => {
      const profile = {
        playerId: '123',
        _version: { schemaVersion: '0.9.0' }
      };
      
      expect(versionManager.needsMigration(profile)).toBe(true);
    });

    it('should return false for current version profiles', () => {
      const profile = {
        playerId: '123',
        _version: { schemaVersion: PROFILE_SCHEMA_VERSION }
      };
      
      expect(versionManager.needsMigration(profile)).toBe(false);
    });
  });

  describe('migrate', () => {
    it('should migrate 0.9.0 to 1.0.0', async () => {
      const oldProfile = {
        playerId: '123',
        displayName: 'Test User',
        bio: 'Test bio',
        isPublic: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const migrated = await versionManager.migrate(oldProfile);
      
      expect(migrated.achievements).toEqual([]);
      expect(migrated.statistics).toBeNull();
      expect(migrated._version.schemaVersion).toBe('1.0.0');
      expect(migrated._version.previousVersion).toBe('0.9.0');
      expect(migrated._version.migratedAt).toBeInstanceOf(Date);
    });

    it('should not migrate current version profiles', async () => {
      const currentProfile = {
        playerId: '123',
        displayName: 'Test',
        achievements: [],
        statistics: null,
        _version: { schemaVersion: '1.0.0' }
      };

      const result = await versionManager.migrate(currentProfile);
      
      expect(result._version.schemaVersion).toBe('1.0.0');
      expect(result._version.migratedAt).toBeUndefined();
    });
  });

  describe('addVersionMetadata', () => {
    it('should add version metadata to profile', () => {
      const profile = {
        playerId: '123',
        displayName: 'Test',
        bio: '',
        avatarUrl: '',
        countryCode: 'US',
        isPublic: true,
        achievements: [],
        statistics: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const versioned = versionManager.addVersionMetadata(profile);
      
      expect(versioned._version).toBeDefined();
      expect(versioned._version.schemaVersion).toBe(PROFILE_SCHEMA_VERSION);
    });
  });

  describe('batchMigrate', () => {
    it('should migrate multiple profiles', async () => {
      const profiles = [
        { playerId: '1', displayName: 'User 1' },
        { playerId: '2', displayName: 'User 2', achievements: [] },
        { playerId: '3', displayName: 'User 3' }
      ];

      const results = await versionManager.batchMigrate(profiles);
      
      expect(results).toHaveLength(3);
      expect(results[0]._version.schemaVersion).toBe('1.0.0');
      expect(results[1]._version.schemaVersion).toBe('1.0.0');
      expect(results[2]._version.schemaVersion).toBe('1.0.0');
    });
  });

  describe('getMigrationHistory', () => {
    it('should return migration history', () => {
      const history = versionManager.getMigrationHistory();
      
      expect(history).toContainEqual({
        from: '0.9.0',
        to: '1.0.0',
        description: 'Add achievements and statistics fields'
      });
    });
  });
});

describe('ProfileMigrationRegistry', () => {
  let registry: ProfileMigrationRegistry;

  beforeEach(() => {
    registry = new ProfileMigrationRegistry();
  });

  describe('register', () => {
    it('should register migrations', () => {
      const migration = {
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        description: 'Test migration',
        migrate: async (profile: any) => ({ ...profile, newField: true })
      };

      registry.register(migration);
      
      const migrations = registry.getMigrationsFrom('1.0.0');
      expect(migrations).toHaveLength(1);
      expect(migrations[0]).toBe(migration);
    });

    it('should allow multiple migrations from same version', () => {
      const migration1 = {
        fromVersion: '1.0.0',
        toVersion: '1.0.1',
        description: 'Patch 1',
        migrate: async (p: any) => p
      };

      const migration2 = {
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        description: 'Minor update',
        migrate: async (p: any) => p
      };

      registry.register(migration1);
      registry.register(migration2);
      
      const migrations = registry.getMigrationsFrom('1.0.0');
      expect(migrations).toHaveLength(2);
    });
  });

  describe('findMigrationPath', () => {
    beforeEach(() => {
      registry.register({
        fromVersion: '1.0.0',
        toVersion: '1.1.0',
        description: 'Step 1',
        migrate: async (p) => p
      });

      registry.register({
        fromVersion: '1.1.0',
        toVersion: '1.2.0',
        description: 'Step 2',
        migrate: async (p) => p
      });

      registry.register({
        fromVersion: '1.2.0',
        toVersion: '2.0.0',
        description: 'Step 3',
        migrate: async (p) => p
      });
    });

    it('should find direct migration path', () => {
      const path = registry.findMigrationPath('1.0.0', '1.1.0');
      
      expect(path).toHaveLength(1);
      expect(path[0].fromVersion).toBe('1.0.0');
      expect(path[0].toVersion).toBe('1.1.0');
    });

    it('should find multi-step migration path', () => {
      const path = registry.findMigrationPath('1.0.0', '2.0.0');
      
      expect(path).toHaveLength(3);
      expect(path[0].toVersion).toBe('1.1.0');
      expect(path[1].toVersion).toBe('1.2.0');
      expect(path[2].toVersion).toBe('2.0.0');
    });

    it('should throw error if no path exists', () => {
      expect(() => {
        registry.findMigrationPath('1.0.0', '3.0.0');
      }).toThrow('No migration path found from 1.0.0 to 3.0.0');
    });
  });
});