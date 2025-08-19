import { RequestCoalescer, CoalescingOptions, withCoalescing } from '../middleware/request-coalescer';
import { IRequest } from 'itty-router';

describe('RequestCoalescer', () => {
  let coalescer: RequestCoalescer;

  beforeEach(() => {
    jest.clearAllMocks();
    coalescer = new RequestCoalescer({
      windowMs: 50,
      maxBatchSize: 5,
      mergeStrategy: 'first',
    });
  });

  describe('coalesce', () => {
    it('should execute function immediately for first request', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      const result = await coalescer.coalesce('key1', fn);

      expect(fn).toHaveBeenCalledTimes(1);
      expect(result).toBe('result');
    });

    it('should coalesce multiple requests within window', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      
      // Fire multiple requests in parallel
      const promises = [
        coalescer.coalesce('key1', fn),
        coalescer.coalesce('key1', fn),
        coalescer.coalesce('key1', fn),
      ];

      const results = await Promise.all(promises);

      // Function should only be called once
      expect(fn).toHaveBeenCalledTimes(1);
      expect(results).toEqual(['result', 'result', 'result']);
    });

    it('should execute immediately when max batch size reached', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      
      // Fire more requests than maxBatchSize
      const promises = [];
      for (let i = 0; i < 6; i++) {
        promises.push(coalescer.coalesce('key1', fn));
      }

      await Promise.all(promises);

      // Should execute twice: once for first 5, once for the 6th
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should handle different keys separately', async () => {
      const fn1 = jest.fn().mockResolvedValue('result1');
      const fn2 = jest.fn().mockResolvedValue('result2');
      
      const [result1, result2] = await Promise.all([
        coalescer.coalesce('key1', fn1),
        coalescer.coalesce('key2', fn2),
      ]);

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
      expect(result1).toBe('result1');
      expect(result2).toBe('result2');
    });

    it('should handle errors properly', async () => {
      const error = new Error('Test error');
      const fn = jest.fn().mockRejectedValue(error);
      
      // Fire multiple requests
      const promises = [
        coalescer.coalesce('key1', fn),
        coalescer.coalesce('key1', fn),
      ];

      // All should reject with the same error
      await expect(Promise.all(promises)).rejects.toThrow('Test error');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('batch', () => {
    it('should batch requests by endpoint', async () => {
      const requests: IRequest[] = [
        { method: 'GET', url: 'https://example.com/api/users' } as IRequest,
        { method: 'GET', url: 'https://example.com/api/users' } as IRequest,
        { method: 'GET', url: 'https://example.com/api/posts' } as IRequest,
      ];

      const responses = await coalescer.batch(requests);

      expect(responses).toHaveLength(3);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should handle batch errors gracefully', async () => {
      const requests: IRequest[] = [
        { method: 'GET', url: 'https://example.com/api/users' } as IRequest,
      ];

      // Mock an error in executeBatch
      jest.spyOn(coalescer as any, 'executeBatch').mockRejectedValue(new Error('Batch error'));

      const responses = await coalescer.batch(requests);

      expect(responses).toHaveLength(1);
      expect(responses[0].status).toBe(500);
      const body = await responses[0].json();
      expect(body).toEqual({ error: 'Batch processing failed' });
    });
  });

  describe('metrics', () => {
    it('should track metrics correctly', async () => {
      const fn = jest.fn().mockResolvedValue('result');
      
      // Execute some requests
      await Promise.all([
        coalescer.coalesce('key1', fn),
        coalescer.coalesce('key1', fn),
        coalescer.coalesce('key2', fn),
      ]);

      const metrics = coalescer.getMetrics();

      expect(metrics.totalRequests).toBe(3);
      expect(metrics.coalescedRequests).toBe(1); // One request was coalesced
      expect(metrics.errors).toBe(0);
    });

    it('should track bypassed requests', async () => {
      const coalescerWithBypass = new RequestCoalescer({
        windowMs: 50,
        maxBatchSize: 5,
        mergeStrategy: 'first',
        bypassHeader: 'X-No-Coalesce',
      });

      const middleware = coalescerWithBypass.middleware();
      const request = {
        method: 'GET',
        url: 'https://example.com/api/test',
        headers: {
          get: (name: string) => name === 'X-No-Coalesce' ? 'true' : null,
        },
      } as unknown as IRequest;

      await middleware(request);

      const metrics = coalescerWithBypass.getMetrics();
      expect(metrics.bypassedRequests).toBe(1);
    });
  });

  describe('middleware', () => {
    it('should only coalesce GET requests', async () => {
      const middleware = coalescer.middleware();
      
      const postRequest = {
        method: 'POST',
        url: 'https://example.com/api/test',
        headers: { get: () => null },
      } as unknown as IRequest;

      const result = await middleware(postRequest);
      
      expect(result).toBeUndefined(); // Should pass through
    });

    it('should handle coalescing errors gracefully', async () => {
      const middleware = coalescer.middleware();
      
      // Mock coalesce to throw error
      jest.spyOn(coalescer, 'coalesce').mockRejectedValue(new Error('Coalesce error'));

      const request = {
        method: 'GET',
        url: 'https://example.com/api/test',
        headers: { get: () => null },
      } as unknown as IRequest;

      const result = await middleware(request);
      
      expect(result).toBeUndefined(); // Should pass through on error
    });
  });

  describe('withCoalescing helper', () => {
    it('should wrap handler with coalescing', async () => {
      const handler = jest.fn().mockResolvedValue(new Response('test'));
      const wrappedHandler = withCoalescing(handler, {
        windowMs: 50,
        maxBatchSize: 3,
      });

      const request = {
        method: 'GET',
        url: 'https://example.com/api/test',
        headers: { get: () => null },
      } as unknown as IRequest;

      const response = await wrappedHandler(request);
      
      expect(handler).toHaveBeenCalledWith(request);
      expect(response).toBeInstanceOf(Response);
    });

    it('should bypass coalescing when bypass header present', async () => {
      const handler = jest.fn().mockResolvedValue(new Response('test'));
      const wrappedHandler = withCoalescing(handler, {
        bypassHeader: 'X-No-Coalesce',
      });

      const request = {
        method: 'GET',
        url: 'https://example.com/api/test',
        headers: {
          get: (name: string) => name === 'X-No-Coalesce' ? 'true' : null,
        },
      } as unknown as IRequest;

      await wrappedHandler(request);
      
      expect(handler).toHaveBeenCalledWith(request);
    });
  });
});