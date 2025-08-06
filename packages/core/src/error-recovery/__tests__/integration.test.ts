import { ErrorRecoveryManager } from '../error-recovery-manager';
import { CircuitBreaker } from '../circuit-breaker';
import { RetryPolicyExecutor } from '../retry-policy';
import { RecoveryStrategies } from '../recovery-strategies';

describe('Error Recovery Integration Tests', () => {
  let errorRecovery: ErrorRecoveryManager;

  beforeEach(() => {
    errorRecovery = new ErrorRecoveryManager();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('End-to-end recovery scenarios', () => {
    it('should handle transient network errors with retry and recovery', async () => {
      let attemptCount = 0;
      const operation = jest.fn(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Network timeout');
        }
        return 'success';
      });

      const result = await errorRecovery.executeWithRecovery(operation, {
        operationName: 'api-call',
        resourceType: 'api',
        critical: false,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
      
      const metrics = errorRecovery.getMetrics();
      expect(metrics.totalRecoveries).toBeGreaterThan(0);
    });

    it('should handle cascading failures with circuit breaker', async () => {
      // Configure circuit breaker for external API
      errorRecovery.configureCircuitBreaker('external-api', {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      const failingOperation = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Trigger circuit breaker
      for (let i = 0; i < 3; i++) {
        await expect(
          errorRecovery.executeWithRecovery(failingOperation, {
            operationName: 'external-api-call',
            resourceType: 'external-api',
            critical: false,
            useCircuitBreaker: true,
          })
        ).rejects.toThrow();
      }

      // Circuit should be open now
      await expect(
        errorRecovery.executeWithRecovery(failingOperation, {
          operationName: 'external-api-call',
          resourceType: 'external-api',
          critical: false,
          useCircuitBreaker: true,
        })
      ).rejects.toThrow('Circuit breaker is open');

      // Verify circuit breaker status
      const status = errorRecovery.getCircuitBreakerStatus();
      expect(status['external-api']).toBe('open');
    });

    it('should handle player disconnection and reconnection gracefully', async () => {
      const connectionContext = {
        error: new Error('WebSocket disconnected'),
        disconnectTime: Date.now(),
        attemptCount: 1,
      };

      // First disconnection - should recommend reconnect
      let strategy = errorRecovery.handleConnectionFailure('player-123', connectionContext);
      expect(strategy.action).toBe('reconnect');
      expect(strategy.delay).toBeGreaterThan(0);

      // Simulate multiple failed attempts
      connectionContext.attemptCount = 5;
      strategy = errorRecovery.handleConnectionFailure('player-123', connectionContext);
      expect(strategy.action).toBe('terminate');

      // Test graceful degradation for spectators
      const spectatorContext = {
        error: new Error('Connection timeout'),
        disconnectTime: Date.now(),
        attemptCount: 3,
        connectionType: 'spectator',
      };
      strategy = errorRecovery.handleConnectionFailure('spectator-456', spectatorContext);
      expect(strategy.action).toBe('graceful-degrade');
      expect(strategy.fallbackMode).toBe('polling');
    });

    it('should handle game state conflicts appropriately', async () => {
      // Non-critical conflict - last write wins
      let resolution = errorRecovery.handleStateConflict({
        conflictType: 'concurrent-update',
        localState: { chatMessages: ['Hello'] },
        remoteState: { chatMessages: ['Hi', 'Hello'] },
        field: 'chatMessages',
      });
      expect(resolution.strategy).toBe('last-write-wins');

      // Critical conflict - manual intervention
      resolution = errorRecovery.handleStateConflict({
        conflictType: 'invalid-state-transition',
        localState: { phase: 'FLOP', pot: 100 },
        remoteState: { phase: 'RIVER', pot: 500 },
        field: 'gamePhase',
      });
      expect(resolution.strategy).toBe('manual-intervention');
      expect(resolution.requiresAdmin).toBe(true);
    });

    it('should handle concurrent operations with bulkhead isolation', async () => {
      const table1Operation = jest.fn().mockRejectedValue(new Error('Table 1 crash'));
      const table2Operation = jest.fn().mockResolvedValue('Table 2 success');

      const results = await Promise.allSettled([
        errorRecovery.executeWithRecovery(table1Operation, {
          operationName: 'table-operation',
          resourceType: 'table',
          resourceId: 'table-1',
          critical: false,
        }),
        errorRecovery.executeWithRecovery(table2Operation, {
          operationName: 'table-operation',
          resourceType: 'table',
          resourceId: 'table-2',
          critical: false,
        }),
      ]);

      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      expect(results[1].value).toBe('Table 2 success');
    });

    it('should handle rate limiting with appropriate backoff', async () => {
      const strategies = new RecoveryStrategies();
      
      const context = {
        errorType: 'RATE_LIMIT_ERROR' as const,
        error: new Error('Rate limit exceeded'),
        attemptCount: 1,
        resourceType: 'api',
        metadata: {
          retryAfter: 30, // 30 seconds
        },
      };

      const strategy = strategies.getStrategy(context);
      expect(strategy.shouldRetry).toBe(true);
      expect(strategy.retryPolicy?.initialDelay).toBeGreaterThanOrEqual(30000);
    });

    it('should handle critical operation failures with alerting', async () => {
      const criticalOperation = jest.fn().mockRejectedValue(new Error('Critical failure'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(
        errorRecovery.executeWithRecovery(criticalOperation, {
          operationName: 'critical-operation',
          resourceType: 'database',
          critical: true,
        })
      ).rejects.toThrow('Critical failure');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Critical error'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('WebSocket recovery integration', () => {
    it('should handle WebSocket message failures with retry', async () => {
      let sendAttempts = 0;
      const mockWebSocket = {
        send: jest.fn(() => {
          sendAttempts++;
          if (sendAttempts < 2) {
            throw new Error('Send failed');
          }
        }),
        readyState: WebSocket.OPEN,
      };

      errorRecovery.configureRetryPolicy('websocket-send', {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 100,
        maxDelay: 1000,
        jitter: false,
      });

      const sendMessage = async () => {
        if (mockWebSocket.readyState !== WebSocket.OPEN) {
          throw new Error('Connection not open');
        }
        mockWebSocket.send(JSON.stringify({ type: 'test' }));
      };

      await errorRecovery.executeWithRecovery(sendMessage, {
        operationName: 'websocket-send',
        resourceType: 'websocket-send',
        critical: false,
      });

      expect(mockWebSocket.send).toHaveBeenCalledTimes(2);
    });

    it('should handle player timeout during game', async () => {
      const gameError = {
        errorType: 'player-timeout',
        playerId: 'player-123',
        gameId: 'game-456',
        context: {
          waitTime: 30000,
          currentPhase: 'TURN',
        },
      };

      const action = errorRecovery.handleGameError(gameError);
      expect(action.action).toBe('skip-turn');
      expect(action.defaultAction).toBe('check-or-fold');
    });
  });

  describe('State synchronization recovery', () => {
    it('should handle state corruption with rollback', async () => {
      const gameError = {
        errorType: 'state-corruption',
        gameId: 'game-789',
        context: {
          severity: 'critical',
          lastValidCheckpoint: {
            version: 10,
            state: { phase: 'FLOP', pot: 100 },
          },
        },
      };

      const action = errorRecovery.handleGameError(gameError);
      expect(action.action).toBe('pause-game');
      expect(action.alertAdmin).toBe(true);
    });

    it('should handle invalid player actions with state rollback', async () => {
      const gameError = {
        errorType: 'invalid-action',
        playerId: 'player-123',
        gameId: 'game-456',
        context: {
          action: 'raise',
          currentPhase: 'WAITING',
          lastValidState: { phase: 'PRE_FLOP', pot: 50 },
        },
      };

      const action = errorRecovery.handleGameError(gameError);
      expect(action.action).toBe('rollback');
      expect(action.targetState).toEqual({ phase: 'PRE_FLOP', pot: 50 });
    });
  });

  describe('Performance under load', () => {
    it('should handle high error rates without degradation', async () => {
      const operations = Array(100).fill(null).map((_, i) => {
        const shouldFail = i % 3 === 0; // 33% failure rate
        return jest.fn().mockImplementation(() => {
          if (shouldFail) {
            return Promise.reject(new Error('Operation failed'));
          }
          return Promise.resolve(`success-${i}`);
        });
      });

      const results = await Promise.allSettled(
        operations.map((op, i) =>
          errorRecovery.executeWithRecovery(op, {
            operationName: `operation-${i}`,
            resourceType: 'api',
            critical: false,
          })
        )
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      expect(successCount).toBeGreaterThan(60); // At least 60% success
      expect(failureCount).toBeLessThan(40); // Less than 40% failure

      const metrics = errorRecovery.getMetrics();
      expect(metrics.errorRate).toBeLessThan(0.4);
    });
  });

  describe('Recovery metrics and monitoring', () => {
    it('should track recovery metrics accurately', async () => {
      // Successful operation
      await errorRecovery.executeWithRecovery(
        () => Promise.resolve('success'),
        { operationName: 'test-1', resourceType: 'api', critical: false }
      );

      // Failed operation
      await errorRecovery.executeWithRecovery(
        () => Promise.reject(new Error('fail')),
        { operationName: 'test-2', resourceType: 'api', critical: false }
      ).catch(() => {});

      // Recovered operation
      let attempt = 0;
      await errorRecovery.executeWithRecovery(
        () => {
          attempt++;
          if (attempt === 1) throw new Error('retry');
          return Promise.resolve('recovered');
        },
        { operationName: 'test-3', resourceType: 'api', critical: false }
      );

      const metrics = errorRecovery.getMetrics();
      expect(metrics.totalOperations).toBe(3);
      expect(metrics.totalErrors).toBeGreaterThan(0);
      expect(metrics.successRate).toBeGreaterThan(0.5);
    });
  });
});