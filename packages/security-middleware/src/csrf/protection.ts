interface CSRFConfig {
  secret: string;
  cookieName?: string;
  headerName?: string;
  tokenLength?: number;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  skipRoutes?: string[];
}

export class CSRFProtection {
  private config: Required<CSRFConfig>;

  constructor(config: CSRFConfig) {
    this.config = {
      cookieName: 'csrf-token',
      headerName: 'X-CSRF-Token',
      tokenLength: 32,
      secure: true,
      sameSite: 'strict',
      skipRoutes: ['/api/health', '/api/auth/login', '/api/auth/register'],
      ...config,
    };
  }

  private generateToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    const randomValues = new Uint8Array(this.config.tokenLength);
    crypto.getRandomValues(randomValues);
    
    for (const byte of randomValues) {
      token += chars[byte % chars.length];
    }
    
    return token;
  }

  private async hashToken(token: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(token + this.config.secret);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  private shouldSkipRoute(pathname: string): boolean {
    return this.config.skipRoutes.some(route => pathname.startsWith(route));
  }

  async generateTokenResponse(): Promise<Response> {
    const token = this.generateToken();
    const hashedToken = await this.hashToken(token);

    return new Response(JSON.stringify({ csrfToken: token }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `${this.config.cookieName}=${hashedToken}; Path=/; HttpOnly; ${this.config.secure ? 'Secure; ' : ''}SameSite=${this.config.sameSite}`,
      },
    });
  }

  async middleware(request: Request, next: () => Promise<Response>): Promise<Response> {
    // Skip CSRF check for safe methods and exempted routes
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      return next();
    }

    const url = new URL(request.url);
    if (this.shouldSkipRoute(url.pathname)) {
      return next();
    }

    // Get token from header
    const headerToken = request.headers.get(this.config.headerName);
    if (!headerToken) {
      return new Response('CSRF token missing', { status: 403 });
    }

    // Get cookie token
    const cookieHeader = request.headers.get('Cookie');
    const cookies = this.parseCookies(cookieHeader || '');
    const cookieToken = cookies[this.config.cookieName];

    if (!cookieToken) {
      return new Response('CSRF cookie missing', { status: 403 });
    }

    // Verify token matches hashed cookie
    const hashedHeaderToken = await this.hashToken(headerToken);
    if (hashedHeaderToken !== cookieToken) {
      return new Response('CSRF token invalid', { status: 403 });
    }

    return next();
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
}

// Alternative implementations for different CSRF strategies

// Double Submit Cookie Pattern
export class DoubleSubmitCSRF {
  private cookieName = 'csrf-token';
  private headerName = 'X-CSRF-Token';

  async middleware(request: Request, next: () => Promise<Response>): Promise<Response> {
    if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS') {
      const response = await next();
      
      // Generate and set CSRF cookie for GET requests
      if (!request.headers.get('Cookie')?.includes(this.cookieName)) {
        const token = crypto.randomUUID();
        response.headers.append('Set-Cookie', 
          `${this.cookieName}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`
        );
      }
      
      return response;
    }

    // For state-changing requests, verify double-submit
    const headerToken = request.headers.get(this.headerName);
    const cookieHeader = request.headers.get('Cookie') || '';
    const cookieMatch = cookieHeader.match(new RegExp(`${this.cookieName}=([^;]+)`));
    const cookieToken = cookieMatch ? cookieMatch[1] : null;

    if (!headerToken || !cookieToken || headerToken !== cookieToken) {
      return new Response('CSRF validation failed', { status: 403 });
    }

    return next();
  }
}

// Encrypted Token Pattern (stateless)
export class EncryptedTokenCSRF {
  constructor(private secret: string) {}

  private async encrypt(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.secret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData.slice(0, 32), // Use first 32 bytes for AES-256
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  }

  private async decrypt(encryptedData: string): Promise<string | null> {
    try {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const keyData = encoder.encode(this.secret);
      const key = await crypto.subtle.importKey(
        'raw',
        keyData.slice(0, 32),
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
      );

      const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const encrypted = combined.slice(12);

      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encrypted
      );

      return decoder.decode(decrypted);
    } catch {
      return null;
    }
  }

  async generateToken(userId: string): Promise<string> {
    const payload = JSON.stringify({
      userId,
      timestamp: Date.now(),
      nonce: crypto.randomUUID(),
    });
    return this.encrypt(payload);
  }

  async validateToken(token: string, userId: string): Promise<boolean> {
    const decrypted = await this.decrypt(token);
    if (!decrypted) return false;

    try {
      const payload = JSON.parse(decrypted);
      
      // Check user ID matches
      if (payload.userId !== userId) return false;
      
      // Check token age (5 minutes)
      const age = Date.now() - payload.timestamp;
      if (age > 5 * 60 * 1000) return false;
      
      return true;
    } catch {
      return false;
    }
  }
}