import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import { ConnectionPoolManager, PoolConfig } from '../websocket-connection-pool';
import { createWebSocketMessage } from '@primo-poker/shared';
import { MockWebSocket } from './websocket-test-utils';
import { BatchingWebSocketManager } from '../websocket-batched';

// Mock authentication
jest.mock('@primo-poker/security', () => ({
  AuthenticationManager: jest.fn().mockImplementation(() => ({
    verifyAccessToken: jest.fn().mockResolvedValue({
      valid: true,
      payload: {
        userId: 'test-user-id',
        username: 'testuser',
      },
    }),
  })),
}));

// Mock parent class handleConnection to avoid timeout
jest.spyOn(BatchingWebSocketManager.prototype, 'handleConnection').mockImplementation(async () => {
  // No-op for tests
});

describe('WebSocket Connection Pool', () => {
  let poolManager: ConnectionPoolManager;
  let poolConfig: PoolConfig;

  beforeEach(() => {
    poolConfig = {
      maxConnectionsPerTable: 100,
      maxTotalConnections: 1000,
      connectionTimeout: 300000, // 5 minutes
      idleTimeout: 60000, // 1 minute
      maxReconnectAttempts: 3,
      reconnectBackoff: 1000,
    };
    poolManager = new ConnectionPoolManager('test-secret', poolConfig);
  });

  afterEach(() => {
    poolManager.shutdown();
  });

  describe('Connection Pooling', () => {
    it('should manage connections per table', async () => {
      const connections: MockWebSocket[] = [];
      
      // Add connections to different tables
      for (let i = 0; i < 5; i++) {
        const ws = new MockWebSocket() as any;
        const request = new Request(`ws://localhost?token=token${i}&tableId=table-1`);
        await poolManager.addConnection(ws, request);
        connections.push(ws);
      }
      
      for (let i = 0; i < 3; i++) {
        const ws = new MockWebSocket() as any;
        const request = new Request(`ws://localhost?token=token${i + 5}&tableId=table-2`);
        await poolManager.addConnection(ws, request);
        connections.push(ws);
      }
      
      // Verify pool stats
      const stats = poolManager.getPoolStats();
      expect(stats.totalConnections).toBe(8);
      expect(stats.connectionsByTable['table-1']).toBe(5);
      expect(stats.connectionsByTable['table-2']).toBe(3);
    });

    it('should enforce max connections per table', async () => {
      poolConfig.maxConnectionsPerTable = 3;
      poolManager = new ConnectionPoolManager('test-secret', poolConfig);
      
      const connections: MockWebSocket[] = [];
      
      // Try to add more than max connections
      for (let i = 0; i < 5; i++) {
        const ws = new MockWebSocket() as any;
        const request = new Request(`ws://localhost?token=token${i}&tableId=table-1`);
        
        if (i < 3) {
          await poolManager.addConnection(ws, request);
          connections.push(ws);
        } else {
          // Should reject connections beyond limit
          await expect(poolManager.addConnection(ws, request)).rejects.toThrow('Table connection limit reached');
        }
      }
      
      const stats = poolManager.getPoolStats();
      expect(stats.connectionsByTable['table-1']).toBe(3);
    });

    it('should enforce total connection limit', async () => {
      poolConfig.maxTotalConnections = 5;
      poolManager = new ConnectionPoolManager('test-secret', poolConfig);
      
      // Try to add more than total max
      for (let i = 0; i < 7; i++) {
        const ws = new MockWebSocket() as any;
        const tableId = `table-${i % 3}`; // Distribute across tables
        const request = new Request(`ws://localhost?token=token${i}&tableId=${tableId}`);
        
        if (i < 5) {
          await poolManager.addConnection(ws, request);
        } else {
          await expect(poolManager.addConnection(ws, request)).rejects.toThrow('Total connection limit reached');
        }
      }
      
      const stats = poolManager.getPoolStats();
      expect(stats.totalConnections).toBe(5);
    });
  });

  describe('Connection Health Management', () => {
    it('should remove idle connections', async () => {
      jest.useFakeTimers();
      poolConfig.idleTimeout = 1000; // 1 second for testing
      poolManager = new ConnectionPoolManager('test-secret', poolConfig);
      
      const ws = new MockWebSocket() as any;
      const request = new Request('ws://localhost?token=test-token&tableId=table-1');
      await poolManager.addConnection(ws, request);
      
      // Initial connection count
      let stats = poolManager.getPoolStats();
      expect(stats.totalConnections).toBe(1);
      
      // Advance time past idle timeout
      jest.advanceTimersByTime(2000);
      
      // Connection should be removed
      stats = poolManager.getPoolStats();
      expect(stats.totalConnections).toBe(0);
      expect(stats.idleConnectionsRemoved).toBe(1);
      
      jest.useRealTimers();
    });

    it('should keep active connections alive', async () => {
      jest.useFakeTimers();
      poolConfig.idleTimeout = 1000;
      poolManager = new ConnectionPoolManager('test-secret', poolConfig);
      
      const ws = new MockWebSocket() as any;
      const request = new Request('ws://localhost?token=test-token&tableId=table-1');
      await poolManager.addConnection(ws, request);
      
      // Simulate activity
      const activityInterval = setInterval(() => {
        ws.receiveMessage(JSON.stringify(createWebSocketMessage('ping', {})));
      }, 500);
      
      // Advance time
      jest.advanceTimersByTime(2000);
      
      // Connection should still be active
      const stats = poolManager.getPoolStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.idleConnectionsRemoved).toBe(0);
      
      clearInterval(activityInterval);
      jest.useRealTimers();
    });

    it('should handle connection failures', async () => {
      const ws = new MockWebSocket() as any;
      const request = new Request('ws://localhost?token=test-token&tableId=table-1');
      await poolManager.addConnection(ws, request);
      
      // Simulate connection error
      ws.dispatchEvent('error', new Error('Connection failed'));
      
      // Should mark connection as unhealthy
      const health = poolManager.getConnectionHealth(ws);
      expect(health?.healthy).toBe(false);
      expect(health?.errorCount).toBeGreaterThan(0);
    });
  });

  describe('Connection Reuse', () => {
    it('should allow connection reuse for same player', async () => {
      const ws1 = new MockWebSocket() as any;
      const request1 = new Request('ws://localhost?token=test-token&tableId=table-1');
      await poolManager.addConnection(ws1, request1);
      
      // Same player tries to connect again
      const ws2 = new MockWebSocket() as any;
      const request2 = new Request('ws://localhost?token=test-token&tableId=table-1');
      await poolManager.addConnection(ws2, request2);
      
      // Old connection should be closed
      expect(ws1.readyState).toBe(3); // CLOSED
      
      // Only one connection for the player
      const stats = poolManager.getPoolStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.connectionReuses).toBe(1);
    });

    it('should handle player switching tables', async () => {
      const ws1 = new MockWebSocket() as any;
      const request1 = new Request('ws://localhost?token=test-token&tableId=table-1');
      await poolManager.addConnection(ws1, request1);
      
      // Player switches to different table
      const ws2 = new MockWebSocket() as any;
      const request2 = new Request('ws://localhost?token=test-token&tableId=table-2');
      await poolManager.addConnection(ws2, request2);
      
      // Should have moved connection
      const stats = poolManager.getPoolStats();
      expect(stats.connectionsByTable['table-1']).toBe(0);
      expect(stats.connectionsByTable['table-2']).toBe(1);
    });
  });

  describe('Broadcast Optimization', () => {
    it('should efficiently broadcast to table connections', async () => {
      const connections: MockWebSocket[] = [];
      
      // Add multiple connections to same table
      for (let i = 0; i < 10; i++) {
        const ws = new MockWebSocket() as any;
        const request = new Request(`ws://localhost?token=token${i}&tableId=table-1`);
        await poolManager.addConnection(ws, request);
        connections.push(ws);
      }
      
      // Broadcast message
      const message = createWebSocketMessage('game_update', { pot: 1000 });
      poolManager.broadcastToTable('table-1', message);
      
      // All connections should receive the message
      connections.forEach(ws => {
        expect(ws.sentMessages.length).toBe(1);
        expect(ws.sentMessages[0]).toContain('game_update');
      });
    });

    it('should handle broadcast failures gracefully', async () => {
      const connections: MockWebSocket[] = [];
      
      for (let i = 0; i < 5; i++) {
        const ws = new MockWebSocket() as any;
        if (i === 2) {
          // Make one connection fail
          ws.send = jest.fn().mockImplementation(() => {
            throw new Error('Send failed');
          });
        }
        const request = new Request(`ws://localhost?token=token${i}&tableId=table-1`);
        await poolManager.addConnection(ws, request);
        connections.push(ws);
      }
      
      // Broadcast should continue despite one failure
      const message = createWebSocketMessage('game_update', { pot: 1000 });
      poolManager.broadcastToTable('table-1', message);
      
      // Check successful sends
      let successCount = 0;
      connections.forEach((ws, index) => {
        if (index !== 2) {
          expect(ws.sentMessages.length).toBe(1);
          successCount++;
        }
      });
      expect(successCount).toBe(4);
    });
  });

  describe('Pool Metrics', () => {
    it('should track detailed pool metrics', async () => {
      // Add various connections
      for (let i = 0; i < 20; i++) {
        const ws = new MockWebSocket() as any;
        const tableId = `table-${i % 4}`;
        const request = new Request(`ws://localhost?token=token${i}&tableId=${tableId}`);
        await poolManager.addConnection(ws, request);
        
        // Simulate some activity
        if (i % 3 === 0) {
          ws.receiveMessage(JSON.stringify(createWebSocketMessage('ping', {})));
        }
      }
      
      const metrics = poolManager.getDetailedMetrics();
      expect(metrics.poolUtilization).toBeDefined();
      expect(metrics.averageConnectionsPerTable).toBeDefined();
      expect(metrics.connectionTurnover).toBeDefined();
      expect(metrics.healthMetrics.healthyConnections).toBeGreaterThan(0);
    });

    it('should provide table-specific metrics', async () => {
      // Add connections to specific table
      for (let i = 0; i < 5; i++) {
        const ws = new MockWebSocket() as any;
        const request = new Request(`ws://localhost?token=token${i}&tableId=table-1`);
        await poolManager.addConnection(ws, request);
      }
      
      const tableMetrics = poolManager.getTableMetrics('table-1');
      expect(tableMetrics.connectionCount).toBe(5);
      expect(tableMetrics.messagesSent).toBeDefined();
      expect(tableMetrics.messagesReceived).toBeDefined();
      expect(tableMetrics.avgLatency).toBeDefined();
    });
  });

  describe('Connection Load Balancing', () => {
    it('should distribute load across connections', async () => {
      const connections: MockWebSocket[] = [];
      
      // Create connections with different load
      for (let i = 0; i < 3; i++) {
        const ws = new MockWebSocket() as any;
        const request = new Request(`ws://localhost?token=token${i}&tableId=table-1`);
        await poolManager.addConnection(ws, request);
        connections.push(ws);
      }
      
      // Send messages using load balancing
      for (let i = 0; i < 30; i++) {
        const targetWs = poolManager.getOptimalConnection('table-1');
        if (targetWs) {
          poolManager.sendToConnection(targetWs, createWebSocketMessage('update', { index: i }));
        }
      }
      
      // Messages should be distributed
      connections.forEach(ws => {
        expect(ws.sentMessages.length).toBeGreaterThan(5);
        expect(ws.sentMessages.length).toBeLessThan(15);
      });
    });

    it('should avoid overloaded connections', async () => {
      const normalWs = new MockWebSocket() as any;
      const overloadedWs = new MockWebSocket() as any;
      
      // Simulate overloaded connection
      overloadedWs.send = jest.fn().mockImplementation(function(this: MockWebSocket, data: string) {
        // Simulate slow send
        return new Promise(resolve => setTimeout(() => {
          this.sentMessages.push(data);
          resolve(undefined);
        }, 100));
      });
      
      await poolManager.addConnection(normalWs, new Request('ws://localhost?token=token1&tableId=table-1'));
      await poolManager.addConnection(overloadedWs, new Request('ws://localhost?token=token2&tableId=table-1'));
      
      // Mark overloaded connection
      poolManager.markConnectionLoad(overloadedWs, 'high');
      
      // Should prefer normal connection
      for (let i = 0; i < 10; i++) {
        const targetWs = poolManager.getOptimalConnection('table-1');
        expect(targetWs).toBe(normalWs);
      }
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close all connections on shutdown', async () => {
      const connections: MockWebSocket[] = [];
      
      // Add multiple connections
      for (let i = 0; i < 10; i++) {
        const ws = new MockWebSocket() as any;
        const tableId = `table-${i % 3}`;
        const request = new Request(`ws://localhost?token=token${i}&tableId=${tableId}`);
        await poolManager.addConnection(ws, request);
        connections.push(ws);
      }
      
      // Shutdown pool
      await poolManager.shutdown();
      
      // All connections should be closed
      connections.forEach(ws => {
        expect(ws.readyState).toBe(3); // CLOSED
      });
      
      // Pool should be empty
      const stats = poolManager.getPoolStats();
      expect(stats.totalConnections).toBe(0);
    });

    it('should wait for pending operations during shutdown', async () => {
      const ws = new MockWebSocket() as any;
      await poolManager.addConnection(ws, new Request('ws://localhost?token=test-token&tableId=table-1'));
      
      // Simulate pending operation
      const pendingOp = new Promise(resolve => setTimeout(resolve, 100));
      poolManager.registerPendingOperation(pendingOp);
      
      // Start shutdown
      const shutdownPromise = poolManager.shutdown();
      
      // Should wait for pending operation
      const startTime = Date.now();
      await shutdownPromise;
      const duration = Date.now() - startTime;
      
      expect(duration).toBeGreaterThanOrEqual(100);
    });
  });
});