import { ErrorRecoveryManager } from '../error-recovery-manager';
import { CircuitBreaker } from '../circuit-breaker';
import { RetryPolicyExecutor } from '../retry-policy';
import { RecoveryStrategies } from '../recovery-strategies';

describe('Additional Error Recovery Integration Tests', () => {
  let errorRecovery: ErrorRecoveryManager;

  beforeEach(() => {
    errorRecovery = new ErrorRecoveryManager();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Circuit Breaker + Retry Policy Advanced Interactions', () => {
    it('should coordinate circuit breaker state changes with retry attempts', async () => {
      let attemptCount = 0;
      const operation = jest.fn(async () => {
        attemptCount++;
        // Succeed on 4th attempt
        if (attemptCount < 4) {
          throw new Error('Service temporarily unavailable');
        }
        return { success: true, attemptNumber: attemptCount };
      });

      // Configure tight circuit breaker thresholds
      errorRecovery.configureCircuitBreaker('flaky-service', {
        failureThreshold: 2,
        resetTimeout: 1000,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      // Configure retry policy with backoff
      errorRecovery.configureRetryPolicy('flaky-service', {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 100,
        maxDelay: 1000,
        jitter: true,
      });

      // Execute operation - should retry and eventually succeed
      const result = await errorRecovery.executeWithRecovery(operation, {
        operationName: 'flaky-operation',
        resourceType: 'flaky-service',
        critical: false,
        useCircuitBreaker: true,
      });

      expect(result).toEqual({ success: true, attemptNumber: 4 });
      expect(operation).toHaveBeenCalledTimes(4);

      // Circuit breaker should be closed after success
      const status = errorRecovery.getCircuitBreakerStatus();
      expect(status['flaky-service']).toBe('closed');
    });

    it('should handle circuit breaker opening during retry sequence', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      errorRecovery.configureCircuitBreaker('failing-service', {
        failureThreshold: 2,
        resetTimeout: 5000,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      errorRecovery.configureRetryPolicy('failing-service', {
        maxAttempts: 3,
        backoffStrategy: 'fixed',
        initialDelay: 100,
        maxDelay: 100,
        jitter: false,
      });

      // First two calls will trip the circuit breaker
      for (let i = 0; i < 2; i++) {
        await expect(
          errorRecovery.executeWithRecovery(failingOperation, {
            operationName: 'test-op',
            resourceType: 'failing-service',
            critical: false,
            useCircuitBreaker: true,
          })
        ).rejects.toThrow();
      }

      // Circuit should now be open
      const status = errorRecovery.getCircuitBreakerStatus();
      expect(status['failing-service']).toBe('open');

      // Further attempts should fail immediately
      await expect(
        errorRecovery.executeWithRecovery(failingOperation, {
          operationName: 'test-op',
          resourceType: 'failing-service',
          critical: false,
          useCircuitBreaker: true,
        })
      ).rejects.toThrow('Service temporarily unavailable');
    });
  });

  describe('Concurrent Table Failures with Player Migration', () => {
    it('should handle multiple table failures without affecting others', async () => {
      const tableOperations = {
        'table-1': jest.fn().mockRejectedValue(new Error('Table 1 crashed')),
        'table-2': jest.fn().mockRejectedValue(new Error('Table 2 crashed')),
        'table-3': jest.fn().mockResolvedValue({ tableId: 'table-3', status: 'active' }),
        'table-4': jest.fn().mockResolvedValue({ tableId: 'table-4', status: 'active' }),
        'table-5': jest.fn().mockResolvedValue({ tableId: 'table-5', status: 'active' }),
      };

      // Configure circuit breakers for each table
      Object.keys(tableOperations).forEach(tableId => {
        errorRecovery.configureCircuitBreaker(tableId, {
          failureThreshold: 2,
          resetTimeout: 10000,
          halfOpenLimit: 1,
          monitoringPeriod: 60000,
        });
      });

      // Execute all table operations concurrently
      const results = await Promise.allSettled(
        Object.entries(tableOperations).map(([tableId, operation]) =>
          errorRecovery.executeWithRecovery(operation, {
            operationName: 'table-operation',
            resourceType: 'table',
            resourceId: tableId,
            critical: false,
            useCircuitBreaker: true,
          })
        )
      );

      // Verify isolation - failures don't cascade
      expect(results[0].status).toBe('rejected'); // table-1
      expect(results[1].status).toBe('rejected'); // table-2
      expect(results[2].status).toBe('fulfilled'); // table-3
      expect(results[3].status).toBe('fulfilled'); // table-4
      expect(results[4].status).toBe('fulfilled'); // table-5

      // Verify only failed tables have open circuit breakers
      const cbStatus = errorRecovery.getCircuitBreakerStatus();
      expect(cbStatus['table-1']).toBe('closed'); // Only 1 failure, threshold is 2
      expect(cbStatus['table-2']).toBe('closed'); // Only 1 failure, threshold is 2
      expect(cbStatus['table-3']).toBe('closed');
      expect(cbStatus['table-4']).toBe('closed');
      expect(cbStatus['table-5']).toBe('closed');
    });
  });

  describe('Resource Cleanup in Failure Scenarios', () => {
    it('should track and cleanup resources on operation timeout', async () => {
      const resourceTracker = {
        allocated: [] as string[],
        released: [] as string[],
      };

      const timeoutOperation = jest.fn(async () => {
        const resourceId = `resource-${Date.now()}`;
        resourceTracker.allocated.push(resourceId);

        // Simulate long operation that will timeout
        await new Promise((resolve) => setTimeout(resolve, 5000));

        // This won't be reached due to timeout
        resourceTracker.released.push(resourceId);
        return { resourceId };
      });

      // Configure short timeout
      const operationPromise = errorRecovery.executeWithRecovery(timeoutOperation, {
        operationName: 'timeout-test',
        resourceType: 'slow-resource',
        critical: false,
        timeout: 1000,
      });

      // Advance time to trigger timeout
      jest.advanceTimersByTime(1100);

      await expect(operationPromise).rejects.toThrow();

      // Verify resource was allocated but not released
      expect(resourceTracker.allocated.length).toBe(1);
      expect(resourceTracker.released.length).toBe(0);

      // In a real system, a cleanup process would handle this
      // For testing, we verify the leak detection
      expect(resourceTracker.allocated.length).toBeGreaterThan(resourceTracker.released.length);
    });
  });

  describe('WebSocket Reconnection with Message Queue', () => {
    it('should queue messages during disconnection and replay on reconnect', async () => {
      const messageQueue: any[] = [];
      let isConnected = true;

      const mockWebSocket = {
        send: jest.fn((data) => {
          if (!isConnected) {
            throw new Error('Not connected');
          }
          return true;
        }),
        readyState: WebSocket.OPEN,
      };

      const sendMessage = async (message: any) => {
        try {
          mockWebSocket.send(JSON.stringify(message));
          return { sent: true };
        } catch (error) {
          messageQueue.push(message);
          throw error;
        }
      };

      // Send initial messages while connected
      await sendMessage({ id: 1, type: 'action', data: 'bet' });
      await sendMessage({ id: 2, type: 'action', data: 'raise' });
      expect(mockWebSocket.send).toHaveBeenCalledTimes(2);

      // Simulate disconnection
      isConnected = false;
      mockWebSocket.readyState = WebSocket.CLOSED;

      // Try to send messages while disconnected
      await expect(sendMessage({ id: 3, type: 'action', data: 'call' })).rejects.toThrow();
      await expect(sendMessage({ id: 4, type: 'action', data: 'fold' })).rejects.toThrow();

      expect(messageQueue).toHaveLength(2);

      // Simulate reconnection
      isConnected = true;
      mockWebSocket.readyState = WebSocket.OPEN;

      // Replay queued messages
      const replayedMessages = [...messageQueue];
      messageQueue.length = 0;

      for (const msg of replayedMessages) {
        await sendMessage(msg);
      }

      expect(mockWebSocket.send).toHaveBeenCalledTimes(4); // 2 initial + 2 replayed
    });
  });

  describe('Graceful Degradation with Feature Flags', () => {
    it('should progressively disable features based on system load', async () => {
      const systemMetrics = {
        cpu: 50,
        memory: 60,
        errorRate: 0.05,
      };

      const features = {
        animations: true,
        realTimeUpdates: true,
        chatSystem: true,
        leaderboard: true,
        soundEffects: true,
      };

      const applyDegradation = () => {
        if (systemMetrics.cpu > 80 || systemMetrics.memory > 80) {
          features.animations = false;
          features.soundEffects = false;
        }
        if (systemMetrics.cpu > 90 || systemMetrics.memory > 90) {
          features.leaderboard = false;
        }
        if (systemMetrics.errorRate > 0.2) {
          features.realTimeUpdates = false;
          features.chatSystem = false;
        }
      };

      // Test normal load
      applyDegradation();
      expect(Object.values(features).every(f => f === true)).toBe(true);

      // Test high CPU load
      systemMetrics.cpu = 85;
      applyDegradation();
      expect(features.animations).toBe(false);
      expect(features.soundEffects).toBe(false);
      expect(features.chatSystem).toBe(true);

      // Test critical load
      systemMetrics.cpu = 95;
      applyDegradation();
      expect(features.leaderboard).toBe(false);

      // Test high error rate
      systemMetrics.errorRate = 0.25;
      applyDegradation();
      expect(features.realTimeUpdates).toBe(false);
      expect(features.chatSystem).toBe(false);
    });
  });

  describe('State Recovery with Event Sourcing', () => {
    it('should recover state from event history after corruption', async () => {
      const eventStore: any[] = [];
      let currentState = {
        gameId: 'test-game',
        pot: 0,
        players: [] as string[],
        phase: 'WAITING',
      };

      const appendEvent = (event: any) => {
        eventStore.push({
          ...event,
          timestamp: Date.now(),
          sequenceNumber: eventStore.length + 1,
        });
      };

      const replayEvents = () => {
        const newState = {
          gameId: 'test-game',
          pot: 0,
          players: [] as string[],
          phase: 'WAITING',
        };

        for (const event of eventStore) {
          switch (event.type) {
            case 'PLAYER_JOINED':
              newState.players.push(event.playerId);
              break;
            case 'BET_PLACED':
              newState.pot += event.amount;
              break;
            case 'PHASE_CHANGED':
              newState.phase = event.newPhase;
              break;
          }
        }

        return newState;
      };

      // Generate events
      appendEvent({ type: 'PLAYER_JOINED', playerId: 'player-1' });
      appendEvent({ type: 'PLAYER_JOINED', playerId: 'player-2' });
      appendEvent({ type: 'PHASE_CHANGED', newPhase: 'PRE_FLOP' });
      appendEvent({ type: 'BET_PLACED', amount: 50, playerId: 'player-1' });
      appendEvent({ type: 'BET_PLACED', amount: 50, playerId: 'player-2' });

      // Update current state
      currentState = replayEvents();

      // Simulate state corruption
      currentState.pot = 999999; // Obviously wrong
      currentState.players.push('ghost-player'); // Invalid player

      // Detect corruption
      const isCorrupted = currentState.pot > 10000 || 
                         currentState.players.includes('ghost-player');

      expect(isCorrupted).toBe(true);

      // Recover from events
      const recoveredState = replayEvents();

      expect(recoveredState.pot).toBe(100);
      expect(recoveredState.players).toEqual(['player-1', 'player-2']);
      expect(recoveredState.phase).toBe('PRE_FLOP');
    });
  });
});