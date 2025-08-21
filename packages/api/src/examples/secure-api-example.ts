/**
 * Example of how to integrate the security middleware with Primo Poker API
 */

import { createSecureAPIHandler, authSchemas, walletSchemas } from '@primo-poker/security-middleware';
import { Logger } from '@primo-poker/logging';
import type { KVNamespace, R2Bucket } from '@cloudflare/workers-types';

interface Env {
  RATE_LIMIT_KV: KVNamespace;
  AUDIT_KV: KVNamespace;
  AUDIT_R2: R2Bucket;
  API_SECRET: string;
  CSRF_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const logger = new Logger({ level: 'info' });

    // Create secure API handler with all security features
    const handler = createSecureAPIHandler(
      {
        // Validation schemas for endpoints
        validation: {
          schemas: {
            '/api/auth/register': authSchemas.register,
            '/api/auth/login': authSchemas.login,
            '/api/wallet/deposit': walletSchemas.deposit,
            '/api/wallet/withdraw': walletSchemas.withdraw,
            '/api/wallet/transfer': walletSchemas.transfer,
          },
          onError: (error) => {
            return new Response(
              JSON.stringify({ 
                error: 'Validation failed', 
                details: error.message 
              }),
              { 
                status: 400,
                headers: { 'Content-Type': 'application/json' }
              }
            );
          },
        },

        // Rate limiting configuration
        rateLimit: {
          storage: env.RATE_LIMIT_KV,
          limits: {
            '/api/auth': { capacity: 5, refillRate: 5 }, // 5 req/min for auth
            '/api/wallet': { capacity: 30, refillRate: 30 }, // 30 req/min for wallet
            '/api': { capacity: 60, refillRate: 60 }, // 60 req/min default
          },
        },

        // Audit logging
        audit: {
          logger,
          storage: {
            kv: env.AUDIT_KV,
            r2: env.AUDIT_R2,
          },
        },

        // CSRF protection
        csrf: {
          secret: env.CSRF_SECRET,
          skipRoutes: ['/api/health', '/api/auth/login', '/api/auth/register'],
        },

        // Request signing for sensitive operations
        signing: {
          secret: env.API_SECRET,
          routes: ['/api/wallet/withdraw', '/api/admin'],
        },

        // Security headers
        headers: {
          preset: 'api',
          custom: {
            'X-API-Version': '1.0',
          },
        },
      },
      {
        // Define your API routes
        '/api/health': async () => {
          return new Response(JSON.stringify({ status: 'ok' }), {
            headers: { 'Content-Type': 'application/json' },
          });
        },

        '/api/auth/register': async (req) => {
          const body = await req.json();
          // Body is already validated by the middleware
          
          // Your registration logic here
          return new Response(JSON.stringify({ 
            success: true,
            userId: crypto.randomUUID(),
          }), {
            headers: { 'Content-Type': 'application/json' },
          });
        },

        '/api/wallet/withdraw': async (req) => {
          const body = await req.json();
          // Body is validated and request signature is verified
          
          // Your withdrawal logic here
          return new Response(JSON.stringify({ 
            success: true,
            transactionId: crypto.randomUUID(),
          }), {
            headers: { 'Content-Type': 'application/json' },
          });
        },

        // Add more routes as needed
      }
    );

    return handler(request);
  },
};

// Example of using individual security components

import { 
  TokenBucketRateLimiter,
  AuditLogger,
  CSRFProtection,
  SecurityHeaders,
  SecurityHeaderPresets,
  RequestSigner,
  APIKeyManager,
  SecurityMonitoringDashboard,
  createSecurityDashboardRoutes,
} from '@primo-poker/security-middleware';

export async function individualComponentsExample(request: Request, env: Env): Promise<Response> {
  const logger = new Logger({ level: 'info' });

  // 1. Rate Limiting
  const rateLimiter = new TokenBucketRateLimiter({
    capacity: 100,
    refillRate: 100,
    storage: env.RATE_LIMIT_KV,
  });

  const rateLimitResult = await rateLimiter.consume(
    request.headers.get('CF-Connecting-IP') || 'unknown'
  );

  if (!rateLimitResult.allowed) {
    return new Response('Too Many Requests', { 
      status: 429,
      headers: {
        'Retry-After': String(rateLimitResult.resetAt - Math.floor(Date.now() / 1000)),
      },
    });
  }

  // 2. Audit Logging
  const auditLogger = new AuditLogger({
    storage: {
      kv: env.AUDIT_KV,
      r2: env.AUDIT_R2,
    },
    logger,
  });

  await auditLogger.log({
    eventType: 'api_request',
    userId: request.headers.get('X-User-ID') || undefined,
    ipAddress: request.headers.get('CF-Connecting-IP') || undefined,
    resource: new URL(request.url).pathname,
    action: request.method,
    result: 'success',
    severity: 'info',
  });

  // 3. CSRF Protection
  const csrf = new CSRFProtection({
    secret: env.CSRF_SECRET,
  });

  if (request.method === 'POST') {
    const csrfMiddleware = csrf.middleware.bind(csrf);
    const csrfResponse = await csrfMiddleware(request, async () => new Response('OK'));
    if (csrfResponse.status === 403) {
      return csrfResponse;
    }
  }

  // 4. Security Headers
  const headers = SecurityHeaderPresets.api();
  const response = new Response(JSON.stringify({ message: 'Secure response' }), {
    headers: { 'Content-Type': 'application/json' },
  });
  
  return headers.apply(response, request);
}

// Example of security monitoring dashboard
export async function securityDashboardExample(request: Request, env: Env): Promise<Response> {
  const logger = new Logger({ level: 'info' });
  
  const auditLogger = new AuditLogger({
    storage: {
      kv: env.AUDIT_KV,
      r2: env.AUDIT_R2,
    },
    logger,
  });

  const dashboard = new SecurityMonitoringDashboard(
    auditLogger,
    env.AUDIT_KV,
    {
      alertThresholds: {
        failedLoginsPerMinute: 10,
        rateLimitViolationsPerMinute: 50,
        suspiciousPatternCount: 5,
      },
      retentionDays: 30,
    }
  );

  // Create dashboard routes
  const dashboardRoutes = createSecurityDashboardRoutes(
    dashboard,
    async (req) => {
      // Check if user is admin
      const authHeader = req.headers.get('Authorization');
      return authHeader === `Bearer ${env.API_SECRET}`;
    }
  );

  const url = new URL(request.url);
  const handler = dashboardRoutes[url.pathname as keyof typeof dashboardRoutes];
  
  if (handler) {
    return handler(request);
  }

  return new Response('Not Found', { status: 404 });
}

// Example of API key authentication
export async function apiKeyExample(request: Request, env: Env): Promise<Response> {
  const logger = new Logger({ level: 'info' });
  
  const auditLogger = new AuditLogger({
    storage: {
      kv: env.AUDIT_KV,
      r2: env.AUDIT_R2,
    },
    logger,
  });

  const apiKeyManager = new APIKeyManager(env.RATE_LIMIT_KV, auditLogger);

  // Extract API key from header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer pk_')) {
    return new Response('Unauthorized', { status: 401 });
  }

  const apiKey = authHeader.substring(7); // Remove 'Bearer '
  const validation = await apiKeyManager.validateAPIKey(apiKey);

  if (!validation.valid) {
    return new Response('Invalid API Key', { status: 401 });
  }

  // Check permissions
  const requiredPermission = 'read:data';
  if (!validation.permissions?.includes(requiredPermission)) {
    return new Response('Insufficient Permissions', { status: 403 });
  }

  // Process the request
  return new Response(JSON.stringify({
    message: 'Authenticated successfully',
    userId: validation.ownerId,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}