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

// Re-export the default instance for convenience
import ErrorRecoveryManager from './error-recovery-manager';
export default ErrorRecoveryManager;