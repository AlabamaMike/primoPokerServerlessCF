import { Context } from '@cloudflare/workers-types';

/**
 * Request Signing Middleware
 * Implements HMAC-based request signing for API authentication and integrity
 */

export interface SigningConfig {
  algorithm?: 'SHA-256' | 'SHA-384' | 'SHA-512';
  headerName?: string;
  timestampHeader?: string;
  nonceHeader?: string;
  maxTimeDiff?: number; // Maximum time difference in seconds
  includeBody?: boolean;
  includeQueryParams?: boolean;
  secretKey?: string; // For simple HMAC signing
  apiKeyHeader?: string; // For API key-based signing
}

export interface SignatureComponents {
  method: string;
  path: string;
  query?: string;
  body?: string;
  timestamp: number;
  nonce?: string;
  headers?: Record<string, string>;
}

export interface VerificationResult {
  valid: boolean;
  reason?: string;
  apiKey?: string;
}

export class RequestSigner {
  private config: Required<SigningConfig>;

  constructor(config: SigningConfig = {}) {
    this.config = {
      algorithm: 'SHA-256',
      headerName: 'X-Signature',
      timestampHeader: 'X-Timestamp',
      nonceHeader: 'X-Nonce',
      maxTimeDiff: 300, // 5 minutes
      includeBody: true,
      includeQueryParams: true,
      secretKey: '',
      apiKeyHeader: 'X-API-Key',
      ...config
    };
  }

  /**
   * Sign a request
   */
  async signRequest(
    request: Request,
    secretKey: string
  ): Promise<Request> {
    const timestamp = Math.floor(Date.now() / 1000);
    const nonce = this.generateNonce();
    
    // Clone request to avoid modifying original
    const headers = new Headers(request.headers);
    headers.set(this.config.timestampHeader, timestamp.toString());
    headers.set(this.config.nonceHeader, nonce);

    // Build signature components
    const components = await this.buildSignatureComponents(request, timestamp, nonce);
    
    // Generate signature
    const signature = await this.generateSignature(components, secretKey);
    headers.set(this.config.headerName, signature);

    return new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      // @ts-ignore - duplex is required for streaming bodies
      duplex: 'half'
    });
  }

  /**
   * Verify request signature
   */
  async verifyRequest(
    request: Request,
    getSecretKey: (apiKey?: string) => Promise<string | null>
  ): Promise<VerificationResult> {
    // Extract signature and components
    const signature = request.headers.get(this.config.headerName);
    const timestamp = request.headers.get(this.config.timestampHeader);
    const nonce = request.headers.get(this.config.nonceHeader);
    const apiKey = request.headers.get(this.config.apiKeyHeader);

    if (!signature) {
      return { valid: false, reason: 'Missing signature header' };
    }

    if (!timestamp) {
      return { valid: false, reason: 'Missing timestamp header' };
    }

    // Verify timestamp
    const timestampNum = parseInt(timestamp, 10);
    if (isNaN(timestampNum)) {
      return { valid: false, reason: 'Invalid timestamp format' };
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const timeDiff = Math.abs(currentTime - timestampNum);
    
    if (timeDiff > this.config.maxTimeDiff) {
      return { valid: false, reason: 'Request timestamp too old' };
    }

    // Get secret key
    const secretKey = await getSecretKey(apiKey || undefined);
    if (!secretKey) {
      return { valid: false, reason: 'Invalid API key' };
    }

    // Build signature components
    const components = await this.buildSignatureComponents(
      request,
      timestampNum,
      nonce || undefined
    );

    // Generate expected signature
    const expectedSignature = await this.generateSignature(components, secretKey);

    // Constant-time comparison
    const valid = await this.timingSafeEqual(signature, expectedSignature);

    return {
      valid,
      reason: valid ? undefined : 'Invalid signature',
      apiKey
    };
  }

  /**
   * Create middleware for request signing verification
   */
  middleware(options: {
    getSecretKey: (apiKey?: string) => Promise<string | null>;
    skipPaths?: string[];
    onError?: (result: VerificationResult) => Response;
    nonceStore?: KVNamespace; // For nonce deduplication
  }) {
    return async (
      request: Request,
      ctx: Context,
      next: () => Promise<Response>
    ): Promise<Response> => {
      const url = new URL(request.url);
      
      // Skip verification for configured paths
      if (options.skipPaths?.some(path => url.pathname.startsWith(path))) {
        return next();
      }

      const result = await this.verifyRequest(request, options.getSecretKey);

      if (!result.valid) {
        const errorResponse = options.onError || this.defaultErrorResponse;
        return errorResponse(result);
      }

      // Check nonce if store provided
      if (options.nonceStore) {
        const nonce = request.headers.get(this.config.nonceHeader);
        if (nonce) {
          const nonceKey = `nonce:${nonce}`;
          const exists = await options.nonceStore.get(nonceKey);
          
          if (exists) {
            return this.defaultErrorResponse({
              valid: false,
              reason: 'Nonce already used'
            });
          }

          // Store nonce with TTL matching max time diff
          await options.nonceStore.put(nonceKey, '1', {
            expirationTtl: this.config.maxTimeDiff * 2
          });
        }
      }

      // Add API key to context if available
      if (result.apiKey) {
        (ctx as any).apiKey = result.apiKey;
      }

      return next();
    };
  }

  /**
   * Generate signature for webhook validation
   */
  async generateWebhookSignature(
    payload: string,
    secretKey: string,
    timestamp?: number
  ): Promise<string> {
    const ts = timestamp || Math.floor(Date.now() / 1000);
    const message = `${ts}.${payload}`;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: this.config.algorithm },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(message)
    );

    return `t=${ts},v1=${this.bufferToHex(signature)}`;
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(
    payload: string,
    signature: string,
    secretKey: string
  ): Promise<boolean> {
    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.substring(2);
    const sig = parts.find(p => p.startsWith('v1='))?.substring(3);

    if (!timestamp || !sig) {
      return false;
    }

    const expectedSig = await this.generateWebhookSignature(
      payload,
      secretKey,
      parseInt(timestamp, 10)
    );

    const expectedParts = expectedSig.split(',');
    const expectedSigValue = expectedParts.find(p => p.startsWith('v1='))?.substring(3);

    return await this.timingSafeEqual(sig, expectedSigValue || '');
  }

  /**
   * API Key management helpers
   */
  static generateApiKey(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  static async hashApiKey(apiKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey));
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Private helper methods
   */
  private async buildSignatureComponents(
    request: Request,
    timestamp: number,
    nonce?: string
  ): Promise<SignatureComponents> {
    const url = new URL(request.url);
    const components: SignatureComponents = {
      method: request.method,
      path: url.pathname,
      timestamp
    };

    if (nonce) {
      components.nonce = nonce;
    }

    if (this.config.includeQueryParams && url.search) {
      components.query = url.search.substring(1); // Remove leading ?
    }

    if (this.config.includeBody && request.body) {
      const body = await request.clone().text();
      if (body) {
        components.body = body;
      }
    }

    // Include specific headers if needed
    const headersToInclude = ['content-type', 'content-length'];
    components.headers = {};
    
    for (const header of headersToInclude) {
      const value = request.headers.get(header);
      if (value) {
        components.headers[header] = value;
      }
    }

    return components;
  }

  private async generateSignature(
    components: SignatureComponents,
    secretKey: string
  ): Promise<string> {
    // Build canonical string
    const parts = [
      components.method,
      components.path,
      components.query || '',
      components.timestamp.toString()
    ];

    if (components.nonce) {
      parts.push(components.nonce);
    }

    if (components.body) {
      // Hash the body
      const encoder = new TextEncoder();
      const bodyHash = await crypto.subtle.digest(
        this.config.algorithm,
        encoder.encode(components.body)
      );
      parts.push(this.bufferToHex(bodyHash));
    }

    // Add headers
    if (components.headers) {
      const headerParts = Object.entries(components.headers)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join('\n');
      parts.push(headerParts);
    }

    const canonical = parts.join('\n');

    // Generate HMAC
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: this.config.algorithm },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(canonical)
    );

    return this.bufferToHex(signature);
  }

  private generateNonce(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }

  private bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async timingSafeEqual(a: string, b: string): Promise<boolean> {
    const encoder = new TextEncoder();
    const aBuffer = encoder.encode(a);
    const bBuffer = encoder.encode(b);

    if (aBuffer.length !== bBuffer.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < aBuffer.length; i++) {
      result |= aBuffer[i] ^ bBuffer[i];
    }

    return result === 0;
  }

  private defaultErrorResponse(result: VerificationResult): Response {
    return new Response(
      JSON.stringify({
        error: 'Authentication failed',
        message: result.reason || 'Invalid request signature'
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Signature'
        }
      }
    );
  }
}

/**
 * Helper to create signed request for sensitive operations
 */
export async function createSignedToken(
  operation: string,
  data: any,
  secretKey: string,
  expiresIn: number = 3600
): Promise<string> {
  const payload = {
    op: operation,
    data,
    exp: Math.floor(Date.now() / 1000) + expiresIn,
    jti: Math.random().toString(36).substring(2)
  };

  const encoder = new TextEncoder();
  const message = JSON.stringify(payload);
  
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message)
  );

  return btoa(message) + '.' + btoa(String.fromCharCode(...new Uint8Array(signature)));
}

/**
 * Verify signed token
 */
export async function verifySignedToken(
  token: string,
  secretKey: string
): Promise<{ valid: boolean; payload?: any }> {
  try {
    const [messageB64, signatureB64] = token.split('.');
    if (!messageB64 || !signatureB64) {
      return { valid: false };
    }

    const message = atob(messageB64);
    const payload = JSON.parse(message);

    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false };
    }

    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secretKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signature = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
    
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(message)
    );

    return { valid, payload: valid ? payload : undefined };
  } catch {
    return { valid: false };
  }
}