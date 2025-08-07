/**
 * WalletManager Durable Object Unit Tests
 */

import { WalletManagerDurableObject } from '../wallet-manager-do'
import type { BuyInRequest, TransferRequest } from '../wallet-manager-do'

// Mock Durable Object environment
class MockDurableObjectState {
  storage: MockStorage = new MockStorage()
  
  transaction(fn: () => Promise<void>): Promise<void> {
    return fn()
  }
}

class MockStorage {
  private data: Map<string, any> = new Map()
  
  async get(key: string): Promise<any> {
    return this.data.get(key)
  }
  
  async put(key: string, value: any): Promise<void> {
    this.data.set(key, value)
  }
  
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }
  
  async deleteAll(): Promise<void> {
    this.data.clear()
  }
  
  async list(): Promise<Map<string, any>> {
    return new Map(this.data)
  }
  
  transaction(fn: () => Promise<void>): Promise<void> {
    return fn()
  }
}

describe('WalletManagerDurableObject', () => {
  let durableObject: WalletManagerDurableObject
  let mockState: MockDurableObjectState
  let mockEnv: any

  beforeEach(() => {
    mockState = new MockDurableObjectState()
    mockEnv = {}
    durableObject = new WalletManagerDurableObject(mockState as any, mockEnv)
  })

  describe('Wallet Initialization', () => {
    it('should initialize a new wallet with default balance', async () => {
      const request = new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123' })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.wallet.playerId).toBe('player-123')
      expect(result.data.wallet.balance).toBe(10000)
      expect(result.data.wallet.currency).toBe('USD')
    })

    it('should initialize a wallet with custom balance', async () => {
      const request = new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ 
          playerId: 'player-456',
          initialBalance: 5000
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.data.wallet.balance).toBe(5000)
    })

    it('should not allow re-initializing existing wallet', async () => {
      // Initialize first time
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123' })
      }))

      // Try to initialize again
      const request = new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123' })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Wallet already exists')
    })
  })

  describe('Buy-In Operations', () => {
    beforeEach(async () => {
      // Initialize a wallet for testing
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))
    })

    it('should process valid buy-in', async () => {
      const buyInRequest: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 200
      }

      const request = new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify(buyInRequest)
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.chipCount).toBe(200)
      expect(result.walletBalance).toBe(800) // 1000 - 200
    })

    it('should reject buy-in with insufficient funds', async () => {
      const buyInRequest: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: 1500
      }

      const request = new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify(buyInRequest)
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Insufficient funds')
    })

    it('should reject negative buy-in amount', async () => {
      const buyInRequest: BuyInRequest = {
        playerId: 'player-123',
        tableId: 'table-1',
        amount: -100
      }

      const request = new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify(buyInRequest)
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Buy-in amount must be positive')
    })

    it('should handle multiple buy-ins correctly', async () => {
      // First buy-in
      await durableObject.fetch(new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          amount: 200
        })
      }))

      // Second buy-in
      const request = new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-2',
          amount: 300
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.walletBalance).toBe(500) // 1000 - 200 - 300
    })
  })

  describe('Cash-Out Operations', () => {
    beforeEach(async () => {
      // Initialize wallet and process buy-in
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          amount: 200
        })
      }))
    })

    it('should process cash-out with profit', async () => {
      const request = new Request('http://localhost/wallet/cash-out', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          chipAmount: 300
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.cashOutAmount).toBe(300)
      expect(result.data.netChange).toBe(100) // 300 - 200
      expect(result.data.newBalance).toBe(1100) // 1000 + 100
    })

    it('should process cash-out with loss', async () => {
      const request = new Request('http://localhost/wallet/cash-out', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          chipAmount: 150
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.cashOutAmount).toBe(150)
      expect(result.data.netChange).toBe(-50) // 150 - 200
      expect(result.data.newBalance).toBe(950) // 1000 - 50
    })

    it('should handle cash-out with zero chips', async () => {
      const request = new Request('http://localhost/wallet/cash-out', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          chipAmount: 0
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.netChange).toBe(-200) // Lost all buy-in
      expect(result.data.newBalance).toBe(800)
    })
  })

  describe('Winnings and Losses', () => {
    beforeEach(async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-456', initialBalance: 1000 })
      }))
    })

    it('should process winnings correctly', async () => {
      const request = new Request('http://localhost/wallet/process-winnings', {
        method: 'POST',
        body: JSON.stringify({
          winners: [
            { playerId: 'player-123', amount: 100 },
            { playerId: 'player-456', amount: 50 }
          ],
          losers: [],
          tableId: 'table-1',
          handId: 'hand-123'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.transactionCount).toBe(2)

      // Verify balances
      const wallet123 = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-123'))
      const wallet123Result = await wallet123.json() as any
      expect(wallet123Result.data.wallet.balance).toBe(1100)

      const wallet456 = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-456'))
      const wallet456Result = await wallet456.json() as any
      expect(wallet456Result.data.wallet.balance).toBe(1050)
    })

    it('should process losses correctly', async () => {
      const request = new Request('http://localhost/wallet/process-winnings', {
        method: 'POST',
        body: JSON.stringify({
          winners: [],
          losers: [
            { playerId: 'player-123', amount: 50 },
            { playerId: 'player-456', amount: 30 }
          ],
          tableId: 'table-1',
          handId: 'hand-123'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)

      // Verify balances
      const wallet123 = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-123'))
      const wallet123Result = await wallet123.json() as any
      expect(wallet123Result.data.wallet.balance).toBe(950)

      const wallet456 = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-456'))
      const wallet456Result = await wallet456.json() as any
      expect(wallet456Result.data.wallet.balance).toBe(970)
    })
  })

  describe('Deposits and Withdrawals', () => {
    beforeEach(async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))
    })

    it('should process deposit', async () => {
      const request = new Request('http://localhost/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          amount: 500,
          description: 'Test deposit'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.newBalance).toBe(1500)
      expect(result.data.depositAmount).toBe(500)
    })

    it('should process withdrawal', async () => {
      const request = new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          amount: 300,
          description: 'Test withdrawal'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.newBalance).toBe(700)
      expect(result.data.withdrawalAmount).toBe(300)
    })

    it('should reject withdrawal with insufficient funds', async () => {
      const request = new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          amount: 1500
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Insufficient available balance')
    })
  })

  describe('Player-to-Player Transfers', () => {
    beforeEach(async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-456', initialBalance: 500 })
      }))
    })

    it('should process valid transfer', async () => {
      const transfer: TransferRequest = {
        fromPlayerId: 'player-123',
        toPlayerId: 'player-456',
        amount: 200,
        description: 'Test transfer'
      }

      const request = new Request('http://localhost/wallet/transfer', {
        method: 'POST',
        body: JSON.stringify(transfer)
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.fromBalance).toBe(800)
      expect(result.data.toBalance).toBe(700)
    })

    it('should reject transfer to self', async () => {
      const transfer: TransferRequest = {
        fromPlayerId: 'player-123',
        toPlayerId: 'player-123',
        amount: 100,
        description: 'Self transfer'
      }

      const request = new Request('http://localhost/wallet/transfer', {
        method: 'POST',
        body: JSON.stringify(transfer)
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot transfer to yourself')
    })

    it('should reject transfer with insufficient funds', async () => {
      const transfer: TransferRequest = {
        fromPlayerId: 'player-123',
        toPlayerId: 'player-456',
        amount: 1500,
        description: 'Large transfer'
      }

      const request = new Request('http://localhost/wallet/transfer', {
        method: 'POST',
        body: JSON.stringify(transfer)
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Insufficient available balance')
    })

    it('should reject transfer outside limits', async () => {
      const transfer: TransferRequest = {
        fromPlayerId: 'player-123',
        toPlayerId: 'player-456',
        amount: 200000, // Over max limit
        description: 'Over limit'
      }

      const request = new Request('http://localhost/wallet/transfer', {
        method: 'POST',
        body: JSON.stringify(transfer)
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Transfer amount must be between')
    })
  })

  describe('Transaction History', () => {
    beforeEach(async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))

      // Create some transactions
      await durableObject.fetch(new Request('http://localhost/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          amount: 100,
          description: 'Deposit 1'
        })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          amount: 200
        })
      }))
    })

    it('should return transaction history', async () => {
      const request = new Request('http://localhost/wallet/transactions?playerId=player-123')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.transactions.length).toBeGreaterThan(0)
      
      // Should be in reverse chronological order
      const timestamps = result.data.transactions.map((t: any) => t.timestamp)
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a))
    })

    it('should filter transactions by type', async () => {
      const request = new Request('http://localhost/wallet/transactions?playerId=player-123&type=deposit')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      const deposits = result.data.transactions.filter((t: any) => t.type === 'deposit')
      expect(deposits.length).toBe(2) // Initial + test deposit
      expect(result.data.transactions).toEqual(deposits)
    })
  })

  describe('Wallet Statistics', () => {
    it('should return wallet statistics', async () => {
      // Create multiple wallets
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-1', initialBalance: 1000 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-2', initialBalance: 2000 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-3', initialBalance: 1500 })
      }))

      const request = new Request('http://localhost/wallet/stats')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.totalWallets).toBe(3)
      expect(result.data.totalBalance).toBe(4500)
      expect(result.data.averageWalletBalance).toBe(1500)
    })
  })

  describe('Health Check', () => {
    it('should return health status', async () => {
      const request = new Request('http://localhost/health')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.healthy).toBe(true)
      expect(result.instanceId).toBeDefined()
      expect(result.uptime).toBeGreaterThanOrEqual(0)
      expect(result.walletCount).toBe(0)
    })
  })

  describe('Error Handling', () => {
    it('should handle missing player ID', async () => {
      const request = new Request('http://localhost/wallet')
      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(400)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Player ID required')
    })

    it('should handle invalid HTTP methods', async () => {
      const request = new Request('http://localhost/wallet/buy-in', {
        method: 'GET' // Should be POST
      })

      const response = await durableObject.fetch(request)
      
      expect(response.status).toBe(405)
    })

    it('should handle wallet not found', async () => {
      const request = new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'non-existent',
          amount: 100
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(404)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Wallet not found')
    })
  })
})