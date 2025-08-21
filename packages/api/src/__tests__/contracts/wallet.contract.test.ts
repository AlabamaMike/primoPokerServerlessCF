import { z } from 'zod';
import { PokerAPIRoutes } from '../../routes';
import {
  createMockRequest,
  createAuthenticatedRequest,
  verifyContract,
  expectSuccessResponse,
  expectErrorResponse,
  testSchemaValidation,
} from './contract-test-utils';
import { AuthenticationManager } from '@primo-poker/security';
import { WalletManager } from '@primo-poker/persistence';

// Request schemas
const DepositRequestSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['CREDIT_CARD', 'BANK_TRANSFER', 'CRYPTO', 'OTHER']),
});

const WithdrawRequestSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['BANK_TRANSFER', 'CRYPTO', 'CHECK']),
});

const TransferRequestSchema = z.object({
  to_table_id: z.string().uuid(),
  amount: z.number().positive(),
});

const BuyInRequestSchema = z.object({
  tableId: z.string().uuid(),
  amount: z.number().positive(),
});

const CashOutRequestSchema = z.object({
  tableId: z.string().uuid(),
  chipAmount: z.number().positive(),
});

// Response schemas
const WalletResponseSchema = z.object({
  id: z.string().uuid(),
  playerId: z.string().uuid(),
  balance: z.number().nonnegative(),
  frozen: z.number().nonnegative(),
  currency: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const BalanceResponseSchema = z.object({
  balance: z.number().nonnegative(),
  pending: z.number().nonnegative(),
});

const TransactionResponseSchema = z.object({
  success: z.boolean(),
  newBalance: z.number().nonnegative(),
  transactionId: z.string().uuid(),
});

const TransferResponseSchema = z.object({
  success: z.boolean(),
  newBalance: z.number().nonnegative(),
  transferredAmount: z.number().positive(),
  transactionId: z.string().uuid(),
});

const BuyInResponseSchema = z.object({
  success: z.boolean(),
  transactionId: z.string().uuid(),
  newBalance: z.number().nonnegative(),
  tableChips: z.number().positive(),
});

const CashOutResponseSchema = z.object({
  success: z.boolean(),
  newBalance: z.number().nonnegative(),
  cashedOut: z.number().positive(),
});

const TransactionHistoryItemSchema = z.object({
  id: z.string().uuid(),
  walletId: z.string().uuid(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER_IN', 'TRANSFER_OUT', 'BUY_IN', 'CASH_OUT']),
  amount: z.number(),
  balance: z.number().nonnegative(),
  description: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  createdAt: z.string().datetime(),
});

const TransactionHistoryResponseSchema = z.object({
  transactions: z.array(TransactionHistoryItemSchema),
  next_cursor: z.string().optional(),
});

describe('Wallet API Contract Tests', () => {
  let api: PokerAPIRoutes;
  let router: any;

  beforeEach(() => {
    api = new PokerAPIRoutes();
    router = api.getRouter();
    jest.clearAllMocks();

    // Mock authentication for protected routes
    jest.spyOn(AuthenticationManager.prototype, 'verifyAccessToken').mockResolvedValue({
      valid: true,
      payload: {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['player'],
        sessionId: 'test-session',
        iat: Date.now() / 1000,
        exp: Date.now() / 1000 + 3600,
      },
    });
  });

  describe('GET /api/wallet', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should return wallet information', async () => {
      const mockWallet = {
        id: 'wallet-id',
        playerId: 'test-user-id',
        balance: 1000,
        frozen: 100,
        currency: 'USD',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet',
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'getWallet').mockResolvedValueOnce(mockWallet);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: WalletResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.balance).toBe(1000);
      expect(result.body.data.frozen).toBe(100);
    });

    it('should handle wallet service errors', async () => {
      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet',
      });

      // Mock wallet manager error
      jest.spyOn(WalletManager.prototype, 'getWallet').mockRejectedValueOnce(new Error('Database error'));

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(500);
      expectErrorResponse(body, '500', /Failed to get wallet information/);
    });
  });

  describe('GET /api/wallet/balance', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet/balance',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should return available balance', async () => {
      const mockWallet = {
        id: 'wallet-id',
        playerId: 'test-user-id',
        balance: 1000,
        frozen: 150,
        currency: 'USD',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet/balance',
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'getWallet').mockResolvedValueOnce(mockWallet);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: BalanceResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.balance).toBe(850); // 1000 - 150
      expect(result.body.data.pending).toBe(150);
    });
  });

  describe('POST /api/wallet/deposit', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        DepositRequestSchema,
        {
          amount: 100,
          method: 'CREDIT_CARD',
        },
        [
          { data: { amount: 0, method: 'CREDIT_CARD' }, expectedError: 'positive' },
          { data: { amount: -100, method: 'CREDIT_CARD' }, expectedError: 'positive' },
          { data: { amount: 100, method: 'INVALID' }, expectedError: 'Invalid' },
          { data: { amount: 100 }, expectedError: 'Required' },
          { data: { method: 'CREDIT_CARD' }, expectedError: 'Required' },
        ]
      );
    });

    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/deposit',
        body: { amount: 100, method: 'CREDIT_CARD' },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should process deposit successfully', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/deposit',
        body: { amount: 500, method: 'CREDIT_CARD' },
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'deposit').mockResolvedValueOnce({
        success: true,
        newBalance: 1500,
        transactionId: 'transaction-id',
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: DepositRequestSchema,
          responseSchema: TransactionResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.success).toBe(true);
      expect(result.body.data.newBalance).toBe(1500);
      expect(result.body.data.transactionId).toBeDefined();
    });

    it('should handle deposit failure', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/deposit',
        body: { amount: 10000, method: 'CREDIT_CARD' },
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'deposit').mockResolvedValueOnce({
        success: false,
        error: 'Transaction limit exceeded',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Transaction limit exceeded/);
    });

    it('should handle different deposit methods', async () => {
      const methods = ['CREDIT_CARD', 'BANK_TRANSFER', 'CRYPTO', 'OTHER'];

      for (const method of methods) {
        const request = createAuthenticatedRequest({
          method: 'POST',
          url: 'http://localhost/api/wallet/deposit',
          body: { amount: 100, method },
        });

        // Mock wallet manager response
        jest.spyOn(WalletManager.prototype, 'deposit').mockResolvedValueOnce({
          success: true,
          newBalance: 1100,
          transactionId: `${method}-transaction-id`,
        });

        const result = await verifyContract(
          router.handle.bind(router),
          request,
          {
            requestSchema: DepositRequestSchema,
            responseSchema: TransactionResponseSchema,
            statusCode: 200,
          }
        );

        expect(result.isValid).toBe(true);
        expectSuccessResponse(result.body);
      }
    });
  });

  describe('POST /api/wallet/withdraw', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        WithdrawRequestSchema,
        {
          amount: 100,
          method: 'BANK_TRANSFER',
        },
        [
          { data: { amount: 0, method: 'BANK_TRANSFER' }, expectedError: 'positive' },
          { data: { amount: -100, method: 'BANK_TRANSFER' }, expectedError: 'positive' },
          { data: { amount: 100, method: 'INVALID' }, expectedError: 'Invalid' },
          { data: { amount: 100 }, expectedError: 'Required' },
        ]
      );
    });

    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/withdraw',
        body: { amount: 100, method: 'BANK_TRANSFER' },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should process withdrawal successfully', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/withdraw',
        body: { amount: 200, method: 'BANK_TRANSFER' },
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'withdraw').mockResolvedValueOnce({
        success: true,
        newBalance: 800,
        transactionId: 'withdrawal-id',
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: WithdrawRequestSchema,
          responseSchema: TransactionResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.success).toBe(true);
      expect(result.body.data.newBalance).toBe(800);
    });

    it('should handle insufficient funds', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/withdraw',
        body: { amount: 5000, method: 'BANK_TRANSFER' },
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'withdraw').mockResolvedValueOnce({
        success: false,
        error: 'Insufficient funds',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Insufficient funds/);
    });
  });

  describe('POST /api/wallet/transfer', () => {
    it('should validate request schema', async () => {
      await testSchemaValidation(
        TransferRequestSchema,
        {
          to_table_id: '123e4567-e89b-12d3-a456-426614174000',
          amount: 100,
        },
        [
          { data: { to_table_id: '123e4567-e89b-12d3-a456-426614174000', amount: 0 }, expectedError: 'positive' },
          { data: { to_table_id: 'invalid-uuid', amount: 100 }, expectedError: 'Invalid' },
          { data: { amount: 100 }, expectedError: 'Required' },
        ]
      );
    });

    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/transfer',
        body: { to_table_id: '123e4567-e89b-12d3-a456-426614174000', amount: 100 },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should transfer funds successfully', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/transfer',
        body: { to_table_id: '123e4567-e89b-12d3-a456-426614174000', amount: 300 },
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'transfer').mockResolvedValueOnce({
        success: true,
        newBalance: 700,
        transferredAmount: 300,
        transactionId: 'transfer-id',
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: TransferRequestSchema,
          responseSchema: TransferResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.success).toBe(true);
      expect(result.body.data.transferredAmount).toBe(300);
    });
  });

  describe('POST /api/wallet/buy-in', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/buy-in',
        body: { tableId: 'table-id', amount: 100 },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should process buy-in successfully', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/buy-in',
        body: { tableId: 'table-id', amount: 500 },
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'processBuyIn').mockResolvedValueOnce({
        success: true,
        transactionId: 'buy-in-id',
        newBalance: 500,
        tableChips: 500,
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(body.data.success).toBe(true);
      expect(body.data.tableChips).toBe(500);
    });

    it('should handle invalid buy-in request', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/buy-in',
        body: { tableId: '', amount: 0 },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Invalid buy-in request/);
    });
  });

  describe('POST /api/wallet/cash-out', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/cash-out',
        body: { tableId: 'table-id', chipAmount: 100 },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should process cash-out successfully', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/cash-out',
        body: { tableId: 'table-id', chipAmount: 750 },
      });

      // Mock wallet manager responses
      jest.spyOn(WalletManager.prototype, 'processCashOut').mockResolvedValueOnce(undefined);
      jest.spyOn(WalletManager.prototype, 'getWallet').mockResolvedValueOnce({
        id: 'wallet-id',
        playerId: 'test-user-id',
        balance: 1750,
        frozen: 0,
        currency: 'USD',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          requestSchema: CashOutRequestSchema,
          responseSchema: CashOutResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.success).toBe(true);
      expect(result.body.data.newBalance).toBe(1750);
      expect(result.body.data.cashedOut).toBe(750);
    });

    it('should handle invalid cash-out request', async () => {
      const request = createAuthenticatedRequest({
        method: 'POST',
        url: 'http://localhost/api/wallet/cash-out',
        body: { tableId: '', chipAmount: -100 },
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(400);
      expectErrorResponse(body, '400', /Invalid cash-out request/);
    });
  });

  describe('GET /api/wallet/transactions', () => {
    it('should require authentication', async () => {
      const request = createMockRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet/transactions',
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expectErrorResponse(body, '401', /Missing or invalid authorization header/);
    });

    it('should return transaction history', async () => {
      const mockTransactions = [
        {
          id: 'trans-1',
          walletId: 'wallet-id',
          type: 'DEPOSIT' as const,
          amount: 1000,
          balance: 1000,
          description: 'Initial deposit',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'trans-2',
          walletId: 'wallet-id',
          type: 'BUY_IN' as const,
          amount: -500,
          balance: 500,
          description: 'Buy-in at Table 1',
          metadata: { tableId: 'table-1' },
          createdAt: new Date().toISOString(),
        },
      ];

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet/transactions',
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'getTransactionHistory').mockResolvedValueOnce({
        transactions: mockTransactions,
        nextCursor: 'next-page-cursor',
      });

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: TransactionHistoryResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.transactions).toHaveLength(2);
      expect(result.body.data.next_cursor).toBe('next-page-cursor');
    });

    it('should support pagination', async () => {
      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet/transactions',
        query: { limit: '10', cursor: 'page-cursor' },
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'getTransactionHistory').mockResolvedValueOnce({
        transactions: [],
        nextCursor: undefined,
      });

      const response = await router.handle(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expectSuccessResponse(body);
      expect(WalletManager.prototype.getTransactionHistory).toHaveBeenCalledWith('test-user-id', 10, 'page-cursor');
    });
  });

  describe('Wallet Edge Cases', () => {
    it('should handle zero balance wallet', async () => {
      const mockWallet = {
        id: 'wallet-id',
        playerId: 'test-user-id',
        balance: 0,
        frozen: 0,
        currency: 'USD',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet',
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'getWallet').mockResolvedValueOnce(mockWallet);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: WalletResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.balance).toBe(0);
    });

    it('should handle maximum balance values', async () => {
      const mockWallet = {
        id: 'wallet-id',
        playerId: 'test-user-id',
        balance: Number.MAX_SAFE_INTEGER,
        frozen: 0,
        currency: 'USD',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet',
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'getWallet').mockResolvedValueOnce(mockWallet);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: WalletResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.balance).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should handle fully frozen wallet', async () => {
      const mockWallet = {
        id: 'wallet-id',
        playerId: 'test-user-id',
        balance: 1000,
        frozen: 1000, // All funds frozen
        currency: 'USD',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const request = createAuthenticatedRequest({
        method: 'GET',
        url: 'http://localhost/api/wallet/balance',
      });

      // Mock wallet manager response
      jest.spyOn(WalletManager.prototype, 'getWallet').mockResolvedValueOnce(mockWallet);

      const result = await verifyContract(
        router.handle.bind(router),
        request,
        {
          responseSchema: BalanceResponseSchema,
          statusCode: 200,
        }
      );

      expect(result.isValid).toBe(true);
      expectSuccessResponse(result.body);
      expect(result.body.data.balance).toBe(0); // No available balance
      expect(result.body.data.pending).toBe(1000);
    });
  });
});