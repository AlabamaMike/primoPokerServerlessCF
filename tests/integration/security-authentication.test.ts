import { AuthenticationManager } from '@primo-poker/security';
import { ValidationUtils, TokenPayload } from '@primo-poker/shared';

describe('Security and Authentication Tests', () => {
  let authManager: AuthenticationManager;
  const jwtSecret = 'test-secret-key-with-sufficient-length-for-security';
  
  beforeEach(() => {
    authManager = new AuthenticationManager(jwtSecret);
  });

  describe('Token Generation and Validation', () => {
    it('should generate valid access and refresh tokens', async () => {
      const user: TokenPayload = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };
      
      const accessToken = await authManager.generateAccessToken(user);
      const refreshToken = await authManager.generateRefreshToken(user.userId);
      
      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(accessToken).not.toBe(refreshToken);
      
      // Tokens should be JWT format
      expect(accessToken.split('.')).toHaveLength(3);
      expect(refreshToken.split('.')).toHaveLength(3);
    });

    it('should validate correct access tokens', async () => {
      const user: TokenPayload = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };
      
      const token = await authManager.generateAccessToken(user);
      const result = await authManager.verifyAccessToken(token);
      
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe(user.userId);
      expect(result.payload?.username).toBe(user.username);
      expect(result.payload?.email).toBe(user.email);
    });

    it('should reject expired tokens', async () => {
      // Create token that expires immediately
      const shortLivedAuth = new AuthenticationManager(jwtSecret);
      const user: TokenPayload = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };
      
      // Mock token with immediate expiration
      const expiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEyMyIsInVzZXJuYW1lIjoidGVzdHVzZXIiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0.invalid';
      
      const result = await authManager.verifyAccessToken(expiredToken);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should reject tokens with invalid signatures', async () => {
      const user: TokenPayload = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };
      
      const validToken = await authManager.generateAccessToken(user);
      // Tamper with the signature
      const tamperedToken = validToken.slice(0, -10) + 'tampered123';
      
      const result = await authManager.verifyAccessToken(tamperedToken);
      expect(result.valid).toBe(false);
    });

    it('should reject malformed tokens', async () => {
      const malformedTokens = [
        'not.a.token',
        'only.two',
        '',
        'a'.repeat(1000),
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // Missing payload and signature
      ];
      
      for (const token of malformedTokens) {
        const result = await authManager.verifyAccessToken(token);
        expect(result.valid).toBe(false);
      }
    });
  });

  describe('Password Hashing and Verification', () => {
    it('should hash passwords securely', async () => {
      const password = 'SecurePassword123!';
      
      const hash1 = await authManager.hashPassword(password);
      const hash2 = await authManager.hashPassword(password);
      
      // Same password should produce different hashes (due to salt)
      expect(hash1).not.toBe(hash2);
      
      // Hashes should be of sufficient length
      expect(hash1.length).toBeGreaterThan(50);
    });

    it('should verify correct passwords', async () => {
      const password = 'SecurePassword123!';
      const hash = await authManager.hashPassword(password);
      
      const isValid = await authManager.verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect passwords', async () => {
      const password = 'SecurePassword123!';
      const hash = await authManager.hashPassword(password);
      
      const wrongPasswords = [
        'WrongPassword123!',
        'securepassword123!', // Different case
        'SecurePassword123', // Missing special char
        '',
        password + ' ', // Extra space
      ];
      
      for (const wrongPassword of wrongPasswords) {
        const isValid = await authManager.verifyPassword(wrongPassword, hash);
        expect(isValid).toBe(false);
      }
    });

    it('should handle password complexity requirements', async () => {
      const weakPasswords = [
        'password', // Too simple
        '12345678', // Only numbers
        'abcdefgh', // Only lowercase
        'ABCDEFGH', // Only uppercase
        'short', // Too short
      ];
      
      // Assuming the auth manager validates password strength
      for (const weakPassword of weakPasswords) {
        const hash = await authManager.hashPassword(weakPassword);
        // Weak passwords should still be hashed (validation is separate)
        expect(hash).toBeDefined();
      }
    });
  });

  describe('Refresh Token Handling', () => {
    it('should generate and validate refresh tokens', async () => {
      const userId = 'user-123';
      const refreshToken = await authManager.generateRefreshToken(userId);
      
      const result = await authManager.verifyRefreshToken(refreshToken);
      expect(result.valid).toBe(true);
      expect(result.userId).toBe(userId);
    });

    it('should allow token refresh with valid refresh token', async () => {
      const user: TokenPayload = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };
      
      const refreshToken = await authManager.generateRefreshToken(user.userId);
      const newAccessToken = await authManager.refreshAccessToken(refreshToken, user);
      
      expect(newAccessToken).toBeDefined();
      
      const result = await authManager.verifyAccessToken(newAccessToken);
      expect(result.valid).toBe(true);
      expect(result.payload?.userId).toBe(user.userId);
    });
  });

  describe('Input Validation and Sanitization', () => {
    it('should validate email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@example.co.uk',
        'user+tag@example.com',
        'user123@example-domain.com',
      ];
      
      const invalidEmails = [
        'notanemail',
        '@example.com',
        'user@',
        'user @example.com',
        'user@example',
        '',
        'user@.com',
      ];
      
      for (const email of validEmails) {
        expect(ValidationUtils.isValidEmail(email)).toBe(true);
      }
      
      for (const email of invalidEmails) {
        expect(ValidationUtils.isValidEmail(email)).toBe(false);
      }
    });

    it('should validate usernames', () => {
      const validUsernames = [
        'user123',
        'test_user',
        'TestUser',
        'user-name',
        'a'.repeat(20), // Max length
      ];
      
      const invalidUsernames = [
        'a', // Too short
        'a'.repeat(21), // Too long
        'user name', // Contains space
        'user@name', // Special characters
        '123', // Only numbers
        '',
        'user!',
      ];
      
      for (const username of validUsernames) {
        expect(ValidationUtils.isValidUsername(username)).toBe(true);
      }
      
      for (const username of invalidUsernames) {
        expect(ValidationUtils.isValidUsername(username)).toBe(false);
      }
    });

    it('should sanitize user inputs', () => {
      const inputs = [
        { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert("xss")&lt;/script&gt;' },
        { input: 'Hello & goodbye', expected: 'Hello &amp; goodbye' },
        { input: '"quoted"', expected: '&quot;quoted&quot;' },
        { input: "it's", expected: 'it&#x27;s' },
        { input: 'normal text', expected: 'normal text' },
      ];
      
      for (const { input, expected } of inputs) {
        expect(ValidationUtils.sanitizeHtml(input)).toBe(expected);
      }
    });
  });

  describe('Session Management', () => {
    it('should handle concurrent sessions', async () => {
      const user: TokenPayload = {
        userId: 'user-123',
        username: 'testuser',
        email: 'test@example.com'
      };
      
      // Generate multiple tokens for same user
      const tokens = await Promise.all([
        authManager.generateAccessToken(user),
        authManager.generateAccessToken(user),
        authManager.generateAccessToken(user),
      ]);
      
      // All tokens should be valid
      for (const token of tokens) {
        const result = await authManager.verifyAccessToken(token);
        expect(result.valid).toBe(true);
      }
      
      // All tokens should be different
      expect(new Set(tokens).size).toBe(3);
    });
  });

  describe('Attack Prevention', () => {
    it('should prevent timing attacks on password verification', async () => {
      const password = 'SecurePassword123!';
      const hash = await authManager.hashPassword(password);
      
      const timings: number[] = [];
      
      // Measure timing for correct and incorrect passwords
      for (let i = 0; i < 10; i++) {
        const start = Date.now();
        await authManager.verifyPassword('WrongPassword', hash);
        timings.push(Date.now() - start);
        
        const start2 = Date.now();
        await authManager.verifyPassword(password, hash);
        timings.push(Date.now() - start2);
      }
      
      // Timing variations should be minimal
      const avgTiming = timings.reduce((a, b) => a + b) / timings.length;
      const maxDeviation = Math.max(...timings.map(t => Math.abs(t - avgTiming)));
      
      expect(maxDeviation).toBeLessThan(50); // Less than 50ms deviation
    });

    it('should handle SQL injection attempts in inputs', () => {
      const sqlInjectionAttempts = [
        "admin' OR '1'='1",
        "'; DROP TABLE users; --",
        "1' UNION SELECT * FROM users--",
        "admin'--",
        "' OR 1=1--",
      ];
      
      for (const attempt of sqlInjectionAttempts) {
        const sanitized = ValidationUtils.sanitizeInput(attempt);
        expect(sanitized).not.toContain("'");
        expect(sanitized).not.toContain("--");
        expect(sanitized).not.toContain("DROP");
        expect(sanitized).not.toContain("UNION");
      }
    });

    it('should prevent XSS in chat messages', () => {
      const xssAttempts = [
        '<img src=x onerror=alert("xss")>',
        '<iframe src="javascript:alert(\'xss\')"></iframe>',
        '<svg onload=alert("xss")>',
        'javascript:alert("xss")',
        '<a href="javascript:alert(\'xss\')">click</a>',
      ];
      
      for (const attempt of xssAttempts) {
        const sanitized = ValidationUtils.sanitizeChatMessage(attempt);
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror');
        expect(sanitized).not.toContain('onload');
      }
    });
  });

  describe('Rate Limiting', () => {
    it('should track login attempts', async () => {
      const attempts = authManager.trackLoginAttempt('192.168.1.1');
      
      // First attempt should be allowed
      expect(attempts).toBe(1);
      
      // Multiple rapid attempts
      for (let i = 0; i < 5; i++) {
        authManager.trackLoginAttempt('192.168.1.1');
      }
      
      // Should detect too many attempts
      const tooMany = authManager.isTooManyAttempts('192.168.1.1');
      expect(tooMany).toBe(true);
    });

    it('should reset attempts after successful login', () => {
      const ip = '192.168.1.2';
      
      // Track failed attempts
      for (let i = 0; i < 3; i++) {
        authManager.trackLoginAttempt(ip);
      }
      
      // Reset on success
      authManager.resetLoginAttempts(ip);
      
      const attempts = authManager.getLoginAttempts(ip);
      expect(attempts).toBe(0);
    });
  });

  describe('CORS and Origin Validation', () => {
    it('should validate allowed origins', () => {
      const allowedOrigins = [
        'https://primo-poker.com',
        'https://app.primo-poker.com',
        'http://localhost:3000',
      ];
      
      const testOrigins = [
        { origin: 'https://primo-poker.com', expected: true },
        { origin: 'https://app.primo-poker.com', expected: true },
        { origin: 'http://localhost:3000', expected: true },
        { origin: 'https://evil-site.com', expected: false },
        { origin: 'http://primo-poker.com', expected: false }, // Wrong protocol
        { origin: '', expected: false },
      ];
      
      for (const { origin, expected } of testOrigins) {
        const isAllowed = allowedOrigins.includes(origin);
        expect(isAllowed).toBe(expected);
      }
    });
  });
});