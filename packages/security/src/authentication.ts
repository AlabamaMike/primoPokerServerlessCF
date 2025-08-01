import { SignJWT, jwtVerify, JWTPayload } from 'jose';
import { RandomUtils } from '@primo-poker/shared';

export interface JWTTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface TokenPayload extends JWTPayload {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  sessionId: string;
}

export interface RefreshTokenPayload extends JWTPayload {
  userId: string;
  sessionId: string;
  tokenType: 'refresh';
}

export class AuthenticationManager {
  private readonly secretKey: Uint8Array;
  private readonly accessTokenTTL = 3600; // 1 hour
  private readonly refreshTokenTTL = 604800; // 7 days
  private readonly activeSessions = new Map<string, Set<string>>();
  
  constructor(secretKey: string) {
    this.secretKey = new TextEncoder().encode(secretKey);
  }

  async authenticate(credentials: {
    username: string;
    password: string;
  }, db?: any): Promise<{ success: boolean; tokens?: JWTTokens; user?: any; error?: string }> {
    try {
      // Validate credentials against database
      const validationResult = await this.validateCredentials(credentials, db);
      
      if (!validationResult.success) {
        return { success: false, error: validationResult.error || 'Invalid credentials' };
      }

      const user = validationResult.user;
      
      // Create session
      const sessionId = RandomUtils.generateUUID();
      
      const tokens = await this.generateTokens({
        userId: user.id,
        username: user.username,
        email: user.email,
        roles: ['player'],
        sessionId,
      });

      // Track active session
      if (!this.activeSessions.has(user.id)) {
        this.activeSessions.set(user.id, new Set());
      }
      this.activeSessions.get(user.id)!.add(sessionId);

      return { success: true, tokens, user };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Authentication failed' };
    }
  }

  async verifyAccessToken(token: string): Promise<{
    valid: boolean;
    payload?: TokenPayload;
    error?: string;
  }> {
    try {
      const { payload } = await jwtVerify(token, this.secretKey);
      
      const tokenPayload = payload as TokenPayload;
      
      // TODO: Implement proper session validation using KV store
      // For now, skip session validation to test basic JWT functionality
      // Check if session is still active
      // const userSessions = this.activeSessions.get(tokenPayload.userId);
      // if (!userSessions?.has(tokenPayload.sessionId)) {
      //   return { valid: false, error: 'Session expired' };
      // }

      return { valid: true, payload: tokenPayload };
    } catch (error) {
      return { 
        valid: false, 
        error: error instanceof Error ? error.message : 'Invalid token' 
      };
    }
  }

  async refreshTokens(refreshToken: string): Promise<{
    success: boolean;
    tokens?: JWTTokens;
    error?: string;
  }> {
    try {
      const { payload } = await jwtVerify(refreshToken, this.secretKey);
      const refreshPayload = payload as RefreshTokenPayload;

      // Verify session is still active
      const userSessions = this.activeSessions.get(refreshPayload.userId);
      if (!userSessions?.has(refreshPayload.sessionId)) {
        return { success: false, error: 'Session expired' };
      }

      // Generate new tokens with same session
      const tokens = await this.generateTokens({
        userId: refreshPayload.userId,
        username: 'user', // In real app, fetch from DB
        email: 'user@example.com',
        roles: ['player'],
        sessionId: refreshPayload.sessionId,
      });

      return { success: true, tokens };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Invalid refresh token' 
      };
    }
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const userSessions = this.activeSessions.get(userId);
    if (userSessions) {
      userSessions.delete(sessionId);
      if (userSessions.size === 0) {
        this.activeSessions.delete(userId);
      }
    }
  }

  async revokeAllSessions(userId: string): Promise<void> {
    this.activeSessions.delete(userId);
  }

  async createTokensForUser(user: {
    userId: string;
    username: string;
    email: string;
    roles?: string[];
  }): Promise<JWTTokens> {
    const sessionId = RandomUtils.generateUUID();
    
    const tokens = await this.generateTokens({
      userId: user.userId,
      username: user.username,
      email: user.email,
      roles: user.roles || ['player'],
      sessionId,
    });

    // Track active session
    if (!this.activeSessions.has(user.userId)) {
      this.activeSessions.set(user.userId, new Set());
    }
    this.activeSessions.get(user.userId)!.add(sessionId);

    return tokens;
  }

  private async generateTokens(payload: Omit<TokenPayload, 'iat' | 'exp'>): Promise<JWTTokens> {
    const now = Math.floor(Date.now() / 1000);
    const accessTokenExp = now + this.accessTokenTTL;
    const refreshTokenExp = now + this.refreshTokenTTL;

    const accessToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(accessTokenExp)
      .sign(this.secretKey);

    const refreshToken = await new SignJWT({
      userId: payload.userId as string,
      sessionId: payload.sessionId as string,
      tokenType: 'refresh',
    } satisfies RefreshTokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(refreshTokenExp)
      .sign(this.secretKey);

    return {
      accessToken,
      refreshToken,
      expiresAt: new Date(accessTokenExp * 1000),
    };
  }

  private async validateCredentials(credentials: {
    username: string;
    password: string;
  }, db?: any): Promise<{ success: boolean; user?: any; error?: string }> {
    if (!db) {
      return { success: false, error: 'Database not available' };
    }

    // Input validation for extra security (defense in depth)
    if (!credentials.username || typeof credentials.username !== 'string') {
      return { success: false, error: 'Invalid username format' };
    }
    
    if (!credentials.password || typeof credentials.password !== 'string') {
      return { success: false, error: 'Invalid password format' };
    }

    // Basic length limits to prevent excessive resource usage
    if (credentials.username.length > 255 || credentials.password.length > 1000) {
      return { success: false, error: 'Credentials too long' };
    }

    try {
      // Import PasswordManager locally to avoid circular dependency
      const { PasswordManager } = await import('./index');
      
      // Look up user by username OR email (support both login methods)
      // Using parameterized query - SAFE from SQL injection
      const stmt = db.prepare('SELECT * FROM players WHERE username = ? OR email = ?');
      const result = await stmt.bind(credentials.username, credentials.username).first();
      
      if (!result) {
        return { success: false, error: 'User not found' };
      }
      
      // Verify password
      const isValidPassword = await PasswordManager.verifyPassword(
        credentials.password,
        result.password_hash,
        result.password_salt
      );
      
      if (!isValidPassword) {
        return { success: false, error: 'Invalid password' };
      }
      
      // Return user data (excluding sensitive fields)
      const user = {
        id: result.id,
        username: result.username,
        email: result.email,
        chipCount: result.chip_count,
        status: result.status,
        createdAt: result.created_at,
        updatedAt: result.updated_at
      };
      
      return { success: true, user };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Validation failed' };
    }
  }
}

// Rate limiting for authentication attempts
export class RateLimiter {
  private attempts = new Map<string, { count: number; resetTime: number }>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(identifier);

    if (!record || now > record.resetTime) {
      this.attempts.set(identifier, { count: 1, resetTime: now + this.windowMs });
      return true;
    }

    if (record.count >= this.maxAttempts) {
      return false;
    }

    record.count++;
    return true;
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }

  getRemainingAttempts(identifier: string): number {
    const record = this.attempts.get(identifier);
    if (!record || Date.now() > record.resetTime) {
      return this.maxAttempts;
    }
    return Math.max(0, this.maxAttempts - record.count);
  }

  getResetTime(identifier: string): Date | null {
    const record = this.attempts.get(identifier);
    if (!record || Date.now() > record.resetTime) {
      return null;
    }
    return new Date(record.resetTime);
  }

  // Cleanup expired records
  cleanup(): void {
    const now = Date.now();
    for (const [identifier, record] of this.attempts) {
      if (now > record.resetTime) {
        this.attempts.delete(identifier);
      }
    }
  }
}

// Password hashing utilities
export class PasswordManager {
  static async hashPassword(password: string, salt?: string): Promise<{
    hash: string;
    salt: string;
  }> {
    const actualSalt = salt || this.generateSalt();
    const encoder = new TextEncoder();
    const data = encoder.encode(password + actualSalt);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return { hash, salt: actualSalt };
  }

  static async verifyPassword(
    password: string,
    hash: string,
    salt: string
  ): Promise<boolean> {
    const { hash: computedHash } = await this.hashPassword(password, salt);
    return computedHash === hash;
  }

  private static generateSalt(): string {
    const saltArray = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(saltArray, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}

// Multi-factor authentication
export class MFAManager {
  private backupCodes = new Map<string, Set<string>>();
  
  generateBackupCodes(userId: string, count = 10): string[] {
    const codes: string[] = [];
    const codeSet = new Set<string>();
    
    for (let i = 0; i < count; i++) {
      const code = this.generateBackupCode();
      codes.push(code);
      codeSet.add(code);
    }
    
    this.backupCodes.set(userId, codeSet);
    return codes;
  }

  verifyBackupCode(userId: string, code: string): boolean {
    const userCodes = this.backupCodes.get(userId);
    if (!userCodes?.has(code)) {
      return false;
    }
    
    // Remove used code
    userCodes.delete(code);
    return true;
  }

  private generateBackupCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }
}
