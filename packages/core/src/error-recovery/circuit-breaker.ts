import { ErrorSanitizer } from './error-sanitizer';
import { Logger, LoggerFactory } from '@primo-poker/logging';

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  halfOpenLimit: number;
  monitoringPeriod: number;
}

export interface CircuitBreakerMetrics {
  successCount: number;
  failureCount: number;
  lastFailureTime: number;
  state: CircuitBreakerState;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private halfOpenRequests = 0;
  private metricsResetTime: number;
  private readonly logger: Logger;

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {
    this.metricsResetTime = Date.now() + config.monitoringPeriod;
    this.logger = LoggerFactory.getInstance().getLogger('circuit-breaker').withContext({
      circuitBreaker: name,
    });
    this.logger.info('Circuit breaker initialized', { config });
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.resetMetricsIfNeeded();

    if (!this.allowRequest()) {
      // Use sanitized error to avoid exposing internal state
      this.logger.warn('Circuit breaker rejecting request', {
        state: this.state,
        failures: this.failures,
      });
      throw ErrorSanitizer.sanitizeError(new Error('Service temporarily unavailable'));
    }

    if (this.state === 'half-open') {
      this.halfOpenRequests++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      this.logger.error('Operation failed', error as Error, {
        state: this.state,
        failures: this.failures,
      });
      throw error;
    }
  }

  trip(): void {
    this.state = 'open';
    this.lastFailureTime = Date.now();
    this.halfOpenRequests = 0;
    this.logger.error('Circuit breaker tripped', undefined, {
      failures: this.failures,
      threshold: this.config.failureThreshold,
    });
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenRequests = 0;
    this.logger.info('Circuit breaker reset', {
      previousFailures: this.failures,
    });
  }

  allowRequest(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.state = 'half-open';
        this.halfOpenRequests = 0;
        this.logger.info('Circuit breaker entering half-open state');
        return true;
      }
      return false;
    }

    // half-open state
    return this.halfOpenRequests < this.config.halfOpenLimit;
  }

  getState(): CircuitBreakerState {
    // Check if we should transition from open to half-open
    if (this.state === 'open' && Date.now() - this.lastFailureTime > this.config.resetTimeout) {
      this.state = 'half-open';
      this.halfOpenRequests = 0;
    }
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    this.resetMetricsIfNeeded();
    return {
      successCount: this.successCount,
      failureCount: this.failures,
      lastFailureTime: this.lastFailureTime,
      state: this.getState(),
    };
  }

  private onSuccess(): void {
    this.successCount++;
    
    if (this.state === 'half-open') {
      this.logger.info('Success in half-open state, resetting circuit breaker');
      this.reset();
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.logger.warn('Failure in half-open state, tripping circuit breaker');
      this.trip();
    } else if (this.state === 'closed' && this.failures >= this.config.failureThreshold) {
      this.logger.warn('Failure threshold reached, tripping circuit breaker', {
        failures: this.failures,
        threshold: this.config.failureThreshold,
      });
      this.trip();
    }
  }

  private resetMetricsIfNeeded(): void {
    const now = Date.now();
    if (now > this.metricsResetTime) {
      this.successCount = 0;
      this.failures = 0;
      this.metricsResetTime = now + this.config.monitoringPeriod;
    }
  }

  getName(): string {
    return this.name;
  }

  getConfig(): CircuitBreakerConfig {
    return this.config;
  }
}

export default CircuitBreaker;