/**
 * Authentication Unit Tests
 * 
 * Comprehensive tests for JWT authentication, session management,
 * password handling, and rate limiting
 */

// Mock @primo-poker/shared before any imports
jest.mock('@primo-poker/shared', () => ({
  RandomUtils: {
    generateUUID: () => {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
  }
}));

import { 
  AuthenticationManager, 
  PasswordManager, 
  RateLimiter,
  MFAManager,
  JWTTokens,
  TokenPayload
} from '../authentication';
import { jwtVerify } from 'jose';

// Mock database for testing
class MockDatabase {
  private users = new Map<string, any>();

  prepare(query: string) {
    return {
      bind: (...params: any[]) => ({
        first: async () => {
          if (query.includes('SELECT * FROM players')) {
            const [usernameOrEmail] = params;
            for (const user of this.users.values()) {
              if (user.username === usernameOrEmail || user.email === usernameOrEmail) {
                return user;
              }
            }
            return null;
          }
          return null;
        }
      })
    };
  }

  addUser(user: any) {
    this.users.set(user.id, user);
  }

  clear() {
    this.users.clear();
  }
}

describe('AuthenticationManager', () => {
  let authManager: AuthenticationManager;
  let mockDb: MockDatabase;
  const testSecret = 'test-secret-key-minimum-32-characters-long';

  beforeEach(() => {
    authManager = new AuthenticationManager(testSecret);
    mockDb = new MockDatabase();
  });

  describe('Token Generation and Verification', () => {
    it('should generate valid JWT tokens', async () => {
      const user = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['player']
      };

      const tokens = await authManager.createTokensForUser(user);

      expect(tokens).toMatchObject({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        expiresAt: expect.any(Date)
      });

      // Verify tokens are different
      expect(tokens.accessToken).not.toBe(tokens.refreshToken);
      
      // Verify expiration is in the future
      expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should verify valid access tokens', async () => {
      const user = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        roles: ['player']
      };

      const tokens = await authManager.createTokensForUser(user);
      const result = await authManager.verifyAccessToken(tokens.accessToken);

      expect(result.valid).toBe(true);
      expect(result.payload).toMatchObject({
        userId: user.userId,
        username: user.username,
        email: user.email,
        roles: user.roles,
        sessionId: expect.any(String)
      });
    });

    it('should reject invalid tokens', async () => {
      const invalidToken = 'invalid.jwt.token';
      const result = await authManager.verifyAccessToken(invalidToken);

      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject expired tokens', async () => {
      // Create a token that's already expired
      const secretKey = new TextEncoder().encode(testSecret);
      const { SignJWT } = await import('jose');
      
      const expiredToken = await new SignJWT({
        userId: 'test',
        username: 'test',
        email: 'test@example.com',
        roles: ['player'],
        sessionId: 'test-session'
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setExpirationTime(Math.floor(Date.now() / 1000) - 3600) // 1 hour ago
        .sign(secretKey);

      const result = await authManager.verifyAccessToken(expiredToken);
      expect(result.valid).toBe(false);
      expect(result.error.toLowerCase()).toContain('exp');
    });

    it('should handle different token signing keys', async () => {
      const otherAuthManager = new AuthenticationManager('different-secret-key-for-testing-purposes');
      
      const tokens = await authManager.createTokensForUser({
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      });

      const result = await otherAuthManager.verifyAccessToken(tokens.accessToken);
      expect(result.valid).toBe(false);
    });
  });

  describe('Authentication Flow', () => {
    beforeEach(async () => {
      // Add test user to mock database
      const { hash, salt } = await PasswordManager.hashPassword('TestPassword123!');
      mockDb.addUser({
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        password_hash: hash,
        password_salt: salt,
        chip_count: 1000,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    });

    it('should authenticate valid credentials', async () => {
      const result = await authManager.authenticate({
        username: 'testuser',
        password: 'TestPassword123!'
      }, mockDb);

      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.user).toMatchObject({
        id: 'user-123',
        username: 'testuser',
        email: 'test@example.com',
        chipCount: 1000
      });
    });

    it('should authenticate with email instead of username', async () => {
      const result = await authManager.authenticate({
        username: 'test@example.com',
        password: 'TestPassword123!'
      }, mockDb);

      expect(result.success).toBe(true);
      expect(result.user).toMatchObject({
        username: 'testuser'
      });
    });

    it('should reject invalid username', async () => {
      const result = await authManager.authenticate({
        username: 'wronguser',
        password: 'TestPassword123!'
      }, mockDb);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
    });

    it('should reject invalid password', async () => {
      const result = await authManager.authenticate({
        username: 'testuser',
        password: 'WrongPassword'
      }, mockDb);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });

    it('should reject missing database', async () => {
      const result = await authManager.authenticate({
        username: 'testuser',
        password: 'TestPassword123!'
      }, null);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not available');
    });

    it('should validate input format', async () => {
      const result1 = await authManager.authenticate({
        username: '',
        password: 'TestPassword123!'
      }, mockDb);

      expect(result1.success).toBe(false);
      expect(result1.error).toBe('Invalid username format');

      const result2 = await authManager.authenticate({
        username: 'testuser',
        password: ''
      }, mockDb);

      expect(result2.success).toBe(false);
      expect(result2.error).toBe('Invalid password format');
    });

    it('should reject excessively long credentials', async () => {
      const result = await authManager.authenticate({
        username: 'a'.repeat(256),
        password: 'TestPassword123!'
      }, mockDb);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Credentials too long');
    });
  });

  describe('Token Refresh', () => {
    it('should refresh valid tokens', async () => {
      const originalTokens = await authManager.createTokensForUser({
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      });

      // Wait a bit to ensure new tokens have different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      const refreshResult = await authManager.refreshTokens(originalTokens.refreshToken);

      expect(refreshResult.success).toBe(true);
      expect(refreshResult.tokens).toBeDefined();
      expect(refreshResult.tokens!.accessToken).not.toBe(originalTokens.accessToken);
    });

    it('should reject invalid refresh tokens', async () => {
      const result = await authManager.refreshTokens('invalid.refresh.token');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should maintain session ID during refresh', async () => {
      const originalTokens = await authManager.createTokensForUser({
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      });

      const originalVerify = await authManager.verifyAccessToken(originalTokens.accessToken);
      const originalSessionId = originalVerify.payload?.sessionId;

      const refreshResult = await authManager.refreshTokens(originalTokens.refreshToken);
      const newVerify = await authManager.verifyAccessToken(refreshResult.tokens!.accessToken);

      expect(newVerify.payload?.sessionId).toBe(originalSessionId);
    });
  });

  describe('Session Management', () => {
    it('should track active sessions', async () => {
      const user = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };

      // Create multiple sessions
      const tokens1 = await authManager.createTokensForUser(user);
      const tokens2 = await authManager.createTokensForUser(user);

      const verify1 = await authManager.verifyAccessToken(tokens1.accessToken);
      const verify2 = await authManager.verifyAccessToken(tokens2.accessToken);

      expect(verify1.payload?.sessionId).not.toBe(verify2.payload?.sessionId);
    });

    it('should revoke specific sessions', async () => {
      const tokens = await authManager.createTokensForUser({
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      });

      const verifyResult = await authManager.verifyAccessToken(tokens.accessToken);
      const sessionId = verifyResult.payload!.sessionId;

      await authManager.revokeSession('user-123', sessionId);

      // After revoking, refresh should fail
      const refreshResult = await authManager.refreshTokens(tokens.refreshToken);
      expect(refreshResult.success).toBe(false);
      expect(refreshResult.error).toBe('Session expired');
    });

    it('should revoke all user sessions', async () => {
      const user = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };

      const tokens1 = await authManager.createTokensForUser(user);
      const tokens2 = await authManager.createTokensForUser(user);

      await authManager.revokeAllSessions('user-123');

      const refresh1 = await authManager.refreshTokens(tokens1.refreshToken);
      const refresh2 = await authManager.refreshTokens(tokens2.refreshToken);

      expect(refresh1.success).toBe(false);
      expect(refresh2.success).toBe(false);
    });
  });
});

describe('PasswordManager', () => {
  describe('Password Hashing', () => {
    it('should hash passwords consistently', async () => {
      const password = 'TestPassword123!';
      const { hash, salt } = await PasswordManager.hashPassword(password);

      expect(hash).toBeDefined();
      expect(salt).toBeDefined();
      expect(hash).toHaveLength(64); // SHA-256 produces 64 hex characters
      expect(salt).toHaveLength(32); // 16 bytes = 32 hex characters
    });

    it('should generate unique salts', async () => {
      const password = 'TestPassword123!';
      const result1 = await PasswordManager.hashPassword(password);
      const result2 = await PasswordManager.hashPassword(password);

      expect(result1.salt).not.toBe(result2.salt);
      expect(result1.hash).not.toBe(result2.hash);
    });

    it('should produce same hash with same salt', async () => {
      const password = 'TestPassword123!';
      const { hash: hash1, salt } = await PasswordManager.hashPassword(password);
      const { hash: hash2 } = await PasswordManager.hashPassword(password, salt);

      expect(hash1).toBe(hash2);
    });

    it('should verify correct passwords', async () => {
      const password = 'TestPassword123!';
      const { hash, salt } = await PasswordManager.hashPassword(password);

      const isValid = await PasswordManager.verifyPassword(password, hash, salt);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect passwords', async () => {
      const { hash, salt } = await PasswordManager.hashPassword('CorrectPassword');

      const isValid = await PasswordManager.verifyPassword('WrongPassword', hash, salt);
      expect(isValid).toBe(false);
    });

    it('should handle special characters in passwords', async () => {
      const specialPassword = 'P@$$w0rd!#$%^&*()_+-=[]{}|;:,.<>?';
      const { hash, salt } = await PasswordManager.hashPassword(specialPassword);

      const isValid = await PasswordManager.verifyPassword(specialPassword, hash, salt);
      expect(isValid).toBe(true);
    });

    it('should handle unicode passwords', async () => {
      const unicodePassword = 'Пароль123🔐';
      const { hash, salt } = await PasswordManager.hashPassword(unicodePassword);

      const isValid = await PasswordManager.verifyPassword(unicodePassword, hash, salt);
      expect(isValid).toBe(true);
    });
  });
});

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(3, 100); // 3 attempts per 100ms
  });

  it('should allow initial attempts', () => {
    expect(rateLimiter.isAllowed('user1')).toBe(true);
    expect(rateLimiter.isAllowed('user1')).toBe(true);
    expect(rateLimiter.isAllowed('user1')).toBe(true);
  });

  it('should block after max attempts', () => {
    // Use up all attempts
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');

    // Should be blocked
    expect(rateLimiter.isAllowed('user1')).toBe(false);
  });

  it('should track attempts per identifier', () => {
    // User 1
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');

    // User 2 should still have all attempts
    expect(rateLimiter.isAllowed('user2')).toBe(true);
    expect(rateLimiter.isAllowed('user2')).toBe(true);
    expect(rateLimiter.isAllowed('user2')).toBe(true);
    expect(rateLimiter.isAllowed('user2')).toBe(false);
  });

  it('should reset after time window', async () => {
    // Use up all attempts
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    expect(rateLimiter.isAllowed('user1')).toBe(false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 150));

    // Should be allowed again
    expect(rateLimiter.isAllowed('user1')).toBe(true);
  });

  it('should report remaining attempts', () => {
    expect(rateLimiter.getRemainingAttempts('user1')).toBe(3);
    
    rateLimiter.isAllowed('user1');
    expect(rateLimiter.getRemainingAttempts('user1')).toBe(2);
    
    rateLimiter.isAllowed('user1');
    expect(rateLimiter.getRemainingAttempts('user1')).toBe(1);
    
    rateLimiter.isAllowed('user1');
    expect(rateLimiter.getRemainingAttempts('user1')).toBe(0);
  });

  it('should provide reset time', () => {
    const before = Date.now();
    rateLimiter.isAllowed('user1');
    
    const resetTime = rateLimiter.getResetTime('user1');
    expect(resetTime).not.toBeNull();
    expect(resetTime!.getTime()).toBeGreaterThan(before);
    expect(resetTime!.getTime()).toBeLessThanOrEqual(before + 100);
  });

  it('should manually reset attempts', () => {
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user1');
    expect(rateLimiter.isAllowed('user1')).toBe(false);

    rateLimiter.reset('user1');
    expect(rateLimiter.isAllowed('user1')).toBe(true);
  });

  it('should cleanup expired records', async () => {
    // Create some records
    rateLimiter.isAllowed('user1');
    rateLimiter.isAllowed('user2');
    rateLimiter.isAllowed('user3');

    // Wait for expiration
    await new Promise(resolve => setTimeout(resolve, 150));

    // Create a new record
    rateLimiter.isAllowed('user4');

    // Cleanup should remove old records
    rateLimiter.cleanup();

    // Old users should have full attempts again
    expect(rateLimiter.getRemainingAttempts('user1')).toBe(3);
    expect(rateLimiter.getRemainingAttempts('user2')).toBe(3);
    expect(rateLimiter.getRemainingAttempts('user3')).toBe(3);
    
    // New user should still have their record
    expect(rateLimiter.getRemainingAttempts('user4')).toBe(2);
  });
});

describe('MFAManager', () => {
  let mfaManager: MFAManager;

  beforeEach(() => {
    mfaManager = new MFAManager();
  });

  it('should generate backup codes', () => {
    const codes = mfaManager.generateBackupCodes('user-123');

    expect(codes).toHaveLength(10);
    codes.forEach(code => {
      expect(code).toMatch(/^[A-Z0-9]{8}$/);
    });

    // All codes should be unique
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(10);
  });

  it('should verify valid backup codes', () => {
    const codes = mfaManager.generateBackupCodes('user-123');
    const firstCode = codes[0];

    expect(mfaManager.verifyBackupCode('user-123', firstCode)).toBe(true);
  });

  it('should reject invalid backup codes', () => {
    mfaManager.generateBackupCodes('user-123');

    expect(mfaManager.verifyBackupCode('user-123', 'INVALID1')).toBe(false);
  });

  it('should prevent code reuse', () => {
    const codes = mfaManager.generateBackupCodes('user-123');
    const firstCode = codes[0];

    // First use should succeed
    expect(mfaManager.verifyBackupCode('user-123', firstCode)).toBe(true);
    
    // Second use should fail
    expect(mfaManager.verifyBackupCode('user-123', firstCode)).toBe(false);
  });

  it('should isolate codes per user', () => {
    const user1Codes = mfaManager.generateBackupCodes('user-123');
    const user2Codes = mfaManager.generateBackupCodes('user-456');

    // User 1's code shouldn't work for user 2
    expect(mfaManager.verifyBackupCode('user-456', user1Codes[0])).toBe(false);
    
    // Each user's codes should work for them
    expect(mfaManager.verifyBackupCode('user-123', user1Codes[0])).toBe(true);
    expect(mfaManager.verifyBackupCode('user-456', user2Codes[0])).toBe(true);
  });

  it('should generate specified number of codes', () => {
    const codes = mfaManager.generateBackupCodes('user-123', 5);
    expect(codes).toHaveLength(5);
  });
});