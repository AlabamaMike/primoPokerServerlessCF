import { Context } from '@cloudflare/workers-types';

/**
 * CSRF Protection Middleware
 * Implements multiple CSRF protection strategies for Cloudflare Workers
 */

export enum CsrfStrategy {
  SYNCHRONIZER_TOKEN = 'synchronizer',
  DOUBLE_SUBMIT = 'double_submit',
  ENCRYPTED_TOKEN = 'encrypted'
}

export interface CsrfConfig {
  strategy: CsrfStrategy;
  secretKey: string; // For token generation/encryption
  cookieName?: string;
  headerName?: string;
  skipRoutes?: string[]; // Routes to skip CSRF check
  tokenLifetime?: number; // Token lifetime in seconds
}

export interface CsrfToken {
  token: string;
  expiresAt: number;
}

export class CsrfProtection {
  private config: Required<CsrfConfig>;

  constructor(config: CsrfConfig) {
    this.config = {
      cookieName: 'csrf-token',
      headerName: 'X-CSRF-Token',
      skipRoutes: [],
      tokenLifetime: 3600, // 1 hour default
      ...config
    };
  }

  /**
   * Generate a new CSRF token
   */
  async generateToken(sessionId?: string, kv?: KVNamespace): Promise<CsrfToken> {
    const expiresAt = Date.now() + (this.config.tokenLifetime * 1000);
    let token: string;

    switch (this.config.strategy) {
      case CsrfStrategy.SYNCHRONIZER_TOKEN:
        token = await this.generateSynchronizerToken(sessionId || this.generateSessionId(), kv);
        break;
      
      case CsrfStrategy.DOUBLE_SUBMIT:
        token = await this.generateRandomToken();
        break;
      
      case CsrfStrategy.ENCRYPTED_TOKEN:
        token = await this.generateEncryptedToken(expiresAt);
        break;
      
      default:
        throw new Error(`Unknown CSRF strategy: ${this.config.strategy}`);
    }

    return { token, expiresAt };
  }

  /**
   * Validate a CSRF token
   */
  async validateToken(
    token: string,
    sessionId?: string,
    cookieToken?: string,
    kv?: KVNamespace
  ): Promise<boolean> {
    if (!token) return false;

    switch (this.config.strategy) {
      case CsrfStrategy.SYNCHRONIZER_TOKEN:
        return await this.validateSynchronizerToken(token, sessionId || '', kv);
      
      case CsrfStrategy.DOUBLE_SUBMIT:
        return token === cookieToken;
      
      case CsrfStrategy.ENCRYPTED_TOKEN:
        return await this.validateEncryptedToken(token);
      
      default:
        return false;
    }
  }

  /**
   * Create CSRF middleware
   */
  middleware(
    options?: {
      kv?: KVNamespace; // For synchronizer token storage
      onError?: (error: string) => Response;
    }
  ) {
    return async (
      request: Request,
      ctx: Context & { sessionId?: string },
      next: () => Promise<Response>
    ): Promise<Response> => {
      const url = new URL(request.url);
      
      // Skip CSRF check for configured routes
      if (this.config.skipRoutes.some(route => url.pathname.startsWith(route))) {
        return next();
      }

      // Skip CSRF for safe methods
      if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        return next();
      }

      // Extract tokens
      const headerToken = request.headers.get(this.config.headerName);
      const cookies = this.parseCookies(request.headers.get('Cookie') || '');
      const cookieToken = cookies[this.config.cookieName];

      // For synchronizer tokens, pass KV namespace to validation
      const isValid = await this.validateToken(
        headerToken || '',
        ctx.sessionId,
        cookieToken,
        options?.kv
      );

      if (!isValid) {
        const errorResponse = options?.onError || this.defaultErrorResponse;
        return errorResponse('CSRF token validation failed');
      }

      return next();
    };
  }

  /**
   * Add CSRF token to response
   */
  async addTokenToResponse(
    response: Response,
    sessionId?: string,
    kv?: KVNamespace
  ): Promise<Response> {
    const { token, expiresAt } = await this.generateToken(sessionId, kv);
    const newResponse = new Response(response.body, response);

    // Add token to response header
    newResponse.headers.set(this.config.headerName, token);

    // Add token to cookie for double-submit strategy
    if (this.config.strategy === CsrfStrategy.DOUBLE_SUBMIT) {
      const cookieValue = `${this.config.cookieName}=${token}; Path=/; SameSite=Strict; Secure; HttpOnly; Max-Age=${this.config.tokenLifetime}`;
      newResponse.headers.append('Set-Cookie', cookieValue);
    }

    return newResponse;
  }

  /**
   * Private helper methods
   */
  private async generateSynchronizerToken(sessionId: string, kv?: KVNamespace): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${sessionId}:${Date.now()}:${Math.random()}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const token = this.bufferToHex(hashBuffer);
    
    // Store token in KV if available
    if (kv) {
      await kv.put(
        `csrf:${sessionId}:${token}`,
        JSON.stringify({ 
          expiresAt: Date.now() + (this.config.tokenLifetime * 1000),
          sessionId 
        }),
        { expirationTtl: this.config.tokenLifetime }
      );
    }
    
    return token;
  }

  private async generateRandomToken(): Promise<string> {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.bufferToHex(array.buffer);
  }

  private async generateEncryptedToken(expiresAt: number): Promise<string> {
    const payload = JSON.stringify({
      exp: expiresAt,
      nonce: Math.random().toString(36).substr(2)
    });

    // Simple encryption using Web Crypto API
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.config.secretKey),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('csrf-salt'),
        iterations: 1000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(payload)
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  private async validateSynchronizerToken(
    token: string,
    sessionId: string,
    kv?: KVNamespace
  ): Promise<boolean> {
    // Validate token format
    if (!/^[a-f0-9]{64}$/.test(token)) {
      return false;
    }

    // If no KV namespace provided, only validate format
    if (!kv) {
      return true;
    }

    // Check if token exists and is valid in KV
    try {
      const storedData = await kv.get(`csrf:${sessionId}:${token}`, 'json') as { expiresAt: number; sessionId: string } | null;
      
      if (!storedData) {
        return false;
      }

      // Check if token is expired
      if (storedData.expiresAt < Date.now()) {
        // Clean up expired token
        await kv.delete(`csrf:${sessionId}:${token}`);
        return false;
      }

      // Validate session ID matches
      return storedData.sessionId === sessionId;
    } catch (error) {
      console.error('Error validating CSRF token:', error);
      return false;
    }
  }

  private async validateEncryptedToken(token: string): Promise<boolean> {
    try {
      // Decode base64
      const combined = Uint8Array.from(atob(token), c => c.charCodeAt(0));
      
      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // Decrypt
      const encoder = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.config.secretKey),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );

      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt: encoder.encode('csrf-salt'),
          iterations: 1000,
          hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      const decoder = new TextDecoder();
      const payload = JSON.parse(decoder.decode(decrypted));

      // Check expiration
      return payload.exp > Date.now();
    } catch {
      return false;
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substr(2) + Date.now().toString(36);
  }

  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {};
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name && value) {
        cookies[name] = value;
      }
    });
    return cookies;
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private defaultErrorResponse(error: string): Response {
    return new Response(
      JSON.stringify({
        error: 'CSRF Protection',
        message: error
      }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * Helper function to create CSRF protection middleware with common configurations
 */
export function createCsrfProtection(
  secretKey: string,
  options?: Partial<CsrfConfig>
): CsrfProtection {
  return new CsrfProtection({
    strategy: CsrfStrategy.DOUBLE_SUBMIT,
    secretKey,
    ...options
  });
}