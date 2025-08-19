import { IRequest } from 'itty-router';
import { logger } from '@primo-poker/core';

export interface CoalescingOptions {
  windowMs: number; // Default 100ms
  maxBatchSize: number;
  mergeStrategy: 'first' | 'last' | 'merge';
  bypassHeader?: string;
}

interface PendingRequest {
  request: IRequest;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface CoalescingMetrics {
  totalRequests: number;
  coalescedRequests: number;
  bypassedRequests: number;
  averageBatchSize: number;
  errors: number;
}

export class RequestCoalescer {
  private pendingRequests: Map<string, PendingRequest[]> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private metrics: CoalescingMetrics = {
    totalRequests: 0,
    coalescedRequests: 0,
    bypassedRequests: 0,
    averageBatchSize: 0,
    errors: 0,
  };
  private batchSizes: number[] = [];

  constructor(private options: CoalescingOptions) {
    this.options = {
      windowMs: 100,
      maxBatchSize: 10,
      mergeStrategy: 'first',
      ...options,
    };
  }

  /**
   * Coalesce multiple requests with the same key
   */
  async coalesce(key: string, fn: () => Promise<any>): Promise<any> {
    this.metrics.totalRequests++;

    return new Promise((resolve, reject) => {
      const pending = this.pendingRequests.get(key) || [];
      
      // Add current request to pending
      pending.push({
        request: {} as IRequest, // In real usage, this would be the actual request
        resolve,
        reject,
        timestamp: Date.now(),
      });

      this.pendingRequests.set(key, pending);

      // If this is the first request for this key, set up the timer
      if (pending.length === 1) {
        this.scheduleExecution(key, fn);
      } else if (pending.length >= this.options.maxBatchSize) {
        // Execute immediately if batch size limit reached
        this.executeAndClear(key, fn);
      } else {
        this.metrics.coalescedRequests++;
      }
    });
  }

  /**
   * Batch multiple requests together
   */
  async batch(requests: IRequest[]): Promise<Response[]> {
    const key = this.generateBatchKey(requests);
    const responses: Response[] = [];

    // Group requests by endpoint and method
    const groups = this.groupRequests(requests);

    for (const [groupKey, groupRequests] of groups) {
      try {
        const batchedResponse = await this.executeBatch(groupKey, groupRequests);
        responses.push(...batchedResponse);
      } catch (error) {
        logger.error('Batch execution failed', { groupKey, error });
        this.metrics.errors++;
        // Return error responses for failed batch
        responses.push(...groupRequests.map(() => 
          new Response(JSON.stringify({ error: 'Batch processing failed' }), { 
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          })
        ));
      }
    }

    return responses;
  }

  /**
   * Get current metrics
   */
  getMetrics(): CoalescingMetrics {
    return {
      ...this.metrics,
      averageBatchSize: this.calculateAverageBatchSize(),
    };
  }

  /**
   * Middleware function for request coalescing
   */
  middleware() {
    return async (request: IRequest): Promise<Response | void> => {
      // Check for bypass header
      if (this.options.bypassHeader && request.headers?.get(this.options.bypassHeader)) {
        this.metrics.bypassedRequests++;
        return;
      }

      // Only coalesce GET requests by default
      if (request.method !== 'GET') {
        return;
      }

      const key = this.generateRequestKey(request);
      
      try {
        const response = await this.coalesce(key, async () => {
          // This will be replaced with actual request handling
          return new Response('Coalesced response', { status: 200 });
        });
        
        return response;
      } catch (error) {
        logger.error('Coalescing failed', { key, error });
        this.metrics.errors++;
        // Let the request proceed normally on error
        return;
      }
    };
  }

  private scheduleExecution(key: string, fn: () => Promise<any>) {
    const timer = setTimeout(() => {
      this.executeAndClear(key, fn);
    }, this.options.windowMs);

    this.timers.set(key, timer);
  }

  private async executeAndClear(key: string, fn: () => Promise<any>) {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }

    const pending = this.pendingRequests.get(key) || [];
    this.pendingRequests.delete(key);

    if (pending.length === 0) return;

    // Record batch size
    this.batchSizes.push(pending.length);
    if (this.batchSizes.length > 1000) {
      this.batchSizes.shift(); // Keep only last 1000 batch sizes
    }

    try {
      const result = await fn();
      
      // Apply merge strategy
      const response = this.applyMergeStrategy(result, pending);
      
      // Resolve all pending requests
      for (const req of pending) {
        req.resolve(response.clone());
      }
    } catch (error) {
      // Reject all pending requests
      for (const req of pending) {
        req.reject(error as Error);
      }
    }
  }

  private applyMergeStrategy(result: any, pending: PendingRequest[]): Response {
    switch (this.options.mergeStrategy) {
      case 'first':
        // Use the result as-is (based on first request)
        return result instanceof Response ? result : new Response(JSON.stringify(result));
      
      case 'last':
        // Use the result based on last request timestamp
        return result instanceof Response ? result : new Response(JSON.stringify(result));
      
      case 'merge':
        // Merge results (implementation depends on response type)
        // For now, just return the result
        return result instanceof Response ? result : new Response(JSON.stringify(result));
      
      default:
        return result instanceof Response ? result : new Response(JSON.stringify(result));
    }
  }

  private generateRequestKey(request: IRequest): string {
    const url = new URL(request.url);
    // Key based on method, pathname, and sorted query params
    const params = Array.from(url.searchParams.entries()).sort();
    return `${request.method}:${url.pathname}:${JSON.stringify(params)}`;
  }

  private generateBatchKey(requests: IRequest[]): string {
    // Simple key based on first request for now
    return requests.length > 0 ? this.generateRequestKey(requests[0]) : 'batch';
  }

  private groupRequests(requests: IRequest[]): Map<string, IRequest[]> {
    const groups = new Map<string, IRequest[]>();
    
    for (const request of requests) {
      const key = this.generateRequestKey(request);
      const group = groups.get(key) || [];
      group.push(request);
      groups.set(key, group);
    }
    
    return groups;
  }

  private async executeBatch(groupKey: string, requests: IRequest[]): Promise<Response[]> {
    // Implementation would depend on the specific batching strategy
    // For now, return individual responses
    return requests.map(() => 
      new Response(JSON.stringify({ batched: true }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    );
  }

  private calculateAverageBatchSize(): number {
    if (this.batchSizes.length === 0) return 0;
    const sum = this.batchSizes.reduce((a, b) => a + b, 0);
    return sum / this.batchSizes.length;
  }
}

// Singleton instance with default options
export const defaultCoalescer = new RequestCoalescer({
  windowMs: 100,
  maxBatchSize: 10,
  mergeStrategy: 'first',
  bypassHeader: 'X-No-Coalesce',
});

/**
 * Helper to wrap a handler with request coalescing
 */
export function withCoalescing<T extends IRequest>(
  handler: (request: T) => Promise<Response>,
  options?: Partial<CoalescingOptions>
): (request: T) => Promise<Response> {
  const coalescer = new RequestCoalescer({
    windowMs: 100,
    maxBatchSize: 10,
    mergeStrategy: 'first',
    ...options,
  });

  return async (request: T): Promise<Response> => {
    // Check for bypass
    if (options?.bypassHeader && request.headers?.get(options.bypassHeader)) {
      return handler(request);
    }

    const key = `${request.method}:${new URL(request.url).pathname}`;
    
    try {
      return await coalescer.coalesce(key, () => handler(request));
    } catch (error) {
      logger.error('Coalescing failed, executing directly', { error });
      return handler(request);
    }
  };
}