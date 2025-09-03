import { Context } from '@cloudflare/workers-types';

/**
 * Security Headers Middleware
 * Implements comprehensive security headers for Cloudflare Workers
 */

export interface SecurityHeadersConfig {
  // Content Security Policy
  contentSecurityPolicy?: string | ContentSecurityPolicyOptions;
  
  // Strict Transport Security
  strictTransportSecurity?: string | StrictTransportSecurityOptions;
  
  // Other security headers
  xContentTypeOptions?: 'nosniff' | false;
  xFrameOptions?: 'DENY' | 'SAMEORIGIN' | false;
  xXssProtection?: string | false;
  referrerPolicy?: ReferrerPolicyOptions | false;
  permissionsPolicy?: string | PermissionsPolicyOptions;
  
  // Cross-Origin headers
  crossOriginEmbedderPolicy?: 'require-corp' | 'credentialless' | false;
  crossOriginOpenerPolicy?: 'same-origin' | 'same-origin-allow-popups' | 'unsafe-none' | false;
  crossOriginResourcePolicy?: 'same-origin' | 'same-site' | 'cross-origin' | false;
  
  // Additional headers
  customHeaders?: Record<string, string>;
  
  // Options
  removeHeaders?: string[]; // Headers to remove from response
  skipPaths?: string[]; // Paths to skip header application
}

export interface ContentSecurityPolicyOptions {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  connectSrc?: string[];
  mediaSrc?: string[];
  objectSrc?: string[];
  frameSrc?: string[];
  workerSrc?: string[];
  childSrc?: string[];
  formAction?: string[];
  frameAncestors?: string[];
  baseUri?: string[];
  reportUri?: string;
  reportTo?: string;
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
}

export interface StrictTransportSecurityOptions {
  maxAge: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

export interface PermissionsPolicyOptions {
  accelerometer?: string[];
  camera?: string[];
  geolocation?: string[];
  gyroscope?: string[];
  magnetometer?: string[];
  microphone?: string[];
  payment?: string[];
  usb?: string[];
  [key: string]: string[] | undefined;
}

export type ReferrerPolicyOptions = 
  | 'no-referrer'
  | 'no-referrer-when-downgrade'
  | 'origin'
  | 'origin-when-cross-origin'
  | 'same-origin'
  | 'strict-origin'
  | 'strict-origin-when-cross-origin'
  | 'unsafe-url';

export class SecurityHeaders {
  private config: SecurityHeadersConfig;

  constructor(config: SecurityHeadersConfig = {}) {
    this.config = config;
  }

  /**
   * Apply security headers to response
   */
  applyHeaders(response: Response): Response {
    const newResponse = new Response(response.body, response);
    const headers = newResponse.headers;

    // Remove specified headers
    if (this.config.removeHeaders) {
      for (const header of this.config.removeHeaders) {
        headers.delete(header);
      }
    }

    // Content Security Policy
    if (this.config.contentSecurityPolicy !== false) {
      const csp = this.buildContentSecurityPolicy(this.config.contentSecurityPolicy);
      if (csp) {
        headers.set('Content-Security-Policy', csp);
      }
    }

    // Strict Transport Security
    if (this.config.strictTransportSecurity !== false) {
      const hsts = this.buildStrictTransportSecurity(this.config.strictTransportSecurity);
      if (hsts) {
        headers.set('Strict-Transport-Security', hsts);
      }
    }

    // X-Content-Type-Options
    if (this.config.xContentTypeOptions !== false) {
      headers.set('X-Content-Type-Options', this.config.xContentTypeOptions || 'nosniff');
    }

    // X-Frame-Options
    if (this.config.xFrameOptions !== false) {
      headers.set('X-Frame-Options', this.config.xFrameOptions || 'DENY');
    }

    // X-XSS-Protection (legacy, but still used)
    if (this.config.xXssProtection !== false) {
      headers.set('X-XSS-Protection', this.config.xXssProtection || '1; mode=block');
    }

    // Referrer-Policy
    if (this.config.referrerPolicy !== false) {
      headers.set('Referrer-Policy', this.config.referrerPolicy || 'strict-origin-when-cross-origin');
    }

    // Permissions-Policy
    if (this.config.permissionsPolicy) {
      const policy = this.buildPermissionsPolicy(this.config.permissionsPolicy);
      if (policy) {
        headers.set('Permissions-Policy', policy);
      }
    }

    // Cross-Origin headers
    if (this.config.crossOriginEmbedderPolicy !== false) {
      headers.set('Cross-Origin-Embedder-Policy', this.config.crossOriginEmbedderPolicy || 'require-corp');
    }

    if (this.config.crossOriginOpenerPolicy !== false) {
      headers.set('Cross-Origin-Opener-Policy', this.config.crossOriginOpenerPolicy || 'same-origin');
    }

    if (this.config.crossOriginResourcePolicy !== false) {
      headers.set('Cross-Origin-Resource-Policy', this.config.crossOriginResourcePolicy || 'same-origin');
    }

    // Custom headers
    if (this.config.customHeaders) {
      for (const [name, value] of Object.entries(this.config.customHeaders)) {
        headers.set(name, value);
      }
    }

    return newResponse;
  }

  /**
   * Create middleware
   */
  middleware() {
    return async (
      request: Request,
      ctx: Context,
      next: () => Promise<Response>
    ): Promise<Response> => {
      const url = new URL(request.url);
      
      // Skip for configured paths
      if (this.config.skipPaths?.some(path => url.pathname.startsWith(path))) {
        return next();
      }

      const response = await next();
      return this.applyHeaders(response);
    };
  }

  /**
   * Private helper methods
   */
  private buildContentSecurityPolicy(
    config?: string | ContentSecurityPolicyOptions
  ): string | null {
    if (!config) return null;
    if (typeof config === 'string') return config;

    const directives: string[] = [];

    // Build each directive
    const directiveMap: Record<keyof ContentSecurityPolicyOptions, string> = {
      defaultSrc: 'default-src',
      scriptSrc: 'script-src',
      styleSrc: 'style-src',
      imgSrc: 'img-src',
      fontSrc: 'font-src',
      connectSrc: 'connect-src',
      mediaSrc: 'media-src',
      objectSrc: 'object-src',
      frameSrc: 'frame-src',
      workerSrc: 'worker-src',
      childSrc: 'child-src',
      formAction: 'form-action',
      frameAncestors: 'frame-ancestors',
      baseUri: 'base-uri',
      reportUri: 'report-uri',
      reportTo: 'report-to',
      upgradeInsecureRequests: 'upgrade-insecure-requests',
      blockAllMixedContent: 'block-all-mixed-content'
    };

    for (const [key, directive] of Object.entries(directiveMap)) {
      const value = config[key as keyof ContentSecurityPolicyOptions];
      
      if (value === undefined) continue;

      if (typeof value === 'boolean') {
        if (value) {
          directives.push(directive);
        }
      } else if (Array.isArray(value)) {
        directives.push(`${directive} ${value.join(' ')}`);
      } else {
        directives.push(`${directive} ${value}`);
      }
    }

    return directives.join('; ');
  }

  private buildStrictTransportSecurity(
    config?: string | StrictTransportSecurityOptions
  ): string | null {
    if (!config) return null;
    if (typeof config === 'string') return config;

    const parts = [`max-age=${config.maxAge}`];
    
    if (config.includeSubDomains) {
      parts.push('includeSubDomains');
    }
    
    if (config.preload) {
      parts.push('preload');
    }

    return parts.join('; ');
  }

  private buildPermissionsPolicy(
    config: string | PermissionsPolicyOptions
  ): string | null {
    if (typeof config === 'string') return config;

    const policies: string[] = [];

    for (const [feature, allowList] of Object.entries(config)) {
      if (!allowList || !Array.isArray(allowList)) continue;
      
      const values = allowList.map(v => 
        v === 'self' ? 'self' : `"${v}"`
      ).join(' ');
      
      policies.push(`${feature}=(${values})`);
    }

    return policies.join(', ');
  }
}

/**
 * Preset configurations for common use cases
 */
export const SecurityHeaderPresets = {
  // Strict security for API endpoints
  API: {
    contentSecurityPolicy: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"]
    },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    xContentTypeOptions: 'nosniff' as const,
    xFrameOptions: 'DENY' as const,
    referrerPolicy: 'no-referrer' as const,
    crossOriginEmbedderPolicy: 'require-corp' as const,
    crossOriginOpenerPolicy: 'same-origin' as const,
    crossOriginResourcePolicy: 'same-origin' as const
  },

  // WebSocket endpoints
  WEBSOCKET: {
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true
    },
    xContentTypeOptions: 'nosniff' as const,
    xFrameOptions: 'DENY' as const
  },

  // Static assets
  STATIC: {
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"]
    },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true
    },
    xContentTypeOptions: 'nosniff' as const,
    xFrameOptions: 'DENY' as const,
    referrerPolicy: 'strict-origin-when-cross-origin' as const
  },

  // Admin panel
  ADMIN: {
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // May need eval for admin tools
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"]
    },
    strictTransportSecurity: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    xContentTypeOptions: 'nosniff' as const,
    xFrameOptions: 'SAMEORIGIN' as const,
    referrerPolicy: 'strict-origin' as const,
    permissionsPolicy: {
      camera: [],
      microphone: [],
      geolocation: [],
      payment: []
    }
  }
};

/**
 * CORS configuration helper
 */
export class CorsHeaders {
  constructor(
    private config: {
      origin?: string | string[] | ((origin: string) => boolean);
      credentials?: boolean;
      methods?: string[];
      allowedHeaders?: string[];
      exposedHeaders?: string[];
      maxAge?: number;
    } = {}
  ) {}

  applyCors(request: Request, response: Response): Response {
    const origin = request.headers.get('Origin');
    const newResponse = new Response(response.body, response);
    const headers = newResponse.headers;

    if (!origin) return newResponse;

    // Check if origin is allowed
    const isAllowed = this.isOriginAllowed(origin);
    if (!isAllowed) return newResponse;

    // Set CORS headers
    headers.set('Access-Control-Allow-Origin', origin);
    
    if (this.config.credentials) {
      headers.set('Access-Control-Allow-Credentials', 'true');
    }

    if (request.method === 'OPTIONS') {
      // Preflight request
      if (this.config.methods) {
        headers.set('Access-Control-Allow-Methods', this.config.methods.join(', '));
      }

      if (this.config.allowedHeaders) {
        headers.set('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
      }

      if (this.config.maxAge) {
        headers.set('Access-Control-Max-Age', this.config.maxAge.toString());
      }
    } else {
      // Actual request
      if (this.config.exposedHeaders) {
        headers.set('Access-Control-Expose-Headers', this.config.exposedHeaders.join(', '));
      }
    }

    return newResponse;
  }

  private isOriginAllowed(origin: string): boolean {
    const { origin: allowedOrigin } = this.config;

    if (!allowedOrigin) return false;

    if (typeof allowedOrigin === 'string') {
      return allowedOrigin === '*' || allowedOrigin === origin;
    }

    if (Array.isArray(allowedOrigin)) {
      return allowedOrigin.includes(origin);
    }

    return allowedOrigin(origin);
  }
}

/**
 * Content type validation middleware
 */
export function validateContentType(
  expectedTypes: string[]
) {
  return async (
    request: Request,
    ctx: Context,
    next: () => Promise<Response>
  ): Promise<Response> => {
    const contentType = request.headers.get('Content-Type');
    
    if (!contentType) {
      return new Response(
        JSON.stringify({ error: 'Content-Type header is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const baseType = contentType.split(';')[0].trim().toLowerCase();
    
    if (!expectedTypes.includes(baseType)) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid Content-Type',
          expected: expectedTypes,
          received: baseType
        }),
        { status: 415, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return next();
  };
}