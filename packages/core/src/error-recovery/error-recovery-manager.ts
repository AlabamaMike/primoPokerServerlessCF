import { CircuitBreaker, CircuitBreakerConfig } from './circuit-breaker';
import { RetryPolicy, RetryPolicyExecutor } from './retry-policy';
import { ErrorSanitizer } from './error-sanitizer';
import { CircuitBreakerMetricsCollector } from './metrics/circuit-breaker-metrics-collector';
import { DEFAULT_RESOURCE_CONFIGS, MetricsCollectorConfig } from './metrics/types';
import { Logger, LoggerFactory, LogContext } from '@primo-poker/logging';

// Helper function to create clean log contexts without undefined values
function createLogContext(context: Record<string, any>): LogContext {
  const cleanContext: LogContext = {};
  Object.entries(context).forEach(([key, value]) => {
    if (value !== undefined) {
      (cleanContext as any)[key] = value;
    }
  });
  return cleanContext;
}

export interface OperationContext {
  operationName: string;
  resourceType: string;
  resourceId?: string;
  critical: boolean;
  useCircuitBreaker?: boolean;
  timeout?: number;
}

export interface RecoveryStrategy {
  action: 'reconnect' | 'terminate' | 'graceful-degrade';
  delay?: number;
  reason?: string;
  fallbackMode?: string;
}

export interface ConnectionFailureContext {
  error: Error;
  disconnectTime: number;
  attemptCount: number;
  connectionType?: string;
}

export interface StateConflict {
  conflictType: string;
  localState: any;
  remoteState: any;
  field: string;
}

export interface ConflictResolution {
  strategy: 'last-write-wins' | 'merge' | 'manual-intervention';
  resolvedState?: any;
  requiresAdmin?: boolean;
}

export interface GameError {
  errorType: string;
  playerId?: string;
  gameId: string;
  context: any;
}

export interface FallbackAction {
  action: string;
  notifyOthers?: boolean;
  alertAdmin?: boolean;
  targetState?: any;
  defaultAction?: string;
}

export interface ErrorMetrics {
  errorRate: number;
  successRate: number;
  recoverySuccessRate: number;
  totalOperations: number;
  totalErrors: number;
  totalRecoveries: number;
}

export class ErrorRecoveryManager {
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private retryPolicies: Map<string, RetryPolicy> = new Map();
  private metricsCollectors: Map<string, CircuitBreakerMetricsCollector> = new Map();
  private readonly logger: Logger;
  private defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    initialDelay: 100,
    maxDelay: 5000,
    jitter: true,
  };
  
  private defaultMetricsConfig: MetricsCollectorConfig = {
    retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
    aggregationIntervals: {
      minute: true,
      hour: true,
      day: true,
    },
    alertThresholds: {
      tripRate: 10,
      failureRate: 50,
      responseTime: 5000,
    },
    exportFormat: 'json',
  };
  
  private metrics = {
    totalOperations: 0,
    totalErrors: 0,
    totalRecoveries: 0,
    successfulOperations: 0,
  };

  constructor() {
    this.logger = LoggerFactory.getInstance().getLogger('error-recovery');
    this.initializeDefaultPolicies();
    this.logger.info('ErrorRecoveryManager initialized');
  }

  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    context: OperationContext
  ): Promise<T> {
    this.metrics.totalOperations++;

    try {
      let result: T;
      
      // Create a wrapped operation with timeout if specified
      const operationWithTimeout = context.timeout
        ? () => this.withTimeout(operation(), context.timeout!)
        : operation;
      
      // Check if we should use circuit breaker
      if (context.useCircuitBreaker || this.shouldUseCircuitBreaker(context)) {
        const circuitBreaker = this.getOrCreateCircuitBreaker(context.resourceType);
        this.logger.debug('Executing operation with circuit breaker', {
          operation: context.operationName,
          resource: context.resourceType,
          resourceId: context.resourceId,
        });
        result = await circuitBreaker.execute(operationWithTimeout);
        this.metrics.successfulOperations++;
        return result;
      }

      // Check if error is recoverable
      if (this.isRecoverableResource(context.resourceType)) {
        const retryPolicy = this.getRetryPolicy(context.resourceType);
        const executor = new RetryPolicyExecutor(retryPolicy);
        
        try {
          result = await executor.execute(operationWithTimeout);
          this.metrics.successfulOperations++;
          return result;
        } catch (error) {
          this.metrics.totalErrors++;
          
          // Check if we recovered at some point
          if (this.wasRecovered(error)) {
            this.metrics.totalRecoveries++;
            this.logger.info('Operation recovered after retry', {
              operation: context.operationName,
              resource: context.resourceType,
              resourceId: context.resourceId,
            });
          }
          
          throw error;
        }
      }

      // Direct execution for non-recoverable operations
      result = await operationWithTimeout();
      this.metrics.successfulOperations++;
      return result;
    } catch (error) {
      this.metrics.totalErrors++;
      
      this.logger.error('Operation failed', error as Error, {
        operation: context.operationName,
        resource: context.resourceType,
        resourceId: context.resourceId,
        critical: context.critical,
      });
      
      if (context.critical) {
        this.handleCriticalError(error as Error, context);
      }
      
      throw error;
    }
  }

  handleConnectionFailure(clientId: string, context: ConnectionFailureContext): RecoveryStrategy {
    const maxReconnectAttempts = 5;
    const maxDisconnectTime = 5 * 60 * 1000; // 5 minutes

    this.logger.info('Handling connection failure', {
      clientId,
      attemptCount: context.attemptCount,
      connectionType: context.connectionType,
    });

    // Check if we should terminate
    if (context.attemptCount >= maxReconnectAttempts) {
      this.logger.warn('Max reconnection attempts reached', {
        clientId,
        attemptCount: context.attemptCount,
      });
      return {
        action: 'terminate',
        reason: 'Max reconnection attempts reached',
      };
    }

    const disconnectDuration = Date.now() - context.disconnectTime;
    if (disconnectDuration > maxDisconnectTime) {
      this.logger.warn('Connection timeout exceeded', {
        clientId,
        duration: disconnectDuration,
      });
      return {
        action: 'terminate',
        reason: 'Connection timeout exceeded',
      };
    }

    // Check if graceful degradation is appropriate
    if (context.connectionType === 'spectator') {
      this.logger.info('Applying graceful degradation for spectator', {
        clientId,
        fallbackMode: 'polling',
      });
      return {
        action: 'graceful-degrade',
        fallbackMode: 'polling',
      };
    }

    // Default to reconnect with exponential backoff
    const delay = Math.min(1000 * Math.pow(2, context.attemptCount - 1), 30000);
    this.logger.info('Scheduling reconnection', {
      clientId,
      delay,
      attemptCount: context.attemptCount,
    });
    return {
      action: 'reconnect',
      delay,
    };
  }

  handleStateConflict(conflict: StateConflict): ConflictResolution {
    this.logger.warn('State conflict detected', {
      conflictType: conflict.conflictType,
      field: conflict.field,
    });

    // Critical game state conflicts require manual intervention
    if (this.isCriticalField(conflict.field)) {
      this.logger.error('Critical field conflict requires manual intervention', undefined, {
        field: conflict.field,
        conflictType: conflict.conflictType,
      });
      return {
        strategy: 'manual-intervention',
        requiresAdmin: true,
      };
    }

    // Invalid state transitions
    if (conflict.conflictType === 'invalid-state-transition') {
      return {
        strategy: 'manual-intervention',
        requiresAdmin: true,
      };
    }

    // Try to merge if possible
    if (this.isMergeable(conflict)) {
      return {
        strategy: 'merge',
        resolvedState: this.mergeStates(conflict.localState, conflict.remoteState),
      };
    }

    // Default to last-write-wins for non-critical data
    return {
      strategy: 'last-write-wins',
      resolvedState: conflict.remoteState,
    };
  }

  handleGameError(error: GameError): FallbackAction {
    this.logger.info('Handling game error', createLogContext({
      errorType: error.errorType,
      playerId: error.playerId,
      gameId: error.gameId,
    }));

    switch (error.errorType) {
      case 'player-disconnected':
        if (error.context.inHand) {
          this.logger.info('Player disconnected during hand, auto-folding', createLogContext({
            playerId: error.playerId,
            gameId: error.gameId,
          }));
          return {
            action: 'auto-fold',
            notifyOthers: true,
          };
        }
        this.logger.info('Player disconnected, removing from table', createLogContext({
          playerId: error.playerId,
          gameId: error.gameId,
        }));
        return {
          action: 'remove-from-table',
          notifyOthers: true,
        };

      case 'state-corruption':
        this.logger.error('Game state corruption detected', undefined, {
          gameId: error.gameId,
          context: error.context,
        });
        return {
          action: 'pause-game',
          alertAdmin: true,
        };

      case 'invalid-action':
        return {
          action: 'rollback',
          targetState: error.context.lastValidState,
        };

      case 'player-timeout':
        return {
          action: 'skip-turn',
          defaultAction: 'check-or-fold',
        };

      default:
        return {
          action: 'log-and-continue',
        };
    }
  }

  configureRetryPolicy(resourceType: string, policy: RetryPolicy): void {
    this.retryPolicies.set(resourceType, policy);
  }

  configureCircuitBreaker(resourceType: string, config: CircuitBreakerConfig): void {
    // Validate configuration
    CircuitBreakerMetricsCollector.validateConfiguration(config);
    
    this.logger.info('Configuring circuit breaker', {
      resourceType,
      config,
    });
    
    const circuitBreaker = new CircuitBreaker(resourceType, config);
    this.circuitBreakers.set(resourceType, circuitBreaker);
    
    // Create metrics collector for this circuit breaker
    const metricsCollector = new CircuitBreakerMetricsCollector(
      circuitBreaker,
      this.defaultMetricsConfig,
      resourceType
    );
    this.metricsCollectors.set(resourceType, metricsCollector);
  }

  registerCircuitBreaker(name: string, circuitBreaker: CircuitBreaker): void {
    this.circuitBreakers.set(name, circuitBreaker);
  }

  getMetrics(): ErrorMetrics {
    const total = this.metrics.totalOperations || 1; // Avoid division by zero
    return {
      errorRate: this.metrics.totalErrors / total,
      successRate: this.metrics.successfulOperations / total,
      recoverySuccessRate: this.metrics.totalRecoveries / (this.metrics.totalErrors || 1),
      totalOperations: this.metrics.totalOperations,
      totalErrors: this.metrics.totalErrors,
      totalRecoveries: this.metrics.totalRecoveries,
    };
  }
  
  getCircuitBreakerMetrics(resourceType: string) {
    const collector = this.metricsCollectors.get(resourceType);
    if (!collector) {
      return null;
    }
    return collector.export();
  }
  
  getAllCircuitBreakerMetrics() {
    const metrics: Record<string, any> = {};
    for (const [resourceType, collector] of this.metricsCollectors.entries()) {
      metrics[resourceType] = collector.export();
    }
    return metrics;
  }
  
  exportMetricsPrometheus(): string {
    const lines: string[] = [];
    for (const [resourceType, collector] of this.metricsCollectors.entries()) {
      lines.push(`# Circuit breaker metrics for ${resourceType}`);
      lines.push(collector.exportPrometheus());
      lines.push('');
    }
    return lines.join('\n');
  }

  getCircuitBreakerStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    this.circuitBreakers.forEach((cb, name) => {
      status[name] = cb.getState();
    });
    return status;
  }

  private initializeDefaultPolicies(): void {
    // API calls - more aggressive retry
    this.retryPolicies.set('api', {
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      initialDelay: 100,
      maxDelay: 5000,
      jitter: true,
    });

    // Database operations - fewer retries, longer delays
    this.retryPolicies.set('database', {
      maxAttempts: 2,
      backoffStrategy: 'exponential',
      initialDelay: 500,
      maxDelay: 5000,
      jitter: false,
    });

    // WebSocket operations
    this.retryPolicies.set('websocket', {
      maxAttempts: 5,
      backoffStrategy: 'exponential',
      initialDelay: 1000,
      maxDelay: 30000,
      jitter: true,
    });
  }

  private shouldUseCircuitBreaker(context: OperationContext): boolean {
    const circuitBreakerResources = ['external-api', 'payment-api', 'third-party'];
    return circuitBreakerResources.includes(context.resourceType);
  }

  private isRecoverableResource(resourceType: string): boolean {
    const nonRecoverableTypes = ['validation', 'authorization', 'business-logic'];
    return !nonRecoverableTypes.includes(resourceType);
  }

  private getOrCreateCircuitBreaker(resourceType: string): CircuitBreaker {
    if (!this.circuitBreakers.has(resourceType)) {
      const config = this.getCircuitBreakerConfig(resourceType);
      const circuitBreaker = new CircuitBreaker(resourceType, config);
      this.circuitBreakers.set(resourceType, circuitBreaker);
      
      // Create metrics collector for this circuit breaker
      const metricsCollector = new CircuitBreakerMetricsCollector(
        circuitBreaker,
        this.defaultMetricsConfig,
        resourceType
      );
      this.metricsCollectors.set(resourceType, metricsCollector);
    }
    return this.circuitBreakers.get(resourceType)!;
  }
  
  private getCircuitBreakerConfig(resourceType: string): CircuitBreakerConfig {
    // Use resource-specific configurations from the centralized config
    const resourceConfig = DEFAULT_RESOURCE_CONFIGS[resourceType];
    if (resourceConfig) {
      // Validate configuration before using
      CircuitBreakerMetricsCollector.validateConfiguration(resourceConfig.circuitBreakerConfig);
      return resourceConfig.circuitBreakerConfig;
    }
    
    // Fall back to default config - we know 'api' exists in DEFAULT_RESOURCE_CONFIGS
    return DEFAULT_RESOURCE_CONFIGS.api!.circuitBreakerConfig;
  }

  private getRetryPolicy(resourceType: string): RetryPolicy {
    return this.retryPolicies.get(resourceType) || this.defaultRetryPolicy;
  }

  private handleCriticalError(error: Error, context: OperationContext): void {
    // Sanitize error before logging to prevent sensitive data exposure
    const sanitizedError = ErrorSanitizer.sanitizeForLogging(error);
    
    this.logger.error(`Critical error in operation`, sanitizedError, {
      operation: context.operationName,
      resource: context.resourceType,
      resourceId: context.resourceId,
      critical: true,
    });
    
    // In a real implementation, this would also send alerts to monitoring service
  }

  private wasRecovered(error: any): boolean {
    // Simple heuristic - in reality would track retry attempts
    return false;
  }

  private async withTimeout<T>(promise: Promise<T>, timeout: number): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeout}ms`));
      }, timeout);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private isCriticalField(field: string): boolean {
    const criticalFields = ['gamePhase', 'pot', 'playerBalances', 'deck'];
    return criticalFields.includes(field);
  }

  private isMergeable(conflict: StateConflict): boolean {
    // Simple check - in reality would have more sophisticated logic
    return conflict.field === 'gameState' && 
           typeof conflict.localState === 'object' && 
           typeof conflict.remoteState === 'object';
  }

  private mergeStates(local: any, remote: any): any {
    // Deep merge with conflict resolution for game states
    if (!local || !remote || typeof local !== 'object' || typeof remote !== 'object') {
      return remote; // Prefer remote state if not mergeable
    }

    const merged: any = { ...local };

    for (const key in remote) {
      if (!(key in merged)) {
        // Add new fields from remote
        merged[key] = remote[key];
      } else if (this.isCriticalField(key)) {
        // Critical fields always use remote (server) state
        merged[key] = remote[key];
      } else if (typeof remote[key] === 'object' && typeof merged[key] === 'object') {
        // Recursively merge nested objects
        if (Array.isArray(remote[key]) && Array.isArray(merged[key])) {
          // For arrays, prefer remote state to avoid inconsistencies
          merged[key] = remote[key];
        } else if (remote[key] instanceof Date || merged[key] instanceof Date) {
          // For dates, use the most recent
          merged[key] = new Date(Math.max(
            new Date(remote[key]).getTime(),
            new Date(merged[key]).getTime()
          ));
        } else {
          // Recursive merge for nested objects
          merged[key] = this.mergeStates(merged[key], remote[key]);
        }
      } else if (key === 'version' || key === 'timestamp') {
        // Version/timestamp fields use the higher value
        merged[key] = Math.max(Number(merged[key]) || 0, Number(remote[key]) || 0);
      } else {
        // For primitive values, use remote state
        merged[key] = remote[key];
      }
    }

    return merged;
  }
  
  configureMetrics(config: MetricsCollectorConfig): void {
    this.defaultMetricsConfig = config;
    
    // Update existing collectors
    for (const [resourceType, circuitBreaker] of this.circuitBreakers.entries()) {
      const newCollector = new CircuitBreakerMetricsCollector(
        circuitBreaker,
        config,
        resourceType
      );
      this.metricsCollectors.set(resourceType, newCollector);
    }
  }
}

export default ErrorRecoveryManager;