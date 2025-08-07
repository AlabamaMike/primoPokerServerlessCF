import { 
  CircuitBreakerConfig, 
  RetryPolicy,
  ErrorRecoveryConfig,
  CircuitBreakerConfigSchema,
  RetryPolicySchema,
  ErrorRecoveryConfigSchema
} from './config-validation';
import { z } from 'zod';

/**
 * Testing utilities for error recovery configuration
 */

/**
 * Generate valid circuit breaker configuration for testing
 */
export function generateValidCircuitBreakerConfig(overrides?: Partial<CircuitBreakerConfig>): CircuitBreakerConfig {
  return {
    failureThreshold: 5,
    resetTimeout: 60000,
    halfOpenLimit: 3,
    monitoringPeriod: 300000,
    ...overrides
  };
}

/**
 * Generate valid retry policy configuration for testing
 */
export function generateValidRetryPolicy(overrides?: Partial<RetryPolicy>): RetryPolicy {
  return {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    initialDelay: 1000,
    maxDelay: 30000,
    jitter: true,
    ...overrides
  };
}

/**
 * Generate valid error recovery configuration for testing
 */
export function generateValidErrorRecoveryConfig(overrides?: Partial<ErrorRecoveryConfig>): ErrorRecoveryConfig {
  return {
    enabled: true,
    logLevel: 'info',
    circuitBreaker: generateValidCircuitBreakerConfig(),
    retryPolicy: generateValidRetryPolicy(),
    ...overrides
  };
}

/**
 * Generate invalid configurations for testing validation
 */
export const invalidConfigs = {
  circuitBreaker: {
    negativeThreshold: { failureThreshold: -1, resetTimeout: 60000, halfOpenLimit: 3, monitoringPeriod: 300000 },
    zeroThreshold: { failureThreshold: 0, resetTimeout: 60000, halfOpenLimit: 3, monitoringPeriod: 300000 },
    tooHighThreshold: { failureThreshold: 101, resetTimeout: 60000, halfOpenLimit: 3, monitoringPeriod: 300000 },
    shortResetTimeout: { failureThreshold: 5, resetTimeout: 500, halfOpenLimit: 3, monitoringPeriod: 300000 },
    longResetTimeout: { failureThreshold: 5, resetTimeout: 400000, halfOpenLimit: 3, monitoringPeriod: 300000 },
    zeroHalfOpenLimit: { failureThreshold: 5, resetTimeout: 60000, halfOpenLimit: 0, monitoringPeriod: 300000 },
    highHalfOpenLimit: { failureThreshold: 5, resetTimeout: 60000, halfOpenLimit: 11, monitoringPeriod: 300000 },
    shortMonitoringPeriod: { failureThreshold: 5, resetTimeout: 60000, halfOpenLimit: 3, monitoringPeriod: 5000 },
    longMonitoringPeriod: { failureThreshold: 5, resetTimeout: 60000, halfOpenLimit: 3, monitoringPeriod: 4000000 }
  },
  retryPolicy: {
    zeroAttempts: { maxAttempts: 0, backoffStrategy: 'exponential', initialDelay: 1000, maxDelay: 30000, jitter: true },
    tooManyAttempts: { maxAttempts: 11, backoffStrategy: 'exponential', initialDelay: 1000, maxDelay: 30000, jitter: true },
    invalidStrategy: { maxAttempts: 3, backoffStrategy: 'random' as any, initialDelay: 1000, maxDelay: 30000, jitter: true },
    shortInitialDelay: { maxAttempts: 3, backoffStrategy: 'exponential', initialDelay: 50, maxDelay: 30000, jitter: true },
    longInitialDelay: { maxAttempts: 3, backoffStrategy: 'exponential', initialDelay: 11000, maxDelay: 30000, jitter: true },
    shortMaxDelay: { maxAttempts: 3, backoffStrategy: 'exponential', initialDelay: 1000, maxDelay: 500, jitter: true },
    longMaxDelay: { maxAttempts: 3, backoffStrategy: 'exponential', initialDelay: 1000, maxDelay: 70000, jitter: true },
    delayMismatch: { maxAttempts: 3, backoffStrategy: 'exponential', initialDelay: 5000, maxDelay: 2000, jitter: true }
  }
};

/**
 * Test helper to validate configuration and get detailed errors
 */
export function validateConfigWithDetails<T>(
  config: unknown,
  schema: z.ZodSchema<T>
): { valid: boolean; errors?: string[]; data?: T } {
  try {
    const data = schema.parse(config);
    return { valid: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return { valid: false, errors };
    }
    return { valid: false, errors: ['Unknown validation error'] };
  }
}

/**
 * Create a configuration validator for testing
 */
export function createConfigValidator() {
  return {
    circuitBreaker: (config: unknown) => validateConfigWithDetails(config, CircuitBreakerConfigSchema),
    retryPolicy: (config: unknown) => validateConfigWithDetails(config, RetryPolicySchema),
    errorRecovery: (config: unknown) => validateConfigWithDetails(config, ErrorRecoveryConfigSchema)
  };
}

/**
 * Configuration edge case generator for property-based testing
 */
export function generateEdgeCaseConfigs() {
  return {
    circuitBreaker: [
      // Minimum valid values
      { failureThreshold: 1, resetTimeout: 1000, halfOpenLimit: 1, monitoringPeriod: 10000 },
      // Maximum valid values
      { failureThreshold: 100, resetTimeout: 300000, halfOpenLimit: 10, monitoringPeriod: 3600000 },
      // Common production values
      { failureThreshold: 5, resetTimeout: 60000, halfOpenLimit: 3, monitoringPeriod: 300000 },
      { failureThreshold: 10, resetTimeout: 30000, halfOpenLimit: 5, monitoringPeriod: 600000 }
    ],
    retryPolicy: [
      // Minimum valid values
      { maxAttempts: 1, backoffStrategy: 'fixed' as const, initialDelay: 100, maxDelay: 1000, jitter: false },
      // Maximum valid values  
      { maxAttempts: 10, backoffStrategy: 'exponential' as const, initialDelay: 10000, maxDelay: 60000, jitter: true },
      // Common production values
      { maxAttempts: 3, backoffStrategy: 'exponential' as const, initialDelay: 1000, maxDelay: 30000, jitter: true },
      { maxAttempts: 5, backoffStrategy: 'linear' as const, initialDelay: 500, maxDelay: 10000, jitter: false }
    ]
  };
}

/**
 * Mock configuration for testing
 */
export class MockConfigStore {
  private configs = new Map<string, unknown>();

  set(key: string, config: unknown): void {
    this.configs.set(key, config);
  }

  get(key: string): unknown | undefined {
    return this.configs.get(key);
  }

  clear(): void {
    this.configs.clear();
  }

  getAll(): Map<string, unknown> {
    return new Map(this.configs);
  }
}