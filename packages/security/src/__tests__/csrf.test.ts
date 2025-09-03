import { CsrfProtection, CsrfStrategy, createCsrfProtection } from '../middleware/csrf';

describe('CSRF Protection', () => {
  describe('CsrfProtection', () => {
    it('should generate tokens for different strategies', async () => {
      const strategies = [
        CsrfStrategy.SYNCHRONIZER_TOKEN,
        CsrfStrategy.DOUBLE_SUBMIT,
        CsrfStrategy.ENCRYPTED_TOKEN
      ];

      for (const strategy of strategies) {
        const csrf = new CsrfProtection({
          strategy,
          secretKey: 'test-secret-key-123'
        });

        const { token, expiresAt } = await csrf.generateToken();

        expect(token).toBeTruthy();
        expect(token.length).toBeGreaterThan(20);
        expect(expiresAt).toBeGreaterThan(Date.now());
      }
    });

    it('should validate tokens correctly', async () => {
      const csrf = new CsrfProtection({
        strategy: CsrfStrategy.DOUBLE_SUBMIT,
        secretKey: 'test-secret'
      });

      const { token } = await csrf.generateToken();
      
      // Valid token
      expect(await csrf.validateToken(token, undefined, token)).toBe(true);
      
      // Invalid token
      expect(await csrf.validateToken('invalid-token', undefined, token)).toBe(false);
      
      // Missing token
      expect(await csrf.validateToken('', undefined, token)).toBe(false);
    });

    describe('middleware', () => {
      let csrf: CsrfProtection;
      let middleware: any;

      beforeEach(() => {
        csrf = new CsrfProtection({
          strategy: CsrfStrategy.DOUBLE_SUBMIT,
          secretKey: 'test-secret',
          headerName: 'X-CSRF-Token',
          cookieName: 'csrf-token'
        });
        middleware = csrf.middleware();
      });

      it('should skip CSRF check for safe methods', async () => {
        const methods = ['GET', 'HEAD', 'OPTIONS'];
        
        for (const method of methods) {
          const request = new Request('https://example.com/api', { method });
          const ctx = {} as any;
          const next = jest.fn().mockResolvedValue(new Response('OK'));

          const response = await middleware(request, ctx, next);

          expect(next).toHaveBeenCalled();
          expect(response.status).toBe(200);
        }
      });

      it('should skip CSRF check for configured routes', async () => {
        csrf = new CsrfProtection({
          strategy: CsrfStrategy.DOUBLE_SUBMIT,
          secretKey: 'test-secret',
          skipRoutes: ['/api/public', '/webhook']
        });
        middleware = csrf.middleware();

        const request = new Request('https://example.com/api/public', { 
          method: 'POST' 
        });
        const ctx = {} as any;
        const next = jest.fn().mockResolvedValue(new Response('OK'));

        const response = await middleware(request, ctx, next);

        expect(next).toHaveBeenCalled();
        expect(response.status).toBe(200);
      });

      it('should reject requests without CSRF token', async () => {
        const request = new Request('https://example.com/api', { 
          method: 'POST' 
        });
        const ctx = {} as any;
        const next = jest.fn();

        const response = await middleware(request, ctx, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toBe(403);
        
        const body = await response.json();
        expect(body.error).toBe('CSRF Protection');
      });

      it('should accept requests with valid CSRF token', async () => {
        const { token } = await csrf.generateToken();
        
        const headers = new Headers({
          'X-CSRF-Token': token,
          'Cookie': `csrf-token=${token}`
        });
        
        const request = new Request('https://example.com/api', { 
          method: 'POST',
          headers
        });
        const ctx = {} as any;
        const next = jest.fn().mockResolvedValue(new Response('OK'));

        const response = await middleware(request, ctx, next);

        expect(next).toHaveBeenCalled();
        expect(response.status).toBe(200);
      });
    });

    it('should add token to response', async () => {
      const csrf = new CsrfProtection({
        strategy: CsrfStrategy.DOUBLE_SUBMIT,
        secretKey: 'test-secret',
        headerName: 'X-CSRF-Token',
        cookieName: 'csrf-token'
      });

      const originalResponse = new Response('OK');
      const response = await csrf.addTokenToResponse(originalResponse);

      expect(response.headers.get('X-CSRF-Token')).toBeTruthy();
      
      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('csrf-token=');
      expect(setCookie).toContain('SameSite=Strict');
      expect(setCookie).toContain('Secure');
      expect(setCookie).toContain('HttpOnly');
    });
  });

  describe('createCsrfProtection helper', () => {
    it('should create CSRF protection with default settings', () => {
      const csrf = createCsrfProtection('my-secret');
      expect(csrf).toBeInstanceOf(CsrfProtection);
    });

    it('should allow overriding default settings', () => {
      const csrf = createCsrfProtection('my-secret', {
        strategy: CsrfStrategy.ENCRYPTED_TOKEN,
        tokenLifetime: 7200
      });
      expect(csrf).toBeInstanceOf(CsrfProtection);
    });
  });
});