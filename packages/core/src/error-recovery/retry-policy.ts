export interface RetryPolicy {
  maxAttempts: number;
  backoffStrategy: 'exponential' | 'linear' | 'fixed';
  initialDelay: number;
  maxDelay: number;
  jitter: boolean;
}

export interface RetryContext {
  attemptNumber: number;
  maxAttempts: number;
  lastError?: Error;
}

export class RetryPolicyExecutor {
  constructor(private readonly policy: RetryPolicy) {}

  async execute<T>(
    operation: (context?: RetryContext) => Promise<T> | T,
    context?: RetryContext,
    signal?: AbortSignal
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.policy.maxAttempts; attempt++) {
      if (signal?.aborted) {
        throw new Error('Operation cancelled');
      }

      const retryContext: RetryContext = context || {
        attemptNumber: attempt,
        maxAttempts: this.policy.maxAttempts,
        ...(lastError && { lastError }),
      };

      try {
        const result = await Promise.resolve(operation(retryContext));
        return result;
      } catch (error) {
        lastError = error as Error;

        if (attempt === this.policy.maxAttempts) {
          throw error;
        }

        const delay = this.calculateDelay(attempt);
        await this.delay(delay, signal);
      }
    }

    throw lastError || new Error('Retry policy exhausted');
  }

  private calculateDelay(attemptNumber: number): number {
    let baseDelay: number;

    switch (this.policy.backoffStrategy) {
      case 'exponential':
        baseDelay = this.policy.initialDelay * Math.pow(2, attemptNumber - 1);
        break;
      case 'linear':
        baseDelay = this.policy.initialDelay * attemptNumber;
        break;
      case 'fixed':
        baseDelay = this.policy.initialDelay;
        break;
      default:
        baseDelay = this.policy.initialDelay;
    }

    // Cap at maxDelay
    baseDelay = Math.min(baseDelay, this.policy.maxDelay);

    // Apply jitter if enabled
    if (this.policy.jitter) {
      const jitterAmount = baseDelay * Math.random();
      return Math.floor(jitterAmount);
    }

    return baseDelay;
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Operation cancelled'));
        return;
      }

      const timer = setTimeout(resolve, ms);

      if (signal) {
        const abortHandler = () => {
          clearTimeout(timer);
          reject(new Error('Operation cancelled'));
        };
        signal.addEventListener('abort', abortHandler, { once: true });
      }
    });
  }
}

export default RetryPolicyExecutor;