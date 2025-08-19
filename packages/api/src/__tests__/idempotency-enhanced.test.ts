import { createIdempotencyManager, withIdempotency, IdempotencyOptions } from '../middleware/idempotency';
import { IRequest } from 'itty-router';

describe('Enhanced Idempotency Middleware', () => {
  let mockRequest: IRequest;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockHandler = jest.fn().mockResolvedValue(new Response('Success', { status: 200 }));
    mockRequest = {
      method: 'POST',
      url: 'https://example.com/api/test',
      headers: {
        get: jest.fn(),
      },
    } as unknown as IRequest;
  });

  describe('createIdempotencyManager', () => {
    it('should create manager with cache strategy', () => {
      const manager = createIdempotencyManager({
        ttl: 1000,
        dedupeStrategy: 'cache',
      });

      expect(manager).toBeDefined();
      expect((manager as any).dedupeStrategy).toBe('cache');
      expect((manager as any).TTL).toBe(1000);
    });

    it('should create manager with coalesce strategy', () => {
      const manager = createIdempotencyManager({
        dedupeStrategy: 'coalesce',
        coalescingOptions: {
          windowMs: 200,
          maxBatchSize: 20,
        },
      });

      expect(manager).toBeDefined();
      expect((manager as any).dedupeStrategy).toBe('coalesce');
      expect((manager as any).coalescer).toBeDefined();
    });

    it('should create manager with both strategies', () => {
      const manager = createIdempotencyManager({
        dedupeStrategy: 'both',
      });

      expect(manager).toBeDefined();
      expect((manager as any).dedupeStrategy).toBe('both');
      expect((manager as any).coalescer).toBeDefined();
    });
  });

  describe('withIdempotency - cache strategy', () => {
    it('should cache successful responses', async () => {
      const wrappedHandler = withIdempotency(mockHandler, {
        dedupeStrategy: 'cache',
      });

      (mockRequest.headers.get as jest.Mock).mockReturnValue('test-key-123');

      // First request
      const response1 = await wrappedHandler(mockRequest);
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(response1.headers.get('X-Idempotent-Replay')).toBeNull();

      // Second request with same key
      const response2 = await wrappedHandler(mockRequest);
      expect(mockHandler).toHaveBeenCalledTimes(1); // Not called again
      expect(response2.headers.get('X-Idempotent-Replay')).toBe('true');
      expect(response2.headers.get('X-Dedupe-Strategy')).toBe('cache');
    });

    it('should not cache failed responses', async () => {
      mockHandler.mockResolvedValue(new Response('Error', { status: 500 }));
      const wrappedHandler = withIdempotency(mockHandler);

      (mockRequest.headers.get as jest.Mock).mockReturnValue('test-key-456');

      // First request
      await wrappedHandler(mockRequest);
      expect(mockHandler).toHaveBeenCalledTimes(1);

      // Second request with same key
      await wrappedHandler(mockRequest);
      expect(mockHandler).toHaveBeenCalledTimes(2); // Called again
    });
  });

  describe('withIdempotency - coalesce strategy', () => {
    it('should coalesce concurrent requests', async () => {
      const wrappedHandler = withIdempotency(mockHandler, {
        dedupeStrategy: 'coalesce',
        coalescingOptions: {
          windowMs: 100,
        },
      });

      (mockRequest.headers.get as jest.Mock).mockReturnValue('test-key-789');

      // Fire multiple concurrent requests
      const promises = [
        wrappedHandler(mockRequest),
        wrappedHandler(mockRequest),
        wrappedHandler(mockRequest),
      ];

      const responses = await Promise.all(promises);

      // Handler should only be called once due to coalescing
      expect(mockHandler).toHaveBeenCalledTimes(1);
      
      // All responses should have coalesce strategy header
      responses.forEach(response => {
        expect(response.headers.get('X-Dedupe-Strategy')).toBe('coalesce');
      });
    });

    it('should fallback on coalescing error', async () => {
      const wrappedHandler = withIdempotency(mockHandler, {
        dedupeStrategy: 'coalesce',
      });

      // Mock coalescer to throw error
      const manager = createIdempotencyManager({ dedupeStrategy: 'coalesce' });
      jest.spyOn((manager as any).coalescer, 'coalesce').mockRejectedValue(new Error('Coalesce error'));

      (mockRequest.headers.get as jest.Mock).mockReturnValue('test-key-error');

      const response = await wrappedHandler(mockRequest);
      
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
    });
  });

  describe('withIdempotency - both strategy', () => {
    it('should check cache first, then coalesce', async () => {
      const manager = createIdempotencyManager({
        dedupeStrategy: 'both',
      });

      // Pre-populate cache
      await manager.storeResponse('cached-key', new Response('Cached', { status: 200 }));

      const wrappedHandler = withIdempotency(mockHandler, {
        dedupeStrategy: 'both',
      });

      // Request with cached key
      (mockRequest.headers.get as jest.Mock).mockReturnValue('cached-key');
      const cachedResponse = await wrappedHandler(mockRequest);
      
      expect(mockHandler).not.toHaveBeenCalled();
      expect(cachedResponse.headers.get('X-Dedupe-Strategy')).toBe('cache');
      expect(await cachedResponse.text()).toBe('Cached');

      // Request with new key (should use coalescing)
      (mockRequest.headers.get as jest.Mock).mockReturnValue('new-key');
      const newResponse = await wrappedHandler(mockRequest);
      
      expect(mockHandler).toHaveBeenCalledTimes(1);
      expect(newResponse.headers.get('X-Dedupe-Strategy')).toBe('coalesce');
    });
  });

  describe('withIdempotency - no idempotency key', () => {
    it('should pass through requests without idempotency key', async () => {
      const wrappedHandler = withIdempotency(mockHandler);
      
      (mockRequest.headers.get as jest.Mock).mockReturnValue(null);

      const response = await wrappedHandler(mockRequest);
      
      expect(mockHandler).toHaveBeenCalledWith(mockRequest);
      expect(response.headers.get('X-Idempotent-Replay')).toBeNull();
      expect(response.headers.get('X-Dedupe-Strategy')).toBeNull();
    });
  });
});