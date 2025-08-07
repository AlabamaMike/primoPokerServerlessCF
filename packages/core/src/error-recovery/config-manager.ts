import { CircuitBreaker } from './circuit-breaker';
import { RetryPolicyExecutor } from './retry-policy';
import { 
  parseCircuitBreakerConfig, 
  parseRetryPolicy,
  parseErrorRecoveryConfig,
  type CircuitBreakerConfig,
  type RetryPolicy,
  type ErrorRecoveryConfig
} from './config-validation';
import { Logger, LoggerFactory } from '@primo-poker/logging';

/**
 * Configuration manager for error recovery with runtime validation
 */
export class ErrorRecoveryConfigManager {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private retryPolicies: Map<string, RetryPolicyExecutor> = new Map();
  private config: ErrorRecoveryConfig;
  private readonly logger: Logger;

  constructor(initialConfig?: ErrorRecoveryConfig) {
    this.logger = LoggerFactory.getInstance().getLogger('error-recovery-config');
    this.config = initialConfig ? parseErrorRecoveryConfig(initialConfig) : { enabled: true, logLevel: 'info' };
    this.logger.info('Error recovery config manager initialized', { config: this.config });
  }

  /**
   * Update the global error recovery configuration
   */
  updateConfig(newConfig: Partial<ErrorRecoveryConfig>): void {
    try {
      const mergedConfig = { ...this.config, ...newConfig };
      this.config = parseErrorRecoveryConfig(mergedConfig);
      this.logger.info('Error recovery configuration updated', { config: this.config });
    } catch (error) {
      this.logger.error('Failed to update error recovery configuration', error as Error);
      throw error;
    }
  }

  /**
   * Create or update a circuit breaker with validation
   */
  configureCircuitBreaker(name: string, config: CircuitBreakerConfig): CircuitBreaker {
    try {
      const validatedConfig = parseCircuitBreakerConfig(config);
      
      // If circuit breaker exists, log that we're replacing it
      if (this.circuitBreakers.has(name)) {
        this.logger.warn('Replacing existing circuit breaker', { name });
      }
      
      const circuitBreaker = new CircuitBreaker(name, validatedConfig);
      this.circuitBreakers.set(name, circuitBreaker);
      
      this.logger.info('Circuit breaker configured', { name, config: validatedConfig });
      return circuitBreaker;
    } catch (error) {
      this.logger.error('Failed to configure circuit breaker', error as Error, { name });
      throw error;
    }
  }

  /**
   * Create or update a retry policy with validation
   */
  configureRetryPolicy(name: string, config: RetryPolicy): RetryPolicyExecutor {
    try {
      const validatedConfig = parseRetryPolicy(config);
      
      // If retry policy exists, log that we're replacing it
      if (this.retryPolicies.has(name)) {
        this.logger.warn('Replacing existing retry policy', { name });
      }
      
      const retryPolicy = new RetryPolicyExecutor(validatedConfig);
      this.retryPolicies.set(name, retryPolicy);
      
      this.logger.info('Retry policy configured', { name, config: validatedConfig });
      return retryPolicy;
    } catch (error) {
      this.logger.error('Failed to configure retry policy', error as Error, { name });
      throw error;
    }
  }

  /**
   * Get a configured circuit breaker
   */
  getCircuitBreaker(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }

  /**
   * Get a configured retry policy
   */
  getRetryPolicy(name: string): RetryPolicyExecutor | undefined {
    return this.retryPolicies.get(name);
  }

  /**
   * Get all circuit breaker names
   */
  getCircuitBreakerNames(): string[] {
    return Array.from(this.circuitBreakers.keys());
  }

  /**
   * Get all retry policy names
   */
  getRetryPolicyNames(): string[] {
    return Array.from(this.retryPolicies.keys());
  }

  /**
   * Check if error recovery is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled ?? true;
  }

  /**
   * Get the current configuration
   */
  getConfig(): ErrorRecoveryConfig {
    return { ...this.config };
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuitBreakers(): void {
    this.circuitBreakers.forEach((cb, name) => {
      cb.reset();
      this.logger.info('Reset circuit breaker', { name });
    });
  }

  /**
   * Clear all configurations
   */
  clear(): void {
    this.circuitBreakers.clear();
    this.retryPolicies.clear();
    this.logger.info('Cleared all error recovery configurations');
  }
}