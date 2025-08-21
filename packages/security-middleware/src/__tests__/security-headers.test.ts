import { describe, it, expect, beforeEach } from '@jest/globals';
import { 
  SecurityHeaders, 
  SecurityHeaderPresets,
  ContentTypeValidator 
} from '../headers/security-headers';

describe('Security Headers', () => {
  describe('SecurityHeaders', () => {
    it('should apply default security headers', () => {
      const headers = new SecurityHeaders();
      const response = new Response('OK');
      
      headers.apply(response);
      
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains; preload');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
      expect(response.headers.get('X-XSS-Protection')).toBe('0');
      expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
      expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
      expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    });

    it('should apply custom CSP header', () => {
      const headers = new SecurityHeaders({
        csp: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'wss:'],
          reportUri: '/csp-report',
          upgradeInsecureRequests: true,
        },
      });
      
      const response = new Response('OK');
      headers.apply(response);
      
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("img-src 'self' data: https:");
      expect(csp).toContain("connect-src 'self' wss:");
      expect(csp).toContain('report-uri /csp-report');
      expect(csp).toContain('upgrade-insecure-requests');
    });

    it('should apply string CSP header', () => {
      const headers = new SecurityHeaders({
        csp: "default-src 'none'; frame-ancestors 'none';",
      });
      
      const response = new Response('OK');
      headers.apply(response);
      
      expect(response.headers.get('Content-Security-Policy')).toBe("default-src 'none'; frame-ancestors 'none';");
    });

    it('should configure HSTS options', () => {
      const headers = new SecurityHeaders({
        hsts: {
          maxAge: 63072000, // 2 years
          includeSubDomains: false,
          preload: false,
        },
      });
      
      const response = new Response('OK');
      headers.apply(response);
      
      expect(response.headers.get('Strict-Transport-Security')).toBe('max-age=63072000');
    });

    it('should disable HSTS when false', () => {
      const headers = new SecurityHeaders({
        hsts: false,
      });
      
      const response = new Response('OK');
      headers.apply(response);
      
      expect(response.headers.get('Strict-Transport-Security')).toBeNull();
    });

    it('should apply Permissions-Policy header', () => {
      const headers = new SecurityHeaders({
        permissionsPolicy: {
          camera: [],
          microphone: [],
          geolocation: ['self'],
          payment: ['self', 'https://payment.example.com'],
          usb: ['*'],
        },
      });
      
      const response = new Response('OK');
      headers.apply(response);
      
      const policy = response.headers.get('Permissions-Policy');
      expect(policy).toContain('camera=()');
      expect(policy).toContain('microphone=()');
      expect(policy).toContain('geolocation=("self")');
      expect(policy).toContain('payment=("self" "https://payment.example.com")');
      expect(policy).toContain('usb=(*)');
    });

    it('should apply custom headers', () => {
      const headers = new SecurityHeaders({
        customHeaders: {
          'X-Custom-Header': 'custom-value',
          'X-Another-Header': 'another-value',
        },
      });
      
      const response = new Response('OK');
      headers.apply(response);
      
      expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
      expect(response.headers.get('X-Another-Header')).toBe('another-value');
    });
  });

  describe('CORS handling', () => {
    it('should handle CORS with string origin', () => {
      const headers = new SecurityHeaders({
        cors: {
          origin: 'https://example.com',
          credentials: true,
          exposedHeaders: ['X-Total-Count'],
        },
      });
      
      const request = new Request('https://api.example.com/data', {
        headers: { Origin: 'https://example.com' },
      });
      const response = new Response('OK');
      
      headers.apply(response, request);
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe('true');
      expect(response.headers.get('Access-Control-Expose-Headers')).toBe('X-Total-Count');
    });

    it('should handle CORS with wildcard origin', () => {
      const headers = new SecurityHeaders({
        cors: { origin: '*' },
      });
      
      const request = new Request('https://api.example.com/data', {
        headers: { Origin: 'https://any-site.com' },
      });
      const response = new Response('OK');
      
      headers.apply(response, request);
      
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://any-site.com');
    });

    it('should handle CORS with array of origins', () => {
      const headers = new SecurityHeaders({
        cors: {
          origin: ['https://app1.com', 'https://app2.com'],
        },
      });
      
      const request1 = new Request('https://api.example.com/data', {
        headers: { Origin: 'https://app1.com' },
      });
      const response1 = new Response('OK');
      headers.apply(response1, request1);
      expect(response1.headers.get('Access-Control-Allow-Origin')).toBe('https://app1.com');
      
      const request2 = new Request('https://api.example.com/data', {
        headers: { Origin: 'https://app3.com' },
      });
      const response2 = new Response('OK');
      headers.apply(response2, request2);
      expect(response2.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('should handle CORS preflight requests', () => {
      const headers = new SecurityHeaders({
        cors: {
          origin: '*',
          methods: ['GET', 'POST', 'PUT', 'DELETE'],
          allowedHeaders: ['Content-Type', 'Authorization'],
          maxAge: 86400,
        },
      });
      
      const request = new Request('https://api.example.com/data', {
        method: 'OPTIONS',
        headers: { Origin: 'https://example.com' },
      });
      const response = new Response('OK');
      
      headers.apply(response, request);
      
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, PUT, DELETE');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
      expect(response.headers.get('Access-Control-Max-Age')).toBe('86400');
    });
  });

  describe('Security Header Presets', () => {
    it('should apply API preset', () => {
      const headers = SecurityHeaderPresets.api();
      const response = new Response('OK');
      
      headers.apply(response);
      
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("default-src 'none'");
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    });

    it('should apply WebSocket preset', () => {
      const headers = SecurityHeaderPresets.websocket();
      const request = new Request('https://api.example.com/ws', {
        headers: { Origin: 'https://app.example.com' },
      });
      const response = new Response('OK');
      
      headers.apply(response, request);
      
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("connect-src 'self' wss:");
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });

    it('should apply static preset', () => {
      const headers = SecurityHeaderPresets.static();
      const response = new Response('OK');
      
      headers.apply(response);
      
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("img-src 'self' data: https:");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    });

    it('should apply admin preset', () => {
      const headers = SecurityHeaderPresets.admin();
      const response = new Response('OK');
      
      headers.apply(response);
      
      const csp = response.headers.get('Content-Security-Policy');
      expect(csp).toContain("frame-ancestors 'none'");
      expect(response.headers.get('Referrer-Policy')).toBe('same-origin');
    });
  });

  describe('Security Headers Middleware', () => {
    it('should work as middleware', async () => {
      const headers = new SecurityHeaders({
        frameOptions: 'SAMEORIGIN',
      });
      
      const middleware = headers.middleware();
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      
      const request = new Request('https://example.com');
      const response = await middleware(request, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');
    });
  });
});

describe('Content Type Validator', () => {
  describe('validation', () => {
    it('should validate exact content type match', () => {
      const validator = new ContentTypeValidator(['application/json']);
      
      const validRequest = new Request('https://api.example.com', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(validator.validate(validRequest)).toBe(true);
      
      const invalidRequest = new Request('https://api.example.com', {
        headers: { 'Content-Type': 'text/plain' },
      });
      expect(validator.validate(invalidRequest)).toBe(false);
    });

    it('should handle content type with charset', () => {
      const validator = new ContentTypeValidator(['application/json']);
      
      const request = new Request('https://api.example.com', {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      });
      
      expect(validator.validate(request)).toBe(true);
    });

    it('should support wildcard content types', () => {
      const validator = new ContentTypeValidator(['application/*', 'text/*']);
      
      const jsonRequest = new Request('https://api.example.com', {
        headers: { 'Content-Type': 'application/json' },
      });
      expect(validator.validate(jsonRequest)).toBe(true);
      
      const xmlRequest = new Request('https://api.example.com', {
        headers: { 'Content-Type': 'application/xml' },
      });
      expect(validator.validate(xmlRequest)).toBe(true);
      
      const textRequest = new Request('https://api.example.com', {
        headers: { 'Content-Type': 'text/plain' },
      });
      expect(validator.validate(textRequest)).toBe(true);
      
      const imageRequest = new Request('https://api.example.com', {
        headers: { 'Content-Type': 'image/png' },
      });
      expect(validator.validate(imageRequest)).toBe(false);
    });

    it('should handle missing content type based on strict mode', () => {
      const strictValidator = new ContentTypeValidator(['application/json'], true);
      const request = new Request('https://api.example.com');
      expect(strictValidator.validate(request)).toBe(false);
      
      const lenientValidator = new ContentTypeValidator(['application/json'], false);
      expect(lenientValidator.validate(request)).toBe(true);
    });
  });

  describe('middleware', () => {
    it('should allow GET requests without content type', async () => {
      const validator = new ContentTypeValidator(['application/json'], true);
      const middleware = validator.middleware();
      
      const request = new Request('https://api.example.com', {
        method: 'GET',
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await middleware(request, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should validate POST requests', async () => {
      const validator = new ContentTypeValidator(['application/json']);
      const middleware = validator.middleware();
      
      const validRequest = new Request('https://api.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await middleware(validRequest, next);
      
      expect(next).toHaveBeenCalled();
      expect(response.status).toBe(200);
    });

    it('should reject invalid content type', async () => {
      const validator = new ContentTypeValidator(['application/json']);
      const middleware = validator.middleware();
      
      const invalidRequest = new Request('https://api.example.com', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
      });
      
      const next = jest.fn().mockResolvedValue(new Response('OK'));
      const response = await middleware(invalidRequest, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(response.status).toBe(415);
      expect(await response.text()).toBe('Unsupported Media Type');
    });
  });
});