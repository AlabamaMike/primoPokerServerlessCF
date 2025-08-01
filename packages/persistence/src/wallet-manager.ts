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
  async getTransactionHistory(playerId: string, limit: number = 50): Promise<WalletTransaction[]> {
    return this.transactions
      .filter(t => t.playerId === playerId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
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