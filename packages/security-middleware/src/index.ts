// Export validation schemas
export * from './validation/schemas';

// Export rate limiting
export * from './rate-limiting/token-bucket';

// Export audit logging
export * from './audit/logger';

// Export CSRF protection
export * from './csrf/protection';

// Export request signing
export * from './signing/request-signer';

// Export security headers
export * from './headers/security-headers';

// Export monitoring dashboard
export * from './monitoring/dashboard';

// Convenience middleware composer
export interface SecurityMiddlewareConfig {
  validation?: {
    schemas: Record<string, import('zod').ZodSchema>;
    onError?: (error: Error) => Response;
  };
  rateLimit?: {
    storage: KVNamespace | DurableObjectStorage;
    limits?: Record<string, { capacity: number; refillRate: number }>;
  };
  audit?: {
    logger: import('@primo-poker/logging').Logger;
    storage: {
      kv: KVNamespace;
      r2?: R2Bucket;
    };
  };
  csrf?: {
    secret: string;
    skipRoutes?: string[];
  };
  signing?: {
    secret: string;
    routes?: string[];
  };
  headers?: {
    preset?: 'api' | 'websocket' | 'static' | 'admin';
    custom?: Record<string, unknown>;
  };
}

export function createSecurityMiddleware(config: SecurityMiddlewareConfig) {
  const middlewares: Array<(req: Request, next: () => Promise<Response>) => Promise<Response>> = [];

  // Add security headers
  if (config.headers) {
    const { SecurityHeaders, SecurityHeaderPresets } = await import('./headers/security-headers');
    const headers = config.headers.preset 
      ? SecurityHeaderPresets[config.headers.preset]()
      : new SecurityHeaders(config.headers.custom);
    middlewares.push(headers.middleware());
  }

  // Add rate limiting
  if (config.rateLimit) {
    const { createRateLimitMiddleware, RateLimiters } = await import('./rate-limiting/token-bucket');
    const rateLimiter = RateLimiters.api(config.rateLimit.storage);
    middlewares.push(createRateLimitMiddleware(rateLimiter));
  }

  // Add CSRF protection
  if (config.csrf) {
    const { CSRFProtection } = await import('./csrf/protection');
    const csrf = new CSRFProtection(config.csrf);
    middlewares.push(csrf.middleware.bind(csrf));
  }

  // Add request signing verification
  if (config.signing) {
    const { RequestSigner } = await import('./signing/request-signer');
    const signer = new RequestSigner(config.signing.secret);
    
    middlewares.push(async (request, next) => {
      const url = new URL(request.url);
      const requiresSigning = config.signing!.routes?.some(route => 
        url.pathname.startsWith(route)
      ) ?? false;

      if (requiresSigning) {
        const valid = await signer.verifyRequest(request);
        if (!valid) {
          return new Response('Invalid signature', { status: 403 });
        }
      }

      return next();
    });
  }

  // Compose middlewares
  return async (request: Request, handler: (req: Request) => Promise<Response>): Promise<Response> => {
    let index = 0;
    
    const next = async (): Promise<Response> => {
      if (index >= middlewares.length) {
        return handler(request);
      }
      
      const middleware = middlewares[index++];
      return middleware(request, next);
    };

    return next();
  };
}

// Helper to create a secure API handler
export function createSecureAPIHandler(
  config: SecurityMiddlewareConfig,
  routes: Record<string, (req: Request) => Promise<Response>>
) {
  const securityMiddleware = createSecurityMiddleware(config);

  return async (request: Request): Promise<Response> => {
    return securityMiddleware(request, async (req) => {
      const url = new URL(req.url);
      const handler = routes[url.pathname];

      if (!handler) {
        return new Response('Not Found', { status: 404 });
      }

      try {
        // Add validation if configured
        if (config.validation) {
          const schema = config.validation.schemas[url.pathname];
          if (schema && req.method !== 'GET') {
            const { validateRequest } = await import('./validation/schemas');
            try {
              const body = await req.json();
              validateRequest(schema, body);
              
              // Create new request with validated body
              req = new Request(req.url, {
                method: req.method,
                headers: req.headers,
                body: JSON.stringify(body),
              });
            } catch (error) {
              if (config.validation.onError) {
                return config.validation.onError(error as Error);
              }
              return new Response(
                JSON.stringify({ error: (error as Error).message }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        const response = await handler(req);

        // Log to audit if configured
        if (config.audit) {
          const { AuditLogger } = await import('./audit/logger');
          const auditLogger = new AuditLogger({
            storage: config.audit.storage,
            logger: config.audit.logger,
          });

          await auditLogger.log({
            eventType: 'api_request',
            userId: req.headers.get('X-User-ID') || undefined,
            ipAddress: req.headers.get('CF-Connecting-IP') || undefined,
            userAgent: req.headers.get('User-Agent') || undefined,
            resource: url.pathname,
            action: req.method,
            result: response.status >= 400 ? 'failure' : 'success',
            severity: response.status >= 500 ? 'error' : 'info',
            metadata: {
              status: response.status,
              duration: 0, // TODO: Add request timing
            },
          });
        }

        return response;
      } catch (error) {
        console.error('Handler error:', error);
        return new Response('Internal Server Error', { status: 500 });
      }
    });
  };
}