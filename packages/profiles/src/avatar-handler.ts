import { InvalidFileTypeError, FileSizeTooLargeError } from '@primo-poker/shared';
import type { R2Bucket } from '@cloudflare/workers-types';

export interface AvatarConfig {
  maxFileSize: number;
  allowedFormats: string[];
  cdnBaseUrl: string;
  minDimensions?: { width: number; height: number };
  maxDimensions?: { width: number; height: number };
}

export interface AvatarUploadResult {
  url: string;
  key: string;
  size: number;
}

export interface AvatarInfo {
  key: string;
  size?: number;
  lastModified?: Date;
}

/**
 * Handles avatar upload, validation, and management for player profiles.
 * Integrates with Cloudflare R2 for storage and CDN delivery.
 */
export class AvatarHandler {
  constructor(
    private r2Bucket: R2Bucket,
    private config: AvatarConfig
  ) {}

  /**
   * Uploads a player avatar after validating file size, type, and dimensions.
   * Deletes any existing avatars for the player before uploading.
   * 
   * @param playerId - The unique identifier of the player
   * @param file - The avatar image file as ArrayBuffer
   * @param mimeType - The MIME type of the image
   * @returns Upload result with CDN URL and metadata
   * @throws {FileSizeTooLargeError} If file exceeds size limit
   * @throws {InvalidFileTypeError} If file type is invalid or content doesn't match type
   */
  async uploadAvatar(
    playerId: string,
    file: ArrayBuffer,
    mimeType: string
  ): Promise<AvatarUploadResult> {
    // Validate file size
    if (file.byteLength > this.config.maxFileSize) {
      throw new FileSizeTooLargeError(
        `File size ${file.byteLength} exceeds maximum allowed size of ${this.config.maxFileSize}`
      );
    }

    // Validate file type
    if (!this.config.allowedFormats.includes(mimeType)) {
      throw new InvalidFileTypeError(
        `File type ${mimeType} is not allowed. Allowed types: ${this.config.allowedFormats.join(', ')}`
      );
    }

    // Validate actual file content matches MIME type
    const actualType = await this.detectFileType(file);
    if (actualType !== mimeType) {
      throw new InvalidFileTypeError(
        `File content does not match declared type. Expected ${mimeType}, detected ${actualType}`
      );
    }

    // Validate dimensions if configured
    if (this.config.minDimensions || this.config.maxDimensions) {
      await this.validateImageDimensions(file, mimeType);
    }

    // Delete existing avatars for this player
    const existingAvatars = await this.listPlayerAvatars(playerId);
    for (const avatar of existingAvatars) {
      await this.deleteAvatar(avatar.key);
    }

    // Generate unique key for the avatar
    const timestamp = Date.now();
    const randomId = crypto.randomUUID().substring(0, 8);
    const extension = this.getFileExtension(mimeType);
    const key = `avatars/${playerId}-${timestamp}-${randomId}.${extension}`;

    // Upload to R2
    await this.r2Bucket.put(key, file, {
      httpMetadata: {
        contentType: mimeType,
      },
    });

    return {
      url: this.getAvatarUrl(key),
      key,
      size: file.byteLength,
    };
  }

  /**
   * Deletes an avatar from R2 storage.
   * Failures are logged but do not throw errors.
   * 
   * @param key - The R2 object key to delete
   */
  async deleteAvatar(key: string): Promise<void> {
    try {
      await this.r2Bucket.delete(key);
    } catch (error) {
      // Gracefully handle deletion errors
      // Use proper logger if available, fallback to console
      const logger = (globalThis as any).logger || console;
      logger.warn(`Failed to delete avatar ${key}:`, error);
    }
  }

  /**
   * Lists all avatars for a specific player.
   * 
   * @param playerId - The player ID to list avatars for
   * @returns Array of avatar metadata
   */
  async listPlayerAvatars(playerId: string): Promise<AvatarInfo[]> {
    const result = await this.r2Bucket.list({
      prefix: `avatars/${playerId}-`,
    });

    return result.objects.map((obj: any) => ({
      key: obj.key,
      size: obj.size,
      lastModified: obj.uploaded ? new Date(obj.uploaded) : undefined,
    }));
  }

  /**
   * Generates the CDN URL for an avatar.
   * 
   * @param key - The R2 object key
   * @returns Full CDN URL for the avatar
   */
  getAvatarUrl(key: string): string {
    return `${this.config.cdnBaseUrl}/${key}`;
  }

  private getFileExtension(mimeType: string): string {
    const extensions: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    };
    return extensions[mimeType] || 'jpg';
  }

  private async validateImageDimensions(
    file: ArrayBuffer,
    mimeType: string
  ): Promise<boolean> {
    // Check dimensions based on file header
    const dimensions = await this.getImageDimensions(file, mimeType);
    
    if (!dimensions) {
      throw new InvalidFileTypeError('Unable to determine image dimensions');
    }

    if (this.config.minDimensions) {
      if (dimensions.width < this.config.minDimensions.width ||
          dimensions.height < this.config.minDimensions.height) {
        throw new InvalidFileTypeError(
          `Image dimensions ${dimensions.width}x${dimensions.height} are below minimum ` +
          `${this.config.minDimensions.width}x${this.config.minDimensions.height}`
        );
      }
    }

    if (this.config.maxDimensions) {
      if (dimensions.width > this.config.maxDimensions.width ||
          dimensions.height > this.config.maxDimensions.height) {
        throw new InvalidFileTypeError(
          `Image dimensions ${dimensions.width}x${dimensions.height} exceed maximum ` +
          `${this.config.maxDimensions.width}x${this.config.maxDimensions.height}`
        );
      }
    }

    return true;
  }

  private async getImageDimensions(
    file: ArrayBuffer,
    mimeType: string
  ): Promise<{ width: number; height: number } | null> {
    const view = new DataView(file);

    // PNG dimensions
    if (mimeType === 'image/png') {
      // PNG header check
      if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
        return null;
      }
      // IHDR chunk contains dimensions
      const width = view.getUint32(16);
      const height = view.getUint32(20);
      return { width, height };
    }

    // JPEG dimensions
    if (mimeType === 'image/jpeg') {
      // JPEG SOI marker check
      if (view.getUint16(0) !== 0xffd8) {
        return null;
      }
      
      let offset = 2;
      while (offset < file.byteLength) {
        const marker = view.getUint16(offset);
        
        // SOF markers (0xFFC0 - 0xFFCF except 0xFFC4 and 0xFFC8)
        if ((marker >= 0xffc0 && marker <= 0xffcf) && 
            marker !== 0xffc4 && marker !== 0xffc8 && marker !== 0xffcc) {
          const height = view.getUint16(offset + 5);
          const width = view.getUint16(offset + 7);
          return { width, height };
        }
        
        offset += 2;
        const segmentSize = view.getUint16(offset);
        offset += segmentSize;
      }
    }

    // GIF dimensions
    if (mimeType === 'image/gif') {
      // GIF header check
      const header = new Uint8Array(file.slice(0, 6));
      const headerStr = String.fromCharCode(...header);
      if (!headerStr.startsWith('GIF87a') && !headerStr.startsWith('GIF89a')) {
        return null;
      }
      const width = view.getUint16(6, true); // Little-endian
      const height = view.getUint16(8, true); // Little-endian
      return { width, height };
    }

    // WebP dimensions
    if (mimeType === 'image/webp') {
      // WebP header check
      if (view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57454250) {
        return null;
      }
      // Simple lossy WebP format (VP8)
      if (view.getUint32(12) === 0x56503820) {
        const width = view.getUint16(26, true) & 0x3fff;
        const height = view.getUint16(28, true) & 0x3fff;
        return { width: width + 1, height: height + 1 };
      }
    }

    return null;
  }

  private async detectFileType(file: ArrayBuffer): Promise<string | null> {
    const view = new DataView(file);
    
    // PNG check
    if (file.byteLength >= 8 && 
        view.getUint32(0) === 0x89504e47 && 
        view.getUint32(4) === 0x0d0a1a0a) {
      return 'image/png';
    }
    
    // JPEG check
    if (file.byteLength >= 2 && view.getUint16(0) === 0xffd8) {
      return 'image/jpeg';
    }
    
    // GIF check
    if (file.byteLength >= 6) {
      const header = new Uint8Array(file.slice(0, 6));
      const headerStr = String.fromCharCode(...header);
      if (headerStr.startsWith('GIF87a') || headerStr.startsWith('GIF89a')) {
        return 'image/gif';
      }
    }
    
    // WebP check
    if (file.byteLength >= 12 &&
        view.getUint32(0) === 0x52494646 &&
        view.getUint32(8) === 0x57454250) {
      return 'image/webp';
    }
    
    return null;
  }
}