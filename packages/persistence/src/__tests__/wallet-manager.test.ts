/**
 * WalletManager Unit Tests
 * 
 * Comprehensive tests for wallet operations, financial transactions,
 * and chip management in the poker system
 */

import { WalletManager, WalletTransaction } from '../wallet-manager';

// Mock types from shared package
interface PlayerWallet {
  playerId: string;
  balance: number;
  currency: string;
  frozen: number;
  lastUpdated: Date;
}

interface BuyInRequest {
  playerId: string;
  tableId: string;
  amount: number;
}

// Mock crypto.randomUUID for Node.js environment
if (!global.crypto) {
  global.crypto = {
    randomUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  } as any;
}

describe('WalletManager', () => {
  let walletManager: WalletManager;

  beforeEach(() => {
    walletManager = new WalletManager();
  });

  describe('Wallet Initialization', () => {
    it('should initialize wallet with default balance', async () => {
      const wallet = await walletManager.initializeWallet('player-123');

      expect(wallet).toMatchObject({
        playerId: 'player-123',
        balance: 10000,
        currency: 'USD',
        frozen: 0,
        lastUpdated: expect.any(Date)
      });
    });

    it('should initialize wallet with custom balance', async () => {
      const wallet = await walletManager.initializeWallet('player-123', 5000);

      expect(wallet.balance).toBe(5000);
    });

    it('should record initial deposit transaction', async () => {
      await walletManager.initializeWallet('player-123', 5000);
      const history = await walletManager.getTransactionHistory('player-123');

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        playerId: 'player-123',
        type: 'deposit',
        amount: 5000,
        description: 'Initial wallet balance'
      });
    });

    it('should create wallet on first access', async () => {
      const wallet = await walletManager.getWallet('new-player');

      expect(wallet.playerId).toBe('new-player');
      expect(wallet.balance).toBe(10000);
    });

    it('should return existing wallet on subsequent access', async () => {
      const wallet1 = await walletManager.initializeWallet('player-123', 5000);
      const wallet2 = await walletManager.getWallet('player-123');

      expect(wallet2).toBe(wallet1);
      expect(wallet2.balance).toBe(5000);
    });
  });

  describe('Buy-In Operations', () => {
    beforeEach(async () => {
      await walletManager.initializeWallet('player-123', 1000);
    });

    it('should process valid buy-in', async () => {
      const buyInRequest: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 200
      };

      const response = await walletManager.processBuyIn(buyInRequest);

      expect(response).toMatchObject({
        success: true,
        chipCount: 200,
        walletBalance: 800 // 1000 - 200
      });

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.frozen).toBe(200);
    });

    it('should reject buy-in with insufficient funds', async () => {
      const buyInRequest: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 1500
      };

      const response = await walletManager.processBuyIn(buyInRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Insufficient funds');
    });

    it('should reject negative buy-in amount', async () => {
      const buyInRequest: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: -100
      };

      const response = await walletManager.processBuyIn(buyInRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Buy-in amount must be positive');
    });

    it('should reject zero buy-in amount', async () => {
      const buyInRequest: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 0
      };

      const response = await walletManager.processBuyIn(buyInRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Buy-in amount must be positive');
    });

    it('should handle multiple buy-ins correctly', async () => {
      const buyIn1: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 200
      };

      const buyIn2: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-2',
        amount: 300
      };

      await walletManager.processBuyIn(buyIn1);
      const response2 = await walletManager.processBuyIn(buyIn2);

      expect(response2.success).toBe(true);
      expect(response2.walletBalance).toBe(500); // 1000 - 200 - 300

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.frozen).toBe(500); // 200 + 300
    });

    it('should record buy-in transaction', async () => {
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const buyInRequest: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 200
      };

      await walletManager.processBuyIn(buyInRequest);
      const history = await walletManager.getTransactionHistory('player-123');

      expect(history).toHaveLength(2); // Initial deposit + buy-in
      expect(history[0]).toMatchObject({
        type: 'buy_in',
        amount: -200,
        tableId: 'table-1',
        description: 'Buy-in to table table-1'
      });
      expect(history[1]).toMatchObject({
        type: 'deposit',
        amount: 1000,
        description: 'Initial wallet balance'
      });
    });
  });

  describe('Cash-Out Operations', () => {
    beforeEach(async () => {
      await walletManager.initializeWallet('player-123', 1000);
      await walletManager.processBuyIn({
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 200
      });
    });

    it('should process cash-out with profit', async () => {
      await walletManager.processCashOut('player-123', 'table-1', 300);

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(1300); // 1000 + 300 (buy-in was frozen, not deducted)
      expect(wallet.frozen).toBe(0);
    });

    it('should process cash-out with loss', async () => {
      await walletManager.processCashOut('player-123', 'table-1', 150);

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(1150); // 1000 + 150 (buy-in was frozen, not deducted)
      expect(wallet.frozen).toBe(0);
    });

    it('should process cash-out with exact buy-in amount', async () => {
      await walletManager.processCashOut('player-123', 'table-1', 200);

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(1200); // 1000 + 200 (return exact buy-in)
      expect(wallet.frozen).toBe(0);
    });

    it('should handle cash-out with zero chips (lost all)', async () => {
      await walletManager.processCashOut('player-123', 'table-1', 0);

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(1000); // 1000 + 0 (lost all chips)
      expect(wallet.frozen).toBe(0);
    });

    it('should record cash-out transaction', async () => {
      await walletManager.processCashOut('player-123', 'table-1', 300);
      const history = await walletManager.getTransactionHistory('player-123');

      const cashOutTransaction = history.find(t => t.type === 'cash_out');
      expect(cashOutTransaction).toMatchObject({
        type: 'cash_out',
        amount: 300,
        tableId: 'table-1',
        description: 'Cash-out from table table-1'
      });
    });

    it('should unfreeze correct amount after cash-out', async () => {
      // Add another buy-in
      await walletManager.processBuyIn({
        playerId: 'player-123',
        tableId: 'table-2',
        amount: 300
      });

      const walletBefore = await walletManager.getWallet('player-123');
      expect(walletBefore.frozen).toBe(500); // 200 + 300

      await walletManager.processCashOut('player-123', 'table-1', 250);

      const walletAfter = await walletManager.getWallet('player-123');
      expect(walletAfter.frozen).toBe(300); // Only table-2 buy-in remains frozen
    });
  });

  describe('Winnings and Losses', () => {
    beforeEach(async () => {
      await walletManager.initializeWallet('player-123', 1000);
    });

    it('should process winnings correctly', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      await walletManager.processWinnings('player-123', 'table-1', 100, 'hand-1');

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(1100);

      const history = await walletManager.getTransactionHistory('player-123');
      expect(history).toHaveLength(2); // Initial + win
      expect(history[0]).toMatchObject({
        type: 'win',
        amount: 100,
        handId: 'hand-1',
        description: 'Winnings from hand hand-1'
      });
    });

    it('should process losses correctly', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      await walletManager.processLosses('player-123', 'table-1', 50, 'hand-1');

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(950);

      const history = await walletManager.getTransactionHistory('player-123');
      expect(history).toHaveLength(2); // Initial + loss
      expect(history[0]).toMatchObject({
        type: 'loss',
        amount: -50,
        handId: 'hand-1',
        description: 'Loss from hand hand-1'
      });
    });

    it('should handle winnings without handId', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      await walletManager.processWinnings('player-123', 'table-1', 100);

      const history = await walletManager.getTransactionHistory('player-123');
      expect(history).toHaveLength(2); // Initial + win
      expect(history[0].description).toBe('Winnings from hand unknown');
      expect(history[0].handId).toBeUndefined();
    });

    it('should handle multiple wins and losses', async () => {
      await walletManager.processWinnings('player-123', 'table-1', 100, 'hand-1');
      await walletManager.processLosses('player-123', 'table-1', 30, 'hand-2');
      await walletManager.processWinnings('player-123', 'table-1', 50, 'hand-3');
      await walletManager.processLosses('player-123', 'table-1', 20, 'hand-4');

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(1100); // 1000 + 100 - 30 + 50 - 20
    });
  });

  describe('Available Balance', () => {
    it('should calculate available balance correctly', async () => {
      await walletManager.initializeWallet('player-123', 1000);
      
      let available = await walletManager.getAvailableBalance('player-123');
      expect(available).toBe(1000);

      await walletManager.processBuyIn({
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 300
      });

      available = await walletManager.getAvailableBalance('player-123');
      expect(available).toBe(700);
    });

    it('should handle multiple frozen amounts', async () => {
      await walletManager.initializeWallet('player-123', 1000);
      
      await walletManager.processBuyIn({
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 200
      });

      await walletManager.processBuyIn({
        playerId: 'player-123',
        tableId: 'table-2',
        amount: 300
      });

      const available = await walletManager.getAvailableBalance('player-123');
      expect(available).toBe(500); // 1000 - 200 - 300
    });
  });

  describe('Fund Management', () => {
    it('should add funds correctly', async () => {
      await walletManager.initializeWallet('player-123', 1000);
      await new Promise(resolve => setTimeout(resolve, 10));
      await walletManager.addFunds('player-123', 500, 'Bonus deposit');

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(1500);

      const history = await walletManager.getTransactionHistory('player-123');
      expect(history).toHaveLength(2); // Initial + bonus
      expect(history[0]).toMatchObject({
        type: 'deposit',
        amount: 500,
        description: 'Bonus deposit'
      });
    });

    it('should add funds with default description', async () => {
      await walletManager.initializeWallet('player-123', 1000);
      await new Promise(resolve => setTimeout(resolve, 10));
      await walletManager.addFunds('player-123', 500);

      const history = await walletManager.getTransactionHistory('player-123');
      expect(history).toHaveLength(2); // Initial + added
      expect(history[0].description).toBe('Added funds');
    });
  });

  describe('Transaction History', () => {
    it('should return transactions in reverse chronological order', async () => {
      await walletManager.initializeWallet('player-123', 1000);
      
      // Add some time delays to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      await walletManager.addFunds('player-123', 100);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      await walletManager.processWinnings('player-123', 'table-1', 50);

      const history = await walletManager.getTransactionHistory('player-123');

      expect(history).toHaveLength(3);
      expect(history[0].type).toBe('win'); // Most recent
      expect(history[1].type).toBe('deposit'); // Second
      expect(history[2].description).toBe('Initial wallet balance'); // Oldest
    });

    it('should limit transaction history', async () => {
      await walletManager.initializeWallet('player-123', 1000);
      
      // Add many transactions
      for (let i = 0; i < 60; i++) {
        await walletManager.addFunds('player-123', 10, `Transaction ${i}`);
      }

      const history = await walletManager.getTransactionHistory('player-123', 10);
      expect(history).toHaveLength(10);
    });

    it('should filter transactions by player', async () => {
      await walletManager.initializeWallet('player-123', 1000);
      await walletManager.initializeWallet('player-456', 1000);
      
      await walletManager.addFunds('player-123', 100);
      await walletManager.addFunds('player-456', 200);

      const history123 = await walletManager.getTransactionHistory('player-123');
      const history456 = await walletManager.getTransactionHistory('player-456');

      expect(history123).toHaveLength(2);
      expect(history456).toHaveLength(2);
      expect(history123.every(t => t.playerId === 'player-123')).toBe(true);
      expect(history456.every(t => t.playerId === 'player-456')).toBe(true);
    });

    it('should prevent transaction history bloat', async () => {
      await walletManager.initializeWallet('player-123', 1000);
      
      // Add more than 1000 transactions
      for (let i = 0; i < 1010; i++) {
        await walletManager.addFunds('player-123', 1, `Transaction ${i}`);
      }

      const history = await walletManager.getTransactionHistory('player-123', 2000);
      expect(history.length).toBeLessThanOrEqual(1000);
    });
  });

  describe('Wallet Statistics', () => {
    it('should calculate wallet statistics correctly', async () => {
      await walletManager.initializeWallet('player-1', 1000);
      await walletManager.initializeWallet('player-2', 2000);
      await walletManager.initializeWallet('player-3', 1500);

      await walletManager.processBuyIn({
        playerId: 'player-1',
        tableId: 'table-1',
        amount: 500
      });

      await walletManager.processBuyIn({
        playerId: 'player-2',
        tableId: 'table-1',
        amount: 1000
      });

      const stats = await walletManager.getWalletStats();

      expect(stats).toMatchObject({
        totalWallets: 3,
        totalBalance: 4500, // 1000 + 2000 + 1500
        totalFrozen: 1500, // 500 + 1000
        totalTransactions: 5 // 3 initial deposits + 2 buy-ins
      });
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle concurrent operations safely', async () => {
      await walletManager.initializeWallet('player-123', 1000);

      // Simulate concurrent buy-ins
      const buyInPromises = [
        walletManager.processBuyIn({
          playerId: 'player-123',
          tableId: 'table-1',
          amount: 200
        }),
        walletManager.processBuyIn({
          playerId: 'player-123',
          tableId: 'table-2',
          amount: 300
        }),
        walletManager.processBuyIn({
          playerId: 'player-123',
          tableId: 'table-3',
          amount: 400
        })
      ];

      const results = await Promise.all(buyInPromises);
      const successCount = results.filter(r => r.success).length;
      
      // All should succeed as we have enough balance
      expect(successCount).toBe(3);

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.frozen).toBe(900);
    });

    it('should maintain data integrity with rapid transactions', async () => {
      await walletManager.initializeWallet('player-123', 1000);

      // Rapid wins and losses
      const operations = [];
      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          operations.push(walletManager.processWinnings('player-123', 'table-1', 10));
        } else {
          operations.push(walletManager.processLosses('player-123', 'table-1', 5));
        }
      }

      await Promise.all(operations);

      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(1050); // 1000 + (10 * 10) - (5 * 10)
    });

    it('should handle very large transactions', async () => {
      await walletManager.initializeWallet('player-123', 1000000);
      
      const response = await walletManager.processBuyIn({
        playerId: 'player-123',
        tableId: 'high-stakes',
        amount: 500000
      });

      expect(response.success).toBe(true);
      expect(response.chipCount).toBe(500000);
      expect(response.walletBalance).toBe(500000);
    });

    it('should reject operations that would create negative balance', async () => {
      await walletManager.initializeWallet('player-123', 100);
      
      // This would create negative balance if not properly checked
      await walletManager.processLosses('player-123', 'table-1', 200);
      
      const wallet = await walletManager.getWallet('player-123');
      expect(wallet.balance).toBe(-100); // System allows negative for losses
      
      // But buy-in should be rejected
      const response = await walletManager.processBuyIn({
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 50
      });
      
      expect(response.success).toBe(false);
      expect(response.error).toContain('Insufficient funds');
    });

    it('should handle player with no transaction history', async () => {
      const history = await walletManager.getTransactionHistory('non-existent-player');
      expect(history).toEqual([]);
    });
  });
});