import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PokerAPIRoutes } from '../routes';
import { D1Database } from '@cloudflare/workers-types';

// Mock interfaces
interface MockEnv {
  DB: D1Database;
  SESSION_STORE: KVNamespace;
  TABLE_OBJECTS: DurableObjectNamespace;
  GAME_TABLES: DurableObjectNamespace;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
}

// Mock the Request and Response objects for Worker environment
const createMockRequest = (method: string, path: string, headers?: Record<string, string>) => {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
};

describe('Health Check Endpoint', () => {
  let api: PokerAPIRoutes;
  let mockEnv: MockEnv;

  beforeEach(() => {
    api = new PokerAPIRoutes();
    
    // Create mock environment
    mockEnv = {
      DB: {} as D1Database,
      SESSION_STORE: {} as KVNamespace,
      TABLE_OBJECTS: {} as DurableObjectNamespace,
      GAME_TABLES: {} as DurableObjectNamespace,
      JWT_SECRET: 'test-secret',
      ENVIRONMENT: 'test',
    };
  });

  describe('GET /api/health', () => {
    it('should return healthy status with all required service information', async () => {
      const request = createMockRequest('GET', '/api/health');
      (request as any).env = mockEnv;
      
      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);

      expect(response.status).toBe(200);
      
      const data = await response.json() as any;
      
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('healthy');
      expect(data.data.timestamp).toBeDefined();
      expect(data.data.environment).toBe('test');
    });

    it('should include detailed service status', async () => {
      const request = createMockRequest('GET', '/api/health');
      (request as any).env = mockEnv;
      
      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);
      
      const data = await response.json() as any;
      const services = data.data.services;
      
      expect(services).toBeDefined();
      expect(services.database).toBe('D1');
      expect(services.session).toBe('KV');
      expect(services.tables).toBe('Durable Objects');
      expect(services.files).toBe('R2');
      expect(services.websocket).toBe('Available');
    });

    it('should include database health check details', async () => {
      const request = createMockRequest('GET', '/api/health');
      (request as any).env = mockEnv;
      
      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);
      
      const data = await response.json() as any;
      
      expect(data.data.health).toBeDefined();
      expect(data.data.health.database).toBeDefined();
      expect(data.data.health.database.status).toBeDefined();
      expect(data.data.health.database.responseTime).toBeDefined();
    });

    it('should include durable objects health status', async () => {
      const request = createMockRequest('GET', '/api/health');
      (request as any).env = mockEnv;
      
      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);
      
      const data = await response.json() as any;
      
      expect(data.data.health.durableObjects).toBeDefined();
      expect(data.data.health.durableObjects.status).toBeDefined();
      expect(data.data.health.durableObjects.responseTime).toBeDefined();
    });

    it('should include performance metrics', async () => {
      const request = createMockRequest('GET', '/api/health');
      (request as any).env = mockEnv;
      
      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);
      
      const data = await response.json() as any;
      
      expect(data.data.metrics).toBeDefined();
      expect(data.data.metrics.requestsPerMinute).toBeDefined();
      expect(data.data.metrics.averageResponseTime).toBeDefined();
      expect(data.data.metrics.errorRate).toBeDefined();
    });

    it('should check response time is under 10ms', async () => {
      const startTime = Date.now();
      
      const request = createMockRequest('GET', '/api/health');
      (request as any).env = mockEnv;
      
      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      
      expect(responseTime).toBeLessThan(10);
      expect(response.status).toBe(200);
    });

    it('should handle database check failures gracefully', async () => {
      // Mock a failed database check
      mockEnv.DB = {
        prepare: jest.fn().mockImplementation(() => {
          throw new Error('Database connection failed');
        }),
      } as any;
      
      const request = createMockRequest('GET', '/api/health');
      (request as any).env = mockEnv;
      
      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);
      
      expect(response.status).toBe(200); // Still returns 200 but with degraded status
      
      const data = await response.json() as any;
      expect(data.data.status).toBe('degraded');
      expect(data.data.health.database.status).toBe('unhealthy');
      expect(data.data.health.database.error).toBeDefined();
    });

    it('should include rate limiting status', async () => {
      const request = createMockRequest('GET', '/api/health');
      (request as any).env = mockEnv;
      
      const router = api.getRouter();
      const response = await router.handle(request, mockEnv);
      
      const data = await response.json() as any;
      
      expect(data.data.rateLimiting).toBeDefined();
      expect(data.data.rateLimiting.enabled).toBeDefined();
      expect(data.data.rateLimiting.requestsPerWindow).toBeDefined();
      expect(data.data.rateLimiting.windowSize).toBeDefined();
    });
  });
});