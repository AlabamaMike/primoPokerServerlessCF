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
  private timers: Map<string, number> = new Map();
  private metrics: CoalescingMetrics = {
    totalRequests: 0,
    coalescedRequests: 0,
    bypassedRequests: 0,
    averageBatchSize: 0,
    errors: 0,
  };
  private batchSizes: number[] = [];
  private batchSizeSum = 0;
  private batchSizeCount = 0;
  private readonly maxBatchSizeHistory = 1000;

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
  async coalesce(key: string, fn: () => Promise<any>, request?: IRequest): Promise<any> {
    this.metrics.totalRequests++;

    return new Promise((resolve, reject) => {
      const pending = this.pendingRequests.get(key) || [];
      
      // Add current request to pending
      pending.push({
        request: request || ({} as IRequest),
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
    const key = await this.generateBatchKey(requests);
    const responses: Response[] = [];

    // Group requests by endpoint and method
    const groups = await this.groupRequests(requests);

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
  middleware(handler: (request: IRequest) => Promise<Response>) {
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

      const key = await this.generateRequestKey(request);
      
      try {
        const response = await this.coalesce(key, async () => {
          // Execute the actual request handler
          return await handler(request);
        }, request);
        
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

    // Record batch size using circular buffer pattern
    this.recordBatchSize(pending.length);

    try {
      const result = await fn();
      
      // Apply merge strategy
      const response = this.applyMergeStrategy(result, pending);
      
      // Resolve all pending requests with cloned responses
      for (let i = 0; i < pending.length; i++) {
        try {
          // Clone response for all but the last request
          const resp = i < pending.length - 1 ? response.clone() : response;
          pending[i].resolve(resp);
        } catch (cloneError) {
          // If cloning fails, create a new response with the same content
          logger.warn('Response cloning failed, creating new response', { cloneError });
          const fallbackResponse = new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
          pending[i].resolve(fallbackResponse);
        }
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
        // For 'last' strategy, we already have the result from the last request
        // The function was called once, so just return the result
        return result instanceof Response ? result : new Response(JSON.stringify(result));
      
      case 'merge':
        // Merge strategy: if result is an array or object with results property, 
        // combine into a single response
        if (result instanceof Response) {
          return result;
        }
        
        // If result is an array, wrap it in a results object
        if (Array.isArray(result)) {
          return new Response(JSON.stringify({ 
            results: result,
            batchSize: pending.length,
            strategy: 'merge'
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // For objects, add metadata about the batch
        return new Response(JSON.stringify({
          ...result,
          _batch: {
            size: pending.length,
            strategy: 'merge'
          }
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      
      default:
        return result instanceof Response ? result : new Response(JSON.stringify(result));
    }
  }

  async generateRequestKey(request: IRequest): Promise<string> {
    const url = new URL(request.url);
    // Key based on method, pathname, and sorted query params
    const params = Array.from(url.searchParams.entries()).sort();
    let key = `${request.method}:${url.pathname}:${JSON.stringify(params)}`;
    
    // For POST/PUT/PATCH requests, include body hash if present
    if (['POST', 'PUT', 'PATCH'].includes(request.method) && request.body) {
      try {
        let bodyContent = '';
        
        if (typeof request.body === 'string') {
          bodyContent = request.body;
        } else if (request.body instanceof ReadableStream) {
          // For streams, we can't reliably hash without consuming
          // Add a flag to indicate stream body
          bodyContent = '[stream]';
        } else {
          bodyContent = JSON.stringify(request.body);
        }
        
        // Simple hash for body content
        if (bodyContent && bodyContent !== '[stream]') {
          const hash = await this.simpleHash(bodyContent);
          key += `:${hash}`;
        }
      } catch (error) {
        // If we can't process the body, continue without it
        logger.warn('Failed to process request body for key generation', { error });
      }
    }
    
    return key;
  }
  
  private async simpleHash(str: string): Promise<string> {
    // Use a simple hash function for Cloudflare Workers environment
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private async generateBatchKey(requests: IRequest[]): Promise<string> {
    // Simple key based on first request for now
    return requests.length > 0 ? await this.generateRequestKey(requests[0]) : 'batch';
  }

  private async groupRequests(requests: IRequest[]): Promise<Map<string, IRequest[]>> {
    const groups = new Map<string, IRequest[]>();
    
    for (const request of requests) {
      const key = await this.generateRequestKey(request);
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

  private recordBatchSize(size: number): void {
    this.batchSizes.push(size);
    this.batchSizeSum += size;
    this.batchSizeCount++;
    
    // Remove oldest batch size when limit reached
    if (this.batchSizes.length > this.maxBatchSizeHistory) {
      const removed = this.batchSizes.shift()!;
      this.batchSizeSum -= removed;
      this.batchSizeCount--;
    }
  }
  
  private calculateAverageBatchSize(): number {
    return this.batchSizeCount === 0 ? 0 : this.batchSizeSum / this.batchSizeCount;
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

    const key = await coalescer.generateRequestKey(request);
    
    try {
      return await coalescer.coalesce(key, () => handler(request), request);
    } catch (error) {
      logger.error('Coalescing failed, executing directly', { error });
      return handler(request);
    }
  };
}