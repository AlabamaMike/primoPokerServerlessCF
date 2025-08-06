import { ErrorSanitizer } from './error-sanitizer';

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

  constructor(
    private readonly name: string,
    private readonly config: CircuitBreakerConfig
  ) {
    this.metricsResetTime = Date.now() + config.monitoringPeriod;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    this.resetMetricsIfNeeded();

    if (!this.allowRequest()) {
      // Use sanitized error to avoid exposing internal state
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
      throw error;
    }
  }

  trip(): void {
    this.state = 'open';
    this.lastFailureTime = Date.now();
    this.halfOpenRequests = 0;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.halfOpenRequests = 0;
  }

  allowRequest(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.config.resetTimeout) {
        this.state = 'half-open';
        this.halfOpenRequests = 0;
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
      this.reset();
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.trip();
    } else if (this.state === 'closed' && this.failures >= this.config.failureThreshold) {
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