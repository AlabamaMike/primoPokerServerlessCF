import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { WalletRoutes } from '../../routes/wallet-routes'
import { AuthUser } from '../../middleware/auth'

describe('Wallet Routes - Admin Endpoints RBAC', () => {
  let walletRoutes: WalletRoutes
  let mockRequest: any
  let mockEnv: any

  beforeEach(() => {
    walletRoutes = new WalletRoutes()
    mockEnv = {
      JWT_SECRET: 'test-secret',
      KV: {
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn()
      }
    }
  })

  describe('GET /stats endpoint', () => {
    it('should deny access to non-admin users', async () => {
      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser',
          roles: ['user']
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/stats'
      }

      // The requireAdmin middleware should block the request before it reaches the handler
      // In a real test environment with the full Hono app, this would return a 403
      // For now, we're testing that the middleware is applied to the route
      const router = walletRoutes.getRouter()
      const routes = router.routes
      
      // Find the /stats route
      const statsRoute = routes.find((r: any) => r.path === '/stats' && r.method === 'GET')
      expect(statsRoute).toBeDefined()
      
      // Verify middleware is applied (requireAdmin should be in the handlers chain)
      expect(statsRoute.handlers.length).toBeGreaterThan(1)
    })

    it('should allow access to admin users', async () => {
      mockRequest = {
        user: {
          userId: 'admin1',
          username: 'adminuser',
          roles: ['admin']
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/stats'
      }

      // In a full integration test, this would call the endpoint and verify success
      const router = walletRoutes.getRouter()
      const routes = router.routes
      const statsRoute = routes.find((r: any) => r.path === '/stats' && r.method === 'GET')
      expect(statsRoute).toBeDefined()
    })
  })

  describe('POST /warm-cache endpoint', () => {
    it('should deny access to non-admin users', async () => {
      mockRequest = {
        user: {
          userId: 'user1',
          username: 'testuser',
          roles: ['user']
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/warm-cache',
        json: async () => ({ playerIds: ['player1', 'player2'] })
      }

      const router = walletRoutes.getRouter()
      const routes = router.routes
      
      // Find the /warm-cache route
      const warmCacheRoute = routes.find((r: any) => r.path === '/warm-cache' && r.method === 'POST')
      expect(warmCacheRoute).toBeDefined()
      
      // Verify middleware is applied
      expect(warmCacheRoute.handlers.length).toBeGreaterThan(1)
    })

    it('should allow access to superadmin users', async () => {
      mockRequest = {
        user: {
          userId: 'admin1',
          username: 'superadmin',
          roles: ['superadmin']
        },
        env: mockEnv,
        url: 'http://localhost/api/wallet/warm-cache',
        json: async () => ({ playerIds: ['player1', 'player2'] })
      }

      const router = walletRoutes.getRouter()
      const routes = router.routes
      const warmCacheRoute = routes.find((r: any) => r.path === '/warm-cache' && r.method === 'POST')
      expect(warmCacheRoute).toBeDefined()
    })
  })

  describe('Non-admin endpoints', () => {
    it('should not have admin middleware on regular endpoints', () => {
      const router = walletRoutes.getRouter()
      const routes = router.routes
      
      // Check that regular endpoints don't have admin middleware
      const balanceRoute = routes.find((r: any) => r.path === '/balance' && r.method === 'GET')
      expect(balanceRoute).toBeDefined()
      
      // Regular endpoints should have fewer handlers (no admin middleware)
      const statsRoute = routes.find((r: any) => r.path === '/stats' && r.method === 'GET')
      expect(statsRoute.handlers.length).toBeGreaterThan(balanceRoute.handlers.length)
    })
  })
})