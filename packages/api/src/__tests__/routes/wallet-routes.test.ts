import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { WalletRoutes } from '../../routes/wallet-routes'
import { AuthUser } from '../../middleware/auth'

describe('Wallet Routes - Admin Endpoints RBAC', () => {
  let walletRoutes: WalletRoutes
  let mockEnv: any

  beforeEach(() => {
    walletRoutes = new WalletRoutes()
    mockEnv = {
      JWT_SECRET: 'test-secret',
      DB: {
        prepare: jest.fn().mockReturnValue({
          bind: jest.fn().mockReturnThis(),
          first: jest.fn().mockResolvedValue(null),
          all: jest.fn().mockResolvedValue({ results: [] }),
          run: jest.fn().mockResolvedValue({ success: true })
        })
      },
      WALLET_DO: {
        idFromName: jest.fn().mockReturnValue('test-do-id'),
        get: jest.fn().mockReturnValue({
          fetch: jest.fn().mockResolvedValue(
            new Response(JSON.stringify({ balance: 1000 }), { status: 200 })
          )
        })
      }
    }
  })

  describe('GET /stats endpoint', () => {
    it('should deny access to non-admin users', async () => {
      const mockRequest = new Request('http://localhost/api/wallet/stats', {
        method: 'GET'
      })

      // Add user context with non-admin role
      Object.assign(mockRequest, {
        user: {
          userId: 'user1',
          username: 'testuser',
          roles: ['user']
        } as AuthUser,
        env: mockEnv
      })

      const router = walletRoutes.getRouter()
      const response = await router.handle(mockRequest)

      // Should return 403 Forbidden for non-admin
      expect(response.status).toBe(403)
    })

    it('should allow access to admin users', async () => {
      const mockRequest = new Request('http://localhost/api/wallet/stats', {
        method: 'GET'
      })

      // Add user context with admin role
      Object.assign(mockRequest, {
        user: {
          userId: 'admin1',
          username: 'adminuser',
          roles: ['admin']
        } as AuthUser,
        env: mockEnv
      })

      const router = walletRoutes.getRouter()
      const response = await router.handle(mockRequest)

      // Should return success for admin (even if stats are empty)
      expect(response.status).toBeLessThan(400)
    })
  })

  describe('POST /warm-cache endpoint', () => {
    it('should deny access to non-admin users', async () => {
      const mockRequest = new Request('http://localhost/api/wallet/warm-cache', {
        method: 'POST',
        body: JSON.stringify({ playerIds: ['player1', 'player2'] }),
        headers: { 'Content-Type': 'application/json' }
      })

      // Add user context with non-admin role
      Object.assign(mockRequest, {
        user: {
          userId: 'user1',
          username: 'testuser',
          roles: ['user']
        } as AuthUser,
        env: mockEnv
      })

      const router = walletRoutes.getRouter()
      const response = await router.handle(mockRequest)

      // Should return 403 Forbidden for non-admin
      expect(response.status).toBe(403)
    })

    it('should allow access to superadmin users', async () => {
      const mockRequest = new Request('http://localhost/api/wallet/warm-cache', {
        method: 'POST',
        body: JSON.stringify({ playerIds: ['player1', 'player2'] }),
        headers: { 'Content-Type': 'application/json' }
      })

      // Add user context with superadmin role
      Object.assign(mockRequest, {
        user: {
          userId: 'admin1',
          username: 'superadmin',
          roles: ['superadmin']
        } as AuthUser,
        env: mockEnv
      })

      const router = walletRoutes.getRouter()
      const response = await router.handle(mockRequest)

      // Should return success for superadmin
      expect(response.status).toBeLessThan(400)
    })
  })

  describe('Non-admin endpoints', () => {
    it('should allow regular users to access /balance endpoint', async () => {
      const mockRequest = new Request('http://localhost/api/wallet/balance', {
        method: 'GET'
      })

      // Add user context with regular user role
      Object.assign(mockRequest, {
        user: {
          userId: 'user1',
          username: 'testuser',
          roles: ['user']
        } as AuthUser,
        env: mockEnv
      })

      const router = walletRoutes.getRouter()
      const response = await router.handle(mockRequest)

      // Should allow regular users to check their own balance
      expect(response.status).toBeLessThan(400)
    })
  })
})
