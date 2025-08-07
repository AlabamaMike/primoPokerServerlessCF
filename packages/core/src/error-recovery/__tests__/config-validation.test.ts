import {
  CircuitBreakerConfigSchema,
  RetryPolicySchema,
  ErrorRecoveryConfigSchema,
  parseCircuitBreakerConfig,
  parseRetryPolicy,
  parseErrorRecoveryConfig,
  formatValidationError
} from '../config-validation';
import {
  generateValidCircuitBreakerConfig,
  generateValidRetryPolicy,
  generateValidErrorRecoveryConfig,
  invalidConfigs,
  validateConfigWithDetails,
  createConfigValidator
} from '../config-test-utils';
import { z } from 'zod';

describe('Configuration Validation', () => {
  describe('CircuitBreakerConfigSchema', () => {
    it('should accept valid configuration', () => {
      const config = generateValidCircuitBreakerConfig();
      const result = CircuitBreakerConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject negative failure threshold', () => {
      const config = invalidConfigs.circuitBreaker.negativeThreshold;
      const result = CircuitBreakerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject too high failure threshold', () => {
      const config = invalidConfigs.circuitBreaker.tooHighThreshold;
      const result = CircuitBreakerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject short reset timeout', () => {
      const config = invalidConfigs.circuitBreaker.shortResetTimeout;
      const result = CircuitBreakerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject long monitoring period', () => {
      const config = invalidConfigs.circuitBreaker.longMonitoringPeriod;
      const result = CircuitBreakerConfigSchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should provide helpful error messages', () => {
      const config = { failureThreshold: -1 };
      expect(() => parseCircuitBreakerConfig(config)).toThrow(
        /Invalid circuit breaker configuration/
      );
    });
  });

  describe('RetryPolicySchema', () => {
    it('should accept valid configuration', () => {
      const config = generateValidRetryPolicy();
      const result = RetryPolicySchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should reject zero attempts', () => {
      const config = invalidConfigs.retryPolicy.zeroAttempts;
      const result = RetryPolicySchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject invalid backoff strategy', () => {
      const config = invalidConfigs.retryPolicy.invalidStrategy;
      const result = RetryPolicySchema.safeParse(config);
      expect(result.success).toBe(false);
    });

    it('should reject delay mismatch', () => {
      const config = invalidConfigs.retryPolicy.delayMismatch;
      const result = RetryPolicySchema.safeParse(config);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain('maxDelay must be greater than or equal to initialDelay');
      }
    });

    it('should accept all valid backoff strategies', () => {
      const strategies = ['exponential', 'linear', 'fixed'] as const;
      strategies.forEach(strategy => {
        const config = generateValidRetryPolicy({ backoffStrategy: strategy });
        const result = RetryPolicySchema.safeParse(config);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('ErrorRecoveryConfigSchema', () => {
    it('should accept valid configuration', () => {
      const config = generateValidErrorRecoveryConfig();
      const result = ErrorRecoveryConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should accept partial configuration', () => {
      const config = { enabled: true };
      const result = ErrorRecoveryConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('should use defaults', () => {
      const config = {};
      const result = ErrorRecoveryConfigSchema.parse(config);
      expect(result.enabled).toBe(true);
      expect(result.logLevel).toBe('info');
    });

    it('should accept all log levels', () => {
      const levels = ['debug', 'info', 'warn', 'error'] as const;
      levels.forEach(level => {
        const config = { logLevel: level };
        const result = ErrorRecoveryConfigSchema.safeParse(config);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('formatValidationError', () => {
    it('should format single error', () => {
      try {
        CircuitBreakerConfigSchema.parse({ failureThreshold: -1 });
      } catch (error) {
        if (error instanceof z.ZodError) {
          const formatted = formatValidationError(error);
          expect(formatted).toContain('failureThreshold');
        }
      }
    });

    it('should format multiple errors', () => {
      try {
        CircuitBreakerConfigSchema.parse({});
      } catch (error) {
        if (error instanceof z.ZodError) {
          const formatted = formatValidationError(error);
          expect(formatted).toContain(';');
          expect(formatted).toContain('failureThreshold');
          expect(formatted).toContain('resetTimeout');
        }
      }
    });
  });

  describe('Configuration Test Utilities', () => {
    const validator = createConfigValidator();

    it('should validate with details', () => {
      const validConfig = generateValidCircuitBreakerConfig();
      const result = validator.circuitBreaker(validConfig);
      expect(result.valid).toBe(true);
      expect(result.data).toEqual(validConfig);
    });

    it('should provide error details', () => {
      const invalidConfig = { failureThreshold: -1 };
      const result = validator.circuitBreaker(invalidConfig);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('failureThreshold');
    });
  });
});