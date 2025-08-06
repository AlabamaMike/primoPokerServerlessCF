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

  describe('API Contract Verification', () => {
    it('should have all required methods on ErrorRecoveryManager', () => {
      // Verify public methods exist
      expect(typeof errorRecovery.executeWithRecovery).toBe('function');
      expect(typeof errorRecovery.configureCircuitBreaker).toBe('function');
      expect(typeof errorRecovery.configureRetryPolicy).toBe('function');
      expect(typeof errorRecovery.getCircuitBreakerStatus).toBe('function');
      expect(typeof errorRecovery.handleConnectionFailure).toBe('function');
      expect(typeof errorRecovery.handleStateConflict).toBe('function');
      expect(typeof errorRecovery.handleGameError).toBe('function');
      expect(typeof errorRecovery.getMetrics).toBe('function');
    });

    it('should accept correct parameters for executeWithRecovery', async () => {
      const mockOperation = jest.fn().mockResolvedValue({ success: true });
      
      // Test with all possible context properties
      const context = {
        operationName: 'test-operation',
        resourceType: 'test-resource',
        resourceId: 'resource-123',
        critical: true,
        useCircuitBreaker: true,
        timeout: 5000,
      };
      
      await expect(
        errorRecovery.executeWithRecovery(mockOperation, context)
      ).resolves.toEqual({ success: true });
      
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should return correct types from methods', () => {
      // Test getCircuitBreakerStatus returns an object
      const status = errorRecovery.getCircuitBreakerStatus();
      expect(typeof status).toBe('object');
      
      // Test getMetrics returns expected shape
      const metrics = errorRecovery.getMetrics();
      expect(metrics).toHaveProperty('totalOperations');
      expect(metrics).toHaveProperty('totalErrors');
      expect(metrics).toHaveProperty('totalRecoveries');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('successRate');
      expect(metrics).toHaveProperty('recoverySuccessRate');
    });
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
        cleanupCallbacks: new Map<string, () => void>(),
      };

      const createResource = (id: string) => {
        resourceTracker.allocated.push(id);
        resourceTracker.cleanupCallbacks.set(id, () => {
          resourceTracker.released.push(id);
        });
      };

      const releaseResource = (id: string) => {
        const cleanup = resourceTracker.cleanupCallbacks.get(id);
        if (cleanup) {
          cleanup();
          resourceTracker.cleanupCallbacks.delete(id);
        }
      };

      const timeoutOperation = jest.fn(async () => {
        const resourceId = `resource-${Date.now()}`;
        createResource(resourceId);

        try {
          // Simulate long operation that will timeout
          await new Promise((resolve) => setTimeout(resolve, 5000));
          
          // This won't be reached due to timeout
          releaseResource(resourceId);
          return { resourceId };
        } catch (error) {
          // Cleanup should happen even on error
          releaseResource(resourceId);
          throw error;
        }
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

      await expect(operationPromise).rejects.toThrow('Operation timed out after 1000ms');

      // Verify resource was allocated but not released due to timeout
      expect(resourceTracker.allocated.length).toBe(1);
      expect(resourceTracker.released.length).toBe(0);

      // Simulate cleanup process that runs after timeout
      // In a real system, this would be automatic
      resourceTracker.cleanupCallbacks.forEach((cleanup, id) => {
        cleanup();
      });

      // Verify all resources were eventually cleaned up
      expect(resourceTracker.released.length).toBe(resourceTracker.allocated.length);
    });

    it('should ensure cleanup happens with finally blocks', async () => {
      const resourceManager = {
        resources: new Set<string>(),
        allocate(id: string) {
          this.resources.add(id);
          return {
            id,
            release: () => this.resources.delete(id),
          };
        },
      };

      const operationWithFinally = jest.fn(async () => {
        const resource = resourceManager.allocate(`res-${Date.now()}`);
        
        try {
          // Simulate operation that fails
          throw new Error('Operation failed');
        } finally {
          // Cleanup happens regardless
          resource.release();
        }
      });

      await expect(
        errorRecovery.executeWithRecovery(operationWithFinally, {
          operationName: 'finally-test',
          resourceType: 'managed-resource',
          critical: false,
        })
      ).rejects.toThrow('Operation failed');

      // Verify resources were cleaned up
      expect(resourceManager.resources.size).toBe(0);
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

  describe('Circuit Breaker Timeout Edge Cases', () => {
    it('should handle circuit breaker timeout during half-open state', async () => {
      let callCount = 0;
      const flakeyOperation = jest.fn(async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Service unavailable');
        }
        // Third call takes too long
        if (callCount === 3) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        return { success: true };
      });

      errorRecovery.configureCircuitBreaker('timeout-service', {
        failureThreshold: 2,
        resetTimeout: 100,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      // First two calls fail and open the circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          errorRecovery.executeWithRecovery(flakeyOperation, {
            operationName: 'test-op',
            resourceType: 'timeout-service',
            critical: false,
            useCircuitBreaker: true,
          })
        ).rejects.toThrow();
      }

      // Circuit should be open
      expect(errorRecovery.getCircuitBreakerStatus()['timeout-service']).toBe('open');

      // Wait for reset timeout
      jest.advanceTimersByTime(150);

      // Next call should be in half-open state but will timeout
      const halfOpenPromise = errorRecovery.executeWithRecovery(flakeyOperation, {
        operationName: 'test-op',
        resourceType: 'timeout-service',
        critical: false,
        useCircuitBreaker: true,
        timeout: 500,
      });

      jest.advanceTimersByTime(600);

      await expect(halfOpenPromise).rejects.toThrow('Operation timed out');

      // Circuit should be open again after timeout in half-open state
      expect(errorRecovery.getCircuitBreakerStatus()['timeout-service']).toBe('open');
    });
  });

  describe('Different Error Types Handling', () => {
    it('should apply different retry strategies for network vs validation errors', async () => {
      const errorCounts = {
        network: 0,
        validation: 0,
        business: 0,
      };

      const operationWithErrorTypes = jest.fn(async (errorType: string) => {
        errorCounts[errorType as keyof typeof errorCounts]++;
        
        switch (errorType) {
          case 'network':
            throw new Error('ECONNREFUSED: Connection refused');
          case 'validation':
            throw new Error('ValidationError: Invalid input format');
          case 'business':
            throw new Error('BusinessRuleError: Insufficient funds');
          default:
            return { success: true };
        }
      });

      // Configure different policies for different error types
      errorRecovery.configureRetryPolicy('network-errors', {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 100,
        maxDelay: 5000,
        jitter: true,
      });

      errorRecovery.configureRetryPolicy('validation-errors', {
        maxAttempts: 1, // No retry for validation
        backoffStrategy: 'fixed',
        initialDelay: 0,
        maxDelay: 0,
        jitter: false,
      });

      errorRecovery.configureRetryPolicy('business-errors', {
        maxAttempts: 2, // Limited retry for business errors
        backoffStrategy: 'linear',
        initialDelay: 500,
        maxDelay: 1000,
        jitter: false,
      });

      // Test network error (should retry multiple times)
      await expect(
        errorRecovery.executeWithRecovery(() => operationWithErrorTypes('network'), {
          operationName: 'network-op',
          resourceType: 'network-errors',
          critical: false,
        })
      ).rejects.toThrow('ECONNREFUSED');
      expect(errorCounts.network).toBe(5); // All retry attempts

      // Test validation error (should not retry)
      await expect(
        errorRecovery.executeWithRecovery(() => operationWithErrorTypes('validation'), {
          operationName: 'validation-op',
          resourceType: 'validation-errors',
          critical: false,
        })
      ).rejects.toThrow('ValidationError');
      expect(errorCounts.validation).toBe(1); // No retries

      // Test business error (limited retries)
      await expect(
        errorRecovery.executeWithRecovery(() => operationWithErrorTypes('business'), {
          operationName: 'business-op',
          resourceType: 'business-errors',
          critical: false,
        })
      ).rejects.toThrow('BusinessRuleError');
      expect(errorCounts.business).toBe(2); // Limited retries
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

    it('should handle corrupted event snapshots during recovery', async () => {
      const eventLog: any[] = [];
      const snapshots = new Map<number, any>();
      
      // Helper to create snapshot
      const createSnapshot = (sequenceNumber: number, state: any) => {
        snapshots.set(sequenceNumber, {
          sequenceNumber,
          state: JSON.parse(JSON.stringify(state)), // Deep clone
          checksum: calculateChecksum(state),
          timestamp: Date.now(),
        });
      };
      
      // Simple checksum for corruption detection
      const calculateChecksum = (state: any): string => {
        const str = JSON.stringify(state);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
      };
      
      // Build event history
      const events = [
        { seq: 1, type: 'GAME_CREATED', gameId: 'game-123' },
        { seq: 2, type: 'PLAYER_JOINED', playerId: 'p1' },
        { seq: 3, type: 'PLAYER_JOINED', playerId: 'p2' },
        { seq: 4, type: 'GAME_STARTED' },
        { seq: 5, type: 'BET_PLACED', playerId: 'p1', amount: 100 },
      ];
      
      eventLog.push(...events);
      
      // Create snapshot at sequence 3
      const stateAtSeq3 = {
        gameId: 'game-123',
        players: ['p1', 'p2'],
        pot: 0,
        phase: 'WAITING',
      };
      createSnapshot(3, stateAtSeq3);
      
      // Corrupt the snapshot
      const corruptedSnapshot = snapshots.get(3)!;
      corruptedSnapshot.state.pot = 999999; // Obviously wrong
      corruptedSnapshot.state.players.push('ghost-player'); // Invalid player
      
      // Try to recover from corrupted snapshot
      const recoverFromSnapshot = (snapshotSeq: number) => {
        const snapshot = snapshots.get(snapshotSeq);
        if (!snapshot) return null;
        
        // Verify checksum
        const currentChecksum = calculateChecksum(snapshot.state);
        if (currentChecksum !== snapshot.checksum) {
          throw new Error('Snapshot corrupted - checksum mismatch');
        }
        
        return snapshot.state;
      };
      
      // Recovery should fail due to checksum mismatch
      expect(() => recoverFromSnapshot(3)).toThrow('Snapshot corrupted');
      
      // Fallback to full event replay
      const recoverFromEvents = () => {
        const state = {
          gameId: '',
          players: [] as string[],
          pot: 0,
          phase: 'WAITING',
        };
        
        for (const event of eventLog) {
          switch (event.type) {
            case 'GAME_CREATED':
              state.gameId = event.gameId;
              break;
            case 'PLAYER_JOINED':
              state.players.push(event.playerId);
              break;
            case 'GAME_STARTED':
              state.phase = 'PRE_FLOP';
              break;
            case 'BET_PLACED':
              state.pot += event.amount;
              break;
          }
        }
        
        return state;
      };
      
      const recoveredState = recoverFromEvents();
      expect(recoveredState.gameId).toBe('game-123');
      expect(recoveredState.players).toEqual(['p1', 'p2']);
      expect(recoveredState.pot).toBe(100);
      expect(recoveredState.phase).toBe('PRE_FLOP');
    });
  });
});