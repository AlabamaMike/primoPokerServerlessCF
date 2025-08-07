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

  describe('Double-Entry Bookkeeping', () => {
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

    it('should maintain balanced books for transfers', async () => {
      // Perform transfer
      await durableObject.fetch(new Request('http://localhost/wallet/transfer', {
        method: 'POST',
        body: JSON.stringify({
          fromPlayerId: 'player-123',
          toPlayerId: 'player-456',
          amount: 200,
          description: 'Test transfer'
        })
      }))

      // Get transactions for both players
      const from123 = await durableObject.fetch(new Request('http://localhost/wallet/transactions?playerId=player-123&type=transfer'))
      const fromResult = await from123.json() as any
      
      const to456 = await durableObject.fetch(new Request('http://localhost/wallet/transactions?playerId=player-456&type=transfer'))
      const toResult = await to456.json() as any

      // Verify double-entry
      expect(fromResult.data.transactions.length).toBe(1)
      expect(toResult.data.transactions.length).toBe(1)
      
      const fromTxn = fromResult.data.transactions[0]
      const toTxn = toResult.data.transactions[0]
      
      expect(fromTxn.amount).toBe(-200)
      expect(toTxn.amount).toBe(200)
      expect(fromTxn.metadata.transferId).toBe(toTxn.metadata.transferId)
      expect(fromTxn.metadata.direction).toBe('outgoing')
      expect(toTxn.metadata.direction).toBe('incoming')
    })

    it('should maintain ledger balance consistency', async () => {
      // Perform multiple operations
      await durableObject.fetch(new Request('http://localhost/wallet/deposit', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', amount: 500 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', tableId: 'table-1', amount: 300 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/cash-out', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', tableId: 'table-1', chipAmount: 400 })
      }))

      // Get all transactions
      const txnsResponse = await durableObject.fetch(new Request('http://localhost/wallet/transactions?playerId=player-123'))
      const txnsResult = await txnsResponse.json() as any

      // Verify running balance
      let calculatedBalance = 0
      for (const txn of txnsResult.data.transactions.reverse()) {
        calculatedBalance += txn.amount
        expect(txn.balance).toBe(calculatedBalance)
      }

      // Verify final balance matches
      const walletResponse = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-123'))
      const walletResult = await walletResponse.json() as any
      expect(walletResult.data.wallet.balance).toBe(calculatedBalance)
    })
  })

  describe('Transaction Atomicity', () => {
    beforeEach(async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))
    })

    it('should handle concurrent buy-ins atomically', async () => {
      // Simulate concurrent buy-ins
      const promises = []
      for (let i = 0; i < 5; i++) {
        promises.push(
          durableObject.fetch(new Request('http://localhost/wallet/buy-in', {
            method: 'POST',
            body: JSON.stringify({
              playerId: 'player-123',
              tableId: `table-${i}`,
              amount: 200
            })
          }))
        )
      }

      const responses = await Promise.all(promises)
      const results = await Promise.all(responses.map(r => r.json()))

      // Check that all operations were handled correctly
      const successCount = results.filter((r: any) => r.success).length
      const failureCount = results.filter((r: any) => !r.success).length

      // With 1000 balance, only 5 buy-ins of 200 each should succeed
      expect(successCount).toBe(5)
      expect(failureCount).toBe(0)

      // Verify final balance
      const walletResponse = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-123'))
      const walletResult = await walletResponse.json() as any
      expect(walletResult.data.availableBalance).toBe(0)
      expect(walletResult.data.frozenAmount).toBe(1000)
    })

    it('should prevent race conditions in transfers', async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-456', initialBalance: 0 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-789', initialBalance: 0 })
      }))

      // Simulate concurrent transfers from same source
      const promises = [
        durableObject.fetch(new Request('http://localhost/wallet/transfer', {
          method: 'POST',
          body: JSON.stringify({
            fromPlayerId: 'player-123',
            toPlayerId: 'player-456',
            amount: 600
          })
        })),
        durableObject.fetch(new Request('http://localhost/wallet/transfer', {
          method: 'POST',
          body: JSON.stringify({
            fromPlayerId: 'player-123',
            toPlayerId: 'player-789',
            amount: 600
          })
        }))
      ]

      const responses = await Promise.all(promises)
      const results = await Promise.all(responses.map(r => r.json()))

      // Only one should succeed
      const successCount = results.filter((r: any) => r.success).length
      expect(successCount).toBe(1)

      // Verify final balance
      const walletResponse = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-123'))
      const walletResult = await walletResponse.json() as any
      expect(walletResult.data.wallet.balance).toBe(400)
    })
  })

  describe('Transaction Rollback', () => {
    beforeEach(async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))
    })

    it('should rollback failed buy-in', async () => {
      const request = new Request('http://localhost/wallet/rollback-buy-in', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          amount: 200,
          reason: 'Table closed unexpectedly'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.refundAmount).toBe(200)
      expect(result.data.newBalance).toBe(1000)
    })

    it('should rollback incomplete hand', async () => {
      // Process buy-in first
      await durableObject.fetch(new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          amount: 300
        })
      }))

      // Rollback the hand
      const request = new Request('http://localhost/wallet/rollback-hand', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-1',
          handId: 'hand-123',
          players: [
            { playerId: 'player-123', refundAmount: 50 }
          ],
          reason: 'Hand cancelled due to disconnection'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)

      // Verify transaction history shows rollback
      const txnsResponse = await durableObject.fetch(new Request('http://localhost/wallet/transactions?playerId=player-123'))
      const txnsResult = await txnsResponse.json() as any
      
      const rollbackTxn = txnsResult.data.transactions.find((t: any) => t.type === 'refund')
      expect(rollbackTxn).toBeDefined()
      expect(rollbackTxn.amount).toBe(50)
      expect(rollbackTxn.metadata.reason).toBe('Hand cancelled due to disconnection')
    })
  })

  describe('Idempotency', () => {
    beforeEach(async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))
    })

    it('should handle duplicate buy-in requests idempotently', async () => {
      const idempotencyKey = 'buy-in-123-456'
      
      // First request
      const request1 = new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          amount: 200
        })
      })

      const response1 = await durableObject.fetch(request1)
      const result1 = await response1.json() as any

      // Duplicate request with same idempotency key
      const request2 = new Request('http://localhost/wallet/buy-in', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          playerId: 'player-123',
          tableId: 'table-1',
          amount: 200
        })
      })

      const response2 = await durableObject.fetch(request2)
      const result2 = await response2.json() as any

      // Should return same result
      expect(result2).toEqual(result1)
      expect(response2.headers.get('X-Idempotent-Replayed')).toBe('true')

      // Verify balance only deducted once
      const walletResponse = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-123'))
      const walletResult = await walletResponse.json() as any
      expect(walletResult.data.availableBalance).toBe(800)
    })

    it('should handle duplicate transfer requests idempotently', async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-456', initialBalance: 0 })
      }))

      const idempotencyKey = 'transfer-789'
      
      // First request
      const request1 = new Request('http://localhost/wallet/transfer', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          fromPlayerId: 'player-123',
          toPlayerId: 'player-456',
          amount: 300,
          description: 'Test transfer'
        })
      })

      await durableObject.fetch(request1)

      // Duplicate request
      const request2 = new Request('http://localhost/wallet/transfer', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          fromPlayerId: 'player-123',
          toPlayerId: 'player-456',
          amount: 300,
          description: 'Test transfer'
        })
      })

      const response2 = await durableObject.fetch(request2)
      expect(response2.headers.get('X-Idempotent-Replayed')).toBe('true')

      // Verify balances
      const wallet123 = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-123'))
      const wallet123Result = await wallet123.json() as any
      expect(wallet123Result.data.wallet.balance).toBe(700)

      const wallet456 = await durableObject.fetch(new Request('http://localhost/wallet?playerId=player-456'))
      const wallet456Result = await wallet456.json() as any
      expect(wallet456Result.data.wallet.balance).toBe(300)
    })
  })

  describe('RAKE Transactions', () => {
    beforeEach(async () => {
      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-123', initialBalance: 1000 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'player-456', initialBalance: 1000 })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        body: JSON.stringify({ playerId: 'house', initialBalance: 0 })
      }))
    })

    it('should process rake collection from pot', async () => {
      const request = new Request('http://localhost/wallet/collect-rake', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-1',
          handId: 'hand-123',
          potAmount: 1000,
          rakePercentage: 5,
          maxRake: 50,
          winnerPlayerId: 'player-123'
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.rakeAmount).toBe(50) // 5% of 1000, capped at 50
      expect(result.data.winnerPayout).toBe(950)

      // Verify house wallet received rake
      const houseWallet = await durableObject.fetch(new Request('http://localhost/wallet?playerId=house'))
      const houseResult = await houseWallet.json() as any
      expect(houseResult.data.wallet.balance).toBe(50)
    })

    it('should handle rake with multiple winners', async () => {
      const request = new Request('http://localhost/wallet/collect-rake', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-1',
          handId: 'hand-124',
          potAmount: 1000,
          rakePercentage: 5,
          maxRake: 100,
          winners: [
            { playerId: 'player-123', share: 0.6 },
            { playerId: 'player-456', share: 0.4 }
          ]
        })
      })

      const response = await durableObject.fetch(request)
      const result = await response.json() as any

      expect(response.status).toBe(200)
      expect(result.success).toBe(true)
      expect(result.data.rakeAmount).toBe(50)
      expect(result.data.payouts).toEqual([
        { playerId: 'player-123', amount: 570 }, // 60% of 950
        { playerId: 'player-456', amount: 380 }  // 40% of 950
      ])
    })

    it('should track rake statistics', async () => {
      // Process several rake collections
      await durableObject.fetch(new Request('http://localhost/wallet/collect-rake', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-1',
          handId: 'hand-1',
          potAmount: 100,
          rakePercentage: 5,
          maxRake: 10,
          winnerPlayerId: 'player-123'
        })
      }))

      await durableObject.fetch(new Request('http://localhost/wallet/collect-rake', {
        method: 'POST',
        body: JSON.stringify({
          tableId: 'table-1',
          handId: 'hand-2',
          potAmount: 200,
          rakePercentage: 5,
          maxRake: 20,
          winnerPlayerId: 'player-456'
        })
      }))

      // Get rake statistics
      const statsResponse = await durableObject.fetch(new Request('http://localhost/wallet/rake-stats?period=daily'))
      const statsResult = await statsResponse.json() as any

      expect(statsResponse.status).toBe(200)
      expect(statsResult.data.totalRake).toBe(15) // 5 + 10
      expect(statsResult.data.handCount).toBe(2)
      expect(statsResult.data.averageRake).toBe(7.5)
    })
  })

  describe('Concurrent Transaction Tests', () => {
    beforeEach(async () => {
      // Initialize multiple wallets
      const initPromises = []
      for (let i = 1; i <= 10; i++) {
        initPromises.push(
          durableObject.fetch(new Request('http://localhost/wallet/initialize', {
            method: 'POST',
            body: JSON.stringify({ playerId: `player-${i}`, initialBalance: 1000 })
          }))
        )
      }
      await Promise.all(initPromises)
    })

    it('should handle high-volume concurrent transactions', async () => {
      const operations = []
      
      // Mix of different operations
      for (let i = 0; i < 50; i++) {
        const fromPlayer = `player-${(i % 10) + 1}`
        const toPlayer = `player-${((i + 1) % 10) + 1}`
        
        if (i % 4 === 0) {
          // Deposits
          operations.push(
            durableObject.fetch(new Request('http://localhost/wallet/deposit', {
              method: 'POST',
              body: JSON.stringify({
                playerId: fromPlayer,
                amount: 50
              })
            }))
          )
        } else if (i % 4 === 1) {
          // Buy-ins
          operations.push(
            durableObject.fetch(new Request('http://localhost/wallet/buy-in', {
              method: 'POST',
              body: JSON.stringify({
                playerId: fromPlayer,
                tableId: `table-${i}`,
                amount: 100
              })
            }))
          )
        } else if (i % 4 === 2) {
          // Transfers
          operations.push(
            durableObject.fetch(new Request('http://localhost/wallet/transfer', {
              method: 'POST',
              body: JSON.stringify({
                fromPlayerId: fromPlayer,
                toPlayerId: toPlayer,
                amount: 25
              })
            }))
          )
        } else {
          // Withdrawals
          operations.push(
            durableObject.fetch(new Request('http://localhost/wallet/withdraw', {
              method: 'POST',
              body: JSON.stringify({
                playerId: fromPlayer,
                amount: 30
              })
            }))
          )
        }
      }

      const responses = await Promise.all(operations)
      const results = await Promise.all(responses.map(r => r.json()))

      // Verify all operations completed
      expect(responses.length).toBe(50)

      // Calculate expected total balance
      const statsResponse = await durableObject.fetch(new Request('http://localhost/wallet/stats'))
      const statsResult = await statsResponse.json() as any

      // Initial: 10 players * 1000 = 10000
      // Deposits: ~12 deposits * 50 = 600
      // Withdrawals: ~12 withdrawals * 30 = -360
      // Transfers: net zero
      // Buy-ins: just frozen, not deducted
      const expectedApproxBalance = 10000 + 600 - 360

      expect(statsResult.data.totalBalance).toBeGreaterThan(expectedApproxBalance - 100)
      expect(statsResult.data.totalBalance).toBeLessThan(expectedApproxBalance + 100)
    })
  })
})