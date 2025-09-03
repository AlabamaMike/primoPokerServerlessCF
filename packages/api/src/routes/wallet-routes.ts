/**
 * Enhanced Wallet Routes
 * 
 * Provides optimized wallet API endpoints with caching,
 * batching, and real-time updates
 */

import { IRequest, Router } from 'itty-router';
import { 
  ApiResponse, 
  PlayerWallet,
  BuyInRequest,
  BuyInResponse,
  WorkerEnvironment,
  RandomUtils
} from '@primo-poker/shared';
import { logger } from '@primo-poker/core';
import { WalletManager } from '@primo-poker/persistence';
import { AuthenticationManager } from '@primo-poker/security';
import { WalletCacheService } from '../services/wallet-cache';
import { AuditLogger, AuditLogEntry } from '../services/audit-logger';
import { IdempotencyService } from '../services/idempotency-service';
import { enhancedWalletRateLimiter } from '../middleware/wallet-rate-limit';
import { requireAdmin } from '../middleware/role-auth';
import { requestSizeLimiter, safeJsonParse } from '../middleware/request-size-limit';
import {
  DepositRequestSchema,
  WithdrawRequestSchema,
  TransferRequestSchema,
  BuyInRequestSchema,
  CashOutRequestSchema,
  TransactionQuerySchema,
  validateRequestBody,
  validateQueryParams
} from '../validation/wallet-schemas';
import { 
  sanitizeWalletParams, 
  createSanitizedValidator,
  sanitizeAmount,
  sanitizeTableId,
  sanitizePlayerId
} from '../utils/input-sanitizer';

interface AuthenticatedRequest extends IRequest {
  user?: { userId: string; username: string };
  env?: WorkerEnvironment;
  rateLimitInfo?: {
    limit: number;
    remaining: number;
    reset: number;
  };
}

export class WalletRoutes {
  private router: ReturnType<typeof Router>;
  private walletManager: WalletManager;
  private cacheService?: WalletCacheService;
  private auditLogger?: AuditLogger;
  private idempotencyService?: IdempotencyService;
  private subscriptions: Map<string, Set<WebSocket>> = new Map();
  
  // Constants
  private readonly MAX_BATCH_SIZE = 100;

  constructor() {
    this.router = Router();
    this.walletManager = new WalletManager();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Apply request size limit middleware to all POST routes
    const sizeLimitMiddleware = requestSizeLimiter.middleware();
    
    // Wallet information endpoints
    this.router.get('/', enhancedWalletRateLimiter.middleware(), this.handleGetWallet.bind(this));
    this.router.get('/balance', enhancedWalletRateLimiter.middleware(), this.handleGetBalance.bind(this));
    
    // Transaction endpoints with size limits
    this.router.post('/deposit', sizeLimitMiddleware, enhancedWalletRateLimiter.middleware(), this.handleDeposit.bind(this));
    this.router.post('/withdraw', sizeLimitMiddleware, enhancedWalletRateLimiter.middleware(), this.handleWithdraw.bind(this));
    this.router.post('/transfer', sizeLimitMiddleware, enhancedWalletRateLimiter.middleware(), this.handleTransfer.bind(this));
    
    // Table operations with size limits
    this.router.post('/buyin', sizeLimitMiddleware, enhancedWalletRateLimiter.middleware(), this.handleBuyIn.bind(this));
    this.router.post('/cashout', sizeLimitMiddleware, enhancedWalletRateLimiter.middleware(), this.handleCashOut.bind(this));
    
    // Transaction history
    this.router.get('/transactions', enhancedWalletRateLimiter.middleware(), this.handleGetTransactions.bind(this));
    
    // Batch operations with size limits
    this.router.post('/batch/balances', sizeLimitMiddleware, enhancedWalletRateLimiter.middleware(), this.handleBatchGetBalances.bind(this));
    
    // WebSocket endpoint for real-time updates
    this.router.get('/subscribe', this.handleWebSocketUpgrade.bind(this));
    
    // Admin endpoints with size limits
    this.router.get('/stats', requireAdmin, this.handleGetStats.bind(this));
    this.router.post('/warm-cache', sizeLimitMiddleware, requireAdmin, this.handleWarmCache.bind(this));
    this.router.get('/audit', enhancedWalletRateLimiter.middleware(), this.handleGetAuditLogs.bind(this));
  }

  /**
   * Initialize cache and audit services if KV is available
   */
  private initializeServices(env: WorkerEnvironment): void {
    if (env.KV) {
      if (!this.cacheService) {
        this.cacheService = new WalletCacheService(env.KV, {
          ttlSeconds: 300,
          staleWhileRevalidateSeconds: 60,
          negativeCacheTtlSeconds: 30
        });
      }
      
      if (!this.auditLogger) {
        this.auditLogger = new AuditLogger(env.KV);
      }
      
      if (!this.idempotencyService) {
        this.idempotencyService = new IdempotencyService(env.KV, {
          ttlSeconds: 86400, // 24 hours
          enableHashValidation: true
        });
      }
    }
  }

  /**
   * Get wallet with caching
   */
  private async handleGetWallet(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      this.initializeServices(request.env!);
      const startTime = Date.now();
      
      let wallet: PlayerWallet;
      
      // Try cache first
      if (this.cacheService) {
        const cached = await this.cacheService.getCachedWallet(request.user.userId);
        if (cached) {
          logger.info('Wallet retrieved from cache', { 
            userId: request.user.userId,
            latency: Date.now() - startTime
          });
          
          return this.successResponse({
            wallet: cached,
            cached: true,
            latency: Date.now() - startTime
          }, request.rateLimitInfo);
        }
      }

      // Fetch from source
      wallet = await this.walletManager.getWallet(request.user.userId);
      
      // Cache for future requests
      if (this.cacheService) {
        await this.cacheService.setCachedWallet(wallet);
      }

      logger.info('Wallet retrieved from source', { 
        userId: request.user.userId,
        latency: Date.now() - startTime
      });

      return this.successResponse({
        wallet,
        cached: false,
        latency: Date.now() - startTime
      }, request.rateLimitInfo);
    } catch (error) {
      logger.error('Get wallet error', error as Error);
      return this.errorResponse('Failed to get wallet information', 500);
    }
  }

  /**
   * Get balance with optimistic caching
   */
  private async handleGetBalance(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      this.initializeServices(request.env!);
      
      let wallet: PlayerWallet;
      
      if (this.cacheService) {
        const cached = await this.cacheService.getCachedWallet(request.user.userId);
        if (cached) {
          return this.successResponse({
            balance: cached.balance - cached.frozen,
            pending: cached.frozen,
            cached: true
          }, request.rateLimitInfo);
        }
      }

      wallet = await this.walletManager.getWallet(request.user.userId);
      
      if (this.cacheService) {
        await this.cacheService.setCachedWallet(wallet);
      }

      return this.successResponse({
        balance: wallet.balance - wallet.frozen,
        pending: wallet.frozen,
        cached: false
      }, request.rateLimitInfo);
    } catch (error) {
      logger.error('Get balance error', error as Error);
      return this.errorResponse('Failed to get balance information', 500);
    }
  }

  /**
   * Handle deposit with optimistic updates and idempotency
   */
  private async handleDeposit(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await safeJsonParse(request);
      const validation = createSanitizedValidator(DepositRequestSchema)(body);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      this.initializeServices(request.env!);

      // Check idempotency if key provided
      if (validation.data.idempotencyKey && this.idempotencyService) {
        const idempotencyCheck = await this.idempotencyService.checkIdempotency(
          validation.data.idempotencyKey,
          request.user.userId,
          'deposit',
          validation.data
        );

        if (idempotencyCheck.exists && idempotencyCheck.record) {
          logger.info('Idempotent request detected for deposit', {
            userId: request.user.userId,
            key: validation.data.idempotencyKey,
            status: idempotencyCheck.record.status
          });

          // Return cached response
          if (idempotencyCheck.record.status === 'completed') {
            return this.successResponse(idempotencyCheck.record.response, request.rateLimitInfo);
          } else if (idempotencyCheck.record.status === 'failed') {
            return this.errorResponse(
              idempotencyCheck.record.response?.error || 'Deposit failed',
              400
            );
          }
          // If pending, allow retry (could be a previous timeout)
        }

        // Store pending request
        await this.idempotencyService.storePendingRequest(
          validation.data.idempotencyKey,
          request.user.userId,
          'deposit',
          validation.data
        );
      }

      // Record audit log
      await this.recordAuditLog(request, 'deposit', validation.data.amount, 'pending');

      let result;
      
      if (this.cacheService) {
        // Optimistic update
        const { wallet, rollback } = await this.cacheService.optimisticUpdate(
          request.user.userId,
          (wallet) => ({
            ...wallet,
            balance: wallet.balance + validation.data.amount,
            lastUpdated: new Date()
          }),
          async () => {
            const depositResult = await this.walletManager.deposit(
              request.user.userId,
              validation.data.amount,
              validation.data.method
            );
            
            if (!depositResult.success) {
              throw new Error(depositResult.error || 'Deposit failed');
            }
            
            return await this.walletManager.getWallet(request.user.userId);
          }
        );

        // Broadcast update to subscribers
        await this.broadcastWalletUpdate(request.user.userId, wallet);

        result = {
          success: true,
          newBalance: wallet.balance,
          transactionId: RandomUtils.generateUUID()
        };
      } else {
        // Direct update without caching
        result = await this.walletManager.deposit(
          request.user.userId,
          validation.data.amount,
          validation.data.method
        );
      }

      if (!result.success) {
        await this.recordAuditLog(request, 'deposit', validation.data.amount, 'failed');
        
        // Store failed response for idempotency
        if (validation.data.idempotencyKey && this.idempotencyService) {
          await this.idempotencyService.storeCompletedResponse(
            validation.data.idempotencyKey,
            request.user.userId,
            { error: result.error || 'Deposit failed' },
            'failed'
          );
        }
        
        return this.errorResponse(result.error || 'Deposit failed', 400);
      }

      await this.recordAuditLog(request, 'deposit', validation.data.amount, 'success');

      const response = {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId
      };

      // Store successful response for idempotency
      if (validation.data.idempotencyKey && this.idempotencyService) {
        await this.idempotencyService.storeCompletedResponse(
          validation.data.idempotencyKey,
          request.user.userId,
          response,
          'completed'
        );
      }

      return this.successResponse(response, request.rateLimitInfo);
    } catch (error) {
      logger.error('Deposit error', error as Error);
      
      // Store error response for idempotency
      if (validation.data?.idempotencyKey && this.idempotencyService) {
        await this.idempotencyService.storeCompletedResponse(
          validation.data.idempotencyKey,
          request.user!.userId,
          { error: 'Failed to process deposit' },
          'failed'
        );
      }
      
      return this.errorResponse('Failed to process deposit', 500);
    }
  }

  /**
   * Handle withdrawal with security checks and idempotency
   */
  private async handleWithdraw(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await safeJsonParse(request);
      const validation = createSanitizedValidator(WithdrawRequestSchema)(body);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      this.initializeServices(request.env!);

      // Record audit log
      await this.recordAuditLog(request, 'withdraw', validation.data.amount, 'pending');

      return await this.executeWithIdempotency(
        validation.data.idempotencyKey,
        request.user.userId,
        'withdraw',
        validation.data,
        request.rateLimitInfo,
        async () => {
          const result = await this.walletManager.withdraw(
            request.user.userId,
            validation.data.amount,
            validation.data.method
          );

          if (!result.success) {
            await this.recordAuditLog(request, 'withdraw', validation.data.amount, 'failed');
            return { success: false, error: result.error };
          }

          // Invalidate cache after withdrawal
          if (this.cacheService) {
            await this.cacheService.invalidateWallet(request.user.userId);
          }

          // Broadcast update
          const wallet = await this.walletManager.getWallet(request.user.userId);
          await this.broadcastWalletUpdate(request.user.userId, wallet);

          await this.recordAuditLog(request, 'withdraw', validation.data.amount, 'success');

          return {
            success: true,
            data: {
              success: true,
              newBalance: result.newBalance,
              transactionId: result.transactionId
            }
          };
        }
      );
    } catch (error) {
      logger.error('Withdraw error', error as Error);
      return this.errorResponse('Failed to process withdrawal', 500);
    }
  }

  /**
   * Handle transfers between wallets with idempotency
   */
  private async handleTransfer(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await safeJsonParse(request);
      const validation = createSanitizedValidator(TransferRequestSchema)(body);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      this.initializeServices(request.env!);

      await this.recordAuditLog(request, 'transfer', validation.data.amount, 'pending');

      return await this.executeWithIdempotency(
        validation.data.idempotencyKey,
        request.user.userId,
        'transfer',
        validation.data,
        request.rateLimitInfo,
        async () => {
          const result = await this.walletManager.transfer(
            request.user.userId,
            validation.data.to_table_id,
            validation.data.amount
          );

          if (!result.success) {
            await this.recordAuditLog(request, 'transfer', validation.data.amount, 'failed');
            return { success: false, error: result.error };
          }

          // Invalidate cache for sender
          if (this.cacheService) {
            await this.cacheService.invalidateWallet(request.user.userId);
          }

          await this.recordAuditLog(request, 'transfer', validation.data.amount, 'success');

          return {
            success: true,
            data: {
              success: true,
              newBalance: result.newBalance,
              transferredAmount: result.transferredAmount,
              transactionId: result.transactionId
            }
          };
        }
      );
    } catch (error) {
      logger.error('Transfer error', error as Error);
      return this.errorResponse('Failed to process transfer', 500);
    }
  }

  /**
   * Handle buy-in with caching and idempotency
   */
  private async handleBuyIn(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await safeJsonParse(request);
      const validation = createSanitizedValidator(BuyInRequestSchema)(body);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      this.initializeServices(request.env!);
      
      const buyInRequest: BuyInRequest = {
        tableId: validation.data.tableId,
        amount: validation.data.amount,
        playerId: request.user.userId
      };
      
      await this.recordAuditLog(request, 'buyin', buyInRequest.amount, 'pending');
      
      return await this.executeWithIdempotency(
        validation.data.idempotencyKey,
        request.user.userId,
        'buyin',
        validation.data,
        request.rateLimitInfo,
        async () => {
          const result = await this.walletManager.processBuyIn(buyInRequest);
          
          if (!result.success) {
            await this.recordAuditLog(request, 'buyin', buyInRequest.amount, 'failed');
            return { success: false, error: result.error };
          }

          // Invalidate cache after buy-in
          if (this.cacheService) {
            await this.cacheService.invalidateWallet(request.user.userId);
          }

          await this.recordAuditLog(request, 'buyin', buyInRequest.amount, 'success');
          
          return { success: true, data: result };
        }
      );
    } catch (error) {
      logger.error('Buy-in error', error as Error);
      return this.errorResponse('Failed to process buy-in', 500);
    }
  }

  /**
   * Handle cash-out with idempotency
   */
  private async handleCashOut(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await safeJsonParse(request);
      const validation = createSanitizedValidator(CashOutRequestSchema)(body);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      this.initializeServices(request.env!);

      await this.recordAuditLog(request, 'cashout', validation.data.chipAmount, 'pending');

      return await this.executeWithIdempotency(
        validation.data.idempotencyKey,
        request.user.userId,
        'cashout',
        validation.data,
        request.rateLimitInfo,
        async () => {
          await this.walletManager.processCashOut(
            request.user.userId, 
            validation.data.tableId, 
            validation.data.chipAmount
          );
          const wallet = await this.walletManager.getWallet(request.user.userId);
          
          // Update cache
          if (this.cacheService) {
            await this.cacheService.setCachedWallet(wallet);
          }

          // Broadcast update
          await this.broadcastWalletUpdate(request.user.userId, wallet);

          await this.recordAuditLog(request, 'cashout', validation.data.chipAmount, 'success');
          
          return {
            success: true,
            data: {
              success: true,
              newBalance: wallet.balance,
              cashedOut: validation.data.chipAmount
            }
          };
        }
      );
    } catch (error) {
      logger.error('Cash-out error', error as Error);
      return this.errorResponse('Failed to process cash-out', 500);
    }
  }

  /**
   * Get transaction history with caching
   */
  private async handleGetTransactions(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const url = new URL(request.url);
      const validation = validateQueryParams(TransactionQuerySchema, url.searchParams);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      const { limit = 20, cursor } = validation.data;
      
      this.initializeServices(request.env!);
      
      // Check cache first
      if (this.cacheService) {
        const cached = await this.cacheService.getCachedTransactionHistory(
          request.user.userId,
          cursor
        );
        
        if (cached) {
          return this.successResponse({
            transactions: cached.transactions,
            next_cursor: cached.nextCursor,
            cached: true
          }, request.rateLimitInfo);
        }
      }
      
      // Fetch from source
      const result = await this.walletManager.getTransactionHistory(
        request.user.userId,
        limit,
        cursor
      );
      
      // Cache the result
      if (this.cacheService) {
        await this.cacheService.cacheTransactionHistory(
          request.user.userId,
          result.transactions,
          cursor
        );
      }
      
      return this.successResponse({
        transactions: result.transactions,
        next_cursor: result.nextCursor,
        cached: false
      }, request.rateLimitInfo);
    } catch (error) {
      logger.error('Get transactions error', error as Error);
      return this.errorResponse('Failed to get transaction history', 500);
    }
  }

  /**
   * Batch get balances for multiple players
   */
  private async handleBatchGetBalances(request: AuthenticatedRequest): Promise<Response> {
    try {
      const rawBody = await safeJsonParse(request);
      
      // Sanitize player IDs
      let playerIds: string[];
      try {
        if (!Array.isArray(rawBody.playerIds) || rawBody.playerIds.length === 0) {
          return this.errorResponse('Invalid player IDs', 400);
        }
        
        if (rawBody.playerIds.length > this.MAX_BATCH_SIZE) {
          return this.errorResponse(`Maximum ${this.MAX_BATCH_SIZE} players per batch request`, 400);
        }
        
        // Sanitize each player ID
        playerIds = rawBody.playerIds.map(id => sanitizePlayerId(id));
      } catch (error) {
        return this.errorResponse(error instanceof Error ? error.message : 'Invalid player ID format', 400);
      }

      this.initializeServices(request.env!);
      
      const results: Record<string, { balance: number; frozen: number }> = {};
      const uncachedIds: string[] = [];
      
      // Check cache first
      if (this.cacheService) {
        const cachedWallets = await this.cacheService.getBatchWallets(playerIds);
        
        
        for (const [playerId, wallet] of cachedWallets) {
          if (wallet) {
            results[playerId] = {
              balance: wallet.balance,
              frozen: wallet.frozen
            };
          } else {
            uncachedIds.push(playerId);
          }
        }
      } else {
        uncachedIds.push(...playerIds);
      }
      
      // Fetch uncached wallets
      if (uncachedIds.length > 0) {
        const fetchPromises = uncachedIds.map(async (playerId) => {
          const wallet = await this.walletManager.getWallet(playerId);
          results[playerId] = {
            balance: wallet.balance,
            frozen: wallet.frozen
          };
          
          // Cache for future
          if (this.cacheService) {
            await this.cacheService.setCachedWallet(wallet);
          }
          
          return wallet;
        });
        
        await Promise.all(fetchPromises);
      }
      
      return this.successResponse({
        wallets: results,
        cached: uncachedIds.length === 0,
        total: playerIds.length
      }, request.rateLimitInfo);
    } catch (error) {
      logger.error('Batch get balances error', error as Error);
      return this.errorResponse('Failed to get batch balances', 500);
    }
  }

  /**
   * Handle WebSocket upgrade for real-time updates
   */
  private async handleWebSocketUpgrade(request: AuthenticatedRequest): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    
    if (!upgradeHeader || upgradeHeader !== 'websocket') {
      return this.errorResponse('Expected Upgrade: websocket', 426);
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    // Handle WebSocket connection
    server.addEventListener('message', async (event) => {
      try {
        const data = JSON.parse(event.data as string);
        
        if (data.type === 'authenticate' && data.token) {
          // Verify authentication token
          if (request.env?.JWT_SECRET) {
            const authManager = new AuthenticationManager(request.env.JWT_SECRET);
            const result = await authManager.verifyAccessToken(data.token);
            
            if (!result.valid || !result.payload) {
              server.send(JSON.stringify({
                type: 'error',
                error: 'Authentication failed'
              }));
              server.close(1008, 'Authentication required');
              return;
            }
            
            // Store authenticated user info
            (server as any).userId = result.payload.userId;
            (server as any).authenticated = true;
            
            server.send(JSON.stringify({
              type: 'authenticated',
              userId: result.payload.userId
            }));
          }
        } else if (data.type === 'subscribe' && data.playerId) {
          // Check authentication before allowing subscription
          if (!(server as any).authenticated) {
            server.send(JSON.stringify({
              type: 'error',
              error: 'Authentication required'
            }));
            return;
          }
          
          // Verify user can only subscribe to their own wallet
          if ((server as any).userId !== data.playerId) {
            server.send(JSON.stringify({
              type: 'error',
              error: 'Unauthorized subscription'
            }));
            return;
          }
          
          // Add to subscriptions
          let subscribers = this.subscriptions.get(data.playerId);
          if (!subscribers) {
            subscribers = new Set();
            this.subscriptions.set(data.playerId, subscribers);
          }
          subscribers.add(server);
          
          server.send(JSON.stringify({
            type: 'subscribed',
            playerId: data.playerId
          }));
        } else if (!(server as any).authenticated) {
          server.send(JSON.stringify({
            type: 'error',
            error: 'Authentication required'
          }));
        }
      } catch (error) {
        logger.error('WebSocket message error', error as Error);
      }
    });

    server.addEventListener('close', () => {
      // Remove from all subscriptions
      for (const subscribers of this.subscriptions.values()) {
        subscribers.delete(server);
      }
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  /**
   * Broadcast wallet update to subscribers
   */
  private async broadcastWalletUpdate(playerId: string, wallet: PlayerWallet): Promise<void> {
    const subscribers = this.subscriptions.get(playerId);
    
    if (!subscribers || subscribers.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type: 'wallet_update',
      playerId,
      wallet: {
        balance: wallet.balance,
        frozen: wallet.frozen,
        lastUpdated: wallet.lastUpdated
      },
      timestamp: Date.now()
    });

    const deadConnections: WebSocket[] = [];

    for (const ws of subscribers) {
      try {
        ws.send(message);
      } catch (error) {
        logger.error('Failed to send WebSocket message', error as Error, { playerId });
        deadConnections.push(ws);
      }
    }

    // Clean up dead connections
    for (const ws of deadConnections) {
      subscribers.delete(ws);
    }
  }

  /**
   * Get wallet statistics
   */
  private async handleGetStats(request: AuthenticatedRequest): Promise<Response> {
    try {
      const stats = await this.walletManager.getWalletStats();
      
      const cacheStats = this.cacheService ? 
        await this.cacheService.getCacheStats() : 
        { pendingUpdates: 0, cacheKeys: [] };
      
      return this.successResponse({
        ...stats,
        cache: cacheStats,
        activeSubscriptions: this.subscriptions.size
      });
    } catch (error) {
      logger.error('Get stats error', error as Error);
      return this.errorResponse('Failed to get wallet statistics', 500);
    }
  }

  /**
   * Warm cache with active player wallets
   */
  private async handleWarmCache(request: AuthenticatedRequest): Promise<Response> {
    try {
      const rawBody = await safeJsonParse(request);
      
      if (!this.cacheService) {
        return this.errorResponse('Cache service not available', 503);
      }
      
      // Sanitize player IDs for cache warming
      let playerIds: string[];
      try {
        if (!Array.isArray(rawBody.playerIds) || rawBody.playerIds.length === 0) {
          return this.errorResponse('Invalid player IDs', 400);
        }
        
        playerIds = rawBody.playerIds.map(id => sanitizePlayerId(id));
      } catch (error) {
        return this.errorResponse(error instanceof Error ? error.message : 'Invalid player ID format', 400);
      }

      await this.cacheService.warmCache(
        playerIds,
        (playerId) => this.walletManager.getWallet(playerId)
      );

      return this.successResponse({
        warmed: playerIds.length
      });
    } catch (error) {
      logger.error('Warm cache error', error as Error);
      return this.errorResponse('Failed to warm cache', 500);
    }
  }

  /**
   * Get audit logs for the authenticated user
   */
  private async handleGetAuditLogs(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      this.initializeServices(request.env!);

      if (!this.auditLogger) {
        return this.errorResponse('Audit service not available', 503);
      }

      const url = new URL(request.url);
      const limit = parseInt(url.searchParams.get('limit') || '100');

      const logs = await this.auditLogger.queryByUser(request.user.userId, limit);

      return this.successResponse({
        logs,
        count: logs.length
      }, request.rateLimitInfo);
    } catch (error) {
      logger.error('Get audit logs error', error as Error);
      return this.errorResponse('Failed to retrieve audit logs', 500);
    }
  }

  /**
   * Record audit log entry
   */
  private async recordAuditLog(
    request: AuthenticatedRequest,
    action: string,
    amount: number,
    status: 'pending' | 'success' | 'failed',
    details?: Record<string, any>
  ): Promise<void> {
    const entry: AuditLogEntry = {
      timestamp: Date.now(),
      userId: request.user?.userId || 'unknown',
      username: request.user?.username,
      action,
      amount,
      status,
      ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      userAgent: request.headers.get('User-Agent') || 'unknown',
      correlationId: request.headers.get('X-Correlation-ID') || RandomUtils.generateUUID(),
      details
    };

    // Use audit logger if available, otherwise fall back to console logging
    if (this.auditLogger) {
      await this.auditLogger.log(entry);
    } else {
      logger.info('Wallet audit log', entry);
    }
  }

  private successResponse<T>(data: T, rateLimitInfo?: any): Response {
    const response: ApiResponse<T> = {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (rateLimitInfo) {
      headers['X-RateLimit-Limit'] = String(rateLimitInfo.limit);
      headers['X-RateLimit-Remaining'] = String(rateLimitInfo.remaining);
      headers['X-RateLimit-Reset'] = String(rateLimitInfo.reset);
    }

    return new Response(JSON.stringify(response), { headers });
  }

  /**
   * Helper to execute request with idempotency support
   */
  private async executeWithIdempotency<T>(
    idempotencyKey: string | undefined,
    userId: string,
    action: string,
    requestData: any,
    rateLimitInfo: any,
    execute: () => Promise<{ success: boolean; data?: T; error?: string }>
  ): Promise<Response> {
    // Check idempotency if key provided
    if (idempotencyKey && this.idempotencyService) {
      const idempotencyCheck = await this.idempotencyService.checkIdempotency(
        idempotencyKey,
        userId,
        action,
        requestData
      );

      if (idempotencyCheck.exists && idempotencyCheck.record) {
        logger.info(`Idempotent request detected for ${action}`, {
          userId,
          key: idempotencyKey,
          status: idempotencyCheck.record.status
        });

        // Return cached response
        if (idempotencyCheck.record.status === 'completed') {
          return this.successResponse(idempotencyCheck.record.response, rateLimitInfo);
        } else if (idempotencyCheck.record.status === 'failed') {
          return this.errorResponse(
            idempotencyCheck.record.response?.error || `${action} failed`,
            400
          );
        }
        // If pending, allow retry (could be a previous timeout)
      }

      // Store pending request
      await this.idempotencyService.storePendingRequest(
        idempotencyKey,
        userId,
        action,
        requestData
      );
    }

    try {
      const result = await execute();

      if (!result.success) {
        // Store failed response for idempotency
        if (idempotencyKey && this.idempotencyService) {
          await this.idempotencyService.storeCompletedResponse(
            idempotencyKey,
            userId,
            { error: result.error || `${action} failed` },
            'failed'
          );
        }
        
        return this.errorResponse(result.error || `${action} failed`, 400);
      }

      // Store successful response for idempotency
      if (idempotencyKey && this.idempotencyService) {
        await this.idempotencyService.storeCompletedResponse(
          idempotencyKey,
          userId,
          result.data,
          'completed'
        );
      }

      return this.successResponse(result.data, rateLimitInfo);
    } catch (error) {
      logger.error(`${action} error`, error as Error);
      
      // Store error response for idempotency
      if (idempotencyKey && this.idempotencyService) {
        await this.idempotencyService.storeCompletedResponse(
          idempotencyKey,
          userId,
          { error: `Failed to process ${action}` },
          'failed'
        );
      }
      
      throw error;
    }
  }

  private errorResponse(message: string, status: number = 500): Response {
    const response: ApiResponse = {
      success: false,
      error: {
        code: status.toString(),
        message,
      },
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(response), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  getRouter(): ReturnType<typeof Router> {
    return this.router;
  }
}

export const walletRoutes = new WalletRoutes();