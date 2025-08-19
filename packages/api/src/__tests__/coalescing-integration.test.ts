import { RequestCoalescer, withCoalescing } from '../middleware/request-coalescer';
import { withIdempotency, createIdempotencyManager } from '../middleware/idempotency';
import { IRequest } from 'itty-router';

describe('Request Coalescing Integration Tests', () => {
  describe('Combined Idempotency and Coalescing', () => {
    it('should handle high concurrent load with both strategies', async () => {
      const callCount = { value: 0 };
      const handler = jest.fn().mockImplementation(async () => {
        callCount.value++;
        // Simulate some processing time
        await new Promise(resolve => setTimeout(resolve, 10));
        return new Response(JSON.stringify({ count: callCount.value }), { status: 200 });
      });

      const wrappedHandler = withIdempotency(handler, {
        dedupeStrategy: 'both',
        coalescingOptions: {
          windowMs: 50,
          maxBatchSize: 10,
        },
      });

      // Simulate 20 concurrent requests with same idempotency key
      const requests = Array(20).fill(null).map((_, i) => ({
        method: 'POST',
        url: 'https://example.com/api/test',
        headers: {
          get: (name: string) => name === 'Idempotency-Key' ? 'load-test-key' : null,
        },
      } as unknown as IRequest));

      const startTime = Date.now();
      const responses = await Promise.all(requests.map(req => wrappedHandler(req)));
      const endTime = Date.now();

      // Handler should be called only once due to coalescing
      expect(handler).toHaveBeenCalledTimes(1);
      
      // All responses should be identical
      const bodies = await Promise.all(responses.map(r => r.json()));
      bodies.forEach(body => {
        expect(body).toEqual({ count: 1 });
      });

      // Should complete quickly due to coalescing
      expect(endTime - startTime).toBeLessThan(100);
    });

    it('should handle mixed idempotency keys correctly', async () => {
      const handler = jest.fn().mockImplementation(async (req: IRequest) => {
        const key = req.headers.get('Idempotency-Key');
        return new Response(JSON.stringify({ key }), { status: 200 });
      });

      const wrappedHandler = withIdempotency(handler, {
        dedupeStrategy: 'both',
        coalescingOptions: {
          windowMs: 50,
        },
      });

      // Create requests with different keys
      const keys = ['key-a', 'key-a', 'key-b', 'key-b', 'key-c'];
      const requests = keys.map(key => ({
        method: 'POST',
        url: 'https://example.com/api/test',
        headers: {
          get: (name: string) => name === 'Idempotency-Key' ? key : null,
        },
      } as unknown as IRequest));

      const responses = await Promise.all(requests.map(req => wrappedHandler(req)));
      
      // Handler should be called 3 times (once per unique key)
      expect(handler).toHaveBeenCalledTimes(3);
      
      // Verify responses match their keys
      const bodies = await Promise.all(responses.map(r => r.json()));
      expect(bodies[0]).toEqual({ key: 'key-a' });
      expect(bodies[1]).toEqual({ key: 'key-a' });
      expect(bodies[2]).toEqual({ key: 'key-b' });
      expect(bodies[3]).toEqual({ key: 'key-b' });
      expect(bodies[4]).toEqual({ key: 'key-c' });
    });
  });

  describe('Performance Tests', () => {
    it('should reduce request count significantly', async () => {
      const coalescer = new RequestCoalescer({
        windowMs: 100,
        maxBatchSize: 50,
        mergeStrategy: 'first',
      });

      let executionCount = 0;
      const fn = jest.fn().mockImplementation(async () => {
        executionCount++;
        await new Promise(resolve => setTimeout(resolve, 20));
        return `execution-${executionCount}`;
      });

      // Simulate 100 requests across 10 different keys
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const key = `key-${i % 10}`;
        promises.push(coalescer.coalesce(key, fn));
      }

      await Promise.all(promises);

      // Should execute significantly fewer times than 100
      expect(executionCount).toBeLessThan(20);
      
      const metrics = coalescer.getMetrics();
      expect(metrics.totalRequests).toBe(100);
      expect(metrics.coalescedRequests).toBeGreaterThan(80);
    });

    it('should handle request timeouts gracefully', async () => {
      const coalescer = new RequestCoalescer({
        windowMs: 50,
        maxBatchSize: 5,
        mergeStrategy: 'first',
      });

      const fn = jest.fn().mockImplementation(async () => {
        // Simulate a slow operation
        await new Promise(resolve => setTimeout(resolve, 200));
        return 'slow-result';
      });

      // Start first batch
      const firstBatch = Array(3).fill(null).map(() => 
        coalescer.coalesce('slow-key', fn)
      );

      // Wait a bit, then start second batch
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const secondBatch = Array(3).fill(null).map(() => 
        coalescer.coalesce('slow-key', fn)
      );

      const allResults = await Promise.all([...firstBatch, ...secondBatch]);

      // Should have executed twice (once per batch)
      expect(fn).toHaveBeenCalledTimes(2);
      
      // All results should be valid
      allResults.forEach(result => {
        expect(result).toBe('slow-result');
      });
    });
  });

  describe('Error Handling', () => {
    it('should isolate errors to affected batch', async () => {
      const coalescer = new RequestCoalescer({
        windowMs: 50,
        maxBatchSize: 3,
        mergeStrategy: 'first',
      });

      let callCount = 0;
      const fn = jest.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('First batch error');
        }
        return 'success';
      });

      // First batch (will fail)
      const firstBatch = Array(3).fill(null).map(() => 
        coalescer.coalesce('error-key', fn)
      );

      // Wait for first batch to fail
      await expect(Promise.all(firstBatch)).rejects.toThrow('First batch error');

      // Second batch (should succeed)
      const secondBatch = Array(2).fill(null).map(() => 
        coalescer.coalesce('error-key', fn)
      );

      const results = await Promise.all(secondBatch);
      
      expect(fn).toHaveBeenCalledTimes(2);
      results.forEach(result => {
        expect(result).toBe('success');
      });
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with many different keys', async () => {
      const coalescer = new RequestCoalescer({
        windowMs: 10,
        maxBatchSize: 5,
        mergeStrategy: 'first',
      });

      const fn = jest.fn().mockResolvedValue('result');

      // Generate many unique keys
      const promises = [];
      for (let i = 0; i < 1000; i++) {
        promises.push(coalescer.coalesce(`unique-key-${i}`, fn));
      }

      await Promise.all(promises);

      // Check that internal maps are cleaned up
      expect((coalescer as any).pendingRequests.size).toBe(0);
      expect((coalescer as any).timers.size).toBe(0);
      
      const metrics = coalescer.getMetrics();
      expect(metrics.totalRequests).toBe(1000);
      expect(metrics.errors).toBe(0);
    });
  });
});