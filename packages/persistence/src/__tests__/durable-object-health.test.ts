import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GameTableDurableObject } from '../game-table-do';
import { DurableObjectState, DurableObjectStorage } from '@cloudflare/workers-types';

// Mock the DurableObjectState and Storage
const createMockState = (): DurableObjectState => {
  const storage: Partial<DurableObjectStorage> = {
    get: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    deleteAll: jest.fn(),
    list: jest.fn(),
    transaction: jest.fn(),
    getAlarm: jest.fn(),
    setAlarm: jest.fn(),
    deleteAlarm: jest.fn(),
    sync: jest.fn(),
  };

  return {
    storage: storage as DurableObjectStorage,
    id: {
      toString: () => 'test-object-id',
      equals: (other: any) => false,
    },
    waitUntil: jest.fn(),
    blockConcurrencyWhile: jest.fn(),
  } as unknown as DurableObjectState;
};

describe('Durable Object Health Monitoring', () => {
  let durableObject: GameTableDurableObject;
  let mockState: DurableObjectState;
  let mockEnv: any;

  beforeEach(() => {
    mockState = createMockState();
    mockEnv = {
      DB: {},
      SESSION_STORE: {},
      TABLE_OBJECTS: {},
      GAME_TABLES: {},
      JWT_SECRET: 'test-secret',
    };
    
    durableObject = new GameTableDurableObject(mockState, mockEnv);
  });

  describe('Health Check Endpoint', () => {
    it('should respond to health check requests', async () => {
      const request = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json() as any;
      expect(data).toHaveProperty('healthy', true);
      expect(data).toHaveProperty('instanceId', 'test-object-id');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('memoryUsage');
    });

    it('should include table state in health check', async () => {
      // First create a table
      const createRequest = new Request('https://internal/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Creator-ID': 'user123',
          'X-Creator-Username': 'testuser',
        },
        body: JSON.stringify({
          config: {
            id: 'test-table',
            name: 'Test Table',
            gameType: 'NL_HOLDEM',
            smallBlind: 10,
            bigBlind: 20,
            maxPlayers: 9,
            minBuyIn: 100,
            maxBuyIn: 1000,
          },
        }),
      });

      await durableObject.fetch(createRequest);

      // Now check health
      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data).toHaveProperty('tableInfo');
      expect(data.tableInfo).toHaveProperty('tableId', 'test-table');
      expect(data.tableInfo).toHaveProperty('playerCount', 0);
      expect(data.tableInfo).toHaveProperty('isActive', false);
    });

    it('should report unhealthy status when storage is unavailable', async () => {
      // Mock storage failure
      (mockState.storage.get as jest.Mock).mockRejectedValue(new Error('Storage unavailable'));

      const request = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(request);
      
      expect(response.status).toBe(200); // Still returns 200 but with unhealthy status
      
      const data = await response.json() as any;
      expect(data).toHaveProperty('healthy', false);
      expect(data).toHaveProperty('error');
    });

    it('should track request counts', async () => {
      // Make several requests
      for (let i = 0; i < 5; i++) {
        await durableObject.fetch(new Request('https://internal/state'));
      }

      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data).toHaveProperty('metrics');
      expect(data.metrics).toHaveProperty('totalRequests', 6); // 5 state requests + 1 health request
    });

    it('should measure average response time', async () => {
      // Make several requests
      for (let i = 0; i < 3; i++) {
        await durableObject.fetch(new Request('https://internal/state'));
      }

      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data.metrics).toHaveProperty('averageResponseTime');
      expect(data.metrics.averageResponseTime).toBeGreaterThan(0);
    });
  });

  describe('Performance Metrics', () => {
    it('should track WebSocket connections', async () => {
      // Simulate WebSocket upgrade
      const wsRequest = new Request('https://internal/websocket', {
        headers: {
          'Upgrade': 'websocket',
        },
      });

      // Mock WebSocket upgrade
      const mockWebSocket = {
        accept: jest.fn(),
        addEventListener: jest.fn(),
        send: jest.fn(),
        close: jest.fn(),
      };

      (global as any).WebSocketPair = jest.fn(() => ({
        0: mockWebSocket,
        1: {},
      }));

      await durableObject.fetch(wsRequest);

      // Check health
      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data).toHaveProperty('websocketConnections', 1);
    });

    it('should track error rates', async () => {
      // Cause an error
      const badRequest = new Request('https://internal/invalid-endpoint');
      await durableObject.fetch(badRequest);

      // Check health
      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data.metrics).toHaveProperty('errorCount', 1);
      expect(data.metrics).toHaveProperty('errorRate');
    });
  });

  describe('Alarm-based Health Checks', () => {
    it('should set up periodic health checks', async () => {
      const setAlarmMock = mockState.storage.setAlarm as jest.Mock;
      
      // Initialize with health check alarm
      await durableObject.fetch(new Request('https://internal/init-health-check', {
        method: 'POST',
      }));

      expect(setAlarmMock).toHaveBeenCalled();
      const alarmTime = setAlarmMock.mock.calls[0][0];
      expect(alarmTime).toBeInstanceOf(Date);
    });

    it('should perform health check on alarm', async () => {
      // Mock alarm handler
      const alarm = durableObject.alarm as any;
      if (alarm) {
        await alarm.call(durableObject);
      }

      // Verify health check was performed
      const getHealthMock = jest.spyOn(durableObject as any, 'performInternalHealthCheck');
      expect(getHealthMock).toHaveBeenCalled();
    });
  });

  describe('Resource Monitoring', () => {
    it('should monitor storage usage', async () => {
      // Mock storage list to return multiple items
      (mockState.storage.list as jest.Mock).mockResolvedValue(
        new Map([
          ['key1', 'value1'],
          ['key2', 'value2'],
          ['key3', 'value3'],
        ])
      );

      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data).toHaveProperty('storageInfo');
      expect(data.storageInfo).toHaveProperty('keyCount', 3);
    });

    it('should detect high memory usage', async () => {
      // Mock high memory usage
      (global as any).performance = {
        memory: {
          usedJSHeapSize: 900 * 1024 * 1024, // 900MB
          totalJSHeapSize: 1024 * 1024 * 1024, // 1GB
          jsHeapSizeLimit: 1024 * 1024 * 1024,
        },
      };

      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data).toHaveProperty('warnings');
      expect(data.warnings).toContain('High memory usage detected');
    });
  });

  describe('Health Status Aggregation', () => {
    it('should aggregate health status from multiple checks', async () => {
      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
        headers: {
          'X-Include-Detailed': 'true',
        },
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data).toHaveProperty('checks');
      expect(data.checks).toHaveProperty('storage');
      expect(data.checks).toHaveProperty('websocket');
      expect(data.checks).toHaveProperty('gameState');
      expect(data.checks).toHaveProperty('memory');
    });

    it('should calculate overall health score', async () => {
      const healthRequest = new Request('https://internal/health', {
        method: 'GET',
      });

      const response = await durableObject.fetch(healthRequest);
      const data = await response.json() as any;

      expect(data).toHaveProperty('healthScore');
      expect(data.healthScore).toBeGreaterThanOrEqual(0);
      expect(data.healthScore).toBeLessThanOrEqual(100);
    });
  });
});