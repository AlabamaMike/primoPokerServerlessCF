import { CircuitBreaker, CircuitBreakerConfig, CircuitBreakerState } from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;
  const defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    resetTimeout: 1000,
    halfOpenLimit: 2,
    monitoringPeriod: 60000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with closed state', () => {
      circuitBreaker = new CircuitBreaker('test-service', defaultConfig);
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should accept custom configuration', () => {
      const customConfig: CircuitBreakerConfig = {
        failureThreshold: 5,
        resetTimeout: 2000,
        halfOpenLimit: 3,
        monitoringPeriod: 30000,
      };
      circuitBreaker = new CircuitBreaker('test-service', customConfig);
      expect(circuitBreaker.getState()).toBe('closed');
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker('test-service', defaultConfig);
    });

    it('should execute successful operations in closed state', async () => {
      const successfulOperation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(successfulOperation);
      
      expect(result).toBe('success');
      expect(successfulOperation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should count failures and trip after threshold', async () => {
      const failingOperation = jest.fn().mockRejectedValue(new Error('test error'));
      
      // First two failures - still closed
      for (let i = 0; i < defaultConfig.failureThreshold - 1; i++) {
        await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('test error');
        expect(circuitBreaker.getState()).toBe('closed');
      }
      
      // Third failure - should trip
      await expect(circuitBreaker.execute(failingOperation)).rejects.toThrow('test error');
      expect(circuitBreaker.getState()).toBe('open');
    });

    it('should reject immediately when open', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      // Trip the circuit breaker
      circuitBreaker.trip();
      expect(circuitBreaker.getState()).toBe('open');
      
      // Should reject without calling operation
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is open');
      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to half-open after reset timeout', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      // Trip the circuit breaker
      circuitBreaker.trip();
      expect(circuitBreaker.getState()).toBe('open');
      
      // Advance time past reset timeout
      jest.advanceTimersByTime(defaultConfig.resetTimeout + 1);
      
      // Should be half-open now and allow request
      const result = await circuitBreaker.execute(operation);
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe('closed');
    });

    it('should limit requests in half-open state', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      // Trip the circuit breaker
      circuitBreaker.trip();
      
      // Advance to half-open state
      jest.advanceTimersByTime(defaultConfig.resetTimeout + 1);
      
      // Execute up to half-open limit
      const promises = [];
      for (let i = 0; i < defaultConfig.halfOpenLimit; i++) {
        promises.push(circuitBreaker.execute(operation));
      }
      
      // All should succeed
      await Promise.all(promises);
      expect(operation).toHaveBeenCalledTimes(defaultConfig.halfOpenLimit);
      
      // Next request should be rejected
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is open');
      expect(operation).toHaveBeenCalledTimes(defaultConfig.halfOpenLimit);
    });

    it('should reset to closed on successful half-open execution', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      // Trip and advance to half-open
      circuitBreaker.trip();
      jest.advanceTimersByTime(defaultConfig.resetTimeout + 1);
      
      // Successful execution should close circuit
      await circuitBreaker.execute(operation);
      expect(circuitBreaker.getState()).toBe('closed');
      
      // Should continue to work normally
      await circuitBreaker.execute(operation);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should re-open on failure in half-open state', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Trip and advance to half-open
      circuitBreaker.trip();
      jest.advanceTimersByTime(defaultConfig.resetTimeout + 1);
      
      // Failure should re-open circuit
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('test error');
      expect(circuitBreaker.getState()).toBe('open');
      
      // Should reject subsequent requests
      await expect(circuitBreaker.execute(operation)).rejects.toThrow('Circuit breaker is open');
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('manual controls', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker('test-service', defaultConfig);
    });

    it('should manually trip the circuit', () => {
      expect(circuitBreaker.getState()).toBe('closed');
      
      circuitBreaker.trip();
      
      expect(circuitBreaker.getState()).toBe('open');
    });

    it('should manually reset the circuit', () => {
      // Trip first
      circuitBreaker.trip();
      expect(circuitBreaker.getState()).toBe('open');
      
      // Manual reset
      circuitBreaker.reset();
      
      expect(circuitBreaker.getState()).toBe('closed');
    });
  });

  describe('allowRequest', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker('test-service', defaultConfig);
    });

    it('should allow requests in closed state', () => {
      expect(circuitBreaker.allowRequest()).toBe(true);
    });

    it('should not allow requests in open state before timeout', () => {
      circuitBreaker.trip();
      expect(circuitBreaker.allowRequest()).toBe(false);
    });

    it('should allow limited requests in half-open state', () => {
      circuitBreaker.trip();
      jest.advanceTimersByTime(defaultConfig.resetTimeout + 1);
      
      // Should allow up to halfOpenLimit requests
      for (let i = 0; i < defaultConfig.halfOpenLimit; i++) {
        expect(circuitBreaker.allowRequest()).toBe(true);
      }
      
      // Should not allow more
      expect(circuitBreaker.allowRequest()).toBe(false);
    });
  });

  describe('metrics', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker('test-service', defaultConfig);
    });

    it('should track success and failure counts', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));
      
      // Execute some operations
      await circuitBreaker.execute(successOp);
      await circuitBreaker.execute(successOp);
      await expect(circuitBreaker.execute(failOp)).rejects.toThrow('fail');
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.lastFailureTime).toBeGreaterThan(0);
    });

    it('should reset metrics after monitoring period', async () => {
      const successOp = jest.fn().mockResolvedValue('success');
      
      // Execute operation
      await circuitBreaker.execute(successOp);
      
      let metrics = circuitBreaker.getMetrics();
      expect(metrics.successCount).toBe(1);
      
      // Advance past monitoring period
      jest.advanceTimersByTime(defaultConfig.monitoringPeriod + 1);
      
      // Execute another operation
      await circuitBreaker.execute(successOp);
      
      metrics = circuitBreaker.getMetrics();
      expect(metrics.successCount).toBe(1); // Should have reset
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker('test-service', defaultConfig);
    });

    it('should handle different error types appropriately', async () => {
      const networkError = new Error('Network timeout');
      const validationError = new Error('Validation failed');
      
      const networkOp = jest.fn().mockRejectedValue(networkError);
      const validationOp = jest.fn().mockRejectedValue(validationError);
      
      // Both should count as failures
      await expect(circuitBreaker.execute(networkOp)).rejects.toThrow('Network timeout');
      await expect(circuitBreaker.execute(validationOp)).rejects.toThrow('Validation failed');
      
      const metrics = circuitBreaker.getMetrics();
      expect(metrics.failureCount).toBe(2);
    });

    it('should preserve error stack traces', async () => {
      const originalError = new Error('Original error');
      originalError.stack = 'Original stack trace';
      
      const failingOp = jest.fn().mockRejectedValue(originalError);
      
      try {
        await circuitBreaker.execute(failingOp);
      } catch (error) {
        expect(error).toBe(originalError);
        expect((error as Error).stack).toBe('Original stack trace');
      }
    });
  });
});