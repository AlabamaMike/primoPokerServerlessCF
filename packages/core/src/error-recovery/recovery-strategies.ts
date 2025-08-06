import { RetryPolicy } from './retry-policy';
import { CircuitBreakerConfig } from './circuit-breaker';

export type ErrorType = 
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'AUTH_ERROR'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'SERVER_ERROR'
  | 'NOT_FOUND_ERROR'
  | 'PERMISSION_ERROR'
  | 'WEBSOCKET_ERROR'
  | 'PLAYER_DISCONNECTED'
  | 'RESOURCE_EXHAUSTED'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'CUSTOM_ERROR'
  | 'UNKNOWN_ERROR';

export interface RecoveryContext {
  errorType: ErrorType;
  error: Error | any;
  attemptCount: number;
  resourceType: string;
  metadata?: Record<string, any>;
}

export interface RecoveryStrategy {
  shouldRetry: boolean;
  retryPolicy?: RetryPolicy;
  useCircuitBreaker?: boolean;
  circuitBreakerConfig?: CircuitBreakerConfig;
  fallbackAction?: string;
  metadata?: Record<string, any>;
}

export class RecoveryStrategies {
  private strategies: Map<ErrorType, RecoveryStrategy> = new Map();
  
  constructor() {
    this.initializeDefaultStrategies();
  }

  getStrategy(context: RecoveryContext): RecoveryStrategy {
    // First try to get a specific strategy for the error type
    let strategy = this.strategies.get(context.errorType);
    
    if (!strategy) {
      // Fallback to categorizing the error
      const categorizedType = this.categorizeError(context.error);
      strategy = this.strategies.get(categorizedType);
    }

    // Apply context-specific modifications
    strategy = this.applyContextModifications(strategy || this.getDefaultStrategy(), context);
    
    return strategy;
  }

  categorizeError(error: Error | any): ErrorType {
    const message = error.message?.toLowerCase() || '';
    const status = error.status || error.statusCode;

    // Network errors
    if (
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('network timeout') ||
      message.includes('connection reset')
    ) {
      return 'NETWORK_ERROR';
    }

    // Authentication errors
    if (
      message.includes('unauthorized') ||
      message.includes('invalid token') ||
      message.includes('authentication failed') ||
      status === 401
    ) {
      return 'AUTH_ERROR';
    }

    // Rate limit errors
    if (
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      status === 429
    ) {
      return 'RATE_LIMIT_ERROR';
    }

    // Validation errors
    if (
      message.includes('validation failed') ||
      message.includes('invalid input') ||
      message.includes('missing required') ||
      status === 400
    ) {
      return 'VALIDATION_ERROR';
    }

    // Server errors
    if (
      message.includes('internal server error') ||
      status === 500 ||
      status === 503
    ) {
      return 'SERVER_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  shouldRetry(errorType: ErrorType): boolean {
    const retryableErrors: ErrorType[] = [
      'NETWORK_ERROR',
      'TIMEOUT_ERROR',
      'SERVER_ERROR',
      'RATE_LIMIT_ERROR',
      'WEBSOCKET_ERROR',
      'PLAYER_DISCONNECTED',
    ];
    
    return retryableErrors.includes(errorType);
  }

  getRetryDelay(
    attemptNumber: number,
    strategy: 'exponential' | 'linear' | 'fixed' = 'exponential',
    baseDelay: number = 100,
    maxDelay: number = 5000,
    addJitter: boolean = false
  ): number {
    let delay: number;
    
    switch (strategy) {
      case 'exponential':
        delay = baseDelay * Math.pow(2, attemptNumber - 1);
        break;
      case 'linear':
        delay = baseDelay * attemptNumber;
        break;
      case 'fixed':
        delay = baseDelay;
        break;
    }
    
    // Cap at maxDelay
    delay = Math.min(delay, maxDelay);
    
    // Add jitter if requested (up to 50% of the delay)
    if (addJitter) {
      const jitter = delay * 0.5 * Math.random();
      delay += jitter;
    }
    
    return Math.floor(delay);
  }

  registerStrategy(errorType: ErrorType, strategy: RecoveryStrategy): void {
    this.strategies.set(errorType, strategy);
  }

  private initializeDefaultStrategies(): void {
    // Network errors - retry with exponential backoff
    this.strategies.set('NETWORK_ERROR', {
      shouldRetry: true,
      retryPolicy: {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 30000,
        jitter: true,
      },
      fallbackAction: 'offline-mode',
    });

    // Timeout errors
    this.strategies.set('TIMEOUT_ERROR', {
      shouldRetry: true,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 2000,
        maxDelay: 10000,
        jitter: false,
      },
    });

    // Authentication errors - don't retry, re-authenticate
    this.strategies.set('AUTH_ERROR', {
      shouldRetry: false,
      fallbackAction: 're-authenticate',
    });

    // Validation errors - don't retry
    this.strategies.set('VALIDATION_ERROR', {
      shouldRetry: false,
      fallbackAction: 'reject',
    });

    // Rate limit errors - retry with longer delays
    this.strategies.set('RATE_LIMIT_ERROR', {
      shouldRetry: true,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 60000, // Start with 1 minute
        maxDelay: 300000, // Max 5 minutes
        jitter: true,
      },
    });

    // Server errors - retry with circuit breaker
    this.strategies.set('SERVER_ERROR', {
      shouldRetry: true,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 10000,
        jitter: true,
      },
      useCircuitBreaker: true,
      circuitBreakerConfig: {
        failureThreshold: 5,
        resetTimeout: 60000,
        halfOpenLimit: 2,
        monitoringPeriod: 300000,
      },
    });

    // External service errors
    this.strategies.set('EXTERNAL_SERVICE_ERROR', {
      shouldRetry: true,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 2000,
        maxDelay: 30000,
        jitter: true,
      },
      useCircuitBreaker: true,
      circuitBreakerConfig: {
        failureThreshold: 3,
        resetTimeout: 120000,
        halfOpenLimit: 1,
        monitoringPeriod: 600000,
      },
    });

    // WebSocket errors
    this.strategies.set('WEBSOCKET_ERROR', {
      shouldRetry: true,
      retryPolicy: {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 1000,
        maxDelay: 30000,
        jitter: true,
      },
      fallbackAction: 'reconnect',
    });

    // Player disconnection
    this.strategies.set('PLAYER_DISCONNECTED', {
      shouldRetry: true,
      retryPolicy: {
        maxAttempts: 3,
        backoffStrategy: 'fixed',
        initialDelay: 5000,
        maxDelay: 5000,
        jitter: false,
      },
      fallbackAction: 'grace-period',
      metadata: {
        gracePeriodMs: 30000,
      },
    });

    // Resource exhaustion
    this.strategies.set('RESOURCE_EXHAUSTED', {
      shouldRetry: false,
      useCircuitBreaker: true,
      circuitBreakerConfig: {
        failureThreshold: 1,
        resetTimeout: 300000, // 5 minutes
        halfOpenLimit: 1,
        monitoringPeriod: 600000,
      },
      fallbackAction: 'shed-load',
    });
  }

  private applyContextModifications(
    baseStrategy: RecoveryStrategy,
    context: RecoveryContext
  ): RecoveryStrategy {
    const strategy = { ...baseStrategy };

    // Rate limit specific handling
    if (context.errorType === 'RATE_LIMIT_ERROR' && context.metadata?.retryAfter) {
      strategy.retryPolicy = {
        ...strategy.retryPolicy!,
        initialDelay: context.metadata.retryAfter * 1000,
      };
    }

    // WebSocket specific handling
    if (context.errorType === 'WEBSOCKET_ERROR') {
      if (context.attemptCount >= 10 || 
          (context.metadata?.lastActivity && 
           Date.now() - context.metadata.lastActivity > 300000)) {
        strategy.shouldRetry = false;
        strategy.fallbackAction = 'terminate';
      }
    }

    // Player disconnection handling
    if (context.errorType === 'PLAYER_DISCONNECTED') {
      if (context.metadata?.disconnectDuration > 30000 || context.attemptCount >= 5) {
        strategy.shouldRetry = false;
        strategy.fallbackAction = 'auto-fold';
      }
    }

    // Resource exhaustion handling
    if (context.errorType === 'RESOURCE_EXHAUSTED') {
      if (context.metadata?.resourceType === 'cpu') {
        strategy.fallbackAction = 'throttle';
      }
    }

    return strategy;
  }

  private getDefaultStrategy(): RecoveryStrategy {
    return {
      shouldRetry: false,
      fallbackAction: 'log-and-continue',
    };
  }
}

export default RecoveryStrategies;