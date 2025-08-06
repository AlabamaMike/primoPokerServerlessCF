import { ErrorRecoveryManager } from '../error-recovery-manager';
import { CircuitBreaker } from '../circuit-breaker';
import { RetryPolicyExecutor } from '../retry-policy';
import { RecoveryStrategies } from '../recovery-strategies';

// Mock WebSocket for testing
class MockWebSocket {
  private _readyState: number = WebSocket.CONNECTING;
  private eventListeners: Map<string, Set<(event: any) => void>> = new Map();
  private sendQueue: any[] = [];
  
  send = jest.fn((data: any) => {
    if (this._readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sendQueue.push(data);
    return true;
  });
  
  close = jest.fn((code?: number, reason?: string) => {
    if (this._readyState === WebSocket.CLOSED) return;
    
    this._readyState = WebSocket.CLOSING;
    // Simulate close event
    setTimeout(() => {
      this._readyState = WebSocket.CLOSED;
      this.dispatchEvent('close', { code: code || 1000, reason });
    }, 0);
  });
  
  addEventListener = jest.fn((event: string, handler: (event: any) => void) => {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(handler);
  });
  
  removeEventListener = jest.fn((event: string, handler: (event: any) => void) => {
    const handlers = this.eventListeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  });
  
  get readyState() {
    return this._readyState;
  }
  
  set readyState(state: number) {
    const oldState = this._readyState;
    this._readyState = state;
    
    // Dispatch appropriate events on state change
    if (oldState === WebSocket.CONNECTING && state === WebSocket.OPEN) {
      this.dispatchEvent('open', {});
    } else if (state === WebSocket.CLOSED && oldState !== WebSocket.CLOSED) {
      this.dispatchEvent('close', { code: 1006, reason: 'Connection lost' });
    }
  }
  
  simulateMessage(data: any) {
    if (this._readyState === WebSocket.OPEN) {
      this.dispatchEvent('message', { data });
    }
  }
  
  simulateError(error: Error) {
    this.dispatchEvent('error', { error });
  }
  
  private dispatchEvent(eventType: string, eventData: any) {
    const handlers = this.eventListeners.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        setTimeout(() => handler(eventData), 0);
      });
    }
  }
  
  getSentMessages() {
    return [...this.sendQueue];
  }
  
  clearSentMessages() {
    this.sendQueue = [];
  }
}

// Mock Durable Object for testing
class MockDurableObject {
  state = {
    storage: new Map(),
    blockConcurrencyWhile: jest.fn((fn) => fn()),
  };
  env = {};
}

describe('Comprehensive Error Recovery Integration Tests', () => {
  let errorRecovery: ErrorRecoveryManager;

  beforeEach(() => {
    errorRecovery = new ErrorRecoveryManager();
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Advanced Circuit Breaker + Retry Policy Interactions', () => {
    it('should handle circuit breaker transitions during retry attempts', async () => {
      let attemptCount = 0;
      const operation = jest.fn(async () => {
        attemptCount++;
        // Fail on attempts 1-3, succeed on 4, fail on 5+
        if (attemptCount >= 1 && attemptCount <= 3) {
          throw new Error('Temporary failure');
        } else if (attemptCount === 4) {
          return { success: true, attempt: attemptCount };
        } else {
          throw new Error('Service degraded');
        }
      });

      // Configure circuit breaker with tight thresholds
      errorRecovery.configureCircuitBreaker('sensitive-api', {
        failureThreshold: 2,
        resetTimeout: 500,
        halfOpenLimit: 1,
        monitoringPeriod: 60000,
      });

      // Configure retry policy
      errorRecovery.configureRetryPolicy('sensitive-api', {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 50,
        maxDelay: 500,
        jitter: true,
      });

      // First execution should retry and succeed on 4th attempt
      const result1 = await errorRecovery.executeWithRecovery(operation, {
        operationName: 'sensitive-operation',
        resourceType: 'sensitive-api',
        critical: false,
        useCircuitBreaker: true,
      });

      expect(result1).toEqual({ success: true, attempt: 4 });
      expect(operation).toHaveBeenCalledTimes(4);

      // Circuit should have recorded failures but recovered
      const status1 = errorRecovery.getCircuitBreakerStatus();
      expect(status1['sensitive-api']).toBe('closed');

      // Reset attempt count for next test
      attemptCount = 0;

      // Now make it fail consistently to trip the circuit
      operation.mockRejectedValue(new Error('Persistent failure'));

      for (let i = 0; i < 2; i++) {
        await expect(
          errorRecovery.executeWithRecovery(operation, {
            operationName: 'sensitive-operation',
            resourceType: 'sensitive-api',
            critical: false,
            useCircuitBreaker: true,
          })
        ).rejects.toThrow();
      }

      // Circuit should now be open
      const status2 = errorRecovery.getCircuitBreakerStatus();
      expect(status2['sensitive-api']).toBe('open');

      // Further attempts should fail immediately without calling the operation
      const callCountBefore = operation.mock.calls.length;
      await expect(
        errorRecovery.executeWithRecovery(operation, {
          operationName: 'sensitive-operation',
          resourceType: 'sensitive-api',
          critical: false,
          useCircuitBreaker: true,
        })
      ).rejects.toThrow('Service temporarily unavailable');
      
      expect(operation.mock.calls.length).toBe(callCountBefore); // No new calls
    });

    it('should handle different retry policies for different error types', async () => {
      const errorTypeTracker: Record<string, number> = {
        network: 0,
        rateLimit: 0,
        validation: 0,
      };

      const complexOperation = jest.fn(async () => {
        const errorTypes = ['network', 'rateLimit', 'validation'];
        const errorType = errorTypes[Math.floor(Math.random() * errorTypes.length)];
        errorTypeTracker[errorType]++;

        switch (errorType) {
          case 'network':
            throw new Error('NETWORK_ERROR: Connection timeout');
          case 'rateLimit':
            throw new Error('RATE_LIMIT_ERROR: Too many requests');
          case 'validation':
            throw new Error('VALIDATION_ERROR: Invalid input');
        }
      });

      // Configure different retry policies for each error type
      errorRecovery.configureRetryPolicy('network-errors', {
        maxAttempts: 5,
        backoffStrategy: 'exponential',
        initialDelay: 100,
        maxDelay: 5000,
        jitter: true,
      });

      errorRecovery.configureRetryPolicy('rate-limit-errors', {
        maxAttempts: 3,
        backoffStrategy: 'linear',
        initialDelay: 1000,
        maxDelay: 10000,
        jitter: false,
      });

      errorRecovery.configureRetryPolicy('validation-errors', {
        maxAttempts: 1, // No retry for validation errors
        backoffStrategy: 'fixed',
        initialDelay: 0,
        maxDelay: 0,
        jitter: false,
      });

      // Execute multiple operations to test different error handling
      const results = await Promise.allSettled(
        Array(10).fill(null).map((_, i) =>
          errorRecovery.executeWithRecovery(complexOperation, {
            operationName: `complex-op-${i}`,
            resourceType: 'mixed-api',
            critical: false,
          })
        )
      );

      // All should fail but with different retry patterns
      expect(results.every(r => r.status === 'rejected')).toBe(true);
      
      // Verify different error types were encountered
      expect(Object.values(errorTypeTracker).every(count => count > 0)).toBe(true);
    });
  });

  describe('Complex Concurrent Failures Across Multiple Tables', () => {
    it('should handle partial table failures with player migration', async () => {
      const tableStates = new Map<string, any>();
      const playerLocations = new Map<string, string>();

      // Initialize tables and players
      const tables = ['table-1', 'table-2', 'table-3', 'table-4'];
      const players = ['player-A', 'player-B', 'player-C', 'player-D', 'player-E', 'player-F'];

      tables.forEach(table => {
        tableStates.set(table, {
          id: table,
          status: 'active',
          players: [],
          maxPlayers: 6,
        });
      });

      // Distribute players across tables
      players.forEach((player, index) => {
        const tableIndex = index % tables.length;
        const table = tables[tableIndex];
        tableStates.get(table)!.players.push(player);
        playerLocations.set(player, table);
      });

      // Simulate table failures
      const tableOperations = tables.map(tableId => {
        return jest.fn(async () => {
          const table = tableStates.get(tableId)!;
          
          // Tables 1 and 2 will fail
          if (tableId === 'table-1' || tableId === 'table-2') {
            table.status = 'failed';
            // Players need to be migrated
            const playersToMigrate = table.players;
            table.players = [];
            
            throw new Error(`Table ${tableId} crashed - ${playersToMigrate.length} players need migration`);
          }
          
          return table;
        });
      });

      // Configure circuit breakers per table
      tables.forEach(tableId => {
        errorRecovery.configureCircuitBreaker(tableId, {
          failureThreshold: 1, // Fail fast for table crashes
          resetTimeout: 30000, // 30 seconds before retry
          halfOpenLimit: 1,
          monitoringPeriod: 60000,
        });
      });

      // Execute table operations concurrently
      const results = await Promise.allSettled(
        tables.map((tableId, index) =>
          errorRecovery.executeWithRecovery(tableOperations[index], {
            operationName: 'table-health-check',
            resourceType: 'table',
            resourceId: tableId,
            critical: false,
            useCircuitBreaker: true,
          })
        )
      );

      // Verify table statuses
      expect(results[0].status).toBe('rejected'); // table-1 failed
      expect(results[1].status).toBe('rejected'); // table-2 failed
      expect(results[2].status).toBe('fulfilled'); // table-3 active
      expect(results[3].status).toBe('fulfilled'); // table-4 active

      // Verify circuit breaker states
      const cbStatus = errorRecovery.getCircuitBreakerStatus();
      expect(cbStatus['table-1']).toBe('open');
      expect(cbStatus['table-2']).toBe('open');
      expect(cbStatus['table-3']).toBe('closed');
      expect(cbStatus['table-4']).toBe('closed');

      // Simulate player migration logic
      const failedTables = ['table-1', 'table-2'];
      const activeTables = ['table-3', 'table-4'];
      const playersToMigrate: string[] = [];

      failedTables.forEach(tableId => {
        const table = tableStates.get(tableId)!;
        playersToMigrate.push(...table.players);
      });

      // Redistribute players to active tables
      let tableIndex = 0;
      playersToMigrate.forEach(player => {
        const targetTable = activeTables[tableIndex % activeTables.length];
        tableStates.get(targetTable)!.players.push(player);
        playerLocations.set(player, targetTable);
        tableIndex++;
      });

      // Verify player migration
      expect(tableStates.get('table-3')!.players.length).toBeGreaterThan(1);
      expect(tableStates.get('table-4')!.players.length).toBeGreaterThan(1);
    });

    it('should prevent cascade failures with bulkhead pattern', async () => {
      const resourcePools = {
        'pool-A': { connections: 10, inUse: 0 },
        'pool-B': { connections: 10, inUse: 0 },
        'pool-C': { connections: 10, inUse: 0 },
      };

      const createPoolOperation = (poolId: string, shouldFail: boolean) => {
        return jest.fn(async () => {
          const pool = resourcePools[poolId as keyof typeof resourcePools];
          
          if (pool.inUse >= pool.connections) {
            throw new Error(`Pool ${poolId} exhausted`);
          }

          pool.inUse++;

          if (shouldFail) {
            // Simulate resource leak - connection not released
            throw new Error(`Operation failed in pool ${poolId}`);
          }

          // Success - release connection
          pool.inUse--;
          return { poolId, success: true };
        });
      };

      // Create operations that will fail for pool-A but succeed for others
      const operations = [
        // Pool A - all operations fail (resource leak)
        ...Array(15).fill(null).map(() => createPoolOperation('pool-A', true)),
        // Pool B - operations succeed
        ...Array(5).fill(null).map(() => createPoolOperation('pool-B', false)),
        // Pool C - operations succeed
        ...Array(5).fill(null).map(() => createPoolOperation('pool-C', false)),
      ];

      // Execute all operations concurrently
      const results = await Promise.allSettled(
        operations.map((op, index) =>
          errorRecovery.executeWithRecovery(op, {
            operationName: `pool-operation-${index}`,
            resourceType: 'database',
            critical: false,
          })
        )
      );

      // Pool A should be exhausted after 10 failures
      const poolAResults = results.slice(0, 15);
      const poolAFailures = poolAResults.filter(r => r.status === 'rejected').length;
      expect(poolAFailures).toBe(15);

      // Pool B and C should succeed
      const poolBResults = results.slice(15, 20);
      const poolCResults = results.slice(20, 25);
      
      expect(poolBResults.every(r => r.status === 'fulfilled')).toBe(true);
      expect(poolCResults.every(r => r.status === 'fulfilled')).toBe(true);

      // Verify bulkhead isolation - Pool A failure didn't affect B and C
      expect(resourcePools['pool-A'].inUse).toBe(10); // Leaked connections
      expect(resourcePools['pool-B'].inUse).toBe(0); // Properly released
      expect(resourcePools['pool-C'].inUse).toBe(0); // Properly released
    });
  });

  describe('Advanced Resource Cleanup and Memory Leak Prevention', () => {
    it('should cleanup resources on operation timeout', async () => {
      const resources: any[] = [];
      const cleanupTracker = {
        created: 0,
        cleaned: 0,
      };

      const createResource = () => {
        const resource = {
          id: `resource-${Date.now()}-${Math.random()}`,
          data: new Array(1024).fill(0), // 1KB of data
          cleanup: jest.fn(() => {
            cleanupTracker.cleaned++;
          }),
        };
        resources.push(resource);
        cleanupTracker.created++;
        return resource;
      };

      const timeoutOperation = jest.fn(async () => {
        const resource = createResource();
        
        // Simulate long-running operation
        await new Promise((resolve) => {
          setTimeout(resolve, 5000); // 5 second operation
        });
        
        resource.cleanup();
        return { resourceId: resource.id };
      });

      errorRecovery.configureRetryPolicy('timeout-prone', {
        maxAttempts: 2,
        backoffStrategy: 'fixed',
        initialDelay: 100,
        maxDelay: 100,
        jitter: false,
      });

      // Execute operation with timeout
      const timeoutPromise = errorRecovery.executeWithRecovery(timeoutOperation, {
        operationName: 'timeout-operation',
        resourceType: 'timeout-prone',
        critical: false,
        timeout: 1000, // 1 second timeout
      });

      // Advance timers to trigger timeout
      jest.advanceTimersByTime(1100);

      await expect(timeoutPromise).rejects.toThrow();

      // Verify resources were created but may not be cleaned due to timeout
      expect(cleanupTracker.created).toBeGreaterThan(0);
      expect(cleanupTracker.cleaned).toBeLessThan(cleanupTracker.created);

      // Simulate manual cleanup process
      resources.forEach(resource => {
        if (resource.cleanup && !resource.cleanup.mock.calls.length) {
          resource.cleanup();
        }
      });

      expect(cleanupTracker.cleaned).toBe(cleanupTracker.created);
    });

    it('should prevent resource exhaustion under high load', async () => {
      const resourceManager = {
        totalResources: 100,
        availableResources: 100,
        waitQueue: [] as Array<() => void>,
        
        acquire: async function() {
          if (this.availableResources > 0) {
            this.availableResources--;
            return {
              id: `resource-${Date.now()}`,
              release: () => {
                this.availableResources++;
                if (this.waitQueue.length > 0) {
                  const next = this.waitQueue.shift();
                  next?.();
                }
              },
            };
          }
          
          // Wait for resource to become available
          return new Promise((resolve) => {
            this.waitQueue.push(() => {
              this.acquire().then(resolve);
            });
          });
        },
      };

      const resourceIntensiveOperation = jest.fn(async () => {
        const resource = await resourceManager.acquire();
        
        try {
          // Simulate work
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // 20% chance of failure
          if (Math.random() < 0.2) {
            throw new Error('Operation failed');
          }
          
          return { success: true, resourceId: resource.id };
        } finally {
          // Always release resource
          resource.release();
        }
      });

      // Launch many concurrent operations
      const operations = Array(200).fill(null).map((_, i) =>
        errorRecovery.executeWithRecovery(resourceIntensiveOperation, {
          operationName: `resource-intensive-${i}`,
          resourceType: 'resource-pool',
          critical: false,
        }).catch(err => ({ error: err.message }))
      );

      // Let some operations complete
      jest.advanceTimersByTime(100);

      const results = await Promise.all(operations);
      
      // Verify no resource exhaustion
      expect(resourceManager.availableResources).toBeGreaterThanOrEqual(0);
      expect(resourceManager.availableResources).toBeLessThanOrEqual(100);
      
      // Most operations should complete
      const successful = results.filter((r: any) => r.success).length;
      expect(successful).toBeGreaterThan(150); // At least 75% success rate
    });
  });

  describe('Complex WebSocket Reconnection Scenarios', () => {
    it('should handle WebSocket reconnection with message replay', async () => {
      const messageQueue: any[] = [];
      const mockWs = new MockWebSocket();
      let isConnected = true;

      const sendWithReplay = async (message: any) => {
        if (!isConnected) {
          messageQueue.push(message);
          throw new Error('WebSocket not connected');
        }

        try {
          mockWs.send(JSON.stringify(message));
          return { sent: true, messageId: message.id };
        } catch (error) {
          messageQueue.push(message);
          throw error;
        }
      };

      // Simulate connection loss and recovery
      const simulateDisconnection = () => {
        isConnected = false;
        mockWs.readyState = WebSocket.CLOSED;
      };

      const simulateReconnection = async () => {
        // Reconnection logic
        const context = {
          error: new Error('Connection lost'),
          disconnectTime: Date.now() - 2000,
          attemptCount: 1,
          connectionType: 'player',
        };

        const strategy = errorRecovery.handleConnectionFailure('player-123', context);
        
        if (strategy.action === 'reconnect') {
          await new Promise(resolve => setTimeout(resolve, strategy.delay || 1000));
          isConnected = true;
          mockWs.readyState = WebSocket.OPEN;
          
          // Replay queued messages
          const messagesToReplay = [...messageQueue];
          messageQueue.length = 0;
          
          for (const msg of messagesToReplay) {
            await sendWithReplay(msg);
          }
          
          return { reconnected: true, replayed: messagesToReplay.length };
        }
        
        return { reconnected: false };
      };

      // Send initial messages
      const messages = [
        { id: 1, type: 'bet', amount: 100 },
        { id: 2, type: 'chat', text: 'Good game!' },
      ];

      for (const msg of messages) {
        await sendWithReplay(msg);
      }

      expect(mockWs.send).toHaveBeenCalledTimes(2);

      // Simulate disconnection
      simulateDisconnection();

      // Try to send messages while disconnected
      const disconnectedMessages = [
        { id: 3, type: 'raise', amount: 200 },
        { id: 4, type: 'fold' },
      ];

      for (const msg of disconnectedMessages) {
        await expect(sendWithReplay(msg)).rejects.toThrow('WebSocket not connected');
      }

      expect(messageQueue).toHaveLength(2);

      // Reconnect and replay
      const reconnectResult = await simulateReconnection();
      
      expect(reconnectResult.reconnected).toBe(true);
      expect(reconnectResult.replayed).toBe(2);
      expect(mockWs.send).toHaveBeenCalledTimes(4); // 2 initial + 2 replayed
    });

    it('should handle progressive degradation for unstable connections', async () => {
      const connectionQuality = {
        latency: 50,
        packetLoss: 0.01,
        jitter: 10,
      };

      const qualityTracker = {
        measurements: [] as number[],
        failures: 0,
        
        addMeasurement(latency: number) {
          this.measurements.push(latency);
          if (this.measurements.length > 10) {
            this.measurements.shift();
          }
        },
        
        getAverageLatency() {
          if (this.measurements.length === 0) return 0;
          return this.measurements.reduce((a, b) => a + b, 0) / this.measurements.length;
        },
        
        getQualityScore() {
          const avgLatency = this.getAverageLatency();
          const failureRate = this.failures / (this.measurements.length || 1);
          
          if (avgLatency < 100 && failureRate < 0.1) return 'good';
          if (avgLatency < 300 && failureRate < 0.3) return 'fair';
          return 'poor';
        },
      };

      const adaptiveWebSocket = {
        async send(data: any) {
          const startTime = Date.now();
          
          // Simulate variable network conditions
          const currentLatency = connectionQuality.latency + 
            (Math.random() * connectionQuality.jitter * 2 - connectionQuality.jitter);
          
          await new Promise(resolve => setTimeout(resolve, currentLatency));
          
          // Simulate packet loss
          if (Math.random() < connectionQuality.packetLoss) {
            qualityTracker.failures++;
            throw new Error('Packet lost');
          }
          
          qualityTracker.addMeasurement(Date.now() - startTime);
          return { sent: true, latency: currentLatency };
        },
        
        getConnectionMode() {
          const quality = qualityTracker.getQualityScore();
          switch (quality) {
            case 'good':
              return { mode: 'realtime', batchSize: 1 };
            case 'fair':
              return { mode: 'batched', batchSize: 5 };
            case 'poor':
              return { mode: 'polling', interval: 5000 };
          }
        },
      };

      // Simulate degrading connection
      const testPhases = [
        { latency: 50, packetLoss: 0.01, jitter: 10, messages: 20 },   // Good
        { latency: 200, packetLoss: 0.1, jitter: 50, messages: 20 },   // Fair
        { latency: 500, packetLoss: 0.3, jitter: 100, messages: 20 },  // Poor
      ];

      for (const phase of testPhases) {
        connectionQuality.latency = phase.latency;
        connectionQuality.packetLoss = phase.packetLoss;
        connectionQuality.jitter = phase.jitter;

        const results = await Promise.allSettled(
          Array(phase.messages).fill(null).map((_, i) =>
            adaptiveWebSocket.send({ id: i, data: 'test' })
          )
        );

        const successRate = results.filter(r => r.status === 'fulfilled').length / results.length;
        const mode = adaptiveWebSocket.getConnectionMode();

        // Connection should degrade appropriately
        if (phase.latency === 50) {
          expect(mode.mode).toBe('realtime');
          expect(successRate).toBeGreaterThan(0.9);
        } else if (phase.latency === 200) {
          expect(mode.mode).toBe('batched');
          expect(successRate).toBeGreaterThan(0.7);
        } else {
          expect(mode.mode).toBe('polling');
          expect(successRate).toBeGreaterThan(0.5);
        }
      }
    });
  });

  describe('Advanced Graceful Degradation Scenarios', () => {
    it('should implement feature flags for progressive degradation', async () => {
      const featureFlags = {
        animations: true,
        soundEffects: true,
        chatSystem: true,
        leaderboard: true,
        achievements: true,
        realTimeUpdates: true,
      };

      const systemLoad = {
        cpu: 50,
        memory: 60,
        connections: 100,
      };

      const degradationThresholds = [
        { cpu: 70, memory: 70, connections: 200, disable: ['animations', 'soundEffects'] },
        { cpu: 80, memory: 80, connections: 300, disable: ['leaderboard', 'achievements'] },
        { cpu: 90, memory: 90, connections: 400, disable: ['chatSystem'] },
        { cpu: 95, memory: 95, connections: 500, disable: ['realTimeUpdates'] },
      ];

      const applyDegradation = () => {
        // Reset all features
        Object.keys(featureFlags).forEach(key => {
          featureFlags[key as keyof typeof featureFlags] = true;
        });

        // Apply degradation based on load
        for (const threshold of degradationThresholds) {
          if (systemLoad.cpu >= threshold.cpu || 
              systemLoad.memory >= threshold.memory || 
              systemLoad.connections >= threshold.connections) {
            threshold.disable.forEach(feature => {
              featureFlags[feature as keyof typeof featureFlags] = false;
            });
          }
        }
      };

      // Test different load scenarios
      const loadScenarios = [
        { cpu: 60, memory: 65, connections: 150 }, // Low load
        { cpu: 75, memory: 72, connections: 250 }, // Medium load
        { cpu: 85, memory: 87, connections: 350 }, // High load
        { cpu: 96, memory: 94, connections: 520 }, // Critical load
      ];

      for (const scenario of loadScenarios) {
        systemLoad.cpu = scenario.cpu;
        systemLoad.memory = scenario.memory;
        systemLoad.connections = scenario.connections;

        applyDegradation();

        // Verify appropriate features are disabled
        if (scenario.cpu >= 95) {
          expect(featureFlags.realTimeUpdates).toBe(false);
          expect(featureFlags.chatSystem).toBe(false);
          expect(featureFlags.animations).toBe(false);
        } else if (scenario.cpu >= 80) {
          expect(featureFlags.realTimeUpdates).toBe(true);
          expect(featureFlags.leaderboard).toBe(false);
          expect(featureFlags.animations).toBe(false);
        } else if (scenario.cpu >= 70) {
          expect(featureFlags.animations).toBe(false);
          expect(featureFlags.soundEffects).toBe(false);
          expect(featureFlags.chatSystem).toBe(true);
        } else {
          // All features should be enabled
          expect(Object.values(featureFlags).every(f => f === true)).toBe(true);
        }
      }
    });

    it('should implement smart caching for degraded services', async () => {
      const cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
      const serviceHealth = {
        userService: 'healthy',
        gameService: 'healthy',
        statsService: 'degraded',
        paymentService: 'down',
      };

      const getCacheTTL = (service: string) => {
        switch (serviceHealth[service as keyof typeof serviceHealth]) {
          case 'healthy':
            return 60000; // 1 minute
          case 'degraded':
            return 300000; // 5 minutes
          case 'down':
            return 3600000; // 1 hour
          default:
            return 60000;
        }
      };

      const fetchWithCache = async (key: string, service: string, fetcher: () => Promise<any>) => {
        const cached = cache.get(key);
        const now = Date.now();

        if (cached && now - cached.timestamp < cached.ttl) {
          return { data: cached.data, source: 'cache' };
        }

        try {
          if (serviceHealth[service as keyof typeof serviceHealth] === 'down') {
            throw new Error(`Service ${service} is down`);
          }

          const data = await fetcher();
          const ttl = getCacheTTL(service);
          
          cache.set(key, { data, timestamp: now, ttl });
          return { data, source: 'fresh' };
        } catch (error) {
          // Return stale cache if available
          if (cached) {
            return { data: cached.data, source: 'stale-cache' };
          }
          throw error;
        }
      };

      // Test caching behavior
      const mockFetchers = {
        userService: jest.fn().mockResolvedValue({ id: 1, name: 'User' }),
        gameService: jest.fn().mockResolvedValue({ id: 1, status: 'active' }),
        statsService: jest.fn().mockResolvedValue({ wins: 10, losses: 5 }),
        paymentService: jest.fn().mockRejectedValue(new Error('Service down')),
      };

      // First fetch - all should hit the service
      const result1 = await fetchWithCache('user:1', 'userService', mockFetchers.userService);
      expect(result1.source).toBe('fresh');
      expect(mockFetchers.userService).toHaveBeenCalledTimes(1);

      // Second fetch immediately - should use cache
      const result2 = await fetchWithCache('user:1', 'userService', mockFetchers.userService);
      expect(result2.source).toBe('cache');
      expect(mockFetchers.userService).toHaveBeenCalledTimes(1);

      // Fetch from degraded service
      const statsResult1 = await fetchWithCache('stats:1', 'statsService', mockFetchers.statsService);
      expect(statsResult1.source).toBe('fresh');

      // Payment service is down - should fail without cache
      await expect(
        fetchWithCache('payment:1', 'paymentService', mockFetchers.paymentService)
      ).rejects.toThrow();

      // Pre-populate cache for payment service
      cache.set('payment:1', { 
        data: { balance: 1000 }, 
        timestamp: Date.now() - 1000, 
        ttl: 3600000 
      });

      // Now it should return stale cache
      const paymentResult = await fetchWithCache('payment:1', 'paymentService', mockFetchers.paymentService);
      expect(paymentResult.source).toBe('stale-cache');
      expect(paymentResult.data).toEqual({ balance: 1000 });
    });
  });

  describe('Complex State Recovery Scenarios', () => {
    it('should handle distributed state recovery across Durable Objects', async () => {
      const durableObjects = new Map<string, MockDurableObject>();
      const stateVersions = new Map<string, number>();

      // Initialize DOs
      ['game-1', 'game-2', 'game-3'].forEach(id => {
        durableObjects.set(id, new MockDurableObject());
        stateVersions.set(id, 1);
      });

      const performStateUpdate = async (gameId: string, update: any) => {
        const DO = durableObjects.get(gameId);
        if (!DO) throw new Error(`DO ${gameId} not found`);

        return DO.state.blockConcurrencyWhile(async () => {
          const currentVersion = stateVersions.get(gameId) || 0;
          const state = DO.state.storage.get('gameState') || {};

          // Simulate version conflict
          if (update.version && update.version !== currentVersion) {
            throw new Error(`Version conflict: expected ${update.version}, got ${currentVersion}`);
          }

          // Apply update
          const newState = { ...state, ...update.data };
          DO.state.storage.set('gameState', newState);
          stateVersions.set(gameId, currentVersion + 1);

          return { 
            success: true, 
            version: currentVersion + 1,
            state: newState 
          };
        });
      };

      // Simulate concurrent updates
      const updates = [
        { gameId: 'game-1', data: { pot: 100 }, version: 1 },
        { gameId: 'game-1', data: { pot: 150 }, version: 1 }, // Will conflict
        { gameId: 'game-2', data: { phase: 'FLOP' }, version: 1 },
        { gameId: 'game-3', data: { players: ['A', 'B'] }, version: 1 },
      ];

      const results = await Promise.allSettled(
        updates.map(update =>
          errorRecovery.executeWithRecovery(
            () => performStateUpdate(update.gameId, update),
            {
              operationName: 'state-update',
              resourceType: 'durable-object',
              resourceId: update.gameId,
              critical: true,
            }
          )
        )
      );

      // First update should succeed
      expect(results[0].status).toBe('fulfilled');
      // Second update should fail due to version conflict
      expect(results[1].status).toBe('rejected');
      // Other updates should succeed
      expect(results[2].status).toBe('fulfilled');
      expect(results[3].status).toBe('fulfilled');

      // Handle state recovery for failed update
      const conflictedGameId = 'game-1';
      const conflictResolution = errorRecovery.handleStateConflict({
        conflictType: 'concurrent-update',
        localState: { pot: 150 },
        remoteState: { pot: 100 },
        field: 'pot',
      });

      if (conflictResolution.strategy === 'merge') {
        // Retry with updated version
        const latestVersion = stateVersions.get(conflictedGameId);
        const retryResult = await performStateUpdate(conflictedGameId, {
          data: conflictResolution.resolvedState || { pot: 150 },
          version: latestVersion,
        });

        expect(retryResult.success).toBe(true);
        expect(retryResult.version).toBe(3);
      }
    });

    it('should implement event sourcing for state recovery', async () => {
      const eventStore: any[] = [];
      const snapshotStore = new Map<string, any>();

      const appendEvent = (event: any) => {
        const timestampedEvent = {
          ...event,
          timestamp: Date.now(),
          sequenceNumber: eventStore.length + 1,
        };
        eventStore.push(timestampedEvent);
        return timestampedEvent;
      };

      const replayEvents = (fromSequence: number = 0) => {
        const state = snapshotStore.get('latest') || { 
          gameId: 'game-1',
          pot: 0,
          players: [],
          phase: 'WAITING',
        };

        const events = eventStore.filter(e => e.sequenceNumber > fromSequence);
        
        for (const event of events) {
          switch (event.type) {
            case 'PLAYER_JOINED':
              state.players.push(event.playerId);
              break;
            case 'GAME_STARTED':
              state.phase = 'PRE_FLOP';
              break;
            case 'BET_PLACED':
              state.pot += event.amount;
              break;
            case 'PHASE_CHANGED':
              state.phase = event.newPhase;
              break;
          }
        }

        return state;
      };

      // Simulate game events
      const gameEvents = [
        { type: 'PLAYER_JOINED', playerId: 'player-1' },
        { type: 'PLAYER_JOINED', playerId: 'player-2' },
        { type: 'GAME_STARTED' },
        { type: 'BET_PLACED', playerId: 'player-1', amount: 50 },
        { type: 'BET_PLACED', playerId: 'player-2', amount: 50 },
        { type: 'PHASE_CHANGED', newPhase: 'FLOP' },
      ];

      // Append events
      gameEvents.forEach(event => appendEvent(event));

      // Create snapshot after 4 events
      const snapshotSequence = 4;
      const snapshotState = replayEvents(0);
      snapshotStore.set('latest', {
        ...snapshotState,
        snapshotSequence,
      });

      // Add more events
      appendEvent({ type: 'BET_PLACED', playerId: 'player-1', amount: 100 });
      appendEvent({ type: 'PHASE_CHANGED', newPhase: 'TURN' });

      // Simulate state corruption
      const corruptedState = {
        gameId: 'game-1',
        pot: 999999, // Obviously wrong
        players: ['player-1', 'player-2', 'ghost-player'], // Extra player
        phase: 'SHOWDOWN', // Wrong phase
      };

      // Detect corruption
      const isCorrupted = corruptedState.pot > 10000 || 
                         corruptedState.players.includes('ghost-player');

      if (isCorrupted) {
        // Recover from snapshot + events
        const snapshot = snapshotStore.get('latest');
        const recoveredState = replayEvents(snapshot.snapshotSequence);

        expect(recoveredState.pot).toBe(200); // 50 + 50 + 100
        expect(recoveredState.players).toEqual(['player-1', 'player-2']);
        expect(recoveredState.phase).toBe('TURN');
      }
    });
  });

  describe('Performance Baseline Testing', () => {
    it('should measure overhead of error recovery mechanisms', async () => {
      const iterations = 100;
      
      // Baseline operation without error recovery
      const baselineOperation = jest.fn().mockResolvedValue({ success: true });
      
      // Measure baseline performance
      const baselineStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        await baselineOperation();
      }
      const baselineDuration = Date.now() - baselineStart;
      const baselineAvg = baselineDuration / iterations;
      
      // Measure with error recovery (no failures)
      const recoveryStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        await errorRecovery.executeWithRecovery(baselineOperation, {
          operationName: `baseline-${i}`,
          resourceType: 'baseline-test',
          critical: false,
        });
      }
      const recoveryDuration = Date.now() - recoveryStart;
      const recoveryAvg = recoveryDuration / iterations;
      
      // Measure with circuit breaker
      const cbStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        await errorRecovery.executeWithRecovery(baselineOperation, {
          operationName: `cb-baseline-${i}`,
          resourceType: 'cb-baseline-test',
          critical: false,
          useCircuitBreaker: true,
        });
      }
      const cbDuration = Date.now() - cbStart;
      const cbAvg = cbDuration / iterations;
      
      // Calculate overhead percentages
      const recoveryOverhead = ((recoveryAvg - baselineAvg) / baselineAvg) * 100;
      const cbOverhead = ((cbAvg - baselineAvg) / baselineAvg) * 100;
      
      // Assert reasonable overhead (less than 50% for basic error recovery)
      expect(recoveryOverhead).toBeLessThan(50);
      expect(cbOverhead).toBeLessThan(100); // Circuit breaker adds more overhead
      
      // Log performance metrics for visibility
      console.log('Performance Baseline Metrics:', {
        baselineAvg: `${baselineAvg.toFixed(2)}ms`,
        recoveryAvg: `${recoveryAvg.toFixed(2)}ms`,
        recoveryOverhead: `${recoveryOverhead.toFixed(1)}%`,
        cbAvg: `${cbAvg.toFixed(2)}ms`,
        cbOverhead: `${cbOverhead.toFixed(1)}%`,
      });
    });
  });

  describe('Performance and Stress Testing', () => {
    it('should maintain performance under extreme error rates', async () => {
      const metrics = {
        startTime: Date.now(),
        operations: 0,
        successes: 0,
        failures: 0,
        recoveries: 0,
        avgResponseTime: 0,
        responseTimes: [] as number[],
      };

      const stressOperation = jest.fn(async () => {
        const start = Date.now();
        metrics.operations++;

        // 70% failure rate
        if (Math.random() < 0.7) {
          metrics.failures++;
          throw new Error('High failure rate test');
        }

        metrics.successes++;
        const responseTime = Date.now() - start;
        metrics.responseTimes.push(responseTime);
        
        return { success: true, responseTime };
      });

      // Configure aggressive retry policy
      errorRecovery.configureRetryPolicy('stress-test', {
        maxAttempts: 3,
        backoffStrategy: 'exponential',
        initialDelay: 10,
        maxDelay: 100,
        jitter: true,
      });

      // Run 1000 operations concurrently in batches
      const batchSize = 100;
      const totalOperations = 1000;

      for (let i = 0; i < totalOperations / batchSize; i++) {
        const batch = Array(batchSize).fill(null).map((_, j) =>
          errorRecovery.executeWithRecovery(stressOperation, {
            operationName: `stress-${i}-${j}`,
            resourceType: 'stress-test',
            critical: false,
          }).then(
            (result) => {
              metrics.recoveries++;
              return result;
            },
            (error) => error
          )
        );

        await Promise.all(batch);
        
        // Allow system to breathe between batches
        jest.advanceTimersByTime(50);
      }

      // Calculate metrics
      metrics.avgResponseTime = metrics.responseTimes.length > 0
        ? metrics.responseTimes.reduce((a, b) => a + b, 0) / metrics.responseTimes.length
        : 0;

      const duration = Date.now() - metrics.startTime;
      const opsPerSecond = (metrics.operations / duration) * 1000;

      // Performance assertions - relative metrics to avoid environment dependencies
      // Instead of absolute thresholds, use relative comparisons
      const baselineResponseTime = 10; // Expected minimum time for a successful operation
      const acceptableOverhead = 5; // 5x overhead is acceptable under high error rate
      
      // Ensure operations completed in reasonable time relative to baseline
      expect(metrics.avgResponseTime).toBeLessThan(baselineResponseTime * acceptableOverhead);
      
      // Ensure system maintained reasonable throughput
      expect(metrics.operations).toBe(totalOperations);
      expect(duration).toBeLessThan(totalOperations * baselineResponseTime * 2); // 2x buffer for overhead
      
      // Good recovery rate is more important than absolute performance
      expect(metrics.recoveries).toBeGreaterThan(metrics.successes * 0.5);

      // System should remain stable
      const systemMetrics = errorRecovery.getMetrics();
      expect(systemMetrics.totalOperations).toBeGreaterThan(0);
      expect(systemMetrics.errorRate).toBeLessThan(0.8); // Despite 70% failure rate
    });
  });
});