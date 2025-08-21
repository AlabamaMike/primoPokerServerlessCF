interface SecurityHeadersConfig {
  csp?: ContentSecurityPolicyConfig | string;
  hsts?: HSTSConfig | boolean;
  frameOptions?: 'DENY' | 'SAMEORIGIN';
  contentTypeOptions?: boolean;
  referrerPolicy?: ReferrerPolicyValue;
  permissionsPolicy?: Record<string, string[]>;
  cors?: CORSConfig;
  customHeaders?: Record<string, string>;
}

interface ContentSecurityPolicyConfig {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  connectSrc?: string[];
  frameSrc?: string[];
  objectSrc?: string[];
  mediaSrc?: string[];
  workerSrc?: string[];
  reportUri?: string;
  upgradeInsecureRequests?: boolean;
}

interface HSTSConfig {
  maxAge: number;
  includeSubDomains?: boolean;
  preload?: boolean;
}

interface CORSConfig {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

type ReferrerPolicyValue = 
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
    this.config = {
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      frameOptions: 'DENY',
      contentTypeOptions: true,
      referrerPolicy: 'strict-origin-when-cross-origin',
      ...config,
    };
  }

  private buildCSP(config: ContentSecurityPolicyConfig | string): string {
    if (typeof config === 'string') {
      return config;
    }

    const directives: string[] = [];

    if (config.defaultSrc) {
      directives.push(`default-src ${config.defaultSrc.join(' ')}`);
    }
    if (config.scriptSrc) {
      directives.push(`script-src ${config.scriptSrc.join(' ')}`);
    }
    if (config.styleSrc) {
      directives.push(`style-src ${config.styleSrc.join(' ')}`);
    }
    if (config.imgSrc) {
      directives.push(`img-src ${config.imgSrc.join(' ')}`);
    }
    if (config.fontSrc) {
      directives.push(`font-src ${config.fontSrc.join(' ')}`);
    }
    if (config.connectSrc) {
      directives.push(`connect-src ${config.connectSrc.join(' ')}`);
    }
    if (config.frameSrc) {
      directives.push(`frame-src ${config.frameSrc.join(' ')}`);
    }
    if (config.objectSrc) {
      directives.push(`object-src ${config.objectSrc.join(' ')}`);
    }
    if (config.mediaSrc) {
      directives.push(`media-src ${config.mediaSrc.join(' ')}`);
    }
    if (config.workerSrc) {
      directives.push(`worker-src ${config.workerSrc.join(' ')}`);
    }
    if (config.reportUri) {
      directives.push(`report-uri ${config.reportUri}`);
    }
    if (config.upgradeInsecureRequests) {
      directives.push('upgrade-insecure-requests');
    }

    return directives.join('; ');
  }

  private buildHSTS(config: HSTSConfig | boolean): string {
    if (typeof config === 'boolean') {
      return config ? 'max-age=31536000' : '';
    }

    const parts = [`max-age=${config.maxAge}`];
    if (config.includeSubDomains) {
      parts.push('includeSubDomains');
    }
    if (config.preload) {
      parts.push('preload');
    }

    return parts.join('; ');
  }

  private buildPermissionsPolicy(permissions: Record<string, string[]>): string {
    return Object.entries(permissions)
      .map(([feature, allowList]) => {
        if (allowList.length === 0) {
          return `${feature}=()`;
        }
        const values = allowList.map(v => v === '*' ? v : `"${v}"`).join(' ');
        return `${feature}=(${values})`;
      })
      .join(', ');
  }

  private handleCORS(request: Request, response: Response, config: CORSConfig): void {
    const origin = request.headers.get('Origin');
    
    if (!origin) return;

    // Determine if origin is allowed
    let allowed = false;
    if (typeof config.origin === 'string') {
      allowed = config.origin === '*' || config.origin === origin;
    } else if (Array.isArray(config.origin)) {
      allowed = config.origin.includes(origin);
    } else if (typeof config.origin === 'function') {
      allowed = config.origin(origin);
    }

    if (!allowed) return;

    // Set CORS headers
    response.headers.set('Access-Control-Allow-Origin', origin);
    
    if (config.credentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    if (config.exposedHeaders && config.exposedHeaders.length > 0) {
      response.headers.set('Access-Control-Expose-Headers', config.exposedHeaders.join(', '));
    }

    // Handle preflight
    if (request.method === 'OPTIONS') {
      if (config.methods) {
        response.headers.set('Access-Control-Allow-Methods', config.methods.join(', '));
      }
      if (config.allowedHeaders) {
        response.headers.set('Access-Control-Allow-Headers', config.allowedHeaders.join(', '));
      }
      if (config.maxAge) {
        response.headers.set('Access-Control-Max-Age', String(config.maxAge));
      }
    }
  }

  apply(response: Response, request?: Request): Response {
    // CSP
    if (this.config.csp) {
      const cspValue = this.buildCSP(this.config.csp);
      response.headers.set('Content-Security-Policy', cspValue);
    }

    // HSTS
    if (this.config.hsts) {
      const hstsValue = this.buildHSTS(this.config.hsts);
      if (hstsValue) {
        response.headers.set('Strict-Transport-Security', hstsValue);
      }
    }

    // X-Frame-Options
    if (this.config.frameOptions) {
      response.headers.set('X-Frame-Options', this.config.frameOptions);
    }

    // X-Content-Type-Options
    if (this.config.contentTypeOptions) {
      response.headers.set('X-Content-Type-Options', 'nosniff');
    }

    // Referrer-Policy
    if (this.config.referrerPolicy) {
      response.headers.set('Referrer-Policy', this.config.referrerPolicy);
    }

    // Permissions-Policy
    if (this.config.permissionsPolicy) {
      const permissionsPolicyValue = this.buildPermissionsPolicy(this.config.permissionsPolicy);
      response.headers.set('Permissions-Policy', permissionsPolicyValue);
    }

    // CORS
    if (this.config.cors && request) {
      this.handleCORS(request, response, this.config.cors);
    }

    // Custom headers
    if (this.config.customHeaders) {
      for (const [name, value] of Object.entries(this.config.customHeaders)) {
        response.headers.set(name, value);
      }
    }

    // Additional security headers
    response.headers.set('X-XSS-Protection', '0'); // Disabled in favor of CSP
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');

    return response;
  }

  middleware() {
    return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
      const response = await next();
      return this.apply(response, request);
    };
  }
}

// Preset configurations for common use cases
export const SecurityHeaderPresets = {
  // Strict API endpoint protection
  api: (): SecurityHeaders => new SecurityHeaders({
    csp: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
    frameOptions: 'DENY',
    permissionsPolicy: {
      accelerometer: [],
      camera: [],
      geolocation: [],
      gyroscope: [],
      magnetometer: [],
      microphone: [],
      payment: [],
      usb: [],
    },
  }),

  // WebSocket endpoint
  websocket: (): SecurityHeaders => new SecurityHeaders({
    csp: {
      defaultSrc: ["'self'"],
      connectSrc: ["'self'", 'wss:'],
    },
    cors: {
      origin: (origin) => origin.startsWith('https://') || origin.startsWith('http://localhost'),
      credentials: true,
    },
  }),

  // Static assets
  static: (): SecurityHeaders => new SecurityHeaders({
    csp: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
    },
    frameOptions: 'SAMEORIGIN',
  }),

  // Admin panel
  admin: (): SecurityHeaders => new SecurityHeaders({
    csp: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'nonce-'"], // Nonce should be generated per request
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
    frameOptions: 'DENY',
    referrerPolicy: 'same-origin',
  }),
};

// Helper for Content-Type validation
export class ContentTypeValidator {
  constructor(
    private allowedTypes: string[],
    private strict: boolean = true
  ) {}

  validate(request: Request): boolean {
    const contentType = request.headers.get('Content-Type');
    
    if (!contentType) {
      return !this.strict;
    }

    // Extract main type (before semicolon)
    const mainType = contentType.split(';')[0].trim().toLowerCase();
    
    return this.allowedTypes.some(allowed => {
      if (allowed.endsWith('/*')) {
        // Wildcard matching (e.g., 'application/*')
        const prefix = allowed.slice(0, -2);
        return mainType.startsWith(prefix);
      }
      return mainType === allowed.toLowerCase();
    });
  }

  middleware() {
    return async (request: Request, next: () => Promise<Response>): Promise<Response> => {
      // Skip validation for GET, HEAD, OPTIONS
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return next();
      }

      if (!this.validate(request)) {
        return new Response('Unsupported Media Type', { status: 415 });
      }

      return next();
    };
  }
}