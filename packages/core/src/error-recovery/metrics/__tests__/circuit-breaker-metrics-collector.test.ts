import { CircuitBreakerMetricsCollector } from '../circuit-breaker-metrics-collector';
import { CircuitBreaker } from '../../circuit-breaker';
import { 
  CircuitBreakerStateTransition,
  CircuitBreakerMetricsSnapshot,
  CircuitBreakerAlert,
  MetricsCollectorConfig,
  DEFAULT_RESOURCE_CONFIGS 
} from '../types';

describe('CircuitBreakerMetricsCollector', () => {
  let metricsCollector: CircuitBreakerMetricsCollector;
  let circuitBreaker: CircuitBreaker;
  const mockConfig: MetricsCollectorConfig = {
    retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
    aggregationIntervals: {
      minute: true,
      hour: true,
      day: true,
    },
    alertThresholds: {
      tripRate: 5, // 5 trips per hour
      failureRate: 50, // 50%
      responseTime: 1000, // 1 second
    },
    exportFormat: 'json',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    circuitBreaker = new CircuitBreaker('test-service', DEFAULT_RESOURCE_CONFIGS.api.circuitBreakerConfig);
    metricsCollector = new CircuitBreakerMetricsCollector(circuitBreaker, mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('State Transition Tracking', () => {
    it('should track state transitions', async () => {
      // Start in closed state
      expect(metricsCollector.getStateTransitions()).toHaveLength(0);

      // Trigger failures to trip the circuit
      const failingOperation = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Execute operations to trigger state change
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreaker.execute(failingOperation);
        } catch (e) {
          // Expected to fail
        }
      }

      const transitions = metricsCollector.getStateTransitions();
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toMatchObject({
        from: 'closed',
        to: 'open',
        reason: 'failure_threshold_exceeded',
      });
    });

    it('should track transition from open to half-open', () => {
      // Trip the circuit
      circuitBreaker.trip();
      
      // Get initial transitions
      let transitions = metricsCollector.getStateTransitions();
      expect(transitions).toHaveLength(1);
      expect(transitions[0]).toMatchObject({
        from: 'closed',
        to: 'open',
      });
      
      // Fast forward past reset timeout
      jest.advanceTimersByTime(31000); // 31 seconds
      
      // Check state to trigger transition
      const state = circuitBreaker.getState();
      expect(state).toBe('half-open');
      
      transitions = metricsCollector.getStateTransitions();
      expect(transitions).toHaveLength(2);
      expect(transitions[1]).toMatchObject({
        from: 'open',
        to: 'half-open',
        reason: 'reset_timeout_elapsed',
      });
    });

    it('should track transition from half-open to closed on success', async () => {
      // Set circuit to half-open
      circuitBreaker.trip();
      jest.advanceTimersByTime(31000);
      circuitBreaker.getState(); // Trigger transition to half-open
      
      // Execute successful operation
      const successfulOperation = jest.fn().mockResolvedValue('success');
      await circuitBreaker.execute(successfulOperation);
      
      const transitions = metricsCollector.getStateTransitions();
      expect(transitions[transitions.length - 1]).toMatchObject({
        from: 'half-open',
        to: 'closed',
        reason: 'successful_request',
      });
    });
  });

  describe('Success/Failure Rate Tracking', () => {
    it('should track success and failure rates', async () => {
      const successfulOp = jest.fn().mockResolvedValue('success');
      const failingOp = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Execute 7 successful and 3 failed operations
      for (let i = 0; i < 7; i++) {
        await circuitBreaker.execute(successfulOp);
      }
      
      for (let i = 0; i < 3; i++) {
        await circuitBreaker.execute(failingOp).catch(() => {});
      }
      
      const metrics = metricsCollector.getCurrentMetrics();
      expect(metrics.successRate).toBe(70); // 70%
      expect(metrics.failureRate).toBe(30); // 30%
      expect(metrics.totalRequests).toBe(10);
    });

    it('should track response times', async () => {
      const slowOperation = jest.fn().mockImplementation(() => 
        new Promise(resolve => {
          // Use jest fake timers to simulate delay
          setTimeout(() => resolve('success'), 100);
        })
      );
      
      const promise = circuitBreaker.execute(slowOperation);
      jest.advanceTimersByTime(100);
      await promise;
      
      const metrics = metricsCollector.getCurrentMetrics();
      expect(metrics.averageResponseTime).toBeGreaterThan(90);
      expect(metrics.averageResponseTime).toBeLessThan(110);
    }, 10000);
  });

  describe('Time Series Data Collection', () => {
    it('should collect time series data points', async () => {
      const successfulOp = jest.fn().mockResolvedValue('success');
      
      // Execute operations at different times
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.execute(successfulOp);
        jest.advanceTimersByTime(60000); // 1 minute
      }
      
      const timeSeries = metricsCollector.getTimeSeries('successRate');
      expect(timeSeries).toHaveLength(5);
      expect(timeSeries[0].value).toBe(100);
    });

    it('should respect retention period', () => {
      const now = Date.now();
      
      // Add old data points
      metricsCollector.addTimeSeriesDataPoint('successRate', {
        timestamp: now - 25 * 60 * 60 * 1000, // 25 hours ago
        value: 100,
      });
      
      // Add recent data point
      metricsCollector.addTimeSeriesDataPoint('successRate', {
        timestamp: now,
        value: 95,
      });
      
      metricsCollector.cleanupOldData();
      
      const timeSeries = metricsCollector.getTimeSeries('successRate');
      expect(timeSeries).toHaveLength(1);
      expect(timeSeries[0].timestamp).toBe(now);
    });
  });

  describe('Metrics Aggregation', () => {
    it('should aggregate metrics by hour', async () => {
      const successfulOp = jest.fn().mockResolvedValue('success');
      const failingOp = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Execute operations in first hour
      for (let i = 0; i < 10; i++) {
        if (i < 8) {
          await circuitBreaker.execute(successfulOp);
        } else {
          try {
            await circuitBreaker.execute(failingOp);
          } catch (e) {
            // Expected to fail
          }
        }
      }
      
      // Advance time to trigger first hour aggregation
      jest.advanceTimersByTime(60 * 60 * 1000); // 1 hour
      
      // Execute operations in second hour
      for (let i = 0; i < 10; i++) {
        if (i < 8) {
          await circuitBreaker.execute(successfulOp);
        } else {
          try {
            await circuitBreaker.execute(failingOp);
          } catch (e) {
            // Expected to fail
          }
        }
      }
      
      // Trigger aggregation check
      metricsCollector['performAggregation']();
      
      const hourlyAggregations = metricsCollector.getAggregations('hour');
      expect(hourlyAggregations.length).toBeGreaterThanOrEqual(1);
      expect(hourlyAggregations[0].successCount).toBe(8);
      expect(hourlyAggregations[0].failureCount).toBe(2);
      expect(hourlyAggregations[0].averageSuccessRate).toBe(80);
    });

    it('should calculate percentiles for response times', async () => {
      // Simulate operations with varying response times
      for (let i = 0; i < 100; i++) {
        const operation = jest.fn().mockResolvedValue('success');
        const promise = circuitBreaker.execute(operation);
        jest.advanceTimersByTime(i * 10); // Simulate different response times
        await promise;
      }
      
      const aggregation = metricsCollector.getLatestAggregation('hour');
      expect(aggregation.p95ResponseTime).toBeGreaterThanOrEqual(950);
      expect(aggregation.p99ResponseTime).toBeGreaterThanOrEqual(980);
    }, 10000);
  });

  describe('Alert Generation', () => {
    it('should generate alert when circuit breaker trips', () => {
      circuitBreaker.trip();
      
      const alerts = metricsCollector.getAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        alertType: 'trip',
        severity: 'high',
        circuitBreakerName: 'test-service',
      });
    });

    it('should generate alert when trip rate exceeds threshold', () => {
      // Trip circuit breaker multiple times in an hour
      for (let i = 0; i < 6; i++) {
        circuitBreaker.trip();
        circuitBreaker.reset(); // Reset to trip again
        jest.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
      }
      
      const alerts = metricsCollector.getAlerts();
      const tripRateAlert = alerts.find(a => a.alertType === 'threshold_exceeded');
      expect(tripRateAlert).toBeDefined();
      expect(tripRateAlert?.severity).toBe('critical');
    });

    it('should generate alert for high failure rate', async () => {
      const failingOp = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Generate 60% failure rate
      for (let i = 0; i < 10; i++) {
        if (i < 6) {
          try {
            await circuitBreaker.execute(failingOp);
          } catch (e) {
            // Expected to fail
          }
        } else {
          await circuitBreaker.execute(() => Promise.resolve('success'));
        }
      }
      
      metricsCollector.checkAlertThresholds();
      
      const alerts = metricsCollector.getAlerts();
      const failureRateAlert = alerts.find(a => 
        a.alertType === 'threshold_exceeded' && 
        a.message.includes('failure rate')
      );
      expect(failureRateAlert).toBeDefined();
    });

    it('should generate recovery alert', () => {
      // Trip and then recover
      circuitBreaker.trip();
      jest.advanceTimersByTime(31000);
      circuitBreaker.reset();
      
      const alerts = metricsCollector.getAlerts();
      const recoveryAlert = alerts.find(a => a.alertType === 'recovery');
      expect(recoveryAlert).toBeDefined();
      expect(recoveryAlert?.severity).toBe('low');
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics in JSON format', async () => {
      // Generate some data
      const successfulOp = jest.fn().mockResolvedValue('success');
      for (let i = 0; i < 5; i++) {
        await circuitBreaker.execute(successfulOp);
      }
      
      circuitBreaker.trip();
      
      const exported = metricsCollector.export();
      
      expect(exported).toMatchObject({
        version: '1.0.0',
        circuitBreaker: {
          name: 'test-service',
          resourceType: 'api',
        },
        metrics: {
          current: expect.objectContaining({
            state: 'open',
            successCount: 5,
            failureCount: 0,
          }),
          stateTransitions: expect.arrayContaining([
            expect.objectContaining({
              from: 'closed',
              to: 'open',
            }),
          ]),
          timeSeries: expect.objectContaining({
            successRate: expect.any(Array),
            failureRate: expect.any(Array),
          }),
        },
      });
    });

    it('should export in Prometheus format', () => {
      const collector = new CircuitBreakerMetricsCollector(
        circuitBreaker,
        { ...mockConfig, exportFormat: 'prometheus' }
      );
      
      const exported = collector.exportPrometheus();
      
      expect(exported).toContain('circuit_breaker_state{name="test-service",state="closed"} 1');
      expect(exported).toContain('circuit_breaker_requests_total{name="test-service",status="success"}');
      expect(exported).toContain('circuit_breaker_requests_total{name="test-service",status="failure"}');
    });
  });

  describe('Resource-Specific Configuration', () => {
    it('should use resource-specific configurations', () => {
      const dbCircuitBreaker = new CircuitBreaker(
        'database-service',
        DEFAULT_RESOURCE_CONFIGS.database.circuitBreakerConfig
      );
      
      const dbMetricsCollector = new CircuitBreakerMetricsCollector(
        dbCircuitBreaker,
        mockConfig,
        'database'
      );
      
      expect(dbMetricsCollector.getResourceType()).toBe('database');
      expect(dbMetricsCollector.getConfiguration()).toMatchObject(
        DEFAULT_RESOURCE_CONFIGS.database.circuitBreakerConfig
      );
    });

    it('should validate configuration', () => {
      const invalidConfig = {
        failureThreshold: -1, // Invalid: negative
        resetTimeout: 0, // Invalid: zero
        halfOpenLimit: 0, // Invalid: zero
        monitoringPeriod: -1000, // Invalid: negative
      };
      
      expect(() => {
        CircuitBreakerMetricsCollector.validateConfiguration(invalidConfig);
      }).toThrow('Invalid configuration');
    });
  });
});