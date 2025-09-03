/**
 * IdempotencyService Unit Tests
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { IdempotencyService } from '../idempotency-service';
import { IdempotencyRecord } from '@primo-poker/shared';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockKV: any;

  beforeEach(() => {
    mockKV = {
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(() => ({ keys: [] })),
    };

    service = new IdempotencyService(mockKV, {
      ttlSeconds: 3600, // 1 hour for testing
      enableHashValidation: true
    });
  });

  describe('checkIdempotency', () => {
    it('should return exists: false for non-existent key', async () => {
      mockKV.get.mockResolvedValue(null);

      const result = await service.checkIdempotency(
        'new-key',
        'user-123',
        'deposit',
        { amount: 100 }
      );

      expect(result.exists).toBe(false);
      expect(result.record).toBeUndefined();
    });

    it('should return exists: true with record for existing key', async () => {
      const existingRecord: IdempotencyRecord = {
        key: 'existing-key',
        userId: 'user-123',
        action: 'deposit',
        requestHash: 'hash123',
        response: { success: true, balance: 1000 },
        status: 'completed',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000)
      };

      mockKV.get.mockResolvedValue(JSON.stringify(existingRecord));

      const result = await service.checkIdempotency(
        'existing-key',
        'user-123',
        'deposit',
        { amount: 100 }
      );

      expect(result.exists).toBe(true);
      expect(result.record).toEqual(existingRecord);
    });

    it('should delete and return exists: false for expired key', async () => {
      const expiredRecord: IdempotencyRecord = {
        key: 'expired-key',
        userId: 'user-123',
        action: 'deposit',
        requestHash: 'hash123',
        response: { success: true },
        status: 'completed',
        createdAt: new Date(Date.now() - 7200000), // 2 hours ago
        expiresAt: new Date(Date.now() - 3600000) // 1 hour ago
      };

      mockKV.get.mockResolvedValue(JSON.stringify(expiredRecord));

      const result = await service.checkIdempotency(
        'expired-key',
        'user-123',
        'deposit',
        { amount: 100 }
      );

      expect(result.exists).toBe(false);
      expect(mockKV.delete).toHaveBeenCalledWith('idempotency:user-123:expired-key');
    });

    it('should validate request hash when enabled', async () => {
      const existingRecord: IdempotencyRecord = {
        key: 'hash-key',
        userId: 'user-123',
        action: 'deposit',
        requestHash: service['generateRequestHash']({ amount: 100 }),
        response: { success: true },
        status: 'completed',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000)
      };

      mockKV.get.mockResolvedValue(JSON.stringify(existingRecord));

      // Different request body
      const result = await service.checkIdempotency(
        'hash-key',
        'user-123',
        'deposit',
        { amount: 200 } // Different amount
      );

      expect(result.exists).toBe(true);
      expect(result.record?.status).toBe('failed');
      expect(result.record?.response.error).toContain('does not match original request');
    });

    it('should handle KV errors gracefully', async () => {
      mockKV.get.mockRejectedValue(new Error('KV error'));

      const result = await service.checkIdempotency(
        'error-key',
        'user-123',
        'deposit',
        { amount: 100 }
      );

      expect(result.exists).toBe(false);
      expect(result.record).toBeUndefined();
    });
  });

  describe('storePendingRequest', () => {
    it('should store pending request with correct TTL', async () => {
      await service.storePendingRequest(
        'pending-key',
        'user-123',
        'withdraw',
        { amount: 50 }
      );

      expect(mockKV.put).toHaveBeenCalledWith(
        'idempotency:user-123:pending-key',
        expect.stringContaining('"status":"pending"'),
        { expirationTtl: 3600 }
      );
    });

    it('should handle storage errors gracefully', async () => {
      mockKV.put.mockRejectedValue(new Error('Storage error'));

      // Should not throw
      await expect(
        service.storePendingRequest('error-key', 'user-123', 'deposit', {})
      ).resolves.not.toThrow();
    });
  });

  describe('storeCompletedResponse', () => {
    it('should update existing record with response', async () => {
      const existingRecord: IdempotencyRecord = {
        key: 'update-key',
        userId: 'user-123',
        action: 'deposit',
        requestHash: 'hash',
        response: null,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000)
      };

      mockKV.get.mockResolvedValue(JSON.stringify(existingRecord));

      await service.storeCompletedResponse(
        'update-key',
        'user-123',
        { success: true, balance: 1000 },
        'completed'
      );

      expect(mockKV.put).toHaveBeenCalledWith(
        'idempotency:user-123:update-key',
        expect.stringContaining('"status":"completed"'),
        expect.any(Object)
      );
    });

    it('should handle missing record gracefully', async () => {
      mockKV.get.mockResolvedValue(null);

      // Should not throw
      await expect(
        service.storeCompletedResponse('missing-key', 'user-123', {}, 'completed')
      ).resolves.not.toThrow();
    });
  });

  describe('deleteIdempotencyKey', () => {
    it('should delete key from storage', async () => {
      await service.deleteIdempotencyKey('delete-key', 'user-123');

      expect(mockKV.delete).toHaveBeenCalledWith('idempotency:user-123:delete-key');
    });

    it('should handle deletion errors gracefully', async () => {
      mockKV.delete.mockRejectedValue(new Error('Delete error'));

      // Should not throw
      await expect(
        service.deleteIdempotencyKey('error-key', 'user-123')
      ).resolves.not.toThrow();
    });
  });

  describe('getUserIdempotencyKeys', () => {
    it('should return user idempotency keys', async () => {
      const keys = [
        { name: 'idempotency:user-123:key1' },
        { name: 'idempotency:user-123:key2' }
      ];

      const records = [
        {
          key: 'key1',
          userId: 'user-123',
          action: 'deposit',
          requestHash: 'hash1',
          response: { success: true },
          status: 'completed',
          createdAt: new Date(Date.now() - 1000),
          expiresAt: new Date(Date.now() + 3600000)
        },
        {
          key: 'key2',
          userId: 'user-123',
          action: 'withdraw',
          requestHash: 'hash2',
          response: { success: true },
          status: 'completed',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000)
        }
      ];

      mockKV.list.mockResolvedValue({ keys });
      mockKV.get
        .mockResolvedValueOnce(JSON.stringify(records[0]))
        .mockResolvedValueOnce(JSON.stringify(records[1]));

      const result = await service.getUserIdempotencyKeys('user-123');

      expect(result).toHaveLength(2);
      expect(result[0].key).toBe('key2'); // Most recent first
      expect(result[1].key).toBe('key1');
    });

    it('should filter out expired keys', async () => {
      const keys = [
        { name: 'idempotency:user-123:active' },
        { name: 'idempotency:user-123:expired' }
      ];

      mockKV.list.mockResolvedValue({ keys });
      mockKV.get
        .mockResolvedValueOnce(JSON.stringify({
          key: 'active',
          userId: 'user-123',
          action: 'deposit',
          requestHash: 'hash1',
          response: { success: true },
          status: 'completed',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 3600000) // Future
        }))
        .mockResolvedValueOnce(JSON.stringify({
          key: 'expired',
          userId: 'user-123',
          action: 'withdraw',
          requestHash: 'hash2',
          response: { success: true },
          status: 'completed',
          createdAt: new Date(Date.now() - 7200000),
          expiresAt: new Date(Date.now() - 3600000) // Past
        }));

      const result = await service.getUserIdempotencyKeys('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].key).toBe('active');
    });
  });

  describe('generateRequestHash', () => {
    it('should generate consistent hashes for same data', () => {
      const data1 = { a: 1, b: 2, c: { d: 3 } };
      const data2 = { c: { d: 3 }, a: 1, b: 2 }; // Different order

      const hash1 = service['generateRequestHash'](data1);
      const hash2 = service['generateRequestHash'](data2);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different data', () => {
      const data1 = { amount: 100 };
      const data2 = { amount: 200 };

      const hash1 = service['generateRequestHash'](data1);
      const hash2 = service['generateRequestHash'](data2);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle arrays in request data', () => {
      const data1 = { items: [1, 2, 3], name: 'test' };
      const data2 = { name: 'test', items: [1, 2, 3] };

      const hash1 = service['generateRequestHash'](data1);
      const hash2 = service['generateRequestHash'](data2);

      expect(hash1).toBe(hash2);
    });

    it('should handle null and undefined values', () => {
      const data = { a: null, b: undefined, c: 'value' };

      // Should not throw
      expect(() => service['generateRequestHash'](data)).not.toThrow();
    });
  });
});