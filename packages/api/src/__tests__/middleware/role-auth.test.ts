import { describe, it, expect, beforeEach, jest } from '@jest/globals'
import { Context } from 'hono'
import { requireRole, requireAdmin } from '../../middleware/role-auth'
import { AuthUser } from '../../middleware/auth'

describe('Role Authorization Middleware', () => {
  let mockContext: any
  let mockNext: jest.Mock

  beforeEach(() => {
    mockNext = jest.fn()
    mockContext = {
      get: jest.fn(),
      json: jest.fn()
    }
  })

  describe('requireRole', () => {
    it('should allow access when user has required role', async () => {
      const user: AuthUser = {
        playerId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['admin', 'user']
      }
      mockContext.get.mockReturnValue(user)

      const middleware = requireRole(['admin'])
      await middleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockContext.json).not.toHaveBeenCalled()
    })

    it('should allow access when user has any of the required roles', async () => {
      const user: AuthUser = {
        playerId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['moderator']
      }
      mockContext.get.mockReturnValue(user)

      const middleware = requireRole(['admin', 'moderator'])
      await middleware(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockContext.json).not.toHaveBeenCalled()
    })

    it('should deny access when user lacks required role', async () => {
      const user: AuthUser = {
        playerId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user']
      }
      mockContext.get.mockReturnValue(user)

      const middleware = requireRole(['admin'])
      const response = await middleware(mockContext as Context, mockNext)

      expect(mockNext).not.toHaveBeenCalled()
      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Forbidden',
          message: 'Insufficient permissions to access this resource'
        },
        403
      )
    })

    it('should deny access when user has no roles', async () => {
      const user: AuthUser = {
        playerId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        roles: undefined
      }
      mockContext.get.mockReturnValue(user)

      const middleware = requireRole(['admin'])
      await middleware(mockContext as Context, mockNext)

      expect(mockNext).not.toHaveBeenCalled()
      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Forbidden',
          message: 'Insufficient permissions to access this resource'
        },
        403
      )
    })

    it('should return 401 when user is not authenticated', async () => {
      mockContext.get.mockReturnValue(undefined)

      const middleware = requireRole(['admin'])
      await middleware(mockContext as Context, mockNext)

      expect(mockNext).not.toHaveBeenCalled()
      expect(mockContext.json).toHaveBeenCalledWith(
        { error: 'Unauthorized' },
        401
      )
    })
  })

  describe('requireAdmin', () => {
    it('should allow access for admin role', async () => {
      const user: AuthUser = {
        playerId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['admin']
      }
      mockContext.get.mockReturnValue(user)

      await requireAdmin(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockContext.json).not.toHaveBeenCalled()
    })

    it('should allow access for superadmin role', async () => {
      const user: AuthUser = {
        playerId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['superadmin']
      }
      mockContext.get.mockReturnValue(user)

      await requireAdmin(mockContext as Context, mockNext)

      expect(mockNext).toHaveBeenCalled()
      expect(mockContext.json).not.toHaveBeenCalled()
    })

    it('should deny access for non-admin users', async () => {
      const user: AuthUser = {
        playerId: 'user1',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['user', 'moderator']
      }
      mockContext.get.mockReturnValue(user)

      await requireAdmin(mockContext as Context, mockNext)

      expect(mockNext).not.toHaveBeenCalled()
      expect(mockContext.json).toHaveBeenCalledWith(
        {
          error: 'Forbidden',
          message: 'Insufficient permissions to access this resource'
        },
        403
      )
    })
  })
})