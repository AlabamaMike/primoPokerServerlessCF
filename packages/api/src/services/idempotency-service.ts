/**
 * Idempotency Service
 * 
 * Handles storage and validation of idempotency keys to prevent
 * duplicate financial transactions on retries
 */

import { logger } from '@primo-poker/core';
import { IdempotencyRecord, IdempotencyOptions } from '@primo-poker/shared';
import crypto from 'crypto';

export class IdempotencyService {
  private readonly DEFAULT_TTL_SECONDS = 86400; // 24 hours
  private readonly KEY_PREFIX = 'idempotency:';
  
  constructor(
    private readonly kv: KVNamespace,
    private readonly options: IdempotencyOptions = {}
  ) {}

  /**
   * Check if an idempotency key exists and return cached response if available
   */
  async checkIdempotency(
    key: string,
    userId: string,
    action: string,
    requestBody: any
  ): Promise<{ exists: boolean; record?: IdempotencyRecord }> {
    try {
      const storageKey = this.getStorageKey(key, userId);
      const storedData = await this.kv.get(storageKey, 'json') as IdempotencyRecord | null;
      
      if (!storedData) {
        return { exists: false };
      }

      // Check if expired
      if (new Date(storedData.expiresAt) < new Date()) {
        await this.kv.delete(storageKey);
        return { exists: false };
      }

      // Validate request hash if enabled
      if (this.options.enableHashValidation) {
        const currentHash = this.generateRequestHash(requestBody);
        if (currentHash !== storedData.requestHash) {
          logger.warn('Idempotency key used with different request body', {
            key,
            userId,
            action,
            storedHash: storedData.requestHash,
            currentHash
          });
          return { 
            exists: true, 
            record: {
              ...storedData,
              status: 'failed',
              response: { 
                error: 'Request body does not match original request for this idempotency key' 
              }
            }
          };
        }
      }

      return { exists: true, record: storedData };
    } catch (error) {
      logger.error('Error checking idempotency', error as Error, { key, userId, action });
      // On error, allow request to proceed (fail open)
      return { exists: false };
    }
  }

  /**
   * Store idempotency record for a pending request
   */
  async storePendingRequest(
    key: string,
    userId: string,
    action: string,
    requestBody: any
  ): Promise<void> {
    try {
      const ttl = this.options.ttlSeconds || this.DEFAULT_TTL_SECONDS;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttl * 1000);
      
      const record: IdempotencyRecord = {
        key,
        userId,
        action,
        requestHash: this.generateRequestHash(requestBody),
        response: null,
        status: 'pending',
        createdAt: now,
        expiresAt
      };

      const storageKey = this.getStorageKey(key, userId);
      await this.kv.put(
        storageKey,
        JSON.stringify(record),
        { expirationTtl: ttl }
      );
    } catch (error) {
      logger.error('Error storing pending idempotency record', error as Error, { 
        key, 
        userId, 
        action 
      });
      // Allow request to proceed on storage failure
    }
  }

  /**
   * Update idempotency record with completed response
   */
  async storeCompletedResponse(
    key: string,
    userId: string,
    response: any,
    status: 'completed' | 'failed'
  ): Promise<void> {
    try {
      const storageKey = this.getStorageKey(key, userId);
      const existingData = await this.kv.get(storageKey, 'json') as IdempotencyRecord | null;
      
      if (!existingData) {
        logger.warn('Idempotency record not found when storing response', { key, userId });
        return;
      }

      const ttl = this.options.ttlSeconds || this.DEFAULT_TTL_SECONDS;
      const remainingTtl = Math.max(
        0,
        Math.floor((new Date(existingData.expiresAt).getTime() - Date.now()) / 1000)
      );

      const updatedRecord: IdempotencyRecord = {
        ...existingData,
        response,
        status
      };

      await this.kv.put(
        storageKey,
        JSON.stringify(updatedRecord),
        { expirationTtl: remainingTtl || ttl }
      );
    } catch (error) {
      logger.error('Error storing completed idempotency response', error as Error, { 
        key, 
        userId, 
        status 
      });
    }
  }

  /**
   * Delete idempotency record (for cleanup or testing)
   */
  async deleteIdempotencyKey(key: string, userId: string): Promise<void> {
    try {
      const storageKey = this.getStorageKey(key, userId);
      await this.kv.delete(storageKey);
    } catch (error) {
      logger.error('Error deleting idempotency key', error as Error, { key, userId });
    }
  }

  /**
   * Get all active idempotency keys for a user (for debugging/admin)
   */
  async getUserIdempotencyKeys(userId: string, limit: number = 100): Promise<IdempotencyRecord[]> {
    try {
      const prefix = `${this.KEY_PREFIX}${userId}:`;
      const list = await this.kv.list({ prefix, limit });
      
      const records: IdempotencyRecord[] = [];
      for (const key of list.keys) {
        const record = await this.kv.get(key.name, 'json') as IdempotencyRecord | null;
        if (record && new Date(record.expiresAt) > new Date()) {
          records.push(record);
        }
      }
      
      return records.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      logger.error('Error getting user idempotency keys', error as Error, { userId });
      return [];
    }
  }

  /**
   * Generate storage key for KV namespace
   */
  private getStorageKey(key: string, userId: string): string {
    return `${this.KEY_PREFIX}${userId}:${key}`;
  }

  /**
   * Generate hash of request body for validation
   */
  private generateRequestHash(requestBody: any): string {
    const sortedBody = this.sortObject(requestBody);
    const bodyString = JSON.stringify(sortedBody);
    return crypto.createHash('sha256').update(bodyString).digest('hex');
  }

  /**
   * Sort object keys recursively for consistent hashing
   */
  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }

    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObject(obj[key]);
    });
    return sorted;
  }
}