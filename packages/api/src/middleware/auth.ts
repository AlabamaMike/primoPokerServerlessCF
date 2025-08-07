import { Context, Next } from 'hono'
import { AuthenticationManager } from '@primo-poker/security'

export interface AuthUser {
  playerId: string
  username: string
  email: string
  roles?: string[]
}

export const authenticateUser = async (c: Context, next: Next) => {
  try {
    const authHeader = c.req.header('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'No token provided' }, 401)
    }

    const token = authHeader.substring(7)
    const jwtSecret = c.env?.JWT_SECRET
    
    if (!jwtSecret) {
      console.error('JWT_SECRET not configured')
      return c.json({ error: 'Server configuration error' }, 500)
    }

    const authManager = new AuthenticationManager(jwtSecret)
    const payload = await authManager.verifyToken(token)

    if (!payload) {
      return c.json({ error: 'Invalid token' }, 401)
    }

    // Set user in context
    const user: AuthUser = {
      playerId: payload.playerId,
      username: payload.username,
      email: payload.email,
      roles: payload.roles || []
    }
    
    c.set('user', user)
    await next()
  } catch (error) {
    console.error('Authentication error:', error)
    return c.json({ error: 'Authentication failed' }, 401)
  }
}