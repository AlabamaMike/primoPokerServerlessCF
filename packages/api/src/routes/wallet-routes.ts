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
import { enhancedWalletRateLimiter } from '../middleware/wallet-rate-limit';
import {
  DepositRequestSchema,
  WithdrawRequestSchema,
  TransferRequestSchema,
  TransactionQuerySchema,
  validateRequestBody,
  validateQueryParams
} from '../validation/wallet-schemas';

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
  private subscriptions: Map<string, Set<WebSocket>> = new Map();
  
  // Constants
  private readonly MAX_BATCH_SIZE = 100;

  constructor() {
    this.router = Router();
    this.walletManager = new WalletManager();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Wallet information endpoints
    this.router.get('/', enhancedWalletRateLimiter.middleware(), this.handleGetWallet.bind(this));
    this.router.get('/balance', enhancedWalletRateLimiter.middleware(), this.handleGetBalance.bind(this));
    
    // Transaction endpoints
    this.router.post('/deposit', enhancedWalletRateLimiter.middleware(), this.handleDeposit.bind(this));
    this.router.post('/withdraw', enhancedWalletRateLimiter.middleware(), this.handleWithdraw.bind(this));
    this.router.post('/transfer', enhancedWalletRateLimiter.middleware(), this.handleTransfer.bind(this));
    
    // Table operations
    this.router.post('/buyin', enhancedWalletRateLimiter.middleware(), this.handleBuyIn.bind(this));
    this.router.post('/cashout', enhancedWalletRateLimiter.middleware(), this.handleCashOut.bind(this));
    
    // Transaction history
    this.router.get('/transactions', enhancedWalletRateLimiter.middleware(), this.handleGetTransactions.bind(this));
    
    // Batch operations
    this.router.post('/batch/balances', enhancedWalletRateLimiter.middleware(), this.handleBatchGetBalances.bind(this));
    
    // WebSocket endpoint for real-time updates
    this.router.get('/subscribe', this.handleWebSocketUpgrade.bind(this));
    
    // Admin endpoints
    this.router.get('/stats', this.handleGetStats.bind(this));
    this.router.post('/warm-cache', this.handleWarmCache.bind(this));
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
   * Handle deposit with optimistic updates
   */
  private async handleDeposit(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await request.json();
      const validation = validateRequestBody(DepositRequestSchema, body);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      this.initializeServices(request.env!);

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
        return this.errorResponse(result.error || 'Deposit failed', 400);
      }

      await this.recordAuditLog(request, 'deposit', validation.data.amount, 'success');

      return this.successResponse({
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId
      }, request.rateLimitInfo);
    } catch (error) {
      logger.error('Deposit error', error as Error);
      return this.errorResponse('Failed to process deposit', 500);
    }
  }

  /**
   * Handle withdrawal with security checks
   */
  private async handleWithdraw(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await request.json();
      const validation = validateRequestBody(WithdrawRequestSchema, body);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      // Record audit log
      await this.recordAuditLog(request, 'withdraw', validation.data.amount, 'pending');

      const result = await this.walletManager.withdraw(
        request.user.userId,
        validation.data.amount,
        validation.data.method
      );

      if (!result.success) {
        await this.recordAuditLog(request, 'withdraw', validation.data.amount, 'failed');
        return this.errorResponse(result.error || 'Withdrawal failed', 400);
      }

      // Invalidate cache after withdrawal
      if (this.cacheService) {
        await this.cacheService.invalidateWallet(request.user.userId);
      }

      // Broadcast update
      const wallet = await this.walletManager.getWallet(request.user.userId);
      await this.broadcastWalletUpdate(request.user.userId, wallet);

      await this.recordAuditLog(request, 'withdraw', validation.data.amount, 'success');

      return this.successResponse({
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId
      }, request.rateLimitInfo);
    } catch (error) {
      logger.error('Withdraw error', error as Error);
      return this.errorResponse('Failed to process withdrawal', 500);
    }
  }

  /**
   * Handle transfers between wallets
   */
  private async handleTransfer(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await request.json();
      const validation = validateRequestBody(TransferRequestSchema, body);
      
      if (!validation.success) {
        return this.errorResponse(validation.error, 400);
      }

      await this.recordAuditLog(request, 'transfer', validation.data.amount, 'pending');

      const result = await this.walletManager.transfer(
        request.user.userId,
        validation.data.to_table_id,
        validation.data.amount
      );

      if (!result.success) {
        await this.recordAuditLog(request, 'transfer', validation.data.amount, 'failed');
        return this.errorResponse(result.error || 'Transfer failed', 400);
      }

      // Invalidate cache for sender
      if (this.cacheService) {
        await this.cacheService.invalidateWallet(request.user.userId);
      }

      await this.recordAuditLog(request, 'transfer', validation.data.amount, 'success');

      return this.successResponse({
        success: true,
        newBalance: result.newBalance,
        transferredAmount: result.transferredAmount,
        transactionId: result.transactionId
      }, request.rateLimitInfo);
    } catch (error) {
      logger.error('Transfer error', error as Error);
      return this.errorResponse('Failed to process transfer', 500);
    }
  }

  /**
   * Handle buy-in with caching
   */
  private async handleBuyIn(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const buyInRequest: BuyInRequest = await request.json();
      
      if (!buyInRequest.tableId || !buyInRequest.amount || buyInRequest.amount <= 0) {
        return this.errorResponse('Invalid buy-in request', 400);
      }

      buyInRequest.playerId = request.user.userId;
      
      await this.recordAuditLog(request, 'buyin', buyInRequest.amount, 'pending');
      
      const result = await this.walletManager.processBuyIn(buyInRequest);
      
      if (!result.success) {
        await this.recordAuditLog(request, 'buyin', buyInRequest.amount, 'failed');
        return this.errorResponse(result.error || 'Buy-in failed', 400);
      }

      // Invalidate cache after buy-in
      if (this.cacheService) {
        await this.cacheService.invalidateWallet(request.user.userId);
      }

      await this.recordAuditLog(request, 'buyin', buyInRequest.amount, 'success');
      
      return this.successResponse(result, request.rateLimitInfo);
    } catch (error) {
      logger.error('Buy-in error', error as Error);
      return this.errorResponse('Failed to process buy-in', 500);
    }
  }

  /**
   * Handle cash-out
   */
  private async handleCashOut(request: AuthenticatedRequest): Promise<Response> {
    try {
      if (!request.user?.userId) {
        return this.errorResponse('User not authenticated', 401);
      }

      const body = await request.json() as { tableId: string; chipAmount: number };
      
      if (!body.tableId || !body.chipAmount || body.chipAmount <= 0) {
        return this.errorResponse('Invalid cash-out request', 400);
      }

      await this.recordAuditLog(request, 'cashout', body.chipAmount, 'pending');

      await this.walletManager.processCashOut(request.user.userId, body.tableId, body.chipAmount);
      const wallet = await this.walletManager.getWallet(request.user.userId);
      
      // Update cache
      if (this.cacheService) {
        await this.cacheService.setCachedWallet(wallet);
      }

      // Broadcast update
      await this.broadcastWalletUpdate(request.user.userId, wallet);

      await this.recordAuditLog(request, 'cashout', body.chipAmount, 'success');
      
      return this.successResponse({
        success: true,
        newBalance: wallet.balance,
        cashedOut: body.chipAmount
      }, request.rateLimitInfo);
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
      const body = await request.json() as { playerIds: string[] };
      
      if (!Array.isArray(body.playerIds) || body.playerIds.length === 0) {
        return this.errorResponse('Invalid player IDs', 400);
      }

      if (body.playerIds.length > this.MAX_BATCH_SIZE) {
        return this.errorResponse(`Maximum ${this.MAX_BATCH_SIZE} players per batch request`, 400);
      }

      this.initializeServices(request.env!);
      
      const results: Record<string, { balance: number; frozen: number }> = {};
      const uncachedIds: string[] = [];
      
      // Check cache first
      if (this.cacheService) {
        const cachedWallets = await this.cacheService.getBatchWallets(body.playerIds);
        
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
        uncachedIds.push(...body.playerIds);
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
        total: body.playerIds.length
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
      const body = await request.json() as { playerIds: string[] };
      
      if (!this.cacheService) {
        return this.errorResponse('Cache service not available', 503);
      }

      await this.cacheService.warmCache(
        body.playerIds,
        (playerId) => this.walletManager.getWallet(playerId)
      );

      return this.successResponse({
        warmed: body.playerIds.length
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