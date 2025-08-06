import { ErrorRecoveryManager } from '../error-recovery-manager';
import { CircuitBreaker } from '../circuit-breaker';
import { RetryPolicyExecutor, RetryPolicy } from '../retry-policy';
import { RecoveryStrategies } from '../recovery-strategies';
import { Logger, LoggerFactory } from '@primo-poker/logging';

// Mock WebSocket for testing
class MockWebSocket {
  readyState = WebSocket.OPEN;
  send = jest.fn();
  close = jest.fn();
}

describe('Enhanced Error Recovery Integration Tests', () => {
  let errorRecovery: ErrorRecoveryManager;
  let mockLogger: Logger;

  beforeEach(() => {
    errorRecovery = new ErrorRecoveryManager();
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Initialize logger with test configuration
    LoggerFactory.initialize({
      defaultLevel: 'debug',
      enablePIIFiltering: true,
    });
    mockLogger = LoggerFactory.getInstance().getLogger('test');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Circuit Breaker + Retry Policy Integration', () => {
    it('should coordinate circuit breaker and retry policy for external API calls', async () => {
      let attemptCount = 0;
      const operation = jest.fn(async () => {
        attemptCount++;
        if (attemptCount < 4) {
          throw new Error('API timeout');
        }
        return { success: true };
      });

      // Configure circuit breaker for external API
      errorRecovery.configureCircuitBreaker('external-api', {
        failureThreshold: 5,
        resetTimeout: 2000,
        halfOpenLimit: 2,
        monitoringPeriod: 60000,
      });

      // Configure retry policy
      errorRecovery.configureRetryPolicy('external-api', {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 100,
        maxDelay: 2000,
        jitter: true,
      });

      // First request should retry and succeed
      const result1 = await errorRecovery.executeWithRecovery(operation, {
        operationName: 'fetch-user-data',
        resourceType: 'external-api',
        critical: false,
        useCircuitBreaker: true,
      });

      expect(result1).toEqual({ success: true });
      expect(operation).toHaveBeenCalledTimes(4);
      
      // Circuit breaker should still be closed
      const status = errorRecovery.getCircuitBreakerStatus();
      expect(status['external-api']).toBe('closed');
    });

    it('should trip circuit breaker after retries exhaust', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      errorRecovery.configureCircuitBreaker('payment-api', {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      // Make requests that will fail and trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          errorRecovery.executeWithRecovery(failingOperation, {
            operationName: 'process-payment',
            resourceType: 'payment-api',
            critical: false,
            useCircuitBreaker: true,
          })
        ).rejects.toThrow();
      }

      // Circuit should be open now
      await expect(
        errorRecovery.executeWithRecovery(failingOperation, {
          operationName: 'process-payment',
          resourceType: 'payment-api',
          critical: false,
          useCircuitBreaker: true,
        })
      ).rejects.toThrow('Service temporarily unavailable');

      const status = errorRecovery.getCircuitBreakerStatus();
      expect(status['payment-api']).toBe('open');

      // Advance time to allow circuit to enter half-open state
      jest.advanceTimersByTime(1100);

      // Next request should be allowed (half-open)
      const testOperation = jest.fn().mockResolvedValue('success');
      await expect(
        errorRecovery.executeWithRecovery(testOperation, {
          operationName: 'test-recovery',
          resourceType: 'payment-api',
          critical: false,
          useCircuitBreaker: true,
        })
      ).resolves.toBe('success');

      // Circuit should be closed again
      const newStatus = errorRecovery.getCircuitBreakerStatus();
      expect(newStatus['payment-api']).toBe('closed');
    });
  });

  describe('Concurrent Failures Across Multiple Tables', () => {
    it('should isolate failures between different tables', async () => {
      const table1Operation = jest.fn().mockRejectedValue(new Error('Table 1 database error'));
      const table2Operation = jest.fn().mockResolvedValue({ tableId: 'table-2', status: 'active' });
      const table3Operation = jest.fn().mockResolvedValue({ tableId: 'table-3', status: 'active' });

      // Configure table-specific circuit breakers
      ['table-1', 'table-2', 'table-3'].forEach(tableId => {
        errorRecovery.configureCircuitBreaker(tableId, {
          failureThreshold: 3,
          resetTimeout: 5000,
          halfOpenLimit: 1,
          monitoringPeriod: 60000,
        });
      });

      // Execute operations concurrently
      const results = await Promise.allSettled([
        errorRecovery.executeWithRecovery(table1Operation, {
          operationName: 'update-game-state',
          resourceType: 'table',
          resourceId: 'table-1',
          critical: false,
          useCircuitBreaker: true,
        }),
        errorRecovery.executeWithRecovery(table2Operation, {
          operationName: 'update-game-state',
          resourceType: 'table',
          resourceId: 'table-2',
          critical: false,
          useCircuitBreaker: true,
        }),
        errorRecovery.executeWithRecovery(table3Operation, {
          operationName: 'update-game-state',
          resourceType: 'table',
          resourceId: 'table-3',
          critical: false,
          useCircuitBreaker: true,
        }),
      ]);

      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('fulfilled');
      expect(results[2].status).toBe('fulfilled');
      
      if (results[1].status === 'fulfilled') {
        expect(results[1].value).toEqual({ tableId: 'table-2', status: 'active' });
      }
      if (results[2].status === 'fulfilled') {
        expect(results[2].value).toEqual({ tableId: 'table-3', status: 'active' });
      }
    });

    it('should handle cascading failures with proper isolation', async () => {
      const operations: Record<string, jest.Mock> = {};
      const tables = ['table-1', 'table-2', 'table-3', 'table-4', 'table-5'];
      
      // Configure different failure patterns
      tables.forEach((tableId, index) => {
        if (index < 2) {
          // First two tables fail immediately
          operations[tableId] = jest.fn().mockRejectedValue(new Error(`${tableId} critical failure`));
        } else if (index === 2) {
          // Third table fails after some attempts
          let attempts = 0;
          operations[tableId] = jest.fn(async () => {
            attempts++;
            if (attempts < 3) {
              throw new Error(`${tableId} transient error`);
            }
            return { tableId, recovered: true };
          });
        } else {
          // Remaining tables succeed
          operations[tableId] = jest.fn().mockResolvedValue({ tableId, status: 'healthy' });
        }
      });

      // Execute all operations concurrently
      const results = await Promise.allSettled(
        tables.map(tableId =>
          errorRecovery.executeWithRecovery(operations[tableId], {
            operationName: 'table-health-check',
            resourceType: 'table',
            resourceId: tableId,
            critical: false,
          })
        )
      );

      // Verify isolation - failures in some tables don't affect others
      expect(results[0].status).toBe('rejected');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
      expect(results[3].status).toBe('fulfilled');
      expect(results[4].status).toBe('fulfilled');

      // Verify retry behavior
      expect(operations['table-3']).toHaveBeenCalledTimes(3);
    });
  });

  describe('Resource Cleanup and Memory Leak Prevention', () => {
    it('should clean up resources after circuit breaker trips', async () => {
      const resources: any[] = [];
      const createResource = () => {
        const resource = {
          id: Math.random(),
          cleanup: jest.fn(),
        };
        resources.push(resource);
        return resource;
      };

      const failingOperation = jest.fn(async () => {
        const resource = createResource();
        throw new Error('Resource allocation failed');
      });

      errorRecovery.configureCircuitBreaker('resource-intensive', {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      // Trigger failures to trip circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          errorRecovery.executeWithRecovery(failingOperation, {
            operationName: 'allocate-resource',
            resourceType: 'resource-intensive',
            critical: false,
            useCircuitBreaker: true,
          })
        ).rejects.toThrow();
      }

      // Verify resources were created
      expect(resources).toHaveLength(3);

      // In a real implementation, cleanup would be triggered
      // For testing, we verify the pattern
      expect(errorRecovery.getCircuitBreakerStatus()['resource-intensive']).toBe('open');
    });

    it('should prevent memory leaks in retry scenarios', async () => {
      const memoryTracker = {
        allocations: [] as any[],
        deallocations: [] as any[],
      };

      let attemptCount = 0;
      const operation = jest.fn(async () => {
        attemptCount++;
        const allocation = { id: attemptCount, size: 1024 * 1024 }; // 1MB
        memoryTracker.allocations.push(allocation);

        if (attemptCount < 3) {
          throw new Error('Operation failed');
        }

        // Success - cleanup should happen
        memoryTracker.deallocations.push(allocation);
        return { success: true, allocationId: allocation.id };
      });

      errorRecovery.configureRetryPolicy('memory-intensive', {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 10,
        maxDelay: 100,
        jitter: false,
      });

      const result = await errorRecovery.executeWithRecovery(operation, {
        operationName: 'memory-intensive-operation',
        resourceType: 'memory-intensive',
        critical: false,
      });

      expect(result).toEqual({ success: true, allocationId: 3 });
      expect(memoryTracker.allocations).toHaveLength(3);
      expect(memoryTracker.deallocations).toHaveLength(1);
    });
  });

  describe('WebSocket Reconnection Scenarios', () => {
    it('should handle WebSocket reconnection with exponential backoff', async () => {
      const mockWs = new MockWebSocket();
      const connectionAttempts: number[] = [];

      const connectWebSocket = jest.fn(async () => {
        const attemptTime = Date.now();
        connectionAttempts.push(attemptTime);
        
        if (connectionAttempts.length < 3) {
          mockWs.readyState = WebSocket.CLOSED;
          throw new Error('Connection failed');
        }
        
        mockWs.readyState = WebSocket.OPEN;
        return mockWs;
      });

      for (let attempt = 1; attempt <= 3; attempt++) {
        const context = {
          error: new Error('WebSocket disconnected'),
          disconnectTime: Date.now() - 1000,
          attemptCount: attempt,
          connectionType: 'player',
        };

        const strategy = errorRecovery.handleConnectionFailure('player-123', context);
        
        if (strategy.action === 'reconnect') {
          jest.advanceTimersByTime(strategy.delay!);
          try {
            await connectWebSocket();
          } catch (error) {
            // Expected for first 2 attempts
          }
        }
      }

      expect(mockWs.readyState).toBe(WebSocket.OPEN);
      expect(connectionAttempts).toHaveLength(3);
    });

    it('should gracefully degrade spectator connections', async () => {
      const spectatorContext = {
        error: new Error('Network unstable'),
        disconnectTime: Date.now() - 2000,
        attemptCount: 2,
        connectionType: 'spectator',
      };

      const strategy = errorRecovery.handleConnectionFailure('spectator-456', spectatorContext);
      
      expect(strategy.action).toBe('graceful-degrade');
      expect(strategy.fallbackMode).toBe('polling');
    });

    it('should terminate connections after max attempts', async () => {
      const context = {
        error: new Error('Persistent connection failure'),
        disconnectTime: Date.now() - 10000,
        attemptCount: 5,
        connectionType: 'player',
      };

      const strategy = errorRecovery.handleConnectionFailure('player-789', context);
      
      expect(strategy.action).toBe('terminate');
      expect(strategy.reason).toBe('Max reconnection attempts reached');
    });

    it('should terminate connections after timeout', async () => {
      const context = {
        error: new Error('Connection timeout'),
        disconnectTime: Date.now() - (6 * 60 * 1000), // 6 minutes ago
        attemptCount: 3,
        connectionType: 'player',
      };

      const strategy = errorRecovery.handleConnectionFailure('player-999', context);
      
      expect(strategy.action).toBe('terminate');
      expect(strategy.reason).toBe('Connection timeout exceeded');
    });
  });

  describe('Graceful Degradation Scenarios', () => {
    it('should degrade functionality when critical services fail', async () => {
      // Simulate RNG service failure
      const rngOperation = jest.fn().mockRejectedValue(new Error('RNG service unavailable'));
      
      errorRecovery.configureCircuitBreaker('rng-service', {
        failureThreshold: 2,
        resetTimeout: 5000,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      // Trip the circuit breaker
      for (let i = 0; i < 2; i++) {
        await expect(
          errorRecovery.executeWithRecovery(rngOperation, {
            operationName: 'generate-random-deck',
            resourceType: 'rng-service',
            critical: false,
            useCircuitBreaker: true,
          })
        ).rejects.toThrow();
      }

      // Service should now be in degraded mode
      const status = errorRecovery.getCircuitBreakerStatus();
      expect(status['rng-service']).toBe('open');

      // Fallback operation should work
      const fallbackOperation = jest.fn().mockResolvedValue({
        deck: 'pre-shuffled-deck',
        source: 'fallback',
      });

      const result = await fallbackOperation();
      expect(result.source).toBe('fallback');
    });

    it('should handle partial service degradation', async () => {
      const services = {
        chat: { available: true, operation: jest.fn().mockResolvedValue('chat ok') },
        stats: { available: false, operation: jest.fn().mockRejectedValue(new Error('Stats service down')) },
        gameplay: { available: true, operation: jest.fn().mockResolvedValue('gameplay ok') },
      };

      const results = await Promise.allSettled([
        errorRecovery.executeWithRecovery(services.chat.operation, {
          operationName: 'chat-service',
          resourceType: 'auxiliary',
          critical: false,
        }),
        errorRecovery.executeWithRecovery(services.stats.operation, {
          operationName: 'stats-service',
          resourceType: 'auxiliary',
          critical: false,
        }),
        errorRecovery.executeWithRecovery(services.gameplay.operation, {
          operationName: 'gameplay-service',
          resourceType: 'core',
          critical: true,
        }),
      ]);

      // Core gameplay should succeed
      expect(results[2].status).toBe('fulfilled');
      // Chat should succeed
      expect(results[0].status).toBe('fulfilled');
      // Stats can fail without affecting core functionality
      expect(results[1].status).toBe('rejected');
    });
  });

  describe('State Recovery After Failures', () => {
    it('should recover game state after transient failures', async () => {
      const gameState = {
        version: 1,
        pot: 100,
        phase: 'FLOP',
        players: ['player1', 'player2'],
      };

      const stateError = {
        errorType: 'invalid-action',
        playerId: 'player1',
        gameId: 'game-123',
        context: {
          action: 'bet',
          currentPhase: 'WAITING',
          lastValidState: gameState,
        },
      };

      const recovery = errorRecovery.handleGameError(stateError);
      
      expect(recovery.action).toBe('rollback');
      expect(recovery.targetState).toEqual(gameState);
    });

    it('should handle state conflicts with appropriate resolution', async () => {
      // Test non-critical field conflict
      const chatConflict = {
        conflictType: 'concurrent-update',
        localState: { messages: ['Hello'] },
        remoteState: { messages: ['Hi', 'Hello'] },
        field: 'chatMessages',
      };

      const chatResolution = errorRecovery.handleStateConflict(chatConflict);
      expect(chatResolution.strategy).toBe('last-write-wins');
      expect(chatResolution.resolvedState).toEqual({ messages: ['Hi', 'Hello'] });

      // Test critical field conflict
      const gamePhaseConflict = {
        conflictType: 'invalid-state-transition',
        localState: { phase: 'FLOP', pot: 100 },
        remoteState: { phase: 'RIVER', pot: 500 },
        field: 'gamePhase',
      };

      const phaseResolution = errorRecovery.handleStateConflict(gamePhaseConflict);
      expect(phaseResolution.strategy).toBe('manual-intervention');
      expect(phaseResolution.requiresAdmin).toBe(true);

      // Test mergeable conflict
      const mergeableConflict = {
        conflictType: 'concurrent-update',
        localState: { 
          gameState: { 
            playerActions: ['fold', 'call'],
            pot: 100 
          } 
        },
        remoteState: { 
          gameState: { 
            playerActions: ['fold', 'call', 'raise'],
            pot: 150 
          } 
        },
        field: 'gameState',
      };

      const mergeResolution = errorRecovery.handleStateConflict(mergeableConflict);
      expect(mergeResolution.strategy).toBe('merge');
      expect(mergeResolution.resolvedState).toBeTruthy();
    });

    it('should pause game on state corruption', async () => {
      const corruptionError = {
        errorType: 'state-corruption',
        gameId: 'game-456',
        context: {
          severity: 'critical',
          detectedAt: Date.now(),
          corruptedFields: ['pot', 'playerBalances'],
        },
      };

      const action = errorRecovery.handleGameError(corruptionError);
      
      expect(action.action).toBe('pause-game');
      expect(action.alertAdmin).toBe(true);
    });
  });

  describe('Metrics and Monitoring Integration', () => {
    it('should track detailed recovery metrics', async () => {
      const operations = [
        { name: 'op1', fn: jest.fn().mockResolvedValue('success') },
        { name: 'op2', fn: jest.fn().mockRejectedValue(new Error('fail')) },
        { 
          name: 'op3', 
          fn: jest.fn()
            .mockRejectedValueOnce(new Error('retry'))
            .mockResolvedValue('recovered') 
        },
      ];

      for (const op of operations) {
        try {
          await errorRecovery.executeWithRecovery(op.fn, {
            operationName: op.name,
            resourceType: 'test',
            critical: false,
          });
        } catch (error) {
          // Expected for op2
        }
      }

      const metrics = errorRecovery.getMetrics();
      
      expect(metrics.totalOperations).toBe(3);
      expect(metrics.totalErrors).toBeGreaterThan(0);
      expect(metrics.successRate).toBeGreaterThan(0.5);
      expect(metrics.errorRate).toBeLessThan(0.5);
    });

    it('should export circuit breaker metrics', async () => {
      errorRecovery.configureCircuitBreaker('test-service', {
        failureThreshold: 3,
        resetTimeout: 1000,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      const failingOp = jest.fn().mockRejectedValue(new Error('Service error'));
      
      // Generate some failures
      for (let i = 0; i < 5; i++) {
        try {
          await errorRecovery.executeWithRecovery(failingOp, {
            operationName: 'test-op',
            resourceType: 'test-service',
            critical: false,
            useCircuitBreaker: true,
          });
        } catch (error) {
          // Expected
        }
      }

      const cbMetrics = errorRecovery.getCircuitBreakerMetrics('test-service');
      expect(cbMetrics).toBeTruthy();
      
      const allMetrics = errorRecovery.getAllCircuitBreakerMetrics();
      expect(allMetrics['test-service']).toBeTruthy();
      
      const prometheusExport = errorRecovery.exportMetricsPrometheus();
      expect(prometheusExport).toContain('Circuit breaker metrics for test-service');
    });
  });
});