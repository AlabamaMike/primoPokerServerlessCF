/**
 * Idempotency Tests
 * 
 * Tests for idempotency key support in wallet transactions
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { WalletRoutes } from '../routes/wallet-routes';
import { IdempotencyService } from '../services/idempotency-service';
import { WalletManager } from '@primo-poker/persistence';
import { RandomUtils } from '@primo-poker/shared';

// Mock dependencies
jest.mock('@primo-poker/persistence');
jest.mock('@primo-poker/core', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Idempotency Tests', () => {
  let walletRoutes: WalletRoutes;
  let mockEnv: any;
  let mockKV: any;
  let mockRequest: any;

  beforeEach(() => {
    // Mock KV storage
    mockKV = {
      get: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      list: jest.fn(),
    };

    // Mock environment
    mockEnv = {
      KV: mockKV,
      JWT_SECRET: 'test-secret',
    };

    // Mock authenticated request
    mockRequest = {
      user: { userId: 'test-user-123', username: 'testuser' },
      env: mockEnv,
      rateLimitInfo: {
        limit: 100,
        remaining: 99,
        reset: Date.now() + 3600000,
      },
      headers: new Map([
        ['Content-Type', 'application/json'],
      ]),
      url: 'https://api.example.com/api/wallet/deposit',
      method: 'POST',
      json: jest.fn(),
    };

    // Create instance
    walletRoutes = new WalletRoutes();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Deposit Idempotency', () => {
    it('should process deposit successfully without idempotency key', async () => {
      const depositData = {
        amount: 100,
        method: 'credit_card'
      };

      mockRequest.json.mockResolvedValue(depositData);

      const mockWalletManager = WalletManager as jest.MockedClass<typeof WalletManager>;
      mockWalletManager.prototype.deposit.mockResolvedValue({
        success: true,
        newBalance: 1100,
        transactionId: 'txn-123'
      });

      const router = walletRoutes.getRouter();
      const handler = router.routes.find(r => r.path === '/deposit' && r.method === 'POST')?.handler;
      const response = await handler?.(mockRequest);

      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.success).toBe(true);
      expect(body.data.newBalance).toBe(1100);
    });

    it('should return cached response for duplicate idempotency key', async () => {
      const idempotencyKey = 'test-idempotency-key-123';
      const depositData = {
        amount: 100,
        method: 'credit_card',
        idempotencyKey
      };

      const cachedResponse = {
        success: true,
        newBalance: 1100,
        transactionId: 'txn-cached-123'
      };

      // Mock idempotency record exists
      mockKV.get.mockResolvedValue(JSON.stringify({
        key: idempotencyKey,
        userId: 'test-user-123',
        action: 'deposit',
        requestHash: 'hash123',
        response: cachedResponse,
        status: 'completed',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000)
      }));

      mockRequest.json.mockResolvedValue(depositData);

      const router = walletRoutes.getRouter();
      const handler = router.routes.find(r => r.path === '/deposit' && r.method === 'POST')?.handler;
      const response = await handler?.(mockRequest);

      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual(cachedResponse);
      
      // Verify wallet manager was not called
      const mockWalletManager = WalletManager as jest.MockedClass<typeof WalletManager>;
      expect(mockWalletManager.prototype.deposit).not.toHaveBeenCalled();
    });

    it('should validate request hash when enabled', async () => {
      const idempotencyKey = 'test-idempotency-key-456';
      const originalData = {
        amount: 100,
        method: 'credit_card',
        idempotencyKey
      };

      const modifiedData = {
        amount: 200, // Different amount
        method: 'credit_card',
        idempotencyKey
      };

      // Mock idempotency record with different hash
      mockKV.get.mockResolvedValue(JSON.stringify({
        key: idempotencyKey,
        userId: 'test-user-123',
        action: 'deposit',
        requestHash: 'original-hash',
        response: { success: true },
        status: 'completed',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000)
      }));

      mockRequest.json.mockResolvedValue(modifiedData);

      // Create service with hash validation enabled
      const idempotencyService = new IdempotencyService(mockKV, {
        enableHashValidation: true
      });

      const result = await idempotencyService.checkIdempotency(
        idempotencyKey,
        'test-user-123',
        'deposit',
        modifiedData
      );

      expect(result.exists).toBe(true);
      expect(result.record?.status).toBe('failed');
      expect(result.record?.response.error).toContain('does not match original request');
    });

    it('should handle expired idempotency keys', async () => {
      const idempotencyKey = 'test-expired-key';
      const depositData = {
        amount: 100,
        method: 'credit_card',
        idempotencyKey
      };

      // Mock expired idempotency record
      mockKV.get.mockResolvedValue(JSON.stringify({
        key: idempotencyKey,
        userId: 'test-user-123',
        action: 'deposit',
        requestHash: 'hash123',
        response: { success: true },
        status: 'completed',
        createdAt: new Date(Date.now() - 90000000), // Created 25 hours ago
        expiresAt: new Date(Date.now() - 3600000) // Expired 1 hour ago
      }));

      mockRequest.json.mockResolvedValue(depositData);

      const mockWalletManager = WalletManager as jest.MockedClass<typeof WalletManager>;
      mockWalletManager.prototype.deposit.mockResolvedValue({
        success: true,
        newBalance: 1100,
        transactionId: 'txn-new-123'
      });

      const router = walletRoutes.getRouter();
      const handler = router.routes.find(r => r.path === '/deposit' && r.method === 'POST')?.handler;
      const response = await handler?.(mockRequest);

      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.success).toBe(true);
      expect(body.data.transactionId).toBe('txn-new-123');
      
      // Verify expired key was deleted
      expect(mockKV.delete).toHaveBeenCalledWith(expect.stringContaining('test-expired-key'));
    });

    it('should store failed responses for idempotency', async () => {
      const idempotencyKey = 'test-failed-key';
      const depositData = {
        amount: 100,
        method: 'credit_card',
        idempotencyKey
      };

      mockRequest.json.mockResolvedValue(depositData);
      mockKV.get.mockResolvedValue(null); // No existing record

      const mockWalletManager = WalletManager as jest.MockedClass<typeof WalletManager>;
      mockWalletManager.prototype.deposit.mockResolvedValue({
        success: false,
        error: 'Insufficient funds'
      });

      const router = walletRoutes.getRouter();
      const handler = router.routes.find(r => r.path === '/deposit' && r.method === 'POST')?.handler;
      const response = await handler?.(mockRequest);

      expect(response?.status).toBe(400);
      const body = await response?.json();
      expect(body.success).toBe(false);
      expect(body.error.message).toBe('Insufficient funds');

      // Verify failed response was stored
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey),
        expect.stringContaining('"status":"failed"'),
        expect.any(Object)
      );
    });
  });

  describe('Withdrawal Idempotency', () => {
    it('should handle withdrawal with idempotency', async () => {
      const idempotencyKey = 'withdraw-key-123';
      const withdrawData = {
        amount: 50,
        method: 'bank',
        idempotencyKey
      };

      mockRequest.json.mockResolvedValue(withdrawData);
      mockKV.get.mockResolvedValue(null); // No existing record

      const mockWalletManager = WalletManager as jest.MockedClass<typeof WalletManager>;
      mockWalletManager.prototype.withdraw.mockResolvedValue({
        success: true,
        newBalance: 950,
        transactionId: 'txn-withdraw-123'
      });
      mockWalletManager.prototype.getWallet.mockResolvedValue({
        playerId: 'test-user-123',
        balance: 950,
        currency: 'USD',
        frozen: 0,
        lastUpdated: new Date()
      });

      const router = walletRoutes.getRouter();
      const handler = router.routes.find(r => r.path === '/withdraw' && r.method === 'POST')?.handler;
      const response = await handler?.(mockRequest);

      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.success).toBe(true);
      expect(body.data.newBalance).toBe(950);

      // Verify idempotency key was stored
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining(idempotencyKey),
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('Transfer Idempotency', () => {
    it('should handle transfer with idempotency', async () => {
      const idempotencyKey = 'transfer-key-123';
      const transferData = {
        to_table_id: 'table-456',
        amount: 200,
        idempotencyKey
      };

      mockRequest.json.mockResolvedValue(transferData);
      mockKV.get.mockResolvedValue(null); // No existing record

      const mockWalletManager = WalletManager as jest.MockedClass<typeof WalletManager>;
      mockWalletManager.prototype.transfer.mockResolvedValue({
        success: true,
        newBalance: 800,
        transferredAmount: 200,
        transactionId: 'txn-transfer-123'
      });

      const router = walletRoutes.getRouter();
      const handler = router.routes.find(r => r.path === '/transfer' && r.method === 'POST')?.handler;
      const response = await handler?.(mockRequest);

      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.success).toBe(true);
      expect(body.data.transferredAmount).toBe(200);
    });
  });

  describe('Buy-in Idempotency', () => {
    it('should handle buy-in with idempotency', async () => {
      const idempotencyKey = 'buyin-key-123';
      const buyInData = {
        tableId: 'table-789',
        amount: 100,
        idempotencyKey
      };

      mockRequest.json.mockResolvedValue(buyInData);
      mockKV.get.mockResolvedValue(null); // No existing record

      const mockWalletManager = WalletManager as jest.MockedClass<typeof WalletManager>;
      mockWalletManager.prototype.processBuyIn.mockResolvedValue({
        success: true,
        chipCount: 100,
        walletBalance: 900
      });

      const router = walletRoutes.getRouter();
      const handler = router.routes.find(r => r.path === '/buyin' && r.method === 'POST')?.handler;
      const response = await handler?.(mockRequest);

      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.success).toBe(true);
      expect(body.data.chipCount).toBe(100);
    });
  });

  describe('Cash-out Idempotency', () => {
    it('should handle cash-out with idempotency', async () => {
      const idempotencyKey = 'cashout-key-123';
      const cashOutData = {
        tableId: 'table-789',
        chipAmount: 150,
        idempotencyKey
      };

      mockRequest.json.mockResolvedValue(cashOutData);
      mockKV.get.mockResolvedValue(null); // No existing record

      const mockWalletManager = WalletManager as jest.MockedClass<typeof WalletManager>;
      mockWalletManager.prototype.processCashOut.mockResolvedValue(undefined);
      mockWalletManager.prototype.getWallet.mockResolvedValue({
        playerId: 'test-user-123',
        balance: 1150,
        currency: 'USD',
        frozen: 0,
        lastUpdated: new Date()
      });

      const router = walletRoutes.getRouter();
      const handler = router.routes.find(r => r.path === '/cashout' && r.method === 'POST')?.handler;
      const response = await handler?.(mockRequest);

      expect(response?.status).toBe(200);
      const body = await response?.json();
      expect(body.success).toBe(true);
      expect(body.data.cashedOut).toBe(150);
    });
  });

  describe('IdempotencyService', () => {
    it('should generate consistent request hashes', () => {
      const service = new IdempotencyService(mockKV);
      const requestBody1 = { amount: 100, method: 'credit_card', extra: { nested: true } };
      const requestBody2 = { extra: { nested: true }, amount: 100, method: 'credit_card' }; // Different order

      const hash1 = service['generateRequestHash'](requestBody1);
      const hash2 = service['generateRequestHash'](requestBody2);

      expect(hash1).toBe(hash2); // Should be same despite different key order
    });

    it('should handle concurrent requests with same idempotency key', async () => {
      const idempotencyKey = 'concurrent-key';
      const service = new IdempotencyService(mockKV);

      // First request stores pending
      mockKV.get.mockResolvedValueOnce(null);
      await service.storePendingRequest(idempotencyKey, 'user-1', 'deposit', { amount: 100 });

      // Second request finds pending
      mockKV.get.mockResolvedValueOnce(JSON.stringify({
        key: idempotencyKey,
        userId: 'user-1',
        action: 'deposit',
        requestHash: 'hash',
        response: null,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000)
      }));

      const result = await service.checkIdempotency(idempotencyKey, 'user-1', 'deposit', { amount: 100 });
      expect(result.exists).toBe(true);
      expect(result.record?.status).toBe('pending');
    });
  });
});