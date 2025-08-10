import { ProfileManager, PlayerProfile } from '../profile-manager';
import { ProfileNotFoundError, ProfileAlreadyExistsError } from '@primo-poker/shared';

describe('ProfileManager', () => {
  let profileManager: ProfileManager;

  beforeEach(() => {
    profileManager = new ProfileManager();
  });

  describe('createProfile', () => {
    it('should create a new player profile', async () => {
      const profile = await profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Player One',
        bio: 'I love poker!',
        countryCode: 'US',
        isPublic: true
      });

      expect(profile.playerId).toBe('player1');
      expect(profile.displayName).toBe('Player One');
      expect(profile.bio).toBe('I love poker!');
      expect(profile.countryCode).toBe('US');
      expect(profile.isPublic).toBe(true);
      expect(profile.createdAt).toBeInstanceOf(Date);
      expect(profile.updatedAt).toBeInstanceOf(Date);
    });

    it('should throw error if profile already exists', async () => {
      await profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Player One',
        isPublic: true
      });

      await expect(profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Duplicate',
        isPublic: true
      })).rejects.toThrow(ProfileAlreadyExistsError);
    });

    it('should set default values for optional fields', async () => {
      const profile = await profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Player One',
        isPublic: true
      });

      expect(profile.bio).toBe('');
      expect(profile.countryCode).toBeUndefined();
      expect(profile.avatarUrl).toBeUndefined();
    });
  });

  describe('getProfile', () => {
    it('should retrieve an existing profile', async () => {
      const created = await profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Player One',
        isPublic: true
      });

      const retrieved = await profileManager.getProfile('player1');
      expect(retrieved).toEqual(created);
    });

    it('should throw error if profile not found', async () => {
      await expect(profileManager.getProfile('nonexistent'))
        .rejects.toThrow(ProfileNotFoundError);
    });
  });

  describe('updateProfile', () => {
    it('should update an existing profile', async () => {
      await profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Player One',
        bio: 'Old bio',
        isPublic: true
      });

      const updated = await profileManager.updateProfile('player1', {
        displayName: 'Updated Name',
        bio: 'New bio',
        countryCode: 'CA'
      });

      expect(updated.displayName).toBe('Updated Name');
      expect(updated.bio).toBe('New bio');
      expect(updated.countryCode).toBe('CA');
      expect(updated.updatedAt.getTime()).toBeGreaterThan(updated.createdAt.getTime());
    });

    it('should throw error if profile not found', async () => {
      await expect(profileManager.updateProfile('nonexistent', {
        displayName: 'New Name'
      })).rejects.toThrow(ProfileNotFoundError);
    });

    it('should not update playerId or timestamps directly', async () => {
      const created = await profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Player One',
        isPublic: true
      });

      const updated = await profileManager.updateProfile('player1', {
        playerId: 'player2' as any,
        createdAt: new Date('2020-01-01') as any,
        displayName: 'Updated Name'
      });

      expect(updated.playerId).toBe('player1');
      expect(updated.createdAt).toEqual(created.createdAt);
    });
  });

  describe('deleteProfile', () => {
    it('should soft delete a profile', async () => {
      await profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Player One',
        isPublic: true
      });

      await profileManager.deleteProfile('player1');

      await expect(profileManager.getProfile('player1'))
        .rejects.toThrow(ProfileNotFoundError);
    });

    it('should throw error if profile not found', async () => {
      await expect(profileManager.deleteProfile('nonexistent'))
        .rejects.toThrow(ProfileNotFoundError);
    });

    it('should not return deleted profiles in listings', async () => {
      await profileManager.createProfile({
        playerId: 'player1',
        displayName: 'Player One',
        isPublic: true
      });
      await profileManager.createProfile({
        playerId: 'player2',
        displayName: 'Player Two',
        isPublic: true
      });

      await profileManager.deleteProfile('player1');

      const profiles = await profileManager.listProfiles();
      expect(profiles).toHaveLength(1);
      expect(profiles[0].playerId).toBe('player2');
    });
  });

  describe('privacy settings', () => {
    it('should respect privacy settings when getting public profile', async () => {
      await profileManager.createProfile({
        playerId: 'private-player',
        displayName: 'Private Player',
        bio: 'Secret bio',
        isPublic: false
      });

      const publicView = await profileManager.getPublicProfile('private-player');
      expect(publicView.playerId).toBe('private-player');
      expect(publicView.displayName).toBe('Private Player');
      expect(publicView.bio).toBeUndefined();
      expect(publicView.isPublic).toBe(false);
    });

    it('should include all fields for public profiles', async () => {
      await profileManager.createProfile({
        playerId: 'public-player',
        displayName: 'Public Player',
        bio: 'Public bio',
        countryCode: 'US',
        isPublic: true
      });

      const publicView = await profileManager.getPublicProfile('public-player');
      expect(publicView.bio).toBe('Public bio');
      expect(publicView.countryCode).toBe('US');
    });
  });
});