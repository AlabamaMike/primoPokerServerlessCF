/**
 * Retry helper for flaky tests
 * Provides configurable retry logic with exponential backoff
 */

import { getRetryConfig } from './test-config';

export interface RetryOptions {
  retries?: number;
  backoff?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry options
 * @returns Result of successful execution
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { retries = 1, backoff = 1000, onRetry } = options;
  let lastError: Error;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < retries) {
        if (onRetry) {
          onRetry(lastError, attempt + 1);
        }
        
        // Exponential backoff
        const delay = backoff * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}

/**
 * Retry helper specifically for E2E tests
 */
export async function retryE2E<T>(
  testName: string,
  fn: () => Promise<T>
): Promise<T> {
  const config = getRetryConfig('e2e');
  
  return withRetry(fn, {
    ...config,
    onRetry: (error, attempt) => {
      console.log(`[${testName}] Retry attempt ${attempt} after error:`, error.message);
    }
  });
}

/**
 * Retry helper specifically for WebSocket tests
 */
export async function retryWebSocket<T>(
  testName: string,
  fn: () => Promise<T>
): Promise<T> {
  const config = getRetryConfig('websocket');
  
  return withRetry(fn, {
    ...config,
    onRetry: (error, attempt) => {
      console.log(`[${testName}] WebSocket retry attempt ${attempt} after error:`, error.message);
    }
  });
}

/**
 * Decorator for retrying test cases
 * Usage: @retryTest(3)
 */
export function retryTest(retries: number = 1, backoff: number = 1000) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return withRetry(
        () => originalMethod.apply(this, args),
        { retries, backoff }
      );
    };

    return descriptor;
  };
}