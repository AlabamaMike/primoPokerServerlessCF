import { CircuitBreaker, CircuitBreakerConfig } from './circuit-breaker';
import { RetryPolicy, RetryPolicyExecutor } from './retry-policy';
import { ErrorSanitizer } from './error-sanitizer';

export interface OperationContext {
  operationName: string;
  resourceType: string;
  resourceId?: string;
  critical: boolean;
  useCircuitBreaker?: boolean;
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
  private defaultRetryPolicy: RetryPolicy = {
    maxAttempts: 3,
    backoffStrategy: 'exponential',
    initialDelay: 100,
    maxDelay: 5000,
    jitter: true,
  };
  
  private metrics = {
    totalOperations: 0,
    totalErrors: 0,
    totalRecoveries: 0,
    successfulOperations: 0,
  };

  constructor() {
    this.initializeDefaultPolicies();
  }

  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    context: OperationContext
  ): Promise<T> {
    this.metrics.totalOperations++;

    try {
      let result: T;
      
      // Check if we should use circuit breaker
      if (context.useCircuitBreaker || this.shouldUseCircuitBreaker(context)) {
        const circuitBreaker = this.getOrCreateCircuitBreaker(context.resourceType);
        result = await circuitBreaker.execute(operation);
        this.metrics.successfulOperations++;
        return result;
      }

      // Check if error is recoverable
      if (this.isRecoverableResource(context.resourceType)) {
        const retryPolicy = this.getRetryPolicy(context.resourceType);
        const executor = new RetryPolicyExecutor(retryPolicy);
        
        try {
          result = await executor.execute(operation);
          this.metrics.successfulOperations++;
          return result;
        } catch (error) {
          this.metrics.totalErrors++;
          
          // Check if we recovered at some point
          if (this.wasRecovered(error)) {
            this.metrics.totalRecoveries++;
          }
          
          throw error;
        }
      }

      // Direct execution for non-recoverable operations
      result = await operation();
      this.metrics.successfulOperations++;
      return result;
    } catch (error) {
      this.metrics.totalErrors++;
      
      if (context.critical) {
        this.handleCriticalError(error as Error, context);
      }
      
      throw error;
    }
  }

  handleConnectionFailure(clientId: string, context: ConnectionFailureContext): RecoveryStrategy {
    const maxReconnectAttempts = 5;
    const maxDisconnectTime = 5 * 60 * 1000; // 5 minutes

    // Check if we should terminate
    if (context.attemptCount >= maxReconnectAttempts) {
      return {
        action: 'terminate',
        reason: 'Max reconnection attempts reached',
      };
    }

    const disconnectDuration = Date.now() - context.disconnectTime;
    if (disconnectDuration > maxDisconnectTime) {
      return {
        action: 'terminate',
        reason: 'Connection timeout exceeded',
      };
    }

    // Check if graceful degradation is appropriate
    if (context.connectionType === 'spectator') {
      return {
        action: 'graceful-degrade',
        fallbackMode: 'polling',
      };
    }

    // Default to reconnect with exponential backoff
    const delay = Math.min(1000 * Math.pow(2, context.attemptCount - 1), 30000);
    return {
      action: 'reconnect',
      delay,
    };
  }

  handleStateConflict(conflict: StateConflict): ConflictResolution {
    // Critical game state conflicts require manual intervention
    if (this.isCriticalField(conflict.field)) {
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
    switch (error.errorType) {
      case 'player-disconnected':
        if (error.context.inHand) {
          return {
            action: 'auto-fold',
            notifyOthers: true,
          };
        }
        return {
          action: 'remove-from-table',
          notifyOthers: true,
        };

      case 'state-corruption':
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
    const circuitBreaker = new CircuitBreaker(resourceType, config);
    this.circuitBreakers.set(resourceType, circuitBreaker);
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
      const config: CircuitBreakerConfig = {
        failureThreshold: 5,
        resetTimeout: 60000,
        halfOpenLimit: 2,
        monitoringPeriod: 300000,
      };
      this.circuitBreakers.set(resourceType, new CircuitBreaker(resourceType, config));
    }
    return this.circuitBreakers.get(resourceType)!;
  }

  private getRetryPolicy(resourceType: string): RetryPolicy {
    return this.retryPolicies.get(resourceType) || this.defaultRetryPolicy;
  }

  private handleCriticalError(error: Error, context: OperationContext): void {
    // Sanitize error before logging to prevent sensitive data exposure
    const sanitizedError = ErrorSanitizer.sanitizeForLogging(error);
    console.error(`Critical error in ${context.operationName}:`, sanitizedError);
    
    // In a real implementation, this would also send alerts to monitoring service
  }

  private wasRecovered(error: any): boolean {
    // Simple heuristic - in reality would track retry attempts
    return false;
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
}

export default ErrorRecoveryManager;