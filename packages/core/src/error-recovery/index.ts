export { CircuitBreaker } from './circuit-breaker';
export type { CircuitBreakerConfig, CircuitBreakerState, CircuitBreakerMetrics } from './circuit-breaker';
export { RetryPolicyExecutor } from './retry-policy';
export type { RetryPolicy, RetryContext } from './retry-policy';
export { ErrorRecoveryManager } from './error-recovery-manager';
export type {
  OperationContext,
  RecoveryStrategy,
  ConnectionFailureContext,
  StateConflict,
  ConflictResolution,
  GameError,
  FallbackAction,
  ErrorMetrics
} from './error-recovery-manager';
export { RecoveryStrategies } from './recovery-strategies';
export type {
  ErrorType,
  RecoveryContext,
  RecoveryStrategy as StrategyConfig
} from './recovery-strategies';
export { ErrorSanitizer } from './error-sanitizer';
export { CircuitBreakerMetricsCollector } from './metrics/circuit-breaker-metrics-collector';
export type {
  CircuitBreakerStateTransition,
  CircuitBreakerMetricsSnapshot,
  TimeSeriesDataPoint,
  CircuitBreakerAlert,
  MetricsAggregation,
  MetricsExportFormat,
  MetricsCollectorConfig,
  ResourceSpecificConfig
} from './metrics/types';
export { DEFAULT_RESOURCE_CONFIGS } from './metrics/types';

// Configuration validation exports
export {
  CircuitBreakerConfigSchema,
  RetryPolicySchema,
  ErrorRecoveryConfigSchema,
  parseCircuitBreakerConfig,
  parseRetryPolicy,
  parseErrorRecoveryConfig,
  formatValidationError
} from './config-validation';
export type {
  CircuitBreakerConfig as ValidatedCircuitBreakerConfig,
  RetryPolicy as ValidatedRetryPolicy,
  ErrorRecoveryConfig
} from './config-validation';

// Configuration management exports
export { ErrorRecoveryConfigManager } from './config-manager';

// Configuration migration exports
export { ConfigMigrator, configMigrator } from './config-migration';
export type { ConfigMigration } from './config-migration';

// Configuration testing utilities exports
export {
  generateValidCircuitBreakerConfig,
  generateValidRetryPolicy,
  generateValidErrorRecoveryConfig,
  invalidConfigs,
  validateConfigWithDetails,
  createConfigValidator,
  generateEdgeCaseConfigs,
  MockConfigStore
} from './config-test-utils';

// Re-export the default instance for convenience
import ErrorRecoveryManager from './error-recovery-manager';
export default ErrorRecoveryManager;