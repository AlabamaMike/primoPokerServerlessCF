import { RequestSizeLimitMiddleware, safeJsonParse } from '../request-size-limit';

describe('RequestSizeLimitMiddleware', () => {
  let middleware: RequestSizeLimitMiddleware;

  beforeEach(() => {
    middleware = new RequestSizeLimitMiddleware({
      maxBodySize: 1024, // 1KB for testing
      maxJsonSize: 512, // 512 bytes for JSON
    });
  });

  describe('middleware()', () => {
    it('should skip GET requests', async () => {
      const request = {
        method: 'GET',
        url: 'http://example.com/api/wallet',
        headers: new Map(),
      };

      const middlewareFn = middleware.middleware();
      const result = await middlewareFn(request, {}, {});

      expect(result).toBeUndefined();
    });

    it('should reject requests with Content-Length exceeding limit', async () => {
      const request = {
        method: 'POST',
        url: 'http://example.com/api/wallet/deposit',
        headers: new Map([['content-length', '2048']]), // 2KB
      };

      const middlewareFn = middleware.middleware();
      const result = await middlewareFn(request, {}, {});

      expect(result).toBeDefined();
      expect(result?.status).toBe(413);
      
      const body = await result?.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('413');
    });

    it('should allow requests within size limit', async () => {
      const request = {
        method: 'POST',
        url: 'http://example.com/api/wallet/deposit',
        headers: new Map([['content-length', '512']]), // 512 bytes
      };

      const middlewareFn = middleware.middleware();
      const result = await middlewareFn(request, {}, {});

      expect(result).toBeUndefined();
    });

    it('should store config on request for JSON parsing', async () => {
      const request: any = {
        method: 'POST',
        url: 'http://example.com/api/wallet/deposit',
        headers: new Map(),
      };

      const middlewareFn = middleware.middleware();
      await middlewareFn(request, {}, {});

      expect(request.__sizeLimitConfig).toBeDefined();
      expect(request.__sizeLimitConfig.maxJsonSize).toBe(512);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON within size limit', async () => {
      const data = { amount: 100, method: 'credit_card' };
      const request: any = {
        __sizeLimitConfig: { maxJsonSize: 1024 },
        text: jest.fn().mockResolvedValue(JSON.stringify(data)),
        clone: jest.fn().mockReturnThis(),
      };

      const result = await safeJsonParse(request);
      expect(result).toEqual(data);
    });

    it('should reject JSON exceeding size limit', async () => {
      const largeData = { data: 'x'.repeat(1000) };
      const request: any = {
        __sizeLimitConfig: { maxJsonSize: 512 },
        text: jest.fn().mockResolvedValue(JSON.stringify(largeData)),
        clone: jest.fn().mockReturnThis(),
      };

      await expect(safeJsonParse(request)).rejects.toThrow('Payload too large');
    });

    it('should reject invalid JSON', async () => {
      const request: any = {
        __sizeLimitConfig: { maxJsonSize: 1024 },
        text: jest.fn().mockResolvedValue('invalid json'),
        clone: jest.fn().mockReturnThis(),
      };

      await expect(safeJsonParse(request)).rejects.toThrow('Invalid request body');
    });

    it('should handle missing size config', async () => {
      const data = { amount: 100 };
      const request: any = {
        text: jest.fn().mockResolvedValue(JSON.stringify(data)),
        clone: jest.fn().mockReturnThis(),
      };

      const result = await safeJsonParse(request);
      expect(result).toEqual(data);
    });
  });
});