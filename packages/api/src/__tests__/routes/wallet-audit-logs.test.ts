import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { WalletRoutes } from '../../routes/wallet-routes'
import { AuditLogger } from '../../services/audit-logger'

describe('Wallet Routes - Audit Log Security', () => {
  let walletRoutes: WalletRoutes
  let mockRequest: any
  let mockEnv: any
  let mockAuditLogger: jest.Mocked<AuditLogger>

  beforeEach(() => {
    walletRoutes = new WalletRoutes()
    
    mockAuditLogger = {
      queryByUser: jest.fn().mockResolvedValue({
        logs: [],
        totalCount: 0,
        hasMore: false
      })
    } as any

    mockEnv = {
      JWT_SECRET: 'test-secret',
      KV: {
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        list: jest.fn()
      }
    }

    // Mock the audit logger
    jest.spyOn(walletRoutes as any, 'auditLogger', 'get').mockReturnValue(mockAuditLogger)
  })

  describe('GET /audit endpoint', () => {
    it('should enforce 30-day default limit when no parameters provided', async () => {
      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser'
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/audit',
        headers: new Map()
      }

      const response = await walletRoutes['handleGetAuditLogs'](mockRequest)
      
      expect(mockAuditLogger.queryByUser).toHaveBeenCalledWith('user1', expect.objectContaining({
        limit: 100,
        page: 1,
        startDate: expect.any(Date),
        endDate: expect.any(Date)
      }))

      // Verify the date range is approximately 30 days
      const call = mockAuditLogger.queryByUser.mock.calls[0]
      const startDate = call[1].startDate
      const endDate = call[1].endDate
      const diffInDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffInDays).toBeCloseTo(30, 0)
    })

    it('should enforce maximum 90-day range', async () => {
      const startDate = new Date('2025-01-01')
      const endDate = new Date('2025-05-01') // 120 days later

      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser'
        },
        env: mockEnv,
        url: `http://localhost/api/wallet/audit?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
        headers: new Map()
      }

      const response = await walletRoutes['handleGetAuditLogs'](mockRequest)
      const responseData = await response.json()
      
      expect(response.status).toBe(400)
      expect(responseData.error.message).toContain('Date range cannot exceed 90 days')
    })

    it('should limit results to 100 records per page', async () => {
      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser'
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/audit?limit=200',
        headers: new Map()
      }

      await walletRoutes['handleGetAuditLogs'](mockRequest)
      
      // Should cap at 100 even if user requests more
      expect(mockAuditLogger.queryByUser).toHaveBeenCalledWith('user1', expect.objectContaining({
        limit: 100
      }))
    })

    it('should support pagination', async () => {
      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser'
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/audit?page=3&limit=50',
        headers: new Map()
      }

      await walletRoutes['handleGetAuditLogs'](mockRequest)
      
      expect(mockAuditLogger.queryByUser).toHaveBeenCalledWith('user1', expect.objectContaining({
        limit: 50,
        page: 3
      }))
    })

    it('should respect custom daysBack parameter up to 90 days', async () => {
      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser'
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/audit?daysBack=60',
        headers: new Map()
      }

      await walletRoutes['handleGetAuditLogs'](mockRequest)
      
      const call = mockAuditLogger.queryByUser.mock.calls[0]
      const startDate = call[1].startDate
      const endDate = call[1].endDate
      const diffInDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      expect(diffInDays).toBeCloseTo(60, 0)
    })

    it('should cap daysBack at 90 days maximum', async () => {
      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser'
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/audit?daysBack=120',
        headers: new Map()
      }

      const response = await walletRoutes['handleGetAuditLogs'](mockRequest)
      const responseData = await response.json()
      
      expect(response.status).toBe(400)
      // Validation should fail since max is 90
      expect(responseData.error).toBeDefined()
    })

    it('should require authentication', async () => {
      mockRequest = {
        user: undefined,
        env: mockEnv,
        url: 'http://localhost/api/wallet/audit',
        headers: new Map()
      }

      const response = await walletRoutes['handleGetAuditLogs'](mockRequest)
      const responseData = await response.json()
      
      expect(response.status).toBe(401)
      expect(responseData.error.message).toBe('User not authenticated')
    })

    it('should return pagination metadata in response', async () => {
      mockAuditLogger.queryByUser.mockResolvedValueOnce({
        logs: Array(50).fill({ timestamp: Date.now() }),
        totalCount: 250,
        hasMore: true
      })

      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser'
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/audit?page=2&limit=50',
        headers: new Map()
      }

      const response = await walletRoutes['handleGetAuditLogs'](mockRequest)
      const responseData = await response.json()
      
      expect(response.status).toBe(200)
      expect(responseData.data.pagination).toEqual({
        page: 2,
        limit: 50,
        totalCount: 250,
        totalPages: 5,
        hasMore: true
      })
    })

    it('should include date range in response', async () => {
      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser'
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/audit',
        headers: new Map()
      }

      const response = await walletRoutes['handleGetAuditLogs'](mockRequest)
      const responseData = await response.json()
      
      expect(response.status).toBe(200)
      expect(responseData.data.dateRange).toBeDefined()
      expect(responseData.data.dateRange.startDate).toBeDefined()
      expect(responseData.data.dateRange.endDate).toBeDefined()
    })
  })
})