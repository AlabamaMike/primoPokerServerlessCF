import { z } from 'zod';

/**
 * Configuration validation schemas for error recovery
 */

// Circuit Breaker configuration schema
export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z
    .number()
    .int()
    .positive()
    .max(100)
    .describe('Number of failures before the circuit breaker trips'),
  
  resetTimeout: z
    .number()
    .int()
    .positive()
    .min(1000)
    .max(300000) // Max 5 minutes
    .describe('Time in milliseconds before attempting to reset from open state'),
  
  halfOpenLimit: z
    .number()
    .int()
    .positive()
    .max(10)
    .describe('Number of requests allowed in half-open state'),
  
  monitoringPeriod: z
    .number()
    .int()
    .positive()
    .min(10000)
    .max(3600000) // Max 1 hour
    .describe('Time window in milliseconds for metrics collection')
});

// Retry Policy configuration schema
export const RetryPolicySchema = z.object({
  maxAttempts: z
    .number()
    .int()
    .positive()
    .max(10)
    .describe('Maximum number of retry attempts'),
  
  backoffStrategy: z
    .enum(['exponential', 'linear', 'fixed'])
    .describe('Strategy for calculating delay between retries'),
  
  initialDelay: z
    .number()
    .int()
    .positive()
    .min(100)
    .max(10000)
    .describe('Initial delay in milliseconds before first retry'),
  
  maxDelay: z
    .number()
    .int()
    .positive()
    .min(1000)
    .max(60000) // Max 1 minute
    .describe('Maximum delay in milliseconds between retries'),
  
  jitter: z
    .boolean()
    .describe('Whether to add randomization to retry delays')
}).refine(
  (data) => data.maxDelay >= data.initialDelay,
  {
    message: 'maxDelay must be greater than or equal to initialDelay',
    path: ['maxDelay']
  }
);

// Combined error recovery configuration schema
export const ErrorRecoveryConfigSchema = z.object({
  circuitBreaker: CircuitBreakerConfigSchema.optional(),
  retryPolicy: RetryPolicySchema.optional(),
  enabled: z.boolean().default(true),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

// Type exports
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;
export type RetryPolicy = z.infer<typeof RetryPolicySchema>;
export type ErrorRecoveryConfig = z.infer<typeof ErrorRecoveryConfigSchema>;

// Validation error formatting
export function formatValidationError(error: z.ZodError): string {
  return error.errors
    .map(e => {
      const path = e.path.join('.');
      const message = e.message;
      return `${path}: ${message}`;
    })
    .join('; ');
}

// Safe configuration parser with helpful error messages
export function parseCircuitBreakerConfig(config: unknown): CircuitBreakerConfig {
  try {
    return CircuitBreakerConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid circuit breaker configuration: ${formatValidationError(error)}`);
    }
    throw error;
  }
}

export function parseRetryPolicy(config: unknown): RetryPolicy {
  try {
    return RetryPolicySchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid retry policy configuration: ${formatValidationError(error)}`);
    }
    throw error;
  }
}

export function parseErrorRecoveryConfig(config: unknown): ErrorRecoveryConfig {
  try {
    return ErrorRecoveryConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid error recovery configuration: ${formatValidationError(error)}`);
    }
    throw error;
  }
}