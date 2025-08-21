import { describe, it, expect, beforeEach } from '@jest/globals';
import { CSRFProtection, DoubleSubmitCSRF, EncryptedTokenCSRF } from '../csrf/protection';

describe('CSRF Protection', () => {
  describe('CSRFProtection (Synchronizer Token)', () => {
    let csrf: CSRFProtection;

    beforeEach(() => {
      csrf = new CSRFProtection({
        secret: 'test-secret-key-1234567890',
      });
    });

    it('should generate token response with cookie', async () => {
      const response = await csrf.generateTokenResponse();
      
      expect(response.status).toBe(200);
      
      const body = await response.json();
      expect(body.csrfToken).toBeTruthy();
      expect(body.csrfToken.length).toBe(32);
      
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('csrf-token=');
      expect(setCookie).toContain('HttpOnly');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('SameSite=strict');
    });

    it('should skip CSRF check for safe methods', async () => {
      const getRequest = new Request('https://example.com/api/data', {
        method: 'GET',
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await csrf.middleware(getRequest, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should skip CSRF check for exempted routes', async () => {
      const csrfWithSkip = new CSRFProtection({
        secret: 'test-secret',
        skipRoutes: ['/api/public'],
      });
      
      const request = new Request('https://example.com/api/public/data', {
        method: 'POST',
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await csrfWithSkip.middleware(request, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should block POST without CSRF token', async () => {
      const request = new Request('https://example.com/api/update', {
        method: 'POST',
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await csrf.middleware(request, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(await response.text()).toBe('CSRF token missing');
    });

    it('should block POST with invalid CSRF token', async () => {
      const request = new Request('https://example.com/api/update', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'invalid-token',
          'Cookie': 'csrf-token=different-hash',
        },
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await csrf.middleware(request, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
      expect(await response.text()).toBe('CSRF token invalid');
    });

    it('should allow POST with valid CSRF token', async () => {
      // Generate token first
      const tokenResponse = await csrf.generateTokenResponse();
      const { csrfToken } = await tokenResponse.json();
      const setCookie = tokenResponse.headers.get('Set-Cookie')!;
      const cookieValue = setCookie.match(/csrf-token=([^;]+)/)?.[1];
      
      const request = new Request('https://example.com/api/update', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
          'Cookie': `csrf-token=${cookieValue}`,
        },
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await csrf.middleware(request, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });

  describe('DoubleSubmitCSRF', () => {
    let csrf: DoubleSubmitCSRF;

    beforeEach(() => {
      csrf = new DoubleSubmitCSRF();
    });

    it('should set CSRF cookie on GET request', async () => {
      const request = new Request('https://example.com/page');
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      
      const response = await csrf.middleware(request, next);
      
      expect(response.status).toBe(200);
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('csrf-token=');
    });

    it('should validate double-submit pattern', async () => {
      const token = 'test-token-123';
      
      const request = new Request('https://example.com/api/action', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': token,
          'Cookie': `csrf-token=${token}`,
        },
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await csrf.middleware(request, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should reject mismatched tokens', async () => {
      const request = new Request('https://example.com/api/action', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': 'token-in-header',
          'Cookie': 'csrf-token=different-token',
        },
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await csrf.middleware(request, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
    });
  });

  describe('EncryptedTokenCSRF', () => {
    let csrf: EncryptedTokenCSRF;

    beforeEach(() => {
      csrf = new EncryptedTokenCSRF('a-very-secret-key-that-is-at-least-32-bytes-long');
    });

    it('should generate encrypted token for user', async () => {
      const token = await csrf.generateToken('user123');
      
      expect(token).toBeTruthy();
      expect(token.length).toBeGreaterThan(20);
      // Should be base64url encoded
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should validate token for correct user', async () => {
      const userId = 'user456';
      const token = await csrf.generateToken(userId);
      
      const isValid = await csrf.validateToken(token, userId);
      expect(isValid).toBe(true);
    });

    it('should reject token for wrong user', async () => {
      const token = await csrf.generateToken('user789');
      
      const isValid = await csrf.validateToken(token, 'different-user');
      expect(isValid).toBe(false);
    });

    it('should reject expired tokens', async () => {
      const userId = 'user999';
      
      // Mock time to be in the past when token was created
      const originalNow = Date.now;
      Date.now = jest.fn().mockReturnValue(originalNow() - 6 * 60 * 1000); // 6 minutes ago
      
      const token = await csrf.generateToken(userId);
      
      // Restore current time
      Date.now = originalNow;
      
      const isValid = await csrf.validateToken(token, userId);
      expect(isValid).toBe(false);
    });

    it('should reject tampered tokens', async () => {
      const userId = 'user111';
      const token = await csrf.generateToken(userId);
      
      // Tamper with the token
      const tamperedToken = token.slice(0, -2) + 'XX';
      
      const isValid = await csrf.validateToken(tamperedToken, userId);
      expect(isValid).toBe(false);
    });

    it('should handle decryption errors gracefully', async () => {
      const isValid = await csrf.validateToken('invalid-base64!@#', 'user');
      expect(isValid).toBe(false);
    });
  });
});