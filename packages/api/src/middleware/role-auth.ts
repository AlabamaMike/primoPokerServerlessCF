import { Context, Next } from 'hono'
import { AuthUser } from './auth'

export const requireRole = (requiredRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get('user') as AuthUser | undefined
    
    if (!user) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    
    const userRoles = user.roles || []
    const hasRequiredRole = requiredRoles.some(role => userRoles.includes(role))
    
    if (!hasRequiredRole) {
      return c.json({ 
        error: 'Forbidden', 
        message: 'Insufficient permissions to access this resource' 
      }, 403)
    }
    
    await next()
  }
}

export const requireAdmin = requireRole(['admin', 'superadmin'])