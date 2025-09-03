import { 
  SecurityHeaders, 
  SecurityHeaderPresets,
  CorsHeaders,
  validateContentType
} from '../middleware/security-headers';

describe('Security Headers', () => {
  describe('SecurityHeaders', () => {
    it('should apply default security headers', () => {
      const headers = new SecurityHeaders({});
      const response = new Response('OK');
      
      const securedResponse = headers.applyHeaders(response);
      
      // Should have default headers but not set any by default
      expect(securedResponse).toBeInstanceOf(Response);
    });

    it('should apply configured security headers', () => {
      const headers = new SecurityHeaders({
        contentSecurityPolicy: "default-src 'self'",
        strictTransportSecurity: 'max-age=31536000',
        xContentTypeOptions: 'nosniff',
        xFrameOptions: 'DENY',
        referrerPolicy: 'no-referrer'
      });
      
      const response = new Response('OK');
      const securedResponse = headers.applyHeaders(response);
      
      expect(securedResponse.headers.get('Content-Security-Policy')).toBe("default-src 'self'");
      expect(securedResponse.headers.get('Strict-Transport-Security')).toBe('max-age=31536000');
      expect(securedResponse.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(securedResponse.headers.get('X-Frame-Options')).toBe('DENY');
      expect(securedResponse.headers.get('Referrer-Policy')).toBe('no-referrer');
    });

    it('should build CSP from options object', () => {
      const headers = new SecurityHeaders({
        contentSecurityPolicy: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          upgradeInsecureRequests: true
        }
      });
      
      const response = new Response('OK');
      const securedResponse = headers.applyHeaders(response);
      
      const csp = securedResponse.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
      expect(csp).toContain("img-src 'self' data: https:");
      expect(csp).toContain("upgrade-insecure-requests");
    });

    it('should build HSTS from options object', () => {
      const headers = new SecurityHeaders({
        strictTransportSecurity: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      });
      
      const response = new Response('OK');
      const securedResponse = headers.applyHeaders(response);
      
      expect(securedResponse.headers.get('Strict-Transport-Security'))
        .toBe('max-age=31536000; includeSubDomains; preload');
    });

    it('should remove specified headers', () => {
      const headers = new SecurityHeaders({
        removeHeaders: ['Server', 'X-Powered-By']
      });
      
      const response = new Response('OK', {
        headers: {
          'Server': 'nginx',
          'X-Powered-By': 'Express',
          'Content-Type': 'text/plain'
        }
      });
      
      const securedResponse = headers.applyHeaders(response);
      
      expect(securedResponse.headers.get('Server')).toBeNull();
      expect(securedResponse.headers.get('X-Powered-By')).toBeNull();
      expect(securedResponse.headers.get('Content-Type')).toBe('text/plain');
    });

    it('should add custom headers', () => {
      const headers = new SecurityHeaders({
        customHeaders: {
          'X-Custom-Header': 'value',
          'X-Request-ID': '12345'
        }
      });
      
      const response = new Response('OK');
      const securedResponse = headers.applyHeaders(response);
      
      expect(securedResponse.headers.get('X-Custom-Header')).toBe('value');
      expect(securedResponse.headers.get('X-Request-ID')).toBe('12345');
    });

    describe('middleware', () => {
      it('should apply headers through middleware', async () => {
        const headers = new SecurityHeaders({
          xFrameOptions: 'DENY'
        });
        
        const middleware = headers.middleware();
        const request = new Request('https://example.com');
        const ctx = {} as any;
        const next = jest.fn().mockResolvedValue(new Response('OK'));
        
        const response = await middleware(request, ctx, next);
        
        expect(next).toHaveBeenCalled();
        expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      });

      it('should skip configured paths', async () => {
        const headers = new SecurityHeaders({
          xFrameOptions: 'DENY',
          skipPaths: ['/public', '/assets']
        });
        
        const middleware = headers.middleware();
        const request = new Request('https://example.com/public/file.js');
        const ctx = {} as any;
        const next = jest.fn().mockResolvedValue(new Response('OK'));
        
        const response = await middleware(request, ctx, next);
        
        expect(next).toHaveBeenCalled();
        expect(response.headers.get('X-Frame-Options')).toBeNull();
      });
    });
  });

  describe('SecurityHeaderPresets', () => {
    it('should have appropriate presets for different endpoints', () => {
      expect(SecurityHeaderPresets.API.contentSecurityPolicy).toEqual({
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"]
      });
      
      expect(SecurityHeaderPresets.WEBSOCKET.xFrameOptions).toBe('DENY');
      
      expect(SecurityHeaderPresets.STATIC.contentSecurityPolicy).toHaveProperty('imgSrc');
      
      expect(SecurityHeaderPresets.ADMIN.xFrameOptions).toBe('SAMEORIGIN');
    });
  });

  describe('CorsHeaders', () => {
    it('should apply CORS headers for allowed origins', () => {
      const cors = new CorsHeaders({
        origin: 'https://example.com',
        credentials: true,
        methods: ['GET', 'POST'],
        allowedHeaders: ['Content-Type', 'Authorization']
      });
      
      const request = new Request('https://api.example.com', {
        headers: { 'Origin': 'https://example.com' }
      });
      const response = new Response('OK');
      
      const corsResponse = cors.applyCors(request, response);
      
      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      expect(corsResponse.headers.get('Access-Control-Allow-Credentials')).toBe('true');
    });

    it('should handle preflight requests', () => {
      const cors = new CorsHeaders({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type'],
        maxAge: 86400
      });
      
      const request = new Request('https://api.example.com', {
        method: 'OPTIONS',
        headers: { 'Origin': 'https://example.com' }
      });
      const response = new Response('OK');
      
      const corsResponse = cors.applyCors(request, response);
      
      expect(corsResponse.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE');
      expect(corsResponse.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
      expect(corsResponse.headers.get('Access-Control-Max-Age')).toBe('86400');
    });

    it('should not add CORS headers for disallowed origins', () => {
      const cors = new CorsHeaders({
        origin: 'https://allowed.com'
      });
      
      const request = new Request('https://api.example.com', {
        headers: { 'Origin': 'https://notallowed.com' }
      });
      const response = new Response('OK');
      
      const corsResponse = cors.applyCors(request, response);
      
      expect(corsResponse.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle origin function', () => {
      const cors = new CorsHeaders({
        origin: (origin) => origin.endsWith('.example.com')
      });
      
      const request1 = new Request('https://api.example.com', {
        headers: { 'Origin': 'https://app.example.com' }
      });
      const request2 = new Request('https://api.example.com', {
        headers: { 'Origin': 'https://evil.com' }
      });
      
      const response = new Response('OK');
      
      const corsResponse1 = cors.applyCors(request1, response);
      const corsResponse2 = cors.applyCors(request2, response);
      
      expect(corsResponse1.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
      expect(corsResponse2.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });
  });

  describe('validateContentType', () => {
    it('should pass requests with valid content type', async () => {
      const middleware = validateContentType(['application/json', 'text/plain']);
      
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const ctx = {} as any;
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      
      const response = await middleware(request, ctx, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should reject requests without content type', async () => {
      const middleware = validateContentType(['application/json']);
      
      const request = new Request('https://example.com', {
        method: 'POST'
      });
      const ctx = {} as any;
      const next = jest.fn();
      
      const response = await middleware(request, ctx, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(400);
      
      const body = await response.json();
      expect(body.error).toBe('Content-Type header is required');
    });

    it('should reject requests with invalid content type', async () => {
      const middleware = validateContentType(['application/json']);
      
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'text/html' }
      });
      const ctx = {} as any;
      const next = jest.fn();
      
      const response = await middleware(request, ctx, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(415);
      
      const body = await response.json();
      expect(body.error).toBe('Invalid Content-Type');
      expect(body.expected).toEqual(['application/json']);
      expect(body.received).toBe('text/html');
    });

    it('should handle content type with charset', async () => {
      const middleware = validateContentType(['application/json']);
      
      const request = new Request('https://example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
      const ctx = {} as any;
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      
      const response = await middleware(request, ctx, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });
  });
});