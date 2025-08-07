import { 
  CircuitBreakerConfig, 
  RetryPolicy,
  ErrorRecoveryConfig,
  parseCircuitBreakerConfig,
  parseRetryPolicy,
  parseErrorRecoveryConfig
} from './config-validation';
import { Logger, LoggerFactory } from '@primo-poker/logging';

/**
 * Configuration migration utilities for error recovery
 */

export interface ConfigMigration<TFrom = unknown, TTo = unknown> {
  version: string;
  description: string;
  migrate: (oldConfig: TFrom) => TTo;
}

/**
 * Circuit breaker configuration migrations
 */
export const circuitBreakerMigrations: ConfigMigration[] = [
  {
    version: '1.0.0',
    description: 'Initial circuit breaker configuration',
    migrate: (oldConfig: any): CircuitBreakerConfig => {
      // Handle legacy configuration formats
      const migrated: any = {
        failureThreshold: oldConfig.failureThreshold ?? oldConfig.threshold ?? 5,
        resetTimeout: oldConfig.resetTimeout ?? oldConfig.timeout ?? 60000,
        halfOpenLimit: oldConfig.halfOpenLimit ?? oldConfig.halfOpenMax ?? 3,
        monitoringPeriod: oldConfig.monitoringPeriod ?? oldConfig.window ?? 60000
      };

      // Ensure backward compatibility with old field names
      if (oldConfig.failureCount !== undefined && !oldConfig.failureThreshold) {
        migrated.failureThreshold = oldConfig.failureCount;
      }

      return parseCircuitBreakerConfig(migrated);
    }
  }
];

/**
 * Retry policy configuration migrations
 */
export const retryPolicyMigrations: ConfigMigration[] = [
  {
    version: '1.0.0',
    description: 'Initial retry policy configuration',
    migrate: (oldConfig: any): RetryPolicy => {
      // Handle legacy configuration formats
      const migrated: any = {
        maxAttempts: oldConfig.maxAttempts ?? oldConfig.retries ?? 3,
        backoffStrategy: oldConfig.backoffStrategy ?? oldConfig.strategy ?? 'exponential',
        initialDelay: oldConfig.initialDelay ?? oldConfig.delay ?? 1000,
        maxDelay: oldConfig.maxDelay ?? oldConfig.maxBackoff ?? 30000,
        jitter: oldConfig.jitter ?? oldConfig.randomize ?? true
      };

      // Handle old backoff strategy names
      if (migrated.backoffStrategy === 'exp') {
        migrated.backoffStrategy = 'exponential';
      } else if (migrated.backoffStrategy === 'const') {
        migrated.backoffStrategy = 'fixed';
      }

      return parseRetryPolicy(migrated);
    }
  }
];

/**
 * Configuration migrator class
 */
export class ConfigMigrator {
  private readonly logger: Logger;

  constructor() {
    this.logger = LoggerFactory.getInstance().getLogger('config-migrator');
  }

  /**
   * Migrate circuit breaker configuration to the latest version
   */
  migrateCircuitBreakerConfig(config: unknown, fromVersion?: string): CircuitBreakerConfig {
    try {
      // If it's already valid, return it
      return parseCircuitBreakerConfig(config);
    } catch (error) {
      // Apply migrations
      this.logger.info('Migrating circuit breaker configuration', { fromVersion });
      
      let migratedConfig = config;
      for (const migration of circuitBreakerMigrations) {
        try {
          migratedConfig = migration.migrate(migratedConfig);
          this.logger.debug('Applied migration', { 
            version: migration.version, 
            description: migration.description 
          });
        } catch (migrationError) {
          this.logger.warn('Migration failed, trying next', { 
            version: migration.version,
            error: (migrationError as Error).message 
          });
        }
      }

      return migratedConfig as CircuitBreakerConfig;
    }
  }

  /**
   * Migrate retry policy configuration to the latest version
   */
  migrateRetryPolicyConfig(config: unknown, fromVersion?: string): RetryPolicy {
    try {
      // If it's already valid, return it
      return parseRetryPolicy(config);
    } catch (error) {
      // Apply migrations
      this.logger.info('Migrating retry policy configuration', { fromVersion });
      
      let migratedConfig = config;
      for (const migration of retryPolicyMigrations) {
        try {
          migratedConfig = migration.migrate(migratedConfig);
          this.logger.debug('Applied migration', { 
            version: migration.version, 
            description: migration.description 
          });
        } catch (migrationError) {
          this.logger.warn('Migration failed, trying next', { 
            version: migration.version,
            error: (migrationError as Error).message 
          });
        }
      }

      return migratedConfig as RetryPolicy;
    }
  }

  /**
   * Migrate full error recovery configuration
   */
  migrateErrorRecoveryConfig(config: unknown): ErrorRecoveryConfig {
    try {
      // If it's already valid, return it
      return parseErrorRecoveryConfig(config);
    } catch (error) {
      this.logger.info('Migrating error recovery configuration');
      
      const migratedConfig: any = {
        enabled: true,
        logLevel: 'info'
      };

      // Migrate circuit breaker if present
      if ((config as any)?.circuitBreaker) {
        try {
          migratedConfig.circuitBreaker = this.migrateCircuitBreakerConfig((config as any).circuitBreaker);
        } catch (cbError) {
          this.logger.warn('Failed to migrate circuit breaker config', { 
            error: (cbError as Error).message 
          });
        }
      }

      // Migrate retry policy if present
      if ((config as any)?.retryPolicy) {
        try {
          migratedConfig.retryPolicy = this.migrateRetryPolicyConfig((config as any).retryPolicy);
        } catch (rpError) {
          this.logger.warn('Failed to migrate retry policy config', { 
            error: (rpError as Error).message 
          });
        }
      }

      // Handle legacy enabled field
      if ((config as any)?.disabled === true) {
        migratedConfig.enabled = false;
      } else if ((config as any)?.enabled !== undefined) {
        migratedConfig.enabled = (config as any).enabled;
      }

      // Handle legacy log level
      if ((config as any)?.logLevel) {
        const level = (config as any).logLevel.toLowerCase();
        if (['debug', 'info', 'warn', 'error'].includes(level)) {
          migratedConfig.logLevel = level;
        }
      }

      return parseErrorRecoveryConfig(migratedConfig);
    }
  }
}

// Singleton instance
export const configMigrator = new ConfigMigrator();