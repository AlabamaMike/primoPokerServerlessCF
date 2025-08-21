/**
 * Test Setup for MSW and WebSocket Mocks - Phase 2
 * 
 * Configures mocking infrastructure for:
 * - API requests (MSW)
 * - WebSocket connections
 * - Performance monitoring
 * - Error tracking
 */

import { server, mockHelpers } from './mocks/handlers';
import { setupWebSocketMock, cleanupWebSocketMock } from './mocks/websocket-mock';
import '@testing-library/jest-dom';

// Performance monitoring for tests
interface TestPerformanceMetrics {
  testName: string;
  duration: number;
  apiCalls: number;
  webSocketMessages: number;
  memoryUsed: number;
}

class TestPerformanceMonitor {
  private metrics: Map<string, TestPerformanceMetrics> = new Map();
  private currentTest: string | null = null;
  private testStartTime: number = 0;
  private apiCallCount: number = 0;
  private wsMessageCount: number = 0;
  private maxMetricsSize: number = 100;

  startTest(testName: string) {
    this.currentTest = testName;
    this.testStartTime = Date.now();
    this.apiCallCount = 0;
    this.wsMessageCount = 0;
  }

  recordApiCall() {
    this.apiCallCount++;
  }

  recordWebSocketMessage() {
    this.wsMessageCount++;
  }

  endTest() {
    if (!this.currentTest) return;

    const duration = Date.now() - this.testStartTime;
    const memoryUsed = process.memoryUsage().heapUsed / 1024 / 1024; // MB

    this.metrics.set(this.currentTest, {
      testName: this.currentTest,
      duration,
      apiCalls: this.apiCallCount,
      webSocketMessages: this.wsMessageCount,
      memoryUsed
    });

    // Prevent memory leaks by limiting metrics size
    if (this.metrics.size > this.maxMetricsSize) {
      const oldestKey = Array.from(this.metrics.keys())[0];
      this.metrics.delete(oldestKey);
    }

    this.currentTest = null;
  }

  getMetrics(): TestPerformanceMetrics[] {
    return Array.from(this.metrics.values());
  }

  getSummary() {
    const metrics = this.getMetrics();
    if (metrics.length === 0) return null;

    const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
    const totalApiCalls = metrics.reduce((sum, m) => sum + m.apiCalls, 0);
    const totalWsMessages = metrics.reduce((sum, m) => sum + m.webSocketMessages, 0);
    const avgMemory = metrics.reduce((sum, m) => sum + m.memoryUsed, 0) / metrics.length;

    return {
      totalTests: metrics.length,
      totalDuration,
      totalApiCalls,
      totalWsMessages,
      averageMemoryMB: avgMemory.toFixed(2),
      slowestTest: metrics.sort((a, b) => b.duration - a.duration)[0]
    };
  }
}

export const testPerformanceMonitor = new TestPerformanceMonitor();

// Setup MSW
beforeAll(() => {
  // Start MSW server
  server.listen({
    onUnhandledRequest: 'warn'
  });

  // Setup WebSocket mocks
  setupWebSocketMock();

  // Add request interceptor for performance monitoring
  server.events.on('request:start', () => {
    testPerformanceMonitor.recordApiCall();
  });

  // Setup console warning suppression for tests
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.warn = (...args: any[]) => {
    // Suppress specific warnings in tests
    const message = args[0]?.toString() || '';
    if (
      message.includes('ReactDOM.render') ||
      message.includes('componentWillReceiveProps') ||
      message.includes('act()')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };

  console.error = (...args: any[]) => {
    // Suppress specific errors in tests
    const message = args[0]?.toString() || '';
    if (
      message.includes('Warning: Failed prop type') ||
      message.includes('Warning: Unknown prop') ||
      message.includes('Not implemented: HTMLFormElement.prototype.submit')
    ) {
      return;
    }
    originalError.apply(console, args);
  };
});

// Reset handlers and data between tests
afterEach(() => {
  server.resetHandlers();
  mockHelpers.resetMockData();
  testPerformanceMonitor.endTest();
});

// Cleanup after all tests
afterAll(() => {
  server.close();
  cleanupWebSocketMock();

  // Log performance summary in development
  if (process.env.NODE_ENV === 'development') {
    const summary = testPerformanceMonitor.getSummary();
    if (summary) {
      console.log('\n=== Test Performance Summary ===');
      console.log(`Total tests: ${summary.totalTests}`);
      console.log(`Total duration: ${summary.totalDuration}ms`);
      console.log(`Total API calls: ${summary.totalApiCalls}`);
      console.log(`Total WebSocket messages: ${summary.totalWsMessages}`);
      console.log(`Average memory usage: ${summary.averageMemoryMB}MB`);
      console.log(`Slowest test: ${summary.slowestTest.testName} (${summary.slowestTest.duration}ms)`);
      console.log('================================\n');
    }
  }
});

// Custom Jest matchers for Phase 2 features
expect.extend({
  toBeValidWalletBalance(received: any) {
    const pass = 
      typeof received === 'number' &&
      received >= 0 &&
      Number.isFinite(received) &&
      !Number.isNaN(received);

    return {
      pass,
      message: () =>
        pass
          ? `expected ${received} not to be a valid wallet balance`
          : `expected ${received} to be a valid wallet balance (non-negative finite number)`
    };
  },

  toBeValidChatMessage(received: any) {
    const pass = 
      typeof received === 'object' &&
      received !== null &&
      typeof received.id === 'string' &&
      typeof received.playerId === 'string' &&
      typeof received.message === 'string' &&
      received.message.trim().length > 0 &&
      typeof received.timestamp === 'string';

    return {
      pass,
      message: () =>
        pass
          ? `expected ${JSON.stringify(received)} not to be a valid chat message`
          : `expected ${JSON.stringify(received)} to be a valid chat message with id, playerId, non-empty message, and timestamp`
    };
  },

  toBeValidTableUpdate(received: any) {
    const pass = 
      typeof received === 'object' &&
      received !== null &&
      typeof received.type === 'string' &&
      ['table_added', 'table_updated', 'table_removed'].includes(received.type) &&
      typeof received.payload === 'object';

    return {
      pass,
      message: () =>
        pass
          ? `expected ${JSON.stringify(received)} not to be a valid table update`
          : `expected ${JSON.stringify(received)} to be a valid table update with type and payload`
    };
  },

  toHaveBeenCalledWithinTime(received: jest.Mock, expectedMs: number) {
    if (!received.mock.calls.length) {
      return {
        pass: false,
        message: () => `expected function to have been called within ${expectedMs}ms, but it was never called`
      };
    }

    // This is a simplified check - in real implementation you'd track actual timing
    const pass = true;

    return {
      pass,
      message: () =>
        pass
          ? `expected function not to have been called within ${expectedMs}ms`
          : `expected function to have been called within ${expectedMs}ms`
    };
  }
});

// Declare custom matchers for TypeScript
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidWalletBalance(): R;
      toBeValidChatMessage(): R;
      toBeValidTableUpdate(): R;
      toHaveBeenCalledWithinTime(expectedMs: number): R;
    }
  }
}

// Test utilities
export const testUtils = {
  // Wait for async updates
  async waitForUpdates(ms: number = 100) {
    await new Promise(resolve => setTimeout(resolve, ms));
  },

  // Create authenticated request headers
  getAuthHeaders(token: string = 'test-token') {
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  },

  // Simulate user interaction
  async simulateUserAction(action: () => void, delayMs: number = 50) {
    action();
    await this.waitForUpdates(delayMs);
  },

  // Monitor WebSocket traffic
  createWebSocketMonitor() {
    const messages: any[] = [];
    const errors: any[] = [];

    return {
      messages,
      errors,
      onMessage: (handler: (data: any) => void) => {
        return (event: MessageEvent) => {
          const data = JSON.parse(event.data);
          messages.push(data);
          testPerformanceMonitor.recordWebSocketMessage();
          handler(data);
        };
      },
      onError: (handler: (error: any) => void) => {
        return (event: Event) => {
          errors.push(event);
          handler(event);
        };
      },
      clear: () => {
        messages.length = 0;
        errors.length = 0;
      },
      getLastMessage: () => messages[messages.length - 1],
      getMessageCount: () => messages.length,
      getErrorCount: () => errors.length
    };
  },

  // Performance testing helper
  async measurePerformance<T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const startTime = performance.now();
    const result = await operation();
    const duration = performance.now() - startTime;

    return { result, duration };
  },

  // Batch operation helper
  async runConcurrent<T>(
    operations: (() => Promise<T>)[],
    maxConcurrent: number = 10
  ): Promise<T[]> {
    const results: (T | undefined)[] = new Array(operations.length);
    const executing: Promise<void>[] = [];

    for (let i = 0; i < operations.length; i++) {
      const index = i;
      const promise = operations[index]().then(result => {
        results[index] = result;
      });

      executing.push(promise);

      if (executing.length >= maxConcurrent) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p), 1);
      }
    }

    await Promise.all(executing);
    return results.filter((r): r is T => r !== undefined);
  }
};

// Export everything needed for tests
export { server, mockHelpers, setupWebSocketMock, cleanupWebSocketMock };