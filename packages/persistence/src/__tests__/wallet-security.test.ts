/**
 * Wallet Security Tests - TDD Approach
 * 
 * Tests for:
 * - Transaction signing with HMAC
 * - Rate limiting per player/endpoint
 * - Fraud detection rules engine
 * - Transaction approval workflow
 * - Audit logging
 * - Admin tools for transaction review
 */

import { WalletManagerDurableObject, WalletTransaction } from '../wallet-manager-do'
import { logger } from '@primo-poker/core'
import crypto from 'crypto'

// Mock the Durable Object environment
const mockEnv = {
  DB: null,
  KV: null,
  WALLET_CONFIG: {
    defaultInitialBalance: 10000,
    maxTransactionsPerPlayer: 1000,
    dailyDepositLimit: 50000,
    dailyWithdrawalLimit: 25000,
    dailyBuyinLimit: 100000,
    minTransferAmount: 1,
    maxTransferAmount: 100000,
    lockTimeoutMs: 30000,
    idempotencyKeyTTLMs: 24 * 60 * 60 * 1000
  },
  WALLET_HMAC_SECRET: 'test-secret-key-for-hmac',
  RATE_LIMIT_CONFIG: {
    windowMs: 60000, // 1 minute
    maxRequests: 10,
    maxDepositsPerWindow: 3,
    maxWithdrawalsPerWindow: 2,
    maxTransfersPerWindow: 5
  },
  FRAUD_DETECTION_CONFIG: {
    unusualAmountThreshold: 10000,
    rapidTransactionCount: 5,
    rapidTransactionWindowMs: 300000, // 5 minutes
    suspiciousPatterns: {
      multipleFailedAttempts: 3,
      unusualGeoLocationChange: true,
      nightTimeThreshold: { start: 2, end: 6 }, // 2 AM - 6 AM
    }
  },
  TRANSACTION_APPROVAL_CONFIG: {
    largeAmountThreshold: 5000,
    requiresApproval: true,
    approvalTimeoutMs: 3600000 // 1 hour
  }
}

// Mock Durable Object State
class MockDurableObjectState {
  storage = new MockDurableObjectStorage()
  
  constructor() {}
}

class MockDurableObjectStorage {
  private data = new Map<string, any>()
  
  async get(key: string): Promise<any> {
    return this.data.get(key)
  }
  
  async put(key: string, value: any): Promise<void> {
    this.data.set(key, value)
  }
  
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key)
  }
  
  async list(options?: { prefix?: string }): Promise<Map<string, any>> {
    if (!options?.prefix) return new Map(this.data)
    
    const filtered = new Map()
    for (const [key, value] of this.data) {
      if (key.startsWith(options.prefix)) {
        filtered.set(key, value)
      }
    }
    return filtered
  }
  
  transaction(callback: () => Promise<void>): Promise<void> {
    return callback()
  }
}

describe('Wallet Security', () => {
  let walletManager: WalletManagerDurableObject
  let mockState: MockDurableObjectState

  beforeEach(() => {
    mockState = new MockDurableObjectState()
    walletManager = new WalletManagerDurableObject(mockState as any, mockEnv)
    jest.clearAllMocks()
  })

  describe('Transaction Signing with HMAC', () => {
    it('should require valid HMAC signature for sensitive operations', async () => {
      const playerId = 'player1'
      const amount = 1000
      const timestamp = Date.now()
      
      // Create request without signature
      const request = new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          playerId,
          amount,
          description: 'Test withdrawal',
          timestamp
        })
      })

      const response = await walletManager.fetch(request)
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error).toContain('signature required')
    })

    it('should accept request with valid HMAC signature', async () => {
      const playerId = 'player1'
      const amount = 1000
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      
      // First initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // Create signature
      const payload = JSON.stringify({
        playerId,
        amount,
        description: 'Test withdrawal',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const request = new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      })

      const response = await walletManager.fetch(request)
      expect(response.status).toBe(200)
    })

    it('should reject requests with invalid HMAC signature', async () => {
      const playerId = 'player1'
      const amount = 1000
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      
      const payload = JSON.stringify({
        playerId,
        amount,
        description: 'Test withdrawal',
        timestamp,
        nonce
      })
      
      // Create invalid signature
      const invalidSignature = 'invalid-signature-12345'

      const request = new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': invalidSignature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      })

      const response = await walletManager.fetch(request)
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Invalid signature')
    })

    it('should reject expired signatures', async () => {
      const playerId = 'player1'
      const amount = 1000
      const oldTimestamp = Date.now() - 6 * 60 * 1000 // 6 minutes ago
      const nonce = crypto.randomUUID()
      
      const payload = JSON.stringify({
        playerId,
        amount,
        description: 'Test withdrawal',
        timestamp: oldTimestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const request = new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': oldTimestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      })

      const response = await walletManager.fetch(request)
      const result = await response.json()

      expect(response.status).toBe(401)
      expect(result.success).toBe(false)
      expect(result.error).toContain('expired')
    })

    it('should reject reused nonces', async () => {
      const playerId = 'player1'
      const amount = 1000
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // First request
      const payload1 = JSON.stringify({
        playerId,
        amount: 100,
        description: 'Test deposit 1',
        timestamp,
        nonce
      })
      
      const signature1 = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload1)
        .digest('hex')

      const request1 = new Request('http://localhost/wallet/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature1,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload1
      })

      const response1 = await walletManager.fetch(request1)
      expect(response1.status).toBe(200)

      // Second request with same nonce
      const payload2 = JSON.stringify({
        playerId,
        amount: 200,
        description: 'Test deposit 2',
        timestamp: Date.now(),
        nonce // Same nonce
      })
      
      const signature2 = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload2)
        .digest('hex')

      const request2 = new Request('http://localhost/wallet/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature2,
          'X-Wallet-Timestamp': Date.now().toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload2
      })

      const response2 = await walletManager.fetch(request2)
      const result2 = await response2.json()

      expect(response2.status).toBe(401)
      expect(result2.success).toBe(false)
      expect(result2.error).toContain('Nonce already used')
    })
  })

  describe('Rate Limiting', () => {
    it('should enforce rate limits per player per endpoint', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // Make requests up to the limit
      const requests = []
      for (let i = 0; i < mockEnv.RATE_LIMIT_CONFIG.maxRequests; i++) {
        const request = new Request(`http://localhost/wallet?playerId=${playerId}`, {
          method: 'GET'
        })
        requests.push(walletManager.fetch(request))
      }

      const responses = await Promise.all(requests)
      responses.forEach(response => {
        expect(response.status).toBe(200)
      })

      // Next request should be rate limited
      const exceededRequest = new Request(`http://localhost/wallet?playerId=${playerId}`, {
        method: 'GET'
      })
      const exceededResponse = await walletManager.fetch(exceededRequest)
      const result = await exceededResponse.json()

      expect(exceededResponse.status).toBe(429)
      expect(result.error).toContain('Rate limit exceeded')
    })

    it('should have separate rate limits for different endpoints', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // Max out deposits
      for (let i = 0; i < mockEnv.RATE_LIMIT_CONFIG.maxDepositsPerWindow; i++) {
        const timestamp = Date.now()
        const nonce = crypto.randomUUID()
        const payload = JSON.stringify({
          playerId,
          amount: 100,
          description: `Deposit ${i}`,
          timestamp,
          nonce
        })
        
        const signature = crypto
          .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
          .update(payload)
          .digest('hex')

        await walletManager.fetch(new Request('http://localhost/wallet/deposit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature,
            'X-Wallet-Timestamp': timestamp.toString(),
            'X-Wallet-Nonce': nonce
          },
          body: payload
        }))
      }

      // Withdrawals should still work
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const withdrawPayload = JSON.stringify({
        playerId,
        amount: 50,
        description: 'Test withdrawal',
        timestamp,
        nonce
      })
      
      const withdrawSignature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(withdrawPayload)
        .digest('hex')

      const withdrawResponse = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': withdrawSignature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: withdrawPayload
      }))

      expect(withdrawResponse.status).toBe(200)
    })

    it('should reset rate limits after time window', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // Max out rate limit
      for (let i = 0; i < mockEnv.RATE_LIMIT_CONFIG.maxRequests; i++) {
        await walletManager.fetch(new Request(`http://localhost/wallet?playerId=${playerId}`, {
          method: 'GET'
        }))
      }

      // Should be rate limited
      const limitedResponse = await walletManager.fetch(
        new Request(`http://localhost/wallet?playerId=${playerId}`, { method: 'GET' })
      )
      expect(limitedResponse.status).toBe(429)

      // Mock time passing
      jest.advanceTimersByTime(mockEnv.RATE_LIMIT_CONFIG.windowMs + 1000)

      // Should work again
      const resetResponse = await walletManager.fetch(
        new Request(`http://localhost/wallet?playerId=${playerId}`, { method: 'GET' })
      )
      expect(resetResponse.status).toBe(200)
    })
  })

  describe('Fraud Detection Rules Engine', () => {
    it('should flag unusual transaction amounts', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // Large withdrawal attempt
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const payload = JSON.stringify({
        playerId,
        amount: mockEnv.FRAUD_DETECTION_CONFIG.unusualAmountThreshold + 1000,
        description: 'Large withdrawal',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const response = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      }))

      const result = await response.json()
      
      expect(response.status).toBe(403)
      expect(result.error).toContain('requires review')
      expect(result.fraudReason).toContain('unusual amount')
    })

    it('should detect rapid transaction patterns', async () => {
      const playerId = 'player1'
      
      // Initialize wallet with large balance
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialBalance: 50000 })
      }))

      // Make rapid transactions
      const transactions = []
      for (let i = 0; i < mockEnv.FRAUD_DETECTION_CONFIG.rapidTransactionCount + 1; i++) {
        const timestamp = Date.now()
        const nonce = crypto.randomUUID()
        const payload = JSON.stringify({
          playerId,
          amount: 100,
          description: `Rapid transaction ${i}`,
          timestamp,
          nonce
        })
        
        const signature = crypto
          .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
          .update(payload)
          .digest('hex')

        const response = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature,
            'X-Wallet-Timestamp': timestamp.toString(),
            'X-Wallet-Nonce': nonce
          },
          body: payload
        }))
        
        transactions.push(response)
      }

      // Last transaction should be flagged
      const lastResponse = transactions[transactions.length - 1]
      const lastResult = await lastResponse.json()
      
      expect(lastResponse.status).toBe(403)
      expect(lastResult.error).toContain('requires review')
      expect(lastResult.fraudReason).toContain('rapid transactions')
    })

    it('should detect multiple failed attempts', async () => {
      const playerId = 'player1'
      
      // Initialize wallet with low balance
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialBalance: 100 })
      }))

      // Make multiple failed withdrawal attempts
      for (let i = 0; i < mockEnv.FRAUD_DETECTION_CONFIG.suspiciousPatterns.multipleFailedAttempts; i++) {
        const timestamp = Date.now()
        const nonce = crypto.randomUUID()
        const payload = JSON.stringify({
          playerId,
          amount: 1000, // More than balance
          description: `Failed attempt ${i}`,
          timestamp,
          nonce
        })
        
        const signature = crypto
          .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
          .update(payload)
          .digest('hex')

        await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature,
            'X-Wallet-Timestamp': timestamp.toString(),
            'X-Wallet-Nonce': nonce
          },
          body: payload
        }))
      }

      // Next valid attempt should be blocked
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const payload = JSON.stringify({
        playerId,
        amount: 50,
        description: 'Valid withdrawal',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const response = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      }))

      const result = await response.json()
      
      expect(response.status).toBe(403)
      expect(result.error).toContain('temporarily blocked')
      expect(result.fraudReason).toContain('multiple failed attempts')
    })

    it('should check for geographic anomalies', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // First transaction from one location
      const timestamp1 = Date.now()
      const nonce1 = crypto.randomUUID()
      const payload1 = JSON.stringify({
        playerId,
        amount: 100,
        description: 'Deposit from US',
        timestamp: timestamp1,
        nonce: nonce1
      })
      
      const signature1 = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload1)
        .digest('hex')

      await walletManager.fetch(new Request('http://localhost/wallet/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature1,
          'X-Wallet-Timestamp': timestamp1.toString(),
          'X-Wallet-Nonce': nonce1,
          'CF-IPCountry': 'US'
        },
        body: payload1
      }))

      // Immediate transaction from different country
      const timestamp2 = Date.now()
      const nonce2 = crypto.randomUUID()
      const payload2 = JSON.stringify({
        playerId,
        amount: 50,
        description: 'Withdrawal from China',
        timestamp: timestamp2,
        nonce: nonce2
      })
      
      const signature2 = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload2)
        .digest('hex')

      const response = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature2,
          'X-Wallet-Timestamp': timestamp2.toString(),
          'X-Wallet-Nonce': nonce2,
          'CF-IPCountry': 'CN'
        },
        body: payload2
      }))

      const result = await response.json()
      
      expect(response.status).toBe(403)
      expect(result.error).toContain('requires review')
      expect(result.fraudReason).toContain('geographic anomaly')
    })
  })

  describe('Transaction Approval Workflow', () => {
    it('should require approval for large transactions', async () => {
      const playerId = 'player1'
      
      // Initialize wallet with large balance
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialBalance: 20000 })
      }))

      // Large withdrawal
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const payload = JSON.stringify({
        playerId,
        amount: mockEnv.TRANSACTION_APPROVAL_CONFIG.largeAmountThreshold + 1000,
        description: 'Large withdrawal',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const response = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      }))

      const result = await response.json()
      
      expect(response.status).toBe(202) // Accepted but pending
      expect(result.status).toBe('pending_approval')
      expect(result.approvalId).toBeDefined()
      expect(result.message).toContain('requires approval')
    })

    it('should process approved transactions', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialBalance: 20000 })
      }))

      // Create pending transaction
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const payload = JSON.stringify({
        playerId,
        amount: mockEnv.TRANSACTION_APPROVAL_CONFIG.largeAmountThreshold + 1000,
        description: 'Large withdrawal',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const pendingResponse = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      }))

      const pendingResult = await pendingResponse.json()
      const approvalId = pendingResult.approvalId

      // Approve the transaction
      const approvalResponse = await walletManager.fetch(new Request('http://localhost/wallet/approve-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': 'admin-secret-token'
        },
        body: JSON.stringify({
          approvalId,
          approved: true,
          adminId: 'admin1',
          reason: 'Verified identity'
        })
      }))

      const approvalResult = await approvalResponse.json()
      
      expect(approvalResponse.status).toBe(200)
      expect(approvalResult.success).toBe(true)
      expect(approvalResult.transaction).toBeDefined()
      expect(approvalResult.transaction.status).toBe('completed')
    })

    it('should handle rejected transactions', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialBalance: 20000 })
      }))

      // Create pending transaction
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const payload = JSON.stringify({
        playerId,
        amount: mockEnv.TRANSACTION_APPROVAL_CONFIG.largeAmountThreshold + 1000,
        description: 'Large withdrawal',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const pendingResponse = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      }))

      const pendingResult = await pendingResponse.json()
      const approvalId = pendingResult.approvalId

      // Reject the transaction
      const rejectResponse = await walletManager.fetch(new Request('http://localhost/wallet/approve-transaction', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Token': 'admin-secret-token'
        },
        body: JSON.stringify({
          approvalId,
          approved: false,
          adminId: 'admin1',
          reason: 'Suspicious activity detected'
        })
      }))

      const rejectResult = await rejectResponse.json()
      
      expect(rejectResponse.status).toBe(200)
      expect(rejectResult.success).toBe(true)
      expect(rejectResult.transaction).toBeDefined()
      expect(rejectResult.transaction.status).toBe('rejected')
      expect(rejectResult.transaction.rejectionReason).toBe('Suspicious activity detected')
    })

    it('should auto-expire pending approvals', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialBalance: 20000 })
      }))

      // Create pending transaction
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const payload = JSON.stringify({
        playerId,
        amount: mockEnv.TRANSACTION_APPROVAL_CONFIG.largeAmountThreshold + 1000,
        description: 'Large withdrawal',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      const pendingResponse = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce
        },
        body: payload
      }))

      const pendingResult = await pendingResponse.json()
      const approvalId = pendingResult.approvalId

      // Advance time past expiration
      jest.advanceTimersByTime(mockEnv.TRANSACTION_APPROVAL_CONFIG.approvalTimeoutMs + 1000)

      // Check status
      const statusResponse = await walletManager.fetch(
        new Request(`http://localhost/wallet/approval-status?approvalId=${approvalId}`, {
          method: 'GET'
        })
      )

      const statusResult = await statusResponse.json()
      
      expect(statusResponse.status).toBe(200)
      expect(statusResult.status).toBe('expired')
      expect(statusResult.message).toContain('expired')
    })
  })

  describe('Audit Logging', () => {
    it('should log all wallet transactions', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // Make a deposit
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const payload = JSON.stringify({
        playerId,
        amount: 500,
        description: 'Test deposit',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      await walletManager.fetch(new Request('http://localhost/wallet/deposit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce,
          'CF-Connecting-IP': '192.168.1.1',
          'User-Agent': 'Mozilla/5.0'
        },
        body: payload
      }))

      // Get audit logs
      const auditResponse = await walletManager.fetch(
        new Request(`http://localhost/wallet/audit-logs?playerId=${playerId}`, {
          method: 'GET',
          headers: {
            'X-Admin-Token': 'admin-secret-token'
          }
        })
      )

      const auditResult = await auditResponse.json()
      
      expect(auditResponse.status).toBe(200)
      expect(auditResult.logs).toHaveLength(2) // Initialize + deposit
      
      const depositLog = auditResult.logs.find((log: any) => log.action === 'deposit')
      expect(depositLog).toBeDefined()
      expect(depositLog.playerId).toBe(playerId)
      expect(depositLog.amount).toBe(500)
      expect(depositLog.ipAddress).toBe('192.168.1.1')
      expect(depositLog.userAgent).toContain('Mozilla')
      expect(depositLog.timestamp).toBeDefined()
    })

    it('should log failed transaction attempts', async () => {
      const playerId = 'player1'
      
      // Try withdrawal without wallet
      const timestamp = Date.now()
      const nonce = crypto.randomUUID()
      const payload = JSON.stringify({
        playerId,
        amount: 1000,
        description: 'Failed withdrawal',
        timestamp,
        nonce
      })
      
      const signature = crypto
        .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
        .update(payload)
        .digest('hex')

      await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': signature,
          'X-Wallet-Timestamp': timestamp.toString(),
          'X-Wallet-Nonce': nonce,
          'CF-Connecting-IP': '192.168.1.1'
        },
        body: payload
      }))

      // Get audit logs
      const auditResponse = await walletManager.fetch(
        new Request(`http://localhost/wallet/audit-logs?playerId=${playerId}`, {
          method: 'GET',
          headers: {
            'X-Admin-Token': 'admin-secret-token'
          }
        })
      )

      const auditResult = await auditResponse.json()
      
      expect(auditResponse.status).toBe(200)
      expect(auditResult.logs.length).toBeGreaterThan(0)
      
      const failedLog = auditResult.logs.find((log: any) => log.action === 'withdraw_failed')
      expect(failedLog).toBeDefined()
      expect(failedLog.error).toContain('Wallet not found')
      expect(failedLog.ipAddress).toBe('192.168.1.1')
    })

    it('should log security events', async () => {
      const playerId = 'player1'
      
      // Invalid signature attempt
      const request = new Request('http://localhost/wallet/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Wallet-Signature': 'invalid-signature',
          'X-Wallet-Timestamp': Date.now().toString(),
          'X-Wallet-Nonce': crypto.randomUUID(),
          'CF-Connecting-IP': '192.168.1.1'
        },
        body: JSON.stringify({
          playerId,
          amount: 1000,
          description: 'Unauthorized attempt'
        })
      })

      await walletManager.fetch(request)

      // Get security logs
      const securityResponse = await walletManager.fetch(
        new Request('http://localhost/wallet/security-logs', {
          method: 'GET',
          headers: {
            'X-Admin-Token': 'admin-secret-token'
          }
        })
      )

      const securityResult = await securityResponse.json()
      
      expect(securityResponse.status).toBe(200)
      expect(securityResult.logs.length).toBeGreaterThan(0)
      
      const securityLog = securityResult.logs.find((log: any) => 
        log.event === 'invalid_signature'
      )
      expect(securityLog).toBeDefined()
      expect(securityLog.ipAddress).toBe('192.168.1.1')
      expect(securityLog.severity).toBe('high')
    })

    it('should support audit log queries', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // Make multiple transactions
      for (let i = 0; i < 5; i++) {
        const timestamp = Date.now()
        const nonce = crypto.randomUUID()
        const payload = JSON.stringify({
          playerId,
          amount: 100 * (i + 1),
          description: `Deposit ${i}`,
          timestamp,
          nonce
        })
        
        const signature = crypto
          .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
          .update(payload)
          .digest('hex')

        await walletManager.fetch(new Request('http://localhost/wallet/deposit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature,
            'X-Wallet-Timestamp': timestamp.toString(),
            'X-Wallet-Nonce': nonce
          },
          body: payload
        }))
      }

      // Query audit logs with filters
      const startDate = Date.now() - 3600000 // 1 hour ago
      const endDate = Date.now()
      
      const auditResponse = await walletManager.fetch(
        new Request(`http://localhost/wallet/audit-logs?` + 
          `playerId=${playerId}&` +
          `action=deposit&` +
          `startDate=${startDate}&` +
          `endDate=${endDate}&` +
          `limit=3`, {
          method: 'GET',
          headers: {
            'X-Admin-Token': 'admin-secret-token'
          }
        })
      )

      const auditResult = await auditResponse.json()
      
      expect(auditResponse.status).toBe(200)
      expect(auditResult.logs).toHaveLength(3) // Limited to 3
      expect(auditResult.totalCount).toBe(5) // Total deposits
      expect(auditResult.logs.every((log: any) => log.action === 'deposit')).toBe(true)
    })
  })

  describe('Admin Tools', () => {
    it('should allow admins to view pending transactions', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialBalance: 20000 })
      }))

      // Create pending transactions
      for (let i = 0; i < 3; i++) {
        const timestamp = Date.now()
        const nonce = crypto.randomUUID()
        const payload = JSON.stringify({
          playerId,
          amount: mockEnv.TRANSACTION_APPROVAL_CONFIG.largeAmountThreshold + (1000 * i),
          description: `Large withdrawal ${i}`,
          timestamp,
          nonce
        })
        
        const signature = crypto
          .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
          .update(payload)
          .digest('hex')

        await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature,
            'X-Wallet-Timestamp': timestamp.toString(),
            'X-Wallet-Nonce': nonce
          },
          body: payload
        }))
      }

      // Get pending transactions
      const pendingResponse = await walletManager.fetch(
        new Request('http://localhost/wallet/admin/pending-transactions', {
          method: 'GET',
          headers: {
            'X-Admin-Token': 'admin-secret-token'
          }
        })
      )

      const pendingResult = await pendingResponse.json()
      
      expect(pendingResponse.status).toBe(200)
      expect(pendingResult.transactions).toHaveLength(3)
      expect(pendingResult.transactions[0].status).toBe('pending_approval')
      expect(pendingResult.transactions[0].amount).toBeGreaterThan(
        mockEnv.TRANSACTION_APPROVAL_CONFIG.largeAmountThreshold
      )
    })

    it('should provide player risk scores', async () => {
      const playerId = 'player1'
      
      // Initialize wallet
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId })
      }))

      // Create suspicious activity
      // Multiple failed attempts
      for (let i = 0; i < 3; i++) {
        const timestamp = Date.now()
        const nonce = crypto.randomUUID()
        const payload = JSON.stringify({
          playerId,
          amount: 100000, // Way over balance
          description: `Failed attempt ${i}`,
          timestamp,
          nonce
        })
        
        const signature = crypto
          .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
          .update(payload)
          .digest('hex')

        await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature,
            'X-Wallet-Timestamp': timestamp.toString(),
            'X-Wallet-Nonce': nonce
          },
          body: payload
        }))
      }

      // Get risk score
      const riskResponse = await walletManager.fetch(
        new Request(`http://localhost/wallet/admin/risk-score?playerId=${playerId}`, {
          method: 'GET',
          headers: {
            'X-Admin-Token': 'admin-secret-token'
          }
        })
      )

      const riskResult = await riskResponse.json()
      
      expect(riskResponse.status).toBe(200)
      expect(riskResult.playerId).toBe(playerId)
      expect(riskResult.riskScore).toBeGreaterThan(50) // High risk
      expect(riskResult.factors).toContain('multiple_failed_attempts')
      expect(riskResult.recommendation).toBeDefined()
    })

    it('should allow bulk approval/rejection', async () => {
      // Create multiple pending transactions
      const approvalIds: string[] = []
      
      for (let i = 0; i < 3; i++) {
        const playerId = `player${i}`
        
        // Initialize wallet
        await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId, initialBalance: 20000 })
        }))

        // Create pending transaction
        const timestamp = Date.now()
        const nonce = crypto.randomUUID()
        const payload = JSON.stringify({
          playerId,
          amount: mockEnv.TRANSACTION_APPROVAL_CONFIG.largeAmountThreshold + 1000,
          description: `Large withdrawal ${i}`,
          timestamp,
          nonce
        })
        
        const signature = crypto
          .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
          .update(payload)
          .digest('hex')

        const response = await walletManager.fetch(new Request('http://localhost/wallet/withdraw', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature,
            'X-Wallet-Timestamp': timestamp.toString(),
            'X-Wallet-Nonce': nonce
          },
          body: payload
        }))

        const result = await response.json()
        approvalIds.push(result.approvalId)
      }

      // Bulk approve
      const bulkResponse = await walletManager.fetch(
        new Request('http://localhost/wallet/admin/bulk-approve', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': 'admin-secret-token'
          },
          body: JSON.stringify({
            approvalIds: approvalIds.slice(0, 2), // Approve first 2
            approved: true,
            adminId: 'admin1',
            reason: 'Verified batch'
          })
        })
      )

      const bulkResult = await bulkResponse.json()
      
      expect(bulkResponse.status).toBe(200)
      expect(bulkResult.processed).toBe(2)
      expect(bulkResult.success).toBe(2)
      expect(bulkResult.failed).toBe(0)
    })

    it('should provide transaction analytics', async () => {
      // Create transaction history
      const playerId = 'player1'
      
      await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, initialBalance: 10000 })
      }))

      // Various transactions
      const transactionTypes = [
        { type: 'deposit', amount: 1000 },
        { type: 'deposit', amount: 2000 },
        { type: 'withdraw', amount: 500 },
        { type: 'deposit', amount: 1500 },
        { type: 'withdraw', amount: 1000 }
      ]

      for (const tx of transactionTypes) {
        const timestamp = Date.now()
        const nonce = crypto.randomUUID()
        const payload = JSON.stringify({
          playerId,
          amount: tx.amount,
          description: `${tx.type} transaction`,
          timestamp,
          nonce
        })
        
        const signature = crypto
          .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
          .update(payload)
          .digest('hex')

        await walletManager.fetch(new Request(`http://localhost/wallet/${tx.type}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Wallet-Signature': signature,
            'X-Wallet-Timestamp': timestamp.toString(),
            'X-Wallet-Nonce': nonce
          },
          body: payload
        }))
      }

      // Get analytics
      const analyticsResponse = await walletManager.fetch(
        new Request('http://localhost/wallet/admin/analytics', {
          method: 'GET',
          headers: {
            'X-Admin-Token': 'admin-secret-token'
          }
        })
      )

      const analyticsResult = await analyticsResponse.json()
      
      expect(analyticsResponse.status).toBe(200)
      expect(analyticsResult.totalTransactions).toBe(6) // 1 init + 5 transactions
      expect(analyticsResult.transactionsByType.deposit).toBe(4) // 1 init + 3 deposits
      expect(analyticsResult.transactionsByType.withdraw).toBe(2)
      expect(analyticsResult.volumeByType.deposit).toBe(14500) // 10000 + 1000 + 2000 + 1500
      expect(analyticsResult.volumeByType.withdraw).toBe(1500) // 500 + 1000
      expect(analyticsResult.activeUsers).toBe(1)
    })

    it('should allow transaction search', async () => {
      // Create transactions with different attributes
      const players = ['player1', 'player2', 'player3']
      
      for (const playerId of players) {
        await walletManager.fetch(new Request('http://localhost/wallet/initialize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId })
        }))

        // Various transactions
        for (let i = 0; i < 3; i++) {
          const timestamp = Date.now()
          const nonce = crypto.randomUUID()
          const payload = JSON.stringify({
            playerId,
            amount: 100 * (i + 1),
            description: `Transaction ${i} for ${playerId}`,
            timestamp,
            nonce
          })
          
          const signature = crypto
            .createHmac('sha256', mockEnv.WALLET_HMAC_SECRET)
            .update(payload)
            .digest('hex')

          await walletManager.fetch(new Request('http://localhost/wallet/deposit', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Wallet-Signature': signature,
              'X-Wallet-Timestamp': timestamp.toString(),
              'X-Wallet-Nonce': nonce
            },
            body: payload
          }))
        }
      }

      // Search transactions
      const searchResponse = await walletManager.fetch(
        new Request('http://localhost/wallet/admin/search-transactions?' +
          'query=player2&' +
          'minAmount=150&' +
          'type=deposit', {
          method: 'GET',
          headers: {
            'X-Admin-Token': 'admin-secret-token'
          }
        })
      )

      const searchResult = await searchResponse.json()
      
      expect(searchResponse.status).toBe(200)
      expect(searchResult.transactions).toBeDefined()
      expect(searchResult.transactions.every((tx: any) => 
        tx.playerId === 'player2' && 
        tx.amount >= 150 &&
        tx.type === 'deposit'
      )).toBe(true)
    })
  })
})