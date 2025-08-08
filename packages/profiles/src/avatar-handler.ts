import { InvalidFileTypeError, FileSizeTooLargeError } from '@primo-poker/shared';

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

export class AvatarHandler {
  constructor(
    private r2Bucket: any, // R2Bucket type from Cloudflare
    private config: AvatarConfig
  ) {}

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
    const randomId = Math.random().toString(36).substring(2, 8);
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

  async deleteAvatar(key: string): Promise<void> {
    try {
      await this.r2Bucket.delete(key);
    } catch (error) {
      // Gracefully handle deletion errors
      console.warn(`Failed to delete avatar ${key}:`, error);
    }
  }

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
    // In a real implementation, this would use an image processing library
    // to check actual image dimensions. For now, we'll return true.
    // This is where you'd integrate with something like @cloudflare/images
    // or decode the image header to check dimensions.
    return true;
  }
}