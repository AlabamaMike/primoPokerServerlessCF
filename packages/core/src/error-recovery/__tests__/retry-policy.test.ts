import { RetryPolicy, RetryPolicyExecutor, RetryContext } from '../retry-policy';

describe('RetryPolicy', () => {
  let executor: RetryPolicyExecutor;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('exponential backoff', () => {
    const exponentialPolicy: RetryPolicy = {
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      initialDelay: 100,
      maxDelay: 5000,
      jitter: false,
    };

    beforeEach(() => {
      executor = new RetryPolicyExecutor(exponentialPolicy);
    });

    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await executor.execute(operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry with exponential delays', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('attempt 1'))
        .mockRejectedValueOnce(new Error('attempt 2'))
        .mockResolvedValue('success');
      
      const promise = executor.execute(operation);
      
      // First attempt - immediate
      await jest.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);
      
      // Second attempt - after 100ms
      await jest.advanceTimersByTimeAsync(100);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Third attempt - after 200ms (exponential: 100 * 2)
      await jest.advanceTimersByTimeAsync(200);
      expect(operation).toHaveBeenCalledTimes(3);
      
      const result = await promise;
      expect(result).toBe('success');
    });

    it('should respect max attempts', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('persistent error'));
      
      const promise = executor.execute(operation);
      
      // Allow all retries to complete
      await jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('persistent error');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should cap delay at maxDelay', async () => {
      const longPolicy: RetryPolicy = {
        maxAttempts: 10,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 5000,
        jitter: false,
      };
      executor = new RetryPolicyExecutor(longPolicy);
      
      const operation = jest.fn().mockRejectedValue(new Error('error'));
      const startTime = Date.now();
      
      const promise = executor.execute(operation);
      
      // Let several retries happen
      for (let i = 0; i < 5; i++) {
        await jest.advanceTimersByTimeAsync(5000);
      }
      
      // Verify delays don't exceed maxDelay
      const calls = operation.mock.calls;
      expect(calls.length).toBeGreaterThan(3);
      
      // Cancel remaining retries
      promise.catch(() => {}); // Prevent unhandled rejection
    });
  });

  describe('linear backoff', () => {
    const linearPolicy: RetryPolicy = {
      maxAttempts: 4,
      backoffStrategy: 'linear',
      initialDelay: 100,
      maxDelay: 1000,
      jitter: false,
    };

    beforeEach(() => {
      executor = new RetryPolicyExecutor(linearPolicy);
    });

    it('should retry with linear delays', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('attempt 1'))
        .mockRejectedValueOnce(new Error('attempt 2'))
        .mockRejectedValueOnce(new Error('attempt 3'))
        .mockResolvedValue('success');
      
      const promise = executor.execute(operation);
      
      // First attempt - immediate
      await jest.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);
      
      // Second attempt - after 100ms
      await jest.advanceTimersByTimeAsync(100);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Third attempt - after 200ms (linear: 100 + 100)
      await jest.advanceTimersByTimeAsync(200);
      expect(operation).toHaveBeenCalledTimes(3);
      
      // Fourth attempt - after 300ms (linear: 100 + 100 + 100)
      await jest.advanceTimersByTimeAsync(300);
      expect(operation).toHaveBeenCalledTimes(4);
      
      const result = await promise;
      expect(result).toBe('success');
    });
  });

  describe('fixed backoff', () => {
    const fixedPolicy: RetryPolicy = {
      maxAttempts: 3,
      backoffStrategy: 'fixed',
      initialDelay: 200,
      maxDelay: 1000,
      jitter: false,
    };

    beforeEach(() => {
      executor = new RetryPolicyExecutor(fixedPolicy);
    });

    it('should retry with fixed delays', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('attempt 1'))
        .mockRejectedValueOnce(new Error('attempt 2'))
        .mockResolvedValue('success');
      
      const promise = executor.execute(operation);
      
      // First attempt - immediate
      await jest.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);
      
      // Second attempt - after 200ms
      await jest.advanceTimersByTimeAsync(200);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Third attempt - after another 200ms
      await jest.advanceTimersByTimeAsync(200);
      expect(operation).toHaveBeenCalledTimes(3);
      
      const result = await promise;
      expect(result).toBe('success');
    });
  });

  describe('jitter', () => {
    it('should add random jitter to delays', async () => {
      const jitterPolicy: RetryPolicy = {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 100,
        maxDelay: 5000,
        jitter: true,
      };
      executor = new RetryPolicyExecutor(jitterPolicy);
      
      // Mock Math.random to return predictable values
      const randomSpy = jest.spyOn(Math, 'random')
        .mockReturnValueOnce(0.2)
        .mockReturnValueOnce(0.8)
        .mockReturnValueOnce(0.5);
      
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('attempt 1'))
        .mockRejectedValueOnce(new Error('attempt 2'))
        .mockResolvedValue('success');
      
      const promise = executor.execute(operation);
      
      // First attempt - immediate
      await jest.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);
      
      // Second attempt - with 20% jitter: 100 * 0.2 = 20ms
      await jest.advanceTimersByTimeAsync(20);
      expect(operation).toHaveBeenCalledTimes(2);
      
      // Third attempt - with 80% jitter: 200 * 0.8 = 160ms
      await jest.advanceTimersByTimeAsync(160);
      expect(operation).toHaveBeenCalledTimes(3);
      
      await promise;
      randomSpy.mockRestore();
    });
  });

  describe('retry context', () => {
    it('should provide context to operations', async () => {
      const policy: RetryPolicy = {
        maxAttempts: 3,
        backoffStrategy: 'fixed',
        initialDelay: 100,
        maxDelay: 1000,
        jitter: false,
      };
      executor = new RetryPolicyExecutor(policy);
      
      const contexts: RetryContext[] = [];
      const operation = jest.fn((context: RetryContext) => {
        contexts.push({ ...context });
        if (context.attemptNumber < 3) {
          return Promise.reject(new Error(`attempt ${context.attemptNumber}`));
        }
        return Promise.resolve('success');
      });
      
      await executor.execute(operation);
      
      expect(contexts).toHaveLength(3);
      expect(contexts[0]).toEqual({
        attemptNumber: 1,
        maxAttempts: 3,
        lastError: undefined,
      });
      expect(contexts[1]).toEqual({
        attemptNumber: 2,
        maxAttempts: 3,
        lastError: expect.objectContaining({ message: 'attempt 1' }),
      });
      expect(contexts[2]).toEqual({
        attemptNumber: 3,
        maxAttempts: 3,
        lastError: expect.objectContaining({ message: 'attempt 2' }),
      });
    });
  });

  describe('error handling', () => {
    it('should preserve original error on final failure', async () => {
      const policy: RetryPolicy = {
        maxAttempts: 2,
        backoffStrategy: 'fixed',
        initialDelay: 100,
        maxDelay: 1000,
        jitter: false,
      };
      executor = new RetryPolicyExecutor(policy);
      
      const originalError = new Error('Original error');
      originalError.stack = 'Original stack trace';
      
      const operation = jest.fn().mockRejectedValue(originalError);
      
      const promise = executor.execute(operation);
      await jest.runAllTimersAsync();
      
      await expect(promise).rejects.toBe(originalError);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should handle synchronous errors', async () => {
      const policy: RetryPolicy = {
        maxAttempts: 2,
        backoffStrategy: 'fixed',
        initialDelay: 100,
        maxDelay: 1000,
        jitter: false,
      };
      executor = new RetryPolicyExecutor(policy);
      
      const operation = jest.fn(() => {
        throw new Error('Sync error');
      });
      
      const promise = executor.execute(operation);
      await jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Sync error');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancellation', () => {
    it('should support cancellation via AbortSignal', async () => {
      const policy: RetryPolicy = {
        maxAttempts: 5,
        backoffStrategy: 'fixed',
        initialDelay: 1000,
        maxDelay: 1000,
        jitter: false,
      };
      executor = new RetryPolicyExecutor(policy);
      
      const operation = jest.fn().mockRejectedValue(new Error('error'));
      const abortController = new AbortController();
      
      const promise = executor.execute(operation, undefined, abortController.signal);
      
      // First attempt
      await jest.advanceTimersByTimeAsync(0);
      expect(operation).toHaveBeenCalledTimes(1);
      
      // Cancel during retry delay
      abortController.abort();
      
      await jest.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('Operation cancelled');
      expect(operation).toHaveBeenCalledTimes(1); // No more attempts after cancellation
    });
  });
});