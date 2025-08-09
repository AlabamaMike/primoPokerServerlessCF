import { AvatarHandler } from '../avatar-handler';
import { InvalidFileTypeError, FileSizeTooLargeError } from '@primo-poker/shared';

// Mock R2 bucket interface
class MockR2Bucket {
  private storage = new Map<string, ArrayBuffer>();

  async put(key: string, value: ArrayBuffer | ReadableStream, options?: any): Promise<any> {
    if (value instanceof ArrayBuffer) {
      this.storage.set(key, value);
    }
    return { key };
  }

  async get(key: string): Promise<any> {
    const data = this.storage.get(key);
    if (!data) return null;
    return {
      body: data,
      arrayBuffer: async () => data
    };
  }

  async delete(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<any> {
    const keys = Array.from(this.storage.keys())
      .filter(key => !options?.prefix || key.startsWith(options.prefix));
    return {
      objects: keys.map(key => ({ key }))
    };
  }
}

describe('AvatarHandler', () => {
  let avatarHandler: AvatarHandler;
  let mockBucket: MockR2Bucket;

  beforeEach(() => {
    mockBucket = new MockR2Bucket();
    avatarHandler = new AvatarHandler(mockBucket as any, {
      maxFileSize: 5 * 1024 * 1024, // 5MB
      allowedFormats: ['image/jpeg', 'image/png', 'image/webp'],
      cdnBaseUrl: 'https://cdn.example.com'
    });
  });

  describe('uploadAvatar', () => {
    it('should upload a valid avatar image', async () => {
      const playerId = 'player1';
      const mockFile = new ArrayBuffer(1024); // 1KB
      const mimeType = 'image/jpeg';

      const result = await avatarHandler.uploadAvatar(playerId, mockFile, mimeType);

      expect(result.url).toMatch(/^https:\/\/cdn\.example\.com\/avatars\/player1-\d+-\w+\.jpg$/);
      expect(result.key).toMatch(/^avatars\/player1-\d+-\w+\.jpg$/);
      expect(result.size).toBe(1024);
    });

    it('should reject files that are too large', async () => {
      const playerId = 'player1';
      const mockFile = new ArrayBuffer(10 * 1024 * 1024); // 10MB
      const mimeType = 'image/jpeg';

      await expect(avatarHandler.uploadAvatar(playerId, mockFile, mimeType))
        .rejects.toThrow(FileSizeTooLargeError);
    });

    it('should reject invalid file types', async () => {
      const playerId = 'player1';
      const mockFile = new ArrayBuffer(1024);
      const mimeType = 'application/pdf';

      await expect(avatarHandler.uploadAvatar(playerId, mockFile, mimeType))
        .rejects.toThrow(InvalidFileTypeError);
    });

    it('should replace existing avatar when uploading new one', async () => {
      const playerId = 'player1';
      const firstFile = new ArrayBuffer(1024);
      const secondFile = new ArrayBuffer(2048);

      const first = await avatarHandler.uploadAvatar(playerId, firstFile, 'image/jpeg');
      const second = await avatarHandler.uploadAvatar(playerId, secondFile, 'image/png');

      expect(second.url).not.toBe(first.url);
      expect(second.size).toBe(2048);

      // Old avatar should be deleted
      const oldAvatars = await avatarHandler.listPlayerAvatars(playerId);
      expect(oldAvatars).toHaveLength(1);
      expect(oldAvatars[0].key).toBe(second.key);
    });

    it('should validate image dimensions', async () => {
      const playerId = 'player1';
      // Create a mock image with invalid dimensions
      const mockFile = new ArrayBuffer(1024);
      const mimeType = 'image/jpeg';

      // Override handler with dimension validation
      avatarHandler = new AvatarHandler(mockBucket as any, {
        maxFileSize: 5 * 1024 * 1024,
        allowedFormats: ['image/jpeg', 'image/png'],
        cdnBaseUrl: 'https://cdn.example.com',
        minDimensions: { width: 100, height: 100 },
        maxDimensions: { width: 2000, height: 2000 }
      });

      // For testing, we'll mock the dimension check
      // In real implementation, this would use image processing library
      const validateSpy = jest.spyOn(avatarHandler as any, 'validateImageDimensions')
        .mockResolvedValue(true);

      await avatarHandler.uploadAvatar(playerId, mockFile, mimeType);
      expect(validateSpy).toHaveBeenCalled();
    });
  });

  describe('deleteAvatar', () => {
    it('should delete an existing avatar', async () => {
      const playerId = 'player1';
      const mockFile = new ArrayBuffer(1024);
      
      const uploaded = await avatarHandler.uploadAvatar(playerId, mockFile, 'image/jpeg');
      await avatarHandler.deleteAvatar(uploaded.key);

      const remaining = await avatarHandler.listPlayerAvatars(playerId);
      expect(remaining).toHaveLength(0);
    });

    it('should handle deletion of non-existent avatar gracefully', async () => {
      await expect(avatarHandler.deleteAvatar('non-existent-key'))
        .resolves.not.toThrow();
    });
  });

  describe('getAvatarUrl', () => {
    it('should generate correct CDN URL for avatar key', () => {
      const key = 'avatars/player1-12345-abc.jpg';
      const url = avatarHandler.getAvatarUrl(key);
      expect(url).toBe('https://cdn.example.com/avatars/player1-12345-abc.jpg');
    });

    it('should handle keys with special characters', () => {
      const key = 'avatars/player-name@123-12345-abc.png';
      const url = avatarHandler.getAvatarUrl(key);
      expect(url).toBe('https://cdn.example.com/avatars/player-name@123-12345-abc.png');
    });
  });
});