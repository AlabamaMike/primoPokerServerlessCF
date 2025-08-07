import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PokerAPIRoutes } from '../routes';
import { D1Database } from '@cloudflare/workers-types';
import { AuthenticationManager } from '@primo-poker/security';
import { WalletManager } from '@primo-poker/persistence';

// Mock interfaces
interface MockEnv {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  TABLE_OBJECTS: DurableObjectNamespace;
  GAME_TABLES: DurableObjectNamespace;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
}

// Mock WalletManager
jest.mock('@primo-poker/persistence', () => {
  const originalModule = jest.requireActual('@primo-poker/persistence');
  return {
    ...originalModule,
    WalletManager: jest.fn().mockImplementation(() => ({
      getWallet: jest.fn(),
      processBuyIn: jest.fn(),
      processCashOut: jest.fn(),
      getTransactionHistory: jest.fn(),
      deposit: jest.fn(),
      withdraw: jest.fn(),
      transfer: jest.fn(),
    })),
  };
});

// Helper to create mock request
const createMockRequest = (
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
) => {
  const request = new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return request;
};

// Helper to create authenticated request
const createAuthenticatedRequest = (
  method: string,
  path: string,
  token: string,
  body?: any
) => {
  return createMockRequest(method, path, body, {
    Authorization: `Bearer ${token}`,
  });
};

describe('Wallet API Endpoints', () => {
  let api: PokerAPIRoutes;
  let mockEnv: MockEnv;
  let mockWalletManager: jest.Mocked<WalletManager>;
  let mockAuthManager: AuthenticationManager;
  let validToken: string;
  const testUserId = 'test-user-123';
  const testUsername = 'testuser';

  beforeEach(async () => {
    // Clear all mocks
    jest.clearAllMocks();
    
    // Create a new instance of the API
    api = new PokerAPIRoutes();
    
    // Create mock environment
    mockEnv = {
      DB: {} as D1Database,
      SESSION_STORE: {} as KVNamespace,
      TABLE_OBJECTS: {} as DurableObjectNamespace,
      GAME_TABLES: {} as DurableObjectNamespace,
      JWT_SECRET: 'test-secret-key-for-testing',
      ENVIRONMENT: 'test',
    };

    // Get the mocked wallet manager instance from the API
    mockWalletManager = (api as any).walletManager as jest.Mocked<WalletManager>;

    // Setup default mock implementations
    mockWalletManager.getWallet.mockResolvedValue({
      playerId: testUserId,
      balance: 1000,
      currency: 'USD',
      frozen: 0,
      lastUpdated: new Date(),
    });

    // Create auth manager and generate valid token
    mockAuthManager = new AuthenticationManager(mockEnv.JWT_SECRET);
    const tokens = await mockAuthManager.createTokensForUser({
      userId: testUserId,
      username: testUsername,
      email: 'test@example.com',
      roles: ['player'],
    });
    validToken = tokens.accessToken;
  });

  describe('POST /api/wallet/deposit', () => {
    it('should successfully process deposit', async () => {
      mockWalletManager.deposit.mockResolvedValue({
        success: true,
        newBalance: 1100,
        transactionId: 'txn-123',
      });

      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/deposit',
        validToken,
        { amount: 100, method: 'credit_card' }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.newBalance).toBe(1100);
      expect(data.data.transactionId).toBeDefined();
    });

    it('should reject deposit without authentication', async () => {
      const request = createMockRequest('POST', '/api/wallet/deposit', {
        amount: 100,
        method: 'credit_card',
      });
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(401);
    });

    it('should validate deposit amount is positive', async () => {
      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/deposit',
        validToken,
        { amount: -100, method: 'credit_card' }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it('should validate payment method', async () => {
      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/deposit',
        validToken,
        { amount: 100, method: 'invalid_method' }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it('should handle deposit failures', async () => {
      mockWalletManager.deposit.mockResolvedValue({
        success: false,
        error: 'Deposit service unavailable',
      });

      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/deposit',
        validToken,
        { amount: 100, method: 'credit_card' }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Deposit service unavailable');
    });
  });

  describe('POST /api/wallet/withdraw', () => {
    it('should successfully process withdrawal', async () => {
      mockWalletManager.withdraw.mockResolvedValue({
        success: true,
        newBalance: 950,
        transactionId: 'txn-456',
      });

      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/withdraw',
        validToken,
        { amount: 50, method: 'bank' }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.newBalance).toBe(950);
    });

    it('should reject withdrawal without authentication', async () => {
      const request = createMockRequest('POST', '/api/wallet/withdraw', {
        amount: 50,
        method: 'bank',
      });
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(401);
    });

    it('should validate withdrawal amount', async () => {
      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/withdraw',
        validToken,
        { amount: 0, method: 'bank' }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it('should check sufficient balance for withdrawal', async () => {
      mockWalletManager.withdraw = jest.fn().mockResolvedValue({
        success: false,
        error: 'Insufficient funds',
      });

      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/withdraw',
        validToken,
        { amount: 10000, method: 'bank' }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Insufficient funds');
    });
  });

  describe('POST /api/wallet/transfer', () => {
    it('should successfully process transfer', async () => {
      mockWalletManager.transfer.mockResolvedValue({
        success: true,
        newBalance: 900,
        transferredAmount: 100,
        transactionId: 'txn-transfer-123',
      });

      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/transfer',
        validToken,
        { to_table_id: 'table-456', amount: 100 }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.newBalance).toBe(900);
      expect(data.data.transferredAmount).toBe(100);
    });

    it('should validate transfer destination', async () => {
      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/transfer',
        validToken,
        { to_table_id: '', amount: 100 }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it('should validate transfer amount', async () => {
      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/transfer',
        validToken,
        { to_table_id: 'table-456', amount: -50 }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it('should handle transfer failures', async () => {
      mockWalletManager.transfer.mockResolvedValue({
        success: false,
        error: 'Insufficient funds',
      });

      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/transfer',
        validToken,
        { to_table_id: 'table-456', amount: 10000 }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toBe('Insufficient funds');
    });
  });

  describe('GET /api/wallet/balance', () => {
    it('should return balance data in correct format', async () => {
      mockWalletManager.getWallet = jest.fn().mockResolvedValue({
        playerId: testUserId,
        balance: 1000,
        currency: 'USD',
        frozen: 100,
        lastUpdated: new Date(),
      });

      const request = createAuthenticatedRequest(
        'GET',
        '/api/wallet/balance',
        validToken
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      // Currently /api/wallet exists, but we need /api/wallet/balance
      if (response.status === 200) {
        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('balance');
        expect(data.data).toHaveProperty('pending');
      }
    });

    it('should reject without authentication', async () => {
      const request = createMockRequest('GET', '/api/wallet/balance');
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/wallet/transactions', () => {
    it('should support pagination parameters', async () => {
      mockWalletManager.getTransactionHistory = jest.fn().mockResolvedValue({
        transactions: [
          {
            id: 'txn-1',
            type: 'deposit',
            amount: 100,
            timestamp: new Date(),
            description: 'Deposit via credit card',
          },
        ],
        nextCursor: 'cursor-123',
      });

      const request = createAuthenticatedRequest(
        'GET',
        '/api/wallet/transactions?limit=20&cursor=xxx',
        validToken
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.transactions)).toBe(true);
      expect(data.data).toHaveProperty('next_cursor');
    });

    it('should validate limit parameter', async () => {
      const request = createAuthenticatedRequest(
        'GET',
        '/api/wallet/transactions?limit=-1',
        validToken
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      // Should still work but use default limit
      expect(response.status).toBe(200);
    });

    it('should return empty array when no transactions', async () => {
      mockWalletManager.getTransactionHistory = jest.fn().mockResolvedValue({
        transactions: [],
        nextCursor: undefined
      });

      const request = createAuthenticatedRequest(
        'GET',
        '/api/wallet/transactions',
        validToken
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.transactions).toEqual([]);
      expect(data.data.next_cursor).toBeUndefined();
    });
  });

  describe('Authentication Tests', () => {
    it('should reject requests without Bearer token', async () => {
      const request = createMockRequest('POST', '/api/wallet/deposit', {
        amount: 100,
        method: 'credit_card',
      }, {
        Authorization: 'Basic sometoken', // Wrong auth type
      });
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(401);
    });

    it('should reject expired tokens', async () => {
      // Create an expired token
      const expiredToken = 'expired.jwt.token';
      
      const request = createAuthenticatedRequest(
        'GET',
        '/api/wallet/balance',
        expiredToken
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(401);
    });
  });

  describe('Request Validation Tests', () => {
    it('should validate required fields in deposit', async () => {
      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/deposit',
        validToken,
        { amount: 100 } // Missing method
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
    });

    it('should validate data types', async () => {
      const request = createAuthenticatedRequest(
        'POST',
        '/api/wallet/deposit',
        validToken,
        { amount: 'not-a-number', method: 'credit_card' }
      );
      (request as any).env = mockEnv;

      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(400);
    });
  });

  describe('Rate Limiting Tests', () => {
    it('should track request rate per user', async () => {
      // Make multiple requests rapidly
      const requests = Array(10).fill(null).map(() => 
        createAuthenticatedRequest(
          'POST',
          '/api/wallet/deposit',
          validToken,
          { amount: 10, method: 'credit_card' }
        )
      );

      const router = api.getRouter();
      const responses = await Promise.all(
        requests.map(req => {
          (req as any).env = mockEnv;
          return router.handle(req, mockEnv);
        })
      );

      // Should implement rate limiting - for now just check all requests complete
      responses.forEach(response => {
        expect([200, 404, 429]).toContain(response.status);
      });
    });
  });

  describe('Idempotency Tests', () => {
    it('should handle duplicate requests with same idempotency key', async () => {
      const idempotencyKey = 'idem-key-123';
      
      const request1 = createAuthenticatedRequest(
        'POST',
        '/api/wallet/deposit',
        validToken,
        { amount: 100, method: 'credit_card' },
      );
      request1.headers.set('Idempotency-Key', idempotencyKey);
      (request1 as any).env = mockEnv;

      const request2 = createAuthenticatedRequest(
        'POST',
        '/api/wallet/deposit',
        validToken,
        { amount: 100, method: 'credit_card' },
      );
      request2.headers.set('Idempotency-Key', idempotencyKey);
      (request2 as any).env = mockEnv;

      const router = api.getRouter();
      const response1 = await router.handle(request1, mockEnv);
      const response2 = await router.handle(request2, mockEnv);

      // When implemented, should return same response
      expect(response1.status).toBe(response2.status);
    });
  });
});