/**
 * WalletManager Durable Object - Phase 2
 * 
 * Handles atomic wallet transactions, balance management, and transaction history.
 * Ensures financial integrity with transactional storage operations.
 */

import { 
  PlayerWallet, 
  BuyInRequest, 
  BuyInResponse,
  createWebSocketMessage,
  WebSocketMessage 
} from '@primo-poker/shared'
import { logger } from '@primo-poker/core'
import { MetricsCollector, DurableObjectHealthMetric } from './monitoring/metrics'
import { 
  walletInitializeSchema, 
  walletDepositSchema, 
  walletWithdrawSchema, 
  walletTransferSchema,
  walletCashOutSchema,
  validateRequestBody 
} from './validation'

export interface WalletTransaction {
  id: string
  playerId: string
  type: 'buy_in' | 'cash_out' | 'win' | 'loss' | 'deposit' | 'withdrawal' | 'transfer' | 'refund' | 'rake'
  amount: number
  balance: number // Balance after transaction
  tableId?: string
  handId?: string
  relatedPlayerId?: string // For transfers
  timestamp: number
  description: string
  metadata?: Record<string, any>
}

export interface WalletManagerState {
  wallets: Map<string, PlayerWallet>
  transactions: Map<string, WalletTransaction[]> // playerId -> transactions
  dailyLimits: Map<string, DailyLimit>
  frozenAmounts: Map<string, FrozenAmount[]> // playerId -> frozen amounts
  idempotencyKeys: Map<string, IdempotencyRecord> // key -> record
  rakeStatistics: Map<string, RakeStatistics> // period -> stats
  createdAt: number
  lastUpdated: number
  totalTransactions: number
}

export interface DailyLimit {
  playerId: string
  date: string // YYYY-MM-DD
  deposits: number
  withdrawals: number
  buyIns: number
}

export interface FrozenAmount {
  id: string
  playerId: string
  amount: number
  tableId: string
  frozenAt: number
  reason: string
}

export interface TransferRequest {
  fromPlayerId: string
  toPlayerId: string
  amount: number
  description: string
}

export interface TransactionFilter {
  playerId?: string
  type?: WalletTransaction['type']
  tableId?: string
  startDate?: number
  endDate?: number
  limit?: number
}

export interface IdempotencyRecord {
  key: string
  response: any
  statusCode: number
  timestamp: number
}

export interface RakeStatistics {
  period: string
  totalRake: number
  handCount: number
  lastUpdated: number
}

export interface RakeCollectionRequest {
  tableId: string
  handId: string
  potAmount: number
  rakePercentage: number
  maxRake: number
  winnerPlayerId?: string
  winners?: Array<{ playerId: string; share: number }>
}

export class WalletManagerDurableObject {
  private state: WalletManagerState
  private durableObjectState: DurableObjectState
  private env: any
  private initialized: boolean = false
  private metrics?: MetricsCollector
  private transactionLocks: Map<string, Promise<void>> = new Map()

  // Constants
  private static readonly DEFAULT_INITIAL_BALANCE = 10000
  private static readonly MAX_TRANSACTIONS_PER_PLAYER = 1000
  private static readonly DAILY_DEPOSIT_LIMIT = 50000
  private static readonly DAILY_WITHDRAWAL_LIMIT = 25000
  private static readonly DAILY_BUYIN_LIMIT = 100000
  private static readonly MIN_TRANSFER_AMOUNT = 1
  private static readonly MAX_TRANSFER_AMOUNT = 100000

  constructor(state: DurableObjectState, env: any) {
    this.durableObjectState = state
    this.env = env
    
    // Initialize state
    this.state = {
      wallets: new Map(),
      transactions: new Map(),
      dailyLimits: new Map(),
      frozenAmounts: new Map(),
      idempotencyKeys: new Map(),
      rakeStatistics: new Map(),
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      totalTransactions: 0
    }

    // Initialize metrics if available
    if (env.DB && env.KV) {
      this.metrics = new MetricsCollector(env.DB, env.KV)
    }
  }

  /**
   * Handle HTTP requests
   */
  async fetch(request: Request): Promise<Response> {
    const startTime = Date.now()
    
    try {
      await this.initializeState()
      
      const url = new URL(request.url)
      const path = url.pathname

      let response: Response
      switch (path) {
        case '/wallet':
          response = await this.handleGetWallet(request)
          break
        case '/wallet/initialize':
          response = await this.handleInitializeWallet(request)
          break
        case '/wallet/buy-in':
          response = await this.handleBuyIn(request)
          break
        case '/wallet/cash-out':
          response = await this.handleCashOut(request)
          break
        case '/wallet/process-winnings':
          response = await this.handleProcessWinnings(request)
          break
        case '/wallet/deposit':
          response = await this.handleDeposit(request)
          break
        case '/wallet/withdraw':
          response = await this.handleWithdraw(request)
          break
        case '/wallet/transfer':
          response = await this.handleTransfer(request)
          break
        case '/wallet/transactions':
          response = await this.handleGetTransactions(request)
          break
        case '/wallet/stats':
          response = await this.handleGetStats(request)
          break
        case '/wallet/rollback-buy-in':
          response = await this.handleRollbackBuyIn(request)
          break
        case '/wallet/rollback-hand':
          response = await this.handleRollbackHand(request)
          break
        case '/wallet/collect-rake':
          response = await this.handleCollectRake(request)
          break
        case '/wallet/rake-stats':
          response = await this.handleRakeStats(request)
          break
        case '/health':
          response = await this.handleHealthCheck(request)
          break
        default:
          response = new Response('Not Found', { status: 404 })
      }

      // Record metrics
      if (this.metrics) {
        const responseTime = Date.now() - startTime
        await this.metrics.recordResponseTime(responseTime, path)
      }

      return response
    } catch (error) {
      logger.error('WalletManager error:', error as Error)
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Initialize state from storage
   */
  private async initializeState(): Promise<void> {
    if (this.initialized) return

    try {
      const savedState = await this.durableObjectState.storage.get('walletState') as WalletManagerState | undefined
      if (savedState) {
        this.state = {
          ...savedState,
          wallets: new Map(Object.entries(savedState.wallets || {})),
          transactions: new Map(Object.entries(savedState.transactions || {})),
          dailyLimits: new Map(Object.entries(savedState.dailyLimits || {})),
          frozenAmounts: new Map(Object.entries(savedState.frozenAmounts || {})),
          idempotencyKeys: new Map(Object.entries(savedState.idempotencyKeys || {})),
          rakeStatistics: new Map(Object.entries(savedState.rakeStatistics || {}))
        }
        logger.info('Loaded saved wallet state', { walletCount: this.state.wallets.size })
      }
    } catch (error) {
      logger.error('Failed to load saved wallet state:', error as Error)
    }

    this.initialized = true
  }

  /**
   * Execute a transaction with locking to prevent race conditions
   */
  private async executeWithLock<T>(playerId: string, operation: () => Promise<T>): Promise<T> {
    // Get or create a lock promise for this player
    const existingLock = this.transactionLocks.get(playerId)
    
    // Create a new lock that waits for the existing one to complete
    let lockPromise: Promise<T>
    
    const lockExecutor = async () => {
      if (existingLock) {
        await existingLock
      }
      
      try {
        // Execute the operation
        return await operation()
      } finally {
        // Clean up the lock when we're done
        if (this.transactionLocks.get(playerId) === lockPromise) {
          this.transactionLocks.delete(playerId)
        }
      }
    }
    
    lockPromise = lockExecutor()
    
    // Store the lock promise
    this.transactionLocks.set(playerId, lockPromise.then(() => undefined).catch(() => undefined))
    
    return lockPromise
  }

  /**
   * Save state to storage with transaction
   */
  private async saveState(): Promise<void> {
    const txn = this.durableObjectState.storage.transaction(async () => {
      try {
        const stateToSave = {
          ...this.state,
          wallets: Object.fromEntries(this.state.wallets),
          transactions: Object.fromEntries(this.state.transactions),
          dailyLimits: Object.fromEntries(this.state.dailyLimits),
          frozenAmounts: Object.fromEntries(this.state.frozenAmounts),
          idempotencyKeys: Object.fromEntries(this.state.idempotencyKeys),
          rakeStatistics: Object.fromEntries(this.state.rakeStatistics),
          lastUpdated: Date.now()
        }

        await this.durableObjectState.storage.put('walletState', stateToSave)
      } catch (error) {
        logger.error('Failed to save wallet state:', error as Error)
        throw error
      }
    })

    await txn
  }

  /**
   * Get wallet information
   */
  private async handleGetWallet(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const playerId = url.searchParams.get('playerId')

    if (!playerId) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Player ID required'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const wallet = await this.getOrCreateWallet(playerId)
    const frozenAmount = this.calculateFrozenAmount(playerId)
    const availableBalance = wallet.balance - frozenAmount

    return new Response(JSON.stringify({
      success: true,
      data: {
        wallet,
        availableBalance,
        frozenAmount
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Initialize a new wallet
   */
  private async handleInitializeWallet(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    try {
      const body = await validateRequestBody(request, walletInitializeSchema)
      const { playerId, initialBalance = WalletManagerDurableObject.DEFAULT_INITIAL_BALANCE } = body

      if (this.state.wallets.has(playerId)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Wallet already exists'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const wallet = await this.createWallet(playerId, initialBalance)

      return new Response(JSON.stringify({
        success: true,
        data: { wallet }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Check and handle idempotency
   */
  private async checkIdempotency(request: Request): Promise<Response | null> {
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey) return null

    const record = this.state.idempotencyKeys.get(idempotencyKey)
    if (record) {
      // Return cached response
      const response = new Response(JSON.stringify(record.response), {
        status: record.statusCode,
        headers: { 
          'Content-Type': 'application/json',
          'X-Idempotent-Replayed': 'true'
        }
      })
      return response
    }

    return null
  }

  /**
   * Store idempotent response
   */
  private async storeIdempotentResponse(
    request: Request, 
    response: Response
  ): Promise<void> {
    const idempotencyKey = request.headers.get('Idempotency-Key')
    if (!idempotencyKey) return

    const responseBody = await response.clone().json()
    const record: IdempotencyRecord = {
      key: idempotencyKey,
      response: responseBody,
      statusCode: response.status,
      timestamp: Date.now()
    }

    this.state.idempotencyKeys.set(idempotencyKey, record)

    // Clean up old idempotency keys (older than 24 hours)
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    for (const [key, rec] of this.state.idempotencyKeys) {
      if (rec.timestamp < cutoff) {
        this.state.idempotencyKeys.delete(key)
      }
    }
  }

  /**
   * Process buy-in request
   */
  private async handleBuyIn(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    // Check idempotency
    const cachedResponse = await this.checkIdempotency(request)
    if (cachedResponse) return cachedResponse

    const buyInRequest = await request.json() as BuyInRequest

    // Validate buy-in amount
    if (buyInRequest.amount <= 0) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Buy-in amount must be positive'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Execute with lock to prevent race conditions
    return this.executeWithLock(buyInRequest.playerId, async () => {
      // Check daily limits
      if (!await this.checkDailyLimit(buyInRequest.playerId, 'buyIns', buyInRequest.amount)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Daily buy-in limit exceeded'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const wallet = await this.getOrCreateWallet(buyInRequest.playerId)
      const availableBalance = wallet.balance - this.calculateFrozenAmount(buyInRequest.playerId)

      if (availableBalance < buyInRequest.amount) {
        return new Response(JSON.stringify({
          success: false,
          error: `Insufficient funds. Available: $${availableBalance}, Required: $${buyInRequest.amount}`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Freeze the buy-in amount
      const frozenAmount: FrozenAmount = {
        id: crypto.randomUUID(),
        playerId: buyInRequest.playerId,
        amount: buyInRequest.amount,
        tableId: buyInRequest.tableId,
        frozenAt: Date.now(),
        reason: 'buy_in'
      }

      let playerFrozenAmounts = this.state.frozenAmounts.get(buyInRequest.playerId) || []
      playerFrozenAmounts.push(frozenAmount)
      this.state.frozenAmounts.set(buyInRequest.playerId, playerFrozenAmounts)

      // Record transaction
      await this.recordTransaction({
        id: crypto.randomUUID(),
        playerId: buyInRequest.playerId,
        type: 'buy_in',
        amount: -buyInRequest.amount,
        balance: wallet.balance, // Balance doesn't change yet, just frozen
        tableId: buyInRequest.tableId,
        timestamp: Date.now(),
        description: `Buy-in to table ${buyInRequest.tableId}`,
        metadata: { frozenAmountId: frozenAmount.id }
      })

      // Update daily limit
      await this.updateDailyLimit(buyInRequest.playerId, 'buyIns', buyInRequest.amount)

      await this.saveState()

      const responseData: BuyInResponse = {
        success: true,
        chipCount: buyInRequest.amount,
        walletBalance: wallet.balance - this.calculateFrozenAmount(buyInRequest.playerId)
      }

      const response = new Response(JSON.stringify(responseData), {
        headers: { 'Content-Type': 'application/json' }
      })

      // Store for idempotency
      await this.storeIdempotentResponse(request, response)

      return response
    })
  }

  /**
   * Process cash-out
   */
  private async handleCashOut(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    try {
      const { playerId, tableId, chipAmount } = await validateRequestBody(request, walletCashOutSchema)

      const wallet = this.state.wallets.get(playerId)
    if (!wallet) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Wallet not found'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Find and remove frozen amount for this table
    const playerFrozenAmounts = this.state.frozenAmounts.get(playerId) || []
    const frozenIndex = playerFrozenAmounts.findIndex(f => f.tableId === tableId)
    
    if (frozenIndex === -1) {
      return new Response(JSON.stringify({
        success: false,
        error: 'No frozen amount found for this table'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const frozen = playerFrozenAmounts[frozenIndex]
    if (!frozen) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Frozen amount data not found'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    playerFrozenAmounts.splice(frozenIndex, 1)
    
    // Calculate net change (chips returned minus original buy-in)
    const netChange = chipAmount - frozen.amount
    wallet.balance += netChange
    wallet.lastUpdated = new Date()

    // Record transaction
    await this.recordTransaction({
      id: crypto.randomUUID(),
      playerId,
      type: 'cash_out',
      amount: chipAmount,
      balance: wallet.balance,
      tableId,
      timestamp: Date.now(),
      description: `Cash-out from table ${tableId}`,
      metadata: { 
        originalBuyIn: frozen.amount,
        netChange,
        frozenAmountId: frozen.id
      }
    })

    await this.saveState()

    return new Response(JSON.stringify({
      success: true,
      data: {
        cashOutAmount: chipAmount,
        netChange,
        newBalance: wallet.balance
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Process winnings from a hand
   */
  private async handleProcessWinnings(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.json() as { 
      winners: Array<{ playerId: string; amount: number }>;
      losers: Array<{ playerId: string; amount: number }>;
      tableId: string;
      handId: string;
    }

    const transactions: WalletTransaction[] = []
    
    // Process winners
    for (const winner of body.winners) {
      const wallet = await this.getOrCreateWallet(winner.playerId)
      wallet.balance += winner.amount
      wallet.lastUpdated = new Date()

      const transaction: WalletTransaction = {
        id: crypto.randomUUID(),
        playerId: winner.playerId,
        type: 'win',
        amount: winner.amount,
        balance: wallet.balance,
        tableId: body.tableId,
        handId: body.handId,
        timestamp: Date.now(),
        description: `Won ${winner.amount} in hand ${body.handId}`
      }

      await this.recordTransaction(transaction)
      transactions.push(transaction)
    }

    // Process losers
    for (const loser of body.losers) {
      const wallet = await this.getOrCreateWallet(loser.playerId)
      wallet.balance -= loser.amount
      wallet.lastUpdated = new Date()

      const transaction: WalletTransaction = {
        id: crypto.randomUUID(),
        playerId: loser.playerId,
        type: 'loss',
        amount: -loser.amount,
        balance: wallet.balance,
        tableId: body.tableId,
        handId: body.handId,
        timestamp: Date.now(),
        description: `Lost ${loser.amount} in hand ${body.handId}`
      }

      await this.recordTransaction(transaction)
      transactions.push(transaction)
    }

    await this.saveState()

    return new Response(JSON.stringify({
      success: true,
      data: { 
        transactionCount: transactions.length,
        transactions: transactions.map(t => ({ id: t.id, playerId: t.playerId, amount: t.amount }))
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Handle deposit
   */
  private async handleDeposit(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    try {
      const { playerId, amount, description = 'Deposit' } = await validateRequestBody(request, walletDepositSchema)

      // Check daily limits
      if (!await this.checkDailyLimit(playerId, 'deposits', amount)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Daily deposit limit exceeded'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const wallet = await this.getOrCreateWallet(playerId)
      wallet.balance += amount
      wallet.lastUpdated = new Date()

      await this.recordTransaction({
        id: crypto.randomUUID(),
        playerId,
        type: 'deposit',
        amount,
        balance: wallet.balance,
        timestamp: Date.now(),
        description
      })

      await this.updateDailyLimit(playerId, 'deposits', amount)
      await this.saveState()

      return new Response(JSON.stringify({
        success: true,
        data: {
          newBalance: wallet.balance,
          depositAmount: amount
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Handle withdrawal
   */
  private async handleWithdraw(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    try {
      const { playerId, amount, description = 'Withdrawal' } = await validateRequestBody(request, walletWithdrawSchema)

      const wallet = this.state.wallets.get(playerId)
      if (!wallet) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Wallet not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const availableBalance = wallet.balance - this.calculateFrozenAmount(playerId)
      if (availableBalance < amount) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Insufficient available balance'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Check daily limits
      if (!await this.checkDailyLimit(playerId, 'withdrawals', amount)) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Daily withdrawal limit exceeded'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      wallet.balance -= amount
      wallet.lastUpdated = new Date()

      await this.recordTransaction({
        id: crypto.randomUUID(),
        playerId,
        type: 'withdrawal',
        amount: -amount,
        balance: wallet.balance,
        timestamp: Date.now(),
        description
      })

      await this.updateDailyLimit(playerId, 'withdrawals', amount)
      await this.saveState()

      return new Response(JSON.stringify({
        success: true,
        data: {
          newBalance: wallet.balance,
          withdrawalAmount: amount
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Handle player-to-player transfer
   */
  private async handleTransfer(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    // Check idempotency
    const cachedResponse = await this.checkIdempotency(request)
    if (cachedResponse) return cachedResponse

    try {
      const transfer = await validateRequestBody(request, walletTransferSchema)

      // Additional validation for transfer limits
      if (transfer.amount < WalletManagerDurableObject.MIN_TRANSFER_AMOUNT || 
          transfer.amount > WalletManagerDurableObject.MAX_TRANSFER_AMOUNT) {
        return new Response(JSON.stringify({
          success: false,
          error: `Transfer amount must be between ${WalletManagerDurableObject.MIN_TRANSFER_AMOUNT} and ${WalletManagerDurableObject.MAX_TRANSFER_AMOUNT}`
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      if (transfer.fromPlayerId === transfer.toPlayerId) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Cannot transfer to yourself'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Lock both accounts in a consistent order to prevent deadlocks
      const playerIds = [transfer.fromPlayerId, transfer.toPlayerId].sort()
      const [firstId, secondId] = playerIds as [string, string]
      
      return this.executeWithLock(firstId, async () => {
        return this.executeWithLock(secondId, async () => {
        const fromWallet = this.state.wallets.get(transfer.fromPlayerId)
        if (!fromWallet) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Sender wallet not found'
          }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        const availableBalance = fromWallet.balance - this.calculateFrozenAmount(transfer.fromPlayerId)
        if (availableBalance < transfer.amount) {
          return new Response(JSON.stringify({
            success: false,
            error: 'Insufficient available balance'
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          })
        }

        const toWallet = await this.getOrCreateWallet(transfer.toPlayerId)

        // Perform atomic transfer
        fromWallet.balance -= transfer.amount
        fromWallet.lastUpdated = new Date()
        toWallet.balance += transfer.amount
        toWallet.lastUpdated = new Date()

        // Record both transactions
        const timestamp = Date.now()
        const transactionId = crypto.randomUUID()

        await this.recordTransaction({
          id: `${transactionId}_from`,
          playerId: transfer.fromPlayerId,
          type: 'transfer',
          amount: -transfer.amount,
          balance: fromWallet.balance,
          relatedPlayerId: transfer.toPlayerId,
          timestamp,
          description: transfer.description || `Transfer to ${transfer.toPlayerId}`,
          metadata: { transferId: transactionId, direction: 'outgoing' }
        })

        await this.recordTransaction({
          id: `${transactionId}_to`,
          playerId: transfer.toPlayerId,
          type: 'transfer',
          amount: transfer.amount,
          balance: toWallet.balance,
          relatedPlayerId: transfer.fromPlayerId,
          timestamp,
          description: transfer.description || `Transfer from ${transfer.fromPlayerId}`,
          metadata: { transferId: transactionId, direction: 'incoming' }
        })

        await this.saveState()

        const response = new Response(JSON.stringify({
          success: true,
          data: {
            transferId: transactionId,
            fromBalance: fromWallet.balance,
            toBalance: toWallet.balance
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        })

        // Store for idempotency
        await this.storeIdempotentResponse(request, response)

        return response
      })
    })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Get transaction history
   */
  private async handleGetTransactions(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const playerId = url.searchParams.get('playerId')
    const type = url.searchParams.get('type')
    const tableId = url.searchParams.get('tableId')
    const startDateStr = url.searchParams.get('startDate')
    const endDateStr = url.searchParams.get('endDate')

    const filter: TransactionFilter = {
      ...(playerId && { playerId }),
      ...(type && { type: type as any }),
      ...(tableId && { tableId }),
      ...(startDateStr && { startDate: parseInt(startDateStr) }),
      ...(endDateStr && { endDate: parseInt(endDateStr) }),
      limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 50
    }

    const transactions = this.getFilteredTransactions(filter)

    return new Response(JSON.stringify({
      success: true,
      data: {
        transactions,
        count: transactions.length
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Get wallet statistics
   */
  private async handleGetStats(request: Request): Promise<Response> {
    const wallets = Array.from(this.state.wallets.values())
    const allTransactions = Array.from(this.state.transactions.values()).flat()

    const stats = {
      totalWallets: wallets.length,
      totalBalance: wallets.reduce((sum, w) => sum + w.balance, 0),
      totalFrozen: Array.from(this.state.frozenAmounts.values())
        .flat()
        .reduce((sum, f) => sum + f.amount, 0),
      totalTransactions: this.state.totalTransactions,
      transactionsByType: this.groupTransactionsByType(allTransactions),
      averageWalletBalance: wallets.length > 0 ? 
        wallets.reduce((sum, w) => sum + w.balance, 0) / wallets.length : 0,
      activeWallets: wallets.filter(w => {
        const transactions = this.state.transactions.get(w.playerId) || []
        return transactions.some(t => t.timestamp > Date.now() - 24 * 60 * 60 * 1000)
      }).length
    }

    return new Response(JSON.stringify({
      success: true,
      data: stats
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Health check endpoint
   */
  private async handleHealthCheck(request: Request): Promise<Response> {
    const startTime = Date.now()

    const healthInfo = {
      healthy: true,
      instanceId: this.durableObjectState.id.toString(),
      uptime: Date.now() - this.state.createdAt,
      timestamp: new Date().toISOString(),
      walletCount: this.state.wallets.size,
      totalTransactions: this.state.totalTransactions,
      frozenAmounts: Array.from(this.state.frozenAmounts.values()).flat().length,
      memoryUsage: (globalThis as any).performance?.memory ? {
        used: (globalThis as any).performance.memory.usedJSHeapSize,
        total: (globalThis as any).performance.memory.totalJSHeapSize,
        limit: (globalThis as any).performance.memory.jsHeapSizeLimit,
        usagePercent: ((globalThis as any).performance.memory.usedJSHeapSize / (globalThis as any).performance.memory.jsHeapSizeLimit) * 100,
      } : undefined
    }

    // Record health metric
    if (this.metrics) {
      const metric: DurableObjectHealthMetric = {
        objectName: 'WalletManager',
        instanceId: this.durableObjectState.id.toString(),
        healthy: true,
        responseTime: Date.now() - startTime,
        timestamp: Date.now()
      }
      await this.metrics.recordDurableObjectHealth(metric)
    }

    return new Response(JSON.stringify(healthInfo), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Get or create a wallet
   */
  private async getOrCreateWallet(playerId: string): Promise<PlayerWallet> {
    let wallet = this.state.wallets.get(playerId)
    
    if (!wallet) {
      wallet = await this.createWallet(playerId)
    }
    
    return wallet
  }

  /**
   * Create a new wallet
   */
  private async createWallet(playerId: string, initialBalance: number = WalletManagerDurableObject.DEFAULT_INITIAL_BALANCE): Promise<PlayerWallet> {
    const wallet: PlayerWallet = {
      playerId,
      balance: initialBalance,
      currency: 'USD',
      frozen: 0, // Calculated dynamically
      lastUpdated: new Date()
    }

    this.state.wallets.set(playerId, wallet)
    this.state.transactions.set(playerId, [])

    // Record initial deposit
    await this.recordTransaction({
      id: crypto.randomUUID(),
      playerId,
      type: 'deposit',
      amount: initialBalance,
      balance: initialBalance,
      timestamp: Date.now(),
      description: 'Initial wallet balance'
    })

    await this.saveState()
    
    return wallet
  }

  /**
   * Record a transaction
   */
  private async recordTransaction(transaction: WalletTransaction): Promise<void> {
    const playerTransactions = this.state.transactions.get(transaction.playerId) || []
    playerTransactions.unshift(transaction) // Add to beginning for reverse chronological order

    // Limit transaction history
    if (playerTransactions.length > WalletManagerDurableObject.MAX_TRANSACTIONS_PER_PLAYER) {
      playerTransactions.splice(WalletManagerDurableObject.MAX_TRANSACTIONS_PER_PLAYER)
    }

    this.state.transactions.set(transaction.playerId, playerTransactions)
    this.state.totalTransactions++

    logger.info('Recorded transaction', {
      id: transaction.id,
      playerId: transaction.playerId,
      type: transaction.type,
      amount: transaction.amount
    })
  }

  /**
   * Calculate frozen amount for a player
   */
  private calculateFrozenAmount(playerId: string): number {
    const frozenAmounts = this.state.frozenAmounts.get(playerId) || []
    return frozenAmounts.reduce((sum, f) => sum + f.amount, 0)
  }

  /**
   * Check daily limit
   */
  private async checkDailyLimit(playerId: string, limitType: 'deposits' | 'withdrawals' | 'buyIns', amount: number): Promise<boolean> {
    const todayParts = new Date().toISOString().split('T')
    const today = todayParts[0] || new Date().toISOString().substring(0, 10)
    const limitKey = `${playerId}_${today}`
    
    let dailyLimit = this.state.dailyLimits.get(limitKey)
    if (!dailyLimit) {
      dailyLimit = {
        playerId,
        date: today,
        deposits: 0,
        withdrawals: 0,
        buyIns: 0
      }
      this.state.dailyLimits.set(limitKey, dailyLimit)
    }

    const currentAmount = dailyLimit[limitType]
    const limits = {
      deposits: WalletManagerDurableObject.DAILY_DEPOSIT_LIMIT,
      withdrawals: WalletManagerDurableObject.DAILY_WITHDRAWAL_LIMIT,
      buyIns: WalletManagerDurableObject.DAILY_BUYIN_LIMIT
    }

    return currentAmount + amount <= limits[limitType]
  }

  /**
   * Update daily limit
   */
  private async updateDailyLimit(playerId: string, limitType: 'deposits' | 'withdrawals' | 'buyIns', amount: number): Promise<void> {
    const todayParts = new Date().toISOString().split('T')
    const today = todayParts[0] || new Date().toISOString().substring(0, 10)
    const limitKey = `${playerId}_${today}`
    
    const dailyLimit = this.state.dailyLimits.get(limitKey)
    if (dailyLimit) {
      dailyLimit[limitType] += amount
    }
  }

  /**
   * Get filtered transactions
   */
  private getFilteredTransactions(filter: TransactionFilter): WalletTransaction[] {
    let transactions: WalletTransaction[] = []

    if (filter.playerId) {
      transactions = this.state.transactions.get(filter.playerId) || []
    } else {
      transactions = Array.from(this.state.transactions.values()).flat()
    }

    // Apply filters
    if (filter.type) {
      transactions = transactions.filter(t => t.type === filter.type)
    }

    if (filter.tableId) {
      transactions = transactions.filter(t => t.tableId === filter.tableId)
    }

    if (filter.startDate) {
      transactions = transactions.filter(t => t.timestamp >= filter.startDate!)
    }

    if (filter.endDate) {
      transactions = transactions.filter(t => t.timestamp <= filter.endDate!)
    }

    // Sort by timestamp descending
    transactions.sort((a, b) => b.timestamp - a.timestamp)

    // Apply limit
    if (filter.limit) {
      transactions = transactions.slice(0, filter.limit)
    }

    return transactions
  }

  /**
   * Group transactions by type
   */
  private groupTransactionsByType(transactions: WalletTransaction[]): Record<string, number> {
    const groups: Record<string, number> = {}
    
    for (const transaction of transactions) {
      groups[transaction.type] = (groups[transaction.type] || 0) + 1
    }
    
    return groups
  }

  /**
   * Handle buy-in rollback
   */
  private async handleRollbackBuyIn(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    try {
      const body = await request.json() as {
        playerId: string
        tableId: string
        amount: number
        reason: string
      }

      const wallet = this.state.wallets.get(body.playerId)
      if (!wallet) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Wallet not found'
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      // Find and remove frozen amount for this table
      const playerFrozenAmounts = this.state.frozenAmounts.get(body.playerId) || []
      const frozenIndex = playerFrozenAmounts.findIndex(f => f.tableId === body.tableId)
      
      if (frozenIndex === -1) {
        return new Response(JSON.stringify({
          success: false,
          error: 'No frozen amount found for this table'
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const frozen = playerFrozenAmounts[frozenIndex]
      playerFrozenAmounts.splice(frozenIndex, 1)

      // Record refund transaction
      await this.recordTransaction({
        id: crypto.randomUUID(),
        playerId: body.playerId,
        type: 'refund',
        amount: frozen?.amount || body.amount,
        balance: wallet.balance,
        tableId: body.tableId,
        timestamp: Date.now(),
        description: `Refund: ${body.reason}`,
        metadata: { 
          reason: body.reason,
          originalFrozenAmountId: frozen?.id
        }
      })

      await this.saveState()

      return new Response(JSON.stringify({
        success: true,
        data: {
          refundAmount: frozen?.amount || body.amount,
          newBalance: wallet.balance,
          reason: body.reason
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Handle hand rollback
   */
  private async handleRollbackHand(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    try {
      const body = await request.json() as {
        tableId: string
        handId: string
        players: Array<{ playerId: string; refundAmount: number }>
        reason: string
      }

      const transactions = []

      for (const player of body.players) {
        const wallet = await this.getOrCreateWallet(player.playerId)
        wallet.balance += player.refundAmount
        wallet.lastUpdated = new Date()

        const transaction: WalletTransaction = {
          id: crypto.randomUUID(),
          playerId: player.playerId,
          type: 'refund',
          amount: player.refundAmount,
          balance: wallet.balance,
          tableId: body.tableId,
          handId: body.handId,
          timestamp: Date.now(),
          description: `Hand rollback: ${body.reason}`,
          metadata: { 
            reason: body.reason,
            handId: body.handId
          }
        }

        await this.recordTransaction(transaction)
        transactions.push(transaction)
      }

      await this.saveState()

      return new Response(JSON.stringify({
        success: true,
        data: {
          transactionCount: transactions.length,
          totalRefunded: body.players.reduce((sum, p) => sum + p.refundAmount, 0),
          reason: body.reason
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Handle rake collection
   */
  private async handleCollectRake(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    try {
      const body = await request.json() as RakeCollectionRequest

      // Calculate rake amount
      let rakeAmount = Math.floor(body.potAmount * body.rakePercentage / 100)
      rakeAmount = Math.min(rakeAmount, body.maxRake)

      const netPot = body.potAmount - rakeAmount

      // Process house rake
      const houseWallet = await this.getOrCreateWallet('house')
      houseWallet.balance += rakeAmount
      houseWallet.lastUpdated = new Date()

      await this.recordTransaction({
        id: crypto.randomUUID(),
        playerId: 'house',
        type: 'rake',
        amount: rakeAmount,
        balance: houseWallet.balance,
        tableId: body.tableId,
        handId: body.handId,
        timestamp: Date.now(),
        description: `Rake collection from hand ${body.handId}`
      })

      // Update rake statistics
      const period = this.getCurrentPeriod('daily')
      let stats = this.state.rakeStatistics.get(period)
      if (!stats) {
        stats = {
          period,
          totalRake: 0,
          handCount: 0,
          lastUpdated: Date.now()
        }
      }
      stats.totalRake += rakeAmount
      stats.handCount++
      stats.lastUpdated = Date.now()
      this.state.rakeStatistics.set(period, stats)

      // Process winner payouts
      const payouts = []
      
      if (body.winnerPlayerId) {
        // Single winner
        const winnerWallet = await this.getOrCreateWallet(body.winnerPlayerId)
        winnerWallet.balance += netPot
        winnerWallet.lastUpdated = new Date()

        await this.recordTransaction({
          id: crypto.randomUUID(),
          playerId: body.winnerPlayerId,
          type: 'win',
          amount: netPot,
          balance: winnerWallet.balance,
          tableId: body.tableId,
          handId: body.handId,
          timestamp: Date.now(),
          description: `Won pot of ${body.potAmount} (after ${rakeAmount} rake)`
        })

        payouts.push({ playerId: body.winnerPlayerId, amount: netPot })
      } else if (body.winners && body.winners.length > 0) {
        // Multiple winners
        for (const winner of body.winners) {
          const winAmount = Math.floor(netPot * winner.share)
          const winnerWallet = await this.getOrCreateWallet(winner.playerId)
          winnerWallet.balance += winAmount
          winnerWallet.lastUpdated = new Date()

          await this.recordTransaction({
            id: crypto.randomUUID(),
            playerId: winner.playerId,
            type: 'win',
            amount: winAmount,
            balance: winnerWallet.balance,
            tableId: body.tableId,
            handId: body.handId,
            timestamp: Date.now(),
            description: `Won ${winner.share * 100}% of pot (${winAmount} after rake)`
          })

          payouts.push({ playerId: winner.playerId, amount: winAmount })
        }
      }

      await this.saveState()

      return new Response(JSON.stringify({
        success: true,
        data: {
          rakeAmount,
          winnerPayout: body.winnerPlayerId ? netPot : undefined,
          payouts: payouts.length > 1 ? payouts : undefined
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  /**
   * Get rake statistics
   */
  private async handleRakeStats(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const period = url.searchParams.get('period') || 'daily'

    const currentPeriod = this.getCurrentPeriod(period)
    const stats = this.state.rakeStatistics.get(currentPeriod)

    if (!stats) {
      return new Response(JSON.stringify({
        success: true,
        data: {
          period: currentPeriod,
          totalRake: 0,
          handCount: 0,
          averageRake: 0
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        ...stats,
        averageRake: stats.handCount > 0 ? stats.totalRake / stats.handCount : 0
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }

  /**
   * Get current period for statistics
   */
  private getCurrentPeriod(type: string): string {
    const now = new Date()
    switch (type) {
      case 'daily':
        return now.toISOString().split('T')[0] || now.toISOString().substring(0, 10)
      case 'monthly':
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      case 'yearly':
        return String(now.getFullYear())
      default:
        return now.toISOString().split('T')[0] || now.toISOString().substring(0, 10)
    }
  }

  /**
   * Cleanup old data periodically
   */
  private async cleanupOldData(): Promise<void> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 7) // Keep 7 days of daily limits
    const cutoffParts = cutoffDate.toISOString().split('T')
    const cutoffString = cutoffParts[0] || cutoffDate.toISOString().substring(0, 10)

    // Clean up old daily limits
    for (const [key, limit] of this.state.dailyLimits) {
      if (limit && limit.date < cutoffString) {
        this.state.dailyLimits.delete(key)
      }
    }
  }
}