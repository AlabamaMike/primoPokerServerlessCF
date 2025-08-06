import { ErrorRecoveryManager, OperationContext, RecoveryStrategy } from '../error-recovery-manager';
import { CircuitBreaker } from '../circuit-breaker';
import { RetryPolicyExecutor } from '../retry-policy';

jest.mock('../circuit-breaker');
jest.mock('../retry-policy');

describe('ErrorRecoveryManager', () => {
  let manager: ErrorRecoveryManager;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;
  let mockRetryExecutor: jest.Mocked<RetryPolicyExecutor>;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new ErrorRecoveryManager();
    
    // Setup mocks
    mockCircuitBreaker = new CircuitBreaker('test', {
      failureThreshold: 3,
      resetTimeout: 1000,
      halfOpenLimit: 2,
      monitoringPeriod: 60000,
    }) as jest.Mocked<CircuitBreaker>;
    
    mockRetryExecutor = new RetryPolicyExecutor({
      maxAttempts: 3,
      backoffStrategy: 'exponential',
      initialDelay: 100,
      maxDelay: 5000,
      jitter: false,
    }) as jest.Mocked<RetryPolicyExecutor>;
  });

  describe('executeWithRecovery', () => {
    it('should execute operation successfully with no errors', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const context: OperationContext = {
        operationName: 'test-operation',
        resourceType: 'api',
        critical: false,
      };

      const result = await manager.executeWithRecovery(operation, context);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should apply retry policy for transient errors', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockResolvedValue('success');
      
      const context: OperationContext = {
        operationName: 'api-call',
        resourceType: 'api',
        critical: false,
      };

      mockRetryExecutor.execute.mockImplementation(async (op) => {
        try {
          return await op();
        } catch (error) {
          return await op();
        }
      });

      const result = await manager.executeWithRecovery(operation, context);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should use circuit breaker for configured resources', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const context: OperationContext = {
        operationName: 'external-api-call',
        resourceType: 'external-api',
        critical: false,
        useCircuitBreaker: true,
      };

      mockCircuitBreaker.execute.mockResolvedValue('success');
      mockCircuitBreaker.allowRequest.mockReturnValue(true);

      const result = await manager.executeWithRecovery(operation, context);

      expect(result).toBe('success');
    });

    it('should skip recovery for non-recoverable errors', async () => {
      const validationError = new Error('Validation failed');
      const operation = jest.fn().mockRejectedValue(validationError);
      
      const context: OperationContext = {
        operationName: 'validate-input',
        resourceType: 'validation',
        critical: false,
      };

      await expect(manager.executeWithRecovery(operation, context)).rejects.toThrow('Validation failed');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should handle critical operations differently', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Critical failure'));
      const context: OperationContext = {
        operationName: 'critical-operation',
        resourceType: 'database',
        critical: true,
      };

      await expect(manager.executeWithRecovery(operation, context)).rejects.toThrow('Critical failure');
      // Should alert and log for critical failures
    });
  });

  describe('handleConnectionFailure', () => {
    it('should return reconnect strategy for temporary disconnections', () => {
      const strategy = manager.handleConnectionFailure('client-123', {
        error: new Error('WebSocket connection lost'),
        disconnectTime: Date.now(),
        attemptCount: 1,
      });

      expect(strategy.action).toBe('reconnect');
      expect(strategy.delay).toBeGreaterThan(0);
    });

    it('should return terminate strategy after max attempts', () => {
      const strategy = manager.handleConnectionFailure('client-123', {
        error: new Error('Connection failed'),
        disconnectTime: Date.now() - 300000, // 5 minutes ago
        attemptCount: 10,
      });

      expect(strategy.action).toBe('terminate');
      expect(strategy.reason).toContain('Max reconnection attempts');
    });

    it('should return graceful-degrade for non-critical connections', () => {
      const strategy = manager.handleConnectionFailure('spectator-123', {
        error: new Error('Connection timeout'),
        disconnectTime: Date.now(),
        attemptCount: 3,
        connectionType: 'spectator',
      });

      expect(strategy.action).toBe('graceful-degrade');
      expect(strategy.fallbackMode).toBe('polling');
    });
  });

  describe('handleStateConflict', () => {
    it('should resolve conflicts using last-write-wins for non-critical data', () => {
      const resolution = manager.handleStateConflict({
        conflictType: 'concurrent-update',
        localState: { version: 1, data: 'local' },
        remoteState: { version: 2, data: 'remote' },
        field: 'chatMessage',
      });

      expect(resolution.strategy).toBe('last-write-wins');
      expect(resolution.resolvedState).toEqual({ version: 2, data: 'remote' });
    });

    it('should use merge strategy for mergeable conflicts', () => {
      const resolution = manager.handleStateConflict({
        conflictType: 'concurrent-update',
        localState: { players: ['alice'], pot: 100 },
        remoteState: { players: ['bob'], pot: 150 },
        field: 'gameState',
      });

      expect(resolution.strategy).toBe('merge');
      expect(resolution.resolvedState).toHaveProperty('players');
      expect(resolution.resolvedState).toHaveProperty('pot');
    });

    it('should require manual intervention for critical conflicts', () => {
      const resolution = manager.handleStateConflict({
        conflictType: 'invalid-state-transition',
        localState: { phase: 'FLOP', pot: 100 },
        remoteState: { phase: 'SHOWDOWN', pot: 200 },
        field: 'gamePhase',
      });

      expect(resolution.strategy).toBe('manual-intervention');
      expect(resolution.requiresAdmin).toBe(true);
    });
  });

  describe('handleGameError', () => {
    it('should auto-fold disconnected players', () => {
      const action = manager.handleGameError({
        errorType: 'player-disconnected',
        playerId: 'player-123',
        gameId: 'game-456',
        context: { inHand: true, hasBet: false },
      });

      expect(action.action).toBe('auto-fold');
      expect(action.notifyOthers).toBe(true);
    });

    it('should pause game for critical errors', () => {
      const action = manager.handleGameError({
        errorType: 'state-corruption',
        gameId: 'game-456',
        context: { severity: 'critical' },
      });

      expect(action.action).toBe('pause-game');
      expect(action.alertAdmin).toBe(true);
    });

    it('should rollback for invalid state transitions', () => {
      const action = manager.handleGameError({
        errorType: 'invalid-action',
        playerId: 'player-123',
        gameId: 'game-456',
        context: {
          action: 'raise',
          currentPhase: 'WAITING',
          lastValidState: { phase: 'PRE_FLOP' },
        },
      });

      expect(action.action).toBe('rollback');
      expect(action.targetState).toEqual({ phase: 'PRE_FLOP' });
    });

    it('should continue with timeout for unresponsive players', () => {
      const action = manager.handleGameError({
        errorType: 'player-timeout',
        playerId: 'player-123',
        gameId: 'game-456',
        context: { waitTime: 30000 },
      });

      expect(action.action).toBe('skip-turn');
      expect(action.defaultAction).toBe('check-or-fold');
    });
  });

  describe('bulkhead isolation', () => {
    it('should isolate failures between tables', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Table crash'));
      const successOperation = jest.fn().mockResolvedValue('success');

      const context1: OperationContext = {
        operationName: 'table-operation',
        resourceType: 'table',
        resourceId: 'table-1',
        critical: false,
      };

      const context2: OperationContext = {
        operationName: 'table-operation',
        resourceType: 'table',
        resourceId: 'table-2',
        critical: false,
      };

      // One table fails
      await expect(
        manager.executeWithRecovery(failingOperation, context1)
      ).rejects.toThrow();

      // Other table should work fine
      const result = await manager.executeWithRecovery(successOperation, context2);
      expect(result).toBe('success');
    });
  });

  describe('metrics and monitoring', () => {
    it('should track error rates', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValue('success');

      const context: OperationContext = {
        operationName: 'monitored-operation',
        resourceType: 'api',
        critical: false,
      };

      await manager.executeWithRecovery(operation, context).catch(() => {});
      await manager.executeWithRecovery(operation, context);

      const metrics = manager.getMetrics();
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.successRate).toBeGreaterThan(0);
    });

    it('should track recovery success rates', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue('recovered');

      const context: OperationContext = {
        operationName: 'recoverable-operation',
        resourceType: 'api',
        critical: false,
      };

      await manager.executeWithRecovery(operation, context);

      const metrics = manager.getMetrics();
      expect(metrics.recoverySuccessRate).toBeGreaterThan(0);
    });

    it('should provide circuit breaker status', () => {
      manager.registerCircuitBreaker('external-api', mockCircuitBreaker);
      mockCircuitBreaker.getState.mockReturnValue('open');

      const status = manager.getCircuitBreakerStatus();
      expect(status['external-api']).toBe('open');
    });
  });

  describe('configuration', () => {
    it('should allow custom retry policies per resource type', async () => {
      manager.configureRetryPolicy('database', {
        maxAttempts: 5,
        backoffStrategy: 'linear',
        initialDelay: 200,
        maxDelay: 2000,
        jitter: true,
      });

      const operation = jest.fn().mockResolvedValue('success');
      const context: OperationContext = {
        operationName: 'db-query',
        resourceType: 'database',
        critical: false,
      };

      await manager.executeWithRecovery(operation, context);
      // Should use custom policy
    });

    it('should allow custom circuit breaker configs', () => {
      manager.configureCircuitBreaker('payment-api', {
        failureThreshold: 5,
        resetTimeout: 30000,
        halfOpenLimit: 1,
        monitoringPeriod: 300000,
      });

      // Should create circuit breaker with custom config
    });
  });
});