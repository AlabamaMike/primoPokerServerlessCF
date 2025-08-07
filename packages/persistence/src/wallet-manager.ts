/**
 * Wallet Manager - Handles player balances and chip management
 * 
 * Features:
 * - Player wallet balance tracking
 * - Buy-in and cash-out operations
 * - Transaction history
 * - Freeze/unfreeze funds for active games
 */

import { PlayerWallet, BuyInRequest, BuyInResponse } from '@primo-poker/shared';

export interface WalletTransaction {
  id: string;
  playerId: string;
  type: 'buy_in' | 'cash_out' | 'win' | 'loss' | 'deposit' | 'withdrawal';
  amount: number;
  tableId?: string;
  handId?: string;
  timestamp: Date;
  description: string;
}

export class WalletManager {
  private wallets: Map<string, PlayerWallet> = new Map();
  private transactions: WalletTransaction[] = [];

  /**
   * Initialize player wallet with starting balance
   */
  async initializeWallet(playerId: string, initialBalance: number = 10000): Promise<PlayerWallet> {
    const wallet: PlayerWallet = {
      playerId,
      balance: initialBalance,
      currency: 'USD',
      frozen: 0,
      lastUpdated: new Date()
    };

    this.wallets.set(playerId, wallet);
    
    // Record initial deposit transaction
    await this.recordTransaction({
      id: crypto.randomUUID(),
      playerId,
      type: 'deposit',
      amount: initialBalance,
      timestamp: new Date(),
      description: 'Initial wallet balance'
    });

    return wallet;
  }

  /**
   * Get player wallet, creating one if it doesn't exist
   */
  async getWallet(playerId: string): Promise<PlayerWallet> {
    let wallet = this.wallets.get(playerId);
    
    if (!wallet) {
      wallet = await this.initializeWallet(playerId);
    }
    
    return wallet;
  }

  /**
   * Process buy-in request
   */
  async processBuyIn(request: BuyInRequest): Promise<BuyInResponse> {
    const wallet = await this.getWallet(request.playerId);
    
    // Validate buy-in amount
    if (request.amount <= 0) {
      return {
        success: false,
        error: 'Buy-in amount must be positive'
      };
    }

    // Check if player has sufficient balance
    const availableBalance = wallet.balance - wallet.frozen;
    if (availableBalance < request.amount) {
      return {
        success: false,
        error: `Insufficient funds. Available: $${availableBalance}, Required: $${request.amount}`
      };
    }

    // Freeze the buy-in amount
    wallet.frozen += request.amount;
    wallet.lastUpdated = new Date();

    // Record buy-in transaction
    await this.recordTransaction({
      id: crypto.randomUUID(),
      playerId: request.playerId,
      type: 'buy_in',
      amount: -request.amount,
      tableId: request.tableId,
      timestamp: new Date(),
      description: `Buy-in to table ${request.tableId}`
    });

    return {
      success: true,
      chipCount: request.amount,
      walletBalance: wallet.balance - wallet.frozen
    };
  }

  /**
   * Process cash-out (when player leaves table)
   */
  async processCashOut(playerId: string, tableId: string, chipAmount: number): Promise<void> {
    const wallet = await this.getWallet(playerId);
    
    // Return chips to wallet balance
    wallet.balance += chipAmount;
    
    // Find and unfreeze the original buy-in amount
    const buyInTransaction = this.transactions
      .filter(t => t.playerId === playerId && t.tableId === tableId && t.type === 'buy_in')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]; // Most recent buy-in

    if (buyInTransaction) {
      wallet.frozen += buyInTransaction.amount; // buyInTransaction.amount is negative, so this reduces frozen
    }

    wallet.lastUpdated = new Date();

    // Record cash-out transaction
    await this.recordTransaction({
      id: crypto.randomUUID(),
      playerId,
      type: 'cash_out',
      amount: chipAmount,
      tableId,
      timestamp: new Date(),
      description: `Cash-out from table ${tableId}`
    });
  }

  /**
   * Transfer winnings to wallet (at end of hand)
   */
  async processWinnings(playerId: string, tableId: string, amount: number, handId?: string): Promise<void> {
    const wallet = await this.getWallet(playerId);
    
    wallet.balance += amount;
    wallet.lastUpdated = new Date();

    const transaction: WalletTransaction = {
      id: crypto.randomUUID(),
      playerId,
      type: 'win',
      amount,
      tableId,
      timestamp: new Date(),
      description: `Winnings from hand ${handId || 'unknown'}`
    };
    
    if (handId) {
      transaction.handId = handId;
    }
    
    await this.recordTransaction(transaction);
  }

  /**
   * Deduct losses from wallet (at end of hand)
   */
  async processLosses(playerId: string, tableId: string, amount: number, handId?: string): Promise<void> {
    const wallet = await this.getWallet(playerId);
    
    wallet.balance -= amount;
    wallet.lastUpdated = new Date();

    const transaction: WalletTransaction = {
      id: crypto.randomUUID(),
      playerId,
      type: 'loss',
      amount: -amount,
      tableId,
      timestamp: new Date(),
      description: `Loss from hand ${handId || 'unknown'}`
    };
    
    if (handId) {
      transaction.handId = handId;
    }
    
    await this.recordTransaction(transaction);
  }

  /**
   * Get player transaction history
   */
  async getTransactionHistory(playerId: string, limit: number = 50, cursor?: string): Promise<{
    transactions: WalletTransaction[];
    nextCursor?: string;
  }> {
    const allTransactions = this.transactions
      .filter(t => t.playerId === playerId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    let startIndex = 0;
    if (cursor) {
      startIndex = allTransactions.findIndex(t => t.id === cursor);
      if (startIndex === -1) startIndex = 0;
      else startIndex += 1; // Start after the cursor
    }

    const transactions = allTransactions.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < allTransactions.length;
    
    return {
      transactions,
      nextCursor: hasMore ? transactions[transactions.length - 1]?.id : undefined
    };
  }

  /**
   * Get available balance (total balance minus frozen funds)
   */
  async getAvailableBalance(playerId: string): Promise<number> {
    const wallet = await this.getWallet(playerId);
    return wallet.balance - wallet.frozen;
  }

  /**
   * Add funds to wallet (for demo/testing purposes)
   */
  async addFunds(playerId: string, amount: number, description: string = 'Added funds'): Promise<void> {
    const wallet = await this.getWallet(playerId);
    
    wallet.balance += amount;
    wallet.lastUpdated = new Date();

    await this.recordTransaction({
      id: crypto.randomUUID(),
      playerId,
      type: 'deposit',
      amount,
      timestamp: new Date(),
      description
    });
  }

  /**
   * Process deposit request
   */
  async deposit(playerId: string, amount: number, method: 'credit_card' | 'bank'): Promise<{
    success: boolean;
    newBalance?: number;
    transactionId?: string;
    error?: string;
  }> {
    try {
      if (amount <= 0) {
        return { success: false, error: 'Amount must be positive' };
      }

      const wallet = await this.getWallet(playerId);
      wallet.balance += amount;
      wallet.lastUpdated = new Date();

      const transactionId = crypto.randomUUID();
      await this.recordTransaction({
        id: transactionId,
        playerId,
        type: 'deposit',
        amount,
        timestamp: new Date(),
        description: `Deposit via ${method}`
      });

      return {
        success: true,
        newBalance: wallet.balance,
        transactionId
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Deposit failed' 
      };
    }
  }

  /**
   * Process withdrawal request
   */
  async withdraw(playerId: string, amount: number, method: 'bank' | 'check'): Promise<{
    success: boolean;
    newBalance?: number;
    transactionId?: string;
    error?: string;
  }> {
    try {
      if (amount <= 0) {
        return { success: false, error: 'Amount must be positive' };
      }

      const wallet = await this.getWallet(playerId);
      const availableBalance = wallet.balance - wallet.frozen;

      if (availableBalance < amount) {
        return { 
          success: false, 
          error: `Insufficient funds. Available: $${availableBalance}` 
        };
      }

      wallet.balance -= amount;
      wallet.lastUpdated = new Date();

      const transactionId = crypto.randomUUID();
      await this.recordTransaction({
        id: transactionId,
        playerId,
        type: 'withdrawal',
        amount: -amount,
        timestamp: new Date(),
        description: `Withdrawal via ${method}`
      });

      return {
        success: true,
        newBalance: wallet.balance,
        transactionId
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Withdrawal failed' 
      };
    }
  }

  /**
   * Process transfer to table
   */
  async transfer(playerId: string, toTableId: string, amount: number): Promise<{
    success: boolean;
    newBalance?: number;
    transferredAmount?: number;
    transactionId?: string;
    error?: string;
  }> {
    try {
      if (!toTableId) {
        return { success: false, error: 'Table ID is required' };
      }

      if (amount <= 0) {
        return { success: false, error: 'Amount must be positive' };
      }

      const wallet = await this.getWallet(playerId);
      const availableBalance = wallet.balance - wallet.frozen;

      if (availableBalance < amount) {
        return { 
          success: false, 
          error: `Insufficient funds. Available: $${availableBalance}` 
        };
      }

      // This would normally interact with the table to add chips
      // For now, we just freeze the amount
      wallet.frozen += amount;
      wallet.lastUpdated = new Date();

      const transactionId = crypto.randomUUID();
      await this.recordTransaction({
        id: transactionId,
        playerId,
        type: 'buy_in',
        amount: -amount,
        tableId: toTableId,
        timestamp: new Date(),
        description: `Transfer to table ${toTableId}`
      });

      return {
        success: true,
        newBalance: wallet.balance - wallet.frozen,
        transferredAmount: amount,
        transactionId
      };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Transfer failed' 
      };
    }
  }

  /**
   * Record a wallet transaction
   */
  private async recordTransaction(transaction: WalletTransaction): Promise<void> {
    this.transactions.push(transaction);
    
    // Keep only last 1000 transactions per player to prevent memory bloat
    const playerTransactions = this.transactions.filter(t => t.playerId === transaction.playerId);
    if (playerTransactions.length > 1000) {
      const excessTransactions = playerTransactions
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        .slice(0, playerTransactions.length - 1000);
      
      this.transactions = this.transactions.filter(t => 
        !excessTransactions.some(et => et.id === t.id)
      );
    }
  }

  /**
   * Get wallet statistics for admin/debugging
   */
  async getWalletStats(): Promise<{
    totalWallets: number;
    totalBalance: number;
    totalFrozen: number;
    totalTransactions: number;
  }> {
    const wallets = Array.from(this.wallets.values());
    
    return {
      totalWallets: wallets.length,
      totalBalance: wallets.reduce((sum, w) => sum + w.balance, 0),
      totalFrozen: wallets.reduce((sum, w) => sum + w.frozen, 0),
      totalTransactions: this.transactions.length
    };
  }
}