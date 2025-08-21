interface SigningConfig {
  algorithm?: 'HMAC-SHA256' | 'HMAC-SHA512';
  headerName?: string;
  timestampHeader?: string;
  nonceHeader?: string;
  maxAgeSeconds?: number;
  includeBody?: boolean;
}

export class RequestSigner {
  private config: Required<SigningConfig>;

  constructor(
    private secret: string,
    config: SigningConfig = {}
  ) {
    this.config = {
      algorithm: 'HMAC-SHA256',
      headerName: 'X-Signature',
      timestampHeader: 'X-Timestamp',
      nonceHeader: 'X-Nonce',
      maxAgeSeconds: 300, // 5 minutes
      includeBody: true,
      ...config,
    };
  }

  private async computeHMAC(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secret),
      { name: 'HMAC', hash: this.config.algorithm.replace('HMAC-', '') },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(data)
    );

    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async signRequest(request: Request): Promise<Request> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID();
    
    // Build the string to sign
    const url = new URL(request.url);
    const parts = [
      request.method,
      url.pathname + url.search,
      timestamp,
      nonce,
    ];

    // Include body if configured and present
    if (this.config.includeBody && request.body) {
      const body = await request.text();
      parts.push(await this.hashBody(body));
      
      // Create new request with body
      const headers = new Headers(request.headers);
      headers.set(this.config.timestampHeader, timestamp);
      headers.set(this.config.nonceHeader, nonce);
      
      const stringToSign = parts.join('\n');
      const signature = await this.computeHMAC(stringToSign);
      headers.set(this.config.headerName, signature);
      
      return new Request(request.url, {
        method: request.method,
        headers,
        body,
      });
    }

    const stringToSign = parts.join('\n');
    const signature = await this.computeHMAC(stringToSign);

    // Add headers
    const headers = new Headers(request.headers);
    headers.set(this.config.headerName, signature);
    headers.set(this.config.timestampHeader, timestamp);
    headers.set(this.config.nonceHeader, nonce);

    return new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
    });
  }

  async verifyRequest(request: Request, nonceStore?: KVNamespace): Promise<boolean> {
    const signature = request.headers.get(this.config.headerName);
    const timestamp = request.headers.get(this.config.timestampHeader);
    const nonce = request.headers.get(this.config.nonceHeader);

    if (!signature || !timestamp || !nonce) {
      return false;
    }

    // Check timestamp is within allowed age
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - requestTime) > this.config.maxAgeSeconds) {
      return false;
    }

    // Check nonce if store provided (prevents replay attacks)
    if (nonceStore) {
      const nonceKey = `nonce:${nonce}`;
      const exists = await nonceStore.get(nonceKey);
      if (exists) {
        return false; // Nonce already used
      }
      // Store nonce with expiration
      await nonceStore.put(nonceKey, '1', {
        expirationTtl: this.config.maxAgeSeconds * 2,
      });
    }

    // Rebuild string to sign
    const url = new URL(request.url);
    const parts = [
      request.method,
      url.pathname + url.search,
      timestamp,
      nonce,
    ];

    if (this.config.includeBody && request.body) {
      const body = await request.text();
      parts.push(await this.hashBody(body));
    }

    const stringToSign = parts.join('\n');
    const expectedSignature = await this.computeHMAC(stringToSign);

    // Constant-time comparison
    return this.secureCompare(signature, expectedSignature);
  }

  private async hashBody(body: string): Promise<string> {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(body));
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
}

// API Key Authentication System
export class APIKeyManager {
  constructor(
    private storage: KVNamespace,
    private auditLogger?: import('../audit/logger').AuditLogger
  ) {}

  async createAPIKey(
    ownerId: string,
    name: string,
    permissions: string[],
    expiresAt?: number
  ): Promise<{
    keyId: string;
    apiKey: string;
    hashedKey: string;
  }> {
    const keyId = crypto.randomUUID();
    const apiKey = this.generateAPIKey();
    const hashedKey = await this.hashAPIKey(apiKey);

    const keyData = {
      keyId,
      ownerId,
      name,
      permissions,
      hashedKey,
      createdAt: Date.now(),
      expiresAt,
      lastUsed: null,
      usageCount: 0,
    };

    await this.storage.put(`apikey:${keyId}`, JSON.stringify(keyData));
    await this.storage.put(`apikey:hash:${hashedKey}`, keyId);

    if (this.auditLogger) {
      await this.auditLogger.log({
        eventType: 'api_key',
        userId: ownerId,
        resource: '/api/keys',
        action: 'create',
        result: 'success',
        severity: 'info',
        metadata: { keyId, name, permissions },
      });
    }

    return { keyId, apiKey, hashedKey };
  }

  private generateAPIKey(): string {
    const prefix = 'pk_'; // "primo key"
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const key = btoa(String.fromCharCode(...randomBytes))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    return prefix + key;
  }

  private async hashAPIKey(apiKey: string): Promise<string> {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(apiKey));
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async validateAPIKey(apiKey: string): Promise<{
    valid: boolean;
    keyId?: string;
    permissions?: string[];
    ownerId?: string;
  }> {
    if (!apiKey.startsWith('pk_')) {
      return { valid: false };
    }

    const hashedKey = await this.hashAPIKey(apiKey);
    const keyId = await this.storage.get(`apikey:hash:${hashedKey}`);
    
    if (!keyId) {
      return { valid: false };
    }

    const keyDataJson = await this.storage.get(`apikey:${keyId}`);
    if (!keyDataJson) {
      return { valid: false };
    }

    const keyData = JSON.parse(keyDataJson);

    // Check expiration
    if (keyData.expiresAt && keyData.expiresAt < Date.now()) {
      return { valid: false };
    }

    // Update usage stats
    keyData.lastUsed = Date.now();
    keyData.usageCount++;
    await this.storage.put(`apikey:${keyId}`, JSON.stringify(keyData));

    return {
      valid: true,
      keyId: keyData.keyId,
      permissions: keyData.permissions,
      ownerId: keyData.ownerId,
    };
  }

  async revokeAPIKey(keyId: string, revokedBy: string, reason: string): Promise<void> {
    const keyDataJson = await this.storage.get(`apikey:${keyId}`);
    if (!keyDataJson) {
      throw new Error('API key not found');
    }

    const keyData = JSON.parse(keyDataJson);
    
    // Remove from storage
    await this.storage.delete(`apikey:${keyId}`);
    await this.storage.delete(`apikey:hash:${keyData.hashedKey}`);

    if (this.auditLogger) {
      await this.auditLogger.log({
        eventType: 'api_key',
        userId: revokedBy,
        resource: '/api/keys',
        action: 'revoke',
        result: 'success',
        severity: 'warning',
        metadata: { keyId, reason, ownerId: keyData.ownerId },
      });
    }
  }
}

// Webhook signature validation
export class WebhookSigner {
  constructor(private secret: string) {}

  async signPayload(payload: string | object): Promise<string> {
    const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000);
    const message = `${timestamp}.${data}`;
    
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(message)
    );

    const sig = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return `t=${timestamp},v1=${sig}`;
  }

  async verifySignature(
    payload: string,
    signature: string,
    maxAgeSeconds: number = 300
  ): Promise<boolean> {
    const parts = signature.split(',');
    const timestamp = parts.find(p => p.startsWith('t='))?.substring(2);
    const sig = parts.find(p => p.startsWith('v1='))?.substring(3);

    if (!timestamp || !sig) {
      return false;
    }

    // Check timestamp
    const requestTime = parseInt(timestamp, 10);
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime - requestTime > maxAgeSeconds) {
      return false;
    }

    // Verify signature
    const message = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const expectedSig = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(message)
    );

    const expected = Array.from(new Uint8Array(expectedSig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return this.secureCompare(sig, expected);
  }

  private secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    
    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    
    return result === 0;
  }
}

// Sensitive operation token generator
export class SensitiveOperationToken {
  constructor(private secret: string) {}

  async generateToken(
    userId: string,
    operation: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const payload = {
      userId,
      operation,
      metadata,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    
    // Encrypt the payload
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.secret).slice(0, 32),
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  async validateToken(
    token: string,
    expectedUserId: string,
    expectedOperation: string,
    maxAgeSeconds: number = 300
  ): Promise<{
    valid: boolean;
    metadata?: Record<string, unknown>;
  }> {
    try {
      // Decode base64url
      const normalized = token.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - normalized.length % 4) % 4);
      const combined = Uint8Array.from(atob(normalized + padding), c => c.charCodeAt(0));

      // Extract IV and encrypted data
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      // Decrypt
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(this.secret).slice(0, 32),
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      const payload = JSON.parse(decoder.decode(decrypted));

      // Validate payload
      if (payload.userId !== expectedUserId || payload.operation !== expectedOperation) {
        return { valid: false };
      }

      // Check age
      const age = Date.now() - payload.timestamp;
      if (age > maxAgeSeconds * 1000) {
        return { valid: false };
      }

      return { valid: true, metadata: payload.metadata };
    } catch {
      return { valid: false };
    }
  }
}