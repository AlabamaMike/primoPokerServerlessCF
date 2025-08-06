import { CircuitBreaker, CircuitBreakerState } from '../circuit-breaker';
import {
  CircuitBreakerStateTransition,
  CircuitBreakerMetricsSnapshot,
  TimeSeriesDataPoint,
  CircuitBreakerAlert,
  MetricsAggregation,
  MetricsExportFormat,
  MetricsCollectorConfig,
  ResourceSpecificConfig,
  DEFAULT_RESOURCE_CONFIGS,
} from './types';

export class CircuitBreakerMetricsCollector {
  private stateTransitions: CircuitBreakerStateTransition[] = [];
  private timeSeries: Map<string, TimeSeriesDataPoint[]> = new Map();
  private alerts: CircuitBreakerAlert[] = [];
  private aggregations: Map<string, MetricsAggregation[]> = new Map();
  private operationMetrics: Map<string, number[]> = new Map();
  private lastState: CircuitBreakerState;
  private lastAggregationTime: Map<string, number> = new Map();
  private tripCount = 0;
  private recoveryCount = 0;
  private resourceConfig?: ResourceSpecificConfig | undefined;

  constructor(
    private readonly circuitBreaker: CircuitBreaker,
    private readonly config: MetricsCollectorConfig,
    private readonly resourceType: string = 'api'
  ) {
    this.lastState = circuitBreaker.getState();
    this.resourceConfig = DEFAULT_RESOURCE_CONFIGS[resourceType] || DEFAULT_RESOURCE_CONFIGS.api;
    
    // Initialize time series maps
    this.timeSeries.set('successRate', []);
    this.timeSeries.set('failureRate', []);
    this.timeSeries.set('responseTime', []);
    this.timeSeries.set('totalRequests', []);
    
    // Initialize aggregation maps
    if (config.aggregationIntervals.minute) {
      this.aggregations.set('minute', []);
      this.lastAggregationTime.set('minute', Date.now());
    }
    if (config.aggregationIntervals.hour) {
      this.aggregations.set('hour', []);
      this.lastAggregationTime.set('hour', Date.now());
    }
    if (config.aggregationIntervals.day) {
      this.aggregations.set('day', []);
      this.lastAggregationTime.set('day', Date.now());
    }
    
    // Set up monitoring
    this.startMonitoring();
  }

  private startMonitoring(): void {
    // Hook into circuit breaker execution
    const originalExecute = this.circuitBreaker.execute.bind(this.circuitBreaker);
    const originalTrip = this.circuitBreaker.trip.bind(this.circuitBreaker);
    const originalReset = this.circuitBreaker.reset.bind(this.circuitBreaker);
    
    // Store reference to self for use in overridden methods
    const self = this;
    
    this.circuitBreaker.execute = async function<T>(operation: () => Promise<T>): Promise<T> {
      const startTime = Date.now();
      const previousState = self.circuitBreaker.getState();
      
      try {
        const result = await originalExecute.call(this, operation);
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        self.recordSuccessfulOperation(responseTime);
        self.checkStateTransition(previousState);
        
        return result as T;
      } catch (error) {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        
        self.recordFailedOperation(responseTime);
        self.checkStateTransition(previousState);
        
        throw error;
      }
    };
    
    this.circuitBreaker.trip = (): void => {
      const previousState = this.circuitBreaker.getState();
      originalTrip();
      this.tripCount++;
      this.recordStateTransition(previousState, 'open', 'failure_threshold_exceeded');
      this.generateAlert('trip', 'high', `Circuit breaker ${this.circuitBreaker.getName()} tripped`);
      this.checkTripRateThreshold();
    };
    
    this.circuitBreaker.reset = (): void => {
      const previousState = this.circuitBreaker.getState();
      originalReset();
      this.recoveryCount++;
      this.recordStateTransition(previousState, 'closed', 'manual_reset');
      this.generateAlert('recovery', 'low', `Circuit breaker ${this.circuitBreaker.getName()} recovered`);
    };
    
    // Override getState to detect automatic transitions
    const originalGetState = this.circuitBreaker.getState.bind(this.circuitBreaker);
    this.circuitBreaker.getState = (): CircuitBreakerState => {
      const currentState = originalGetState();
      if (currentState !== this.lastState) {
        if (this.lastState === 'open' && currentState === 'half-open') {
          this.recordStateTransition('open', 'half-open', 'reset_timeout_elapsed');
        } else if (this.lastState === 'half-open' && currentState === 'closed') {
          this.recordStateTransition('half-open', 'closed', 'successful_request');
          this.recoveryCount++;
          this.generateAlert('recovery', 'low', `Circuit breaker ${this.circuitBreaker.getName()} recovered`);
        }
        this.lastState = currentState;
      }
      return currentState;
    };
  }

  private recordSuccessfulOperation(responseTime: number): void {
    const timestamp = Date.now();
    const key = `${timestamp}_success`;
    if (!this.operationMetrics.has(key)) {
      this.operationMetrics.set(key, []);
    }
    this.operationMetrics.get(key)!.push(responseTime);
    
    // Also store for response time tracking
    if (!this.operationMetrics.has('responseTimes')) {
      this.operationMetrics.set('responseTimes', []);
    }
    this.operationMetrics.get('responseTimes')!.push(responseTime);
    
    // Update time series
    this.updateTimeSeries();
  }

  private recordFailedOperation(responseTime: number): void {
    const timestamp = Date.now();
    const key = `${timestamp}_failure`;
    if (!this.operationMetrics.has(key)) {
      this.operationMetrics.set(key, []);
    }
    this.operationMetrics.get(key)!.push(responseTime);
    
    // Also store for response time tracking
    if (!this.operationMetrics.has('responseTimes')) {
      this.operationMetrics.set('responseTimes', []);
    }
    this.operationMetrics.get('responseTimes')!.push(responseTime);
    
    // Update time series
    this.updateTimeSeries();
    
    // Check failure rate threshold
    this.checkFailureRateThreshold();
  }

  private updateTimeSeries(): void {
    const metrics = this.getCurrentMetrics();
    const timestamp = Date.now();
    
    this.addTimeSeriesDataPoint('successRate', {
      timestamp,
      value: metrics.successRate,
    });
    
    this.addTimeSeriesDataPoint('failureRate', {
      timestamp,
      value: metrics.failureRate,
    });
    
    if (metrics.averageResponseTime !== undefined) {
      this.addTimeSeriesDataPoint('responseTime', {
        timestamp,
        value: metrics.averageResponseTime,
      });
    }
    
    this.addTimeSeriesDataPoint('totalRequests', {
      timestamp,
      value: metrics.totalRequests,
    });
    
    // Check if we need to aggregate
    this.performAggregation();
  }

  private performAggregation(): void {
    const now = Date.now();
    
    // Check each aggregation interval
    for (const [period, lastTime] of this.lastAggregationTime.entries()) {
      const intervalMs = this.getIntervalMs(period as 'minute' | 'hour' | 'day');
      
      if (now - lastTime >= intervalMs) {
        this.aggregate(period as 'minute' | 'hour' | 'day');
        this.lastAggregationTime.set(period, now);
      }
    }
  }

  private getIntervalMs(period: 'minute' | 'hour' | 'day'): number {
    switch (period) {
      case 'minute':
        return 60 * 1000;
      case 'hour':
        return 60 * 60 * 1000;
      case 'day':
        return 24 * 60 * 60 * 1000;
    }
  }

  private aggregate(period: 'minute' | 'hour' | 'day'): void {
    const now = Date.now();
    const intervalMs = this.getIntervalMs(period);
    const startTime = now - intervalMs;
    
    // Calculate metrics for this period
    const operations = this.getOperationsInTimeRange(startTime, now);
    const responseTimes = operations.map(op => op.responseTime).sort((a, b) => a - b);
    
    const aggregation: MetricsAggregation = {
      period,
      startTime,
      endTime: now,
      totalRequests: operations.length,
      successCount: operations.filter(op => op.success).length,
      failureCount: operations.filter(op => !op.success).length,
      averageSuccessRate: operations.length > 0 
        ? (operations.filter(op => op.success).length / operations.length) * 100 
        : 0,
      averageFailureRate: operations.length > 0 
        ? (operations.filter(op => !op.success).length / operations.length) * 100 
        : 0,
      tripCount: this.getTripsInTimeRange(startTime, now),
      recoveryCount: this.getRecoveriesInTimeRange(startTime, now),
      averageResponseTime: responseTimes.length > 0 
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
        : 0,
      p95ResponseTime: this.getPercentile(responseTimes, 95),
      p99ResponseTime: this.getPercentile(responseTimes, 99),
    };
    
    const aggregations = this.aggregations.get(period) || [];
    aggregations.push(aggregation);
    this.aggregations.set(period, aggregations);
  }

  private getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index] ?? 0;
  }

  private getOperationsInTimeRange(startTime: number, endTime: number): Array<{ success: boolean; responseTime: number }> {
    const operations: Array<{ success: boolean; responseTime: number }> = [];
    
    // Get all operations within time range
    let successCount = 0;
    let failureCount = 0;
    const responseTimes: number[] = [];
    
    for (const [key, times] of this.operationMetrics.entries()) {
      const parts = key.split('_');
      if (parts.length < 2) continue;
      const timestamp = parts[0];
      const status = parts[1];
      if (!timestamp || !status) continue;
      const ts = parseInt(timestamp, 10);
      if (isNaN(ts)) continue;
      
      if (ts >= startTime && ts <= endTime) {
        for (const responseTime of times) {
          operations.push({
            success: status === 'success',
            responseTime,
          });
          responseTimes.push(responseTime);
          if (status === 'success') {
            successCount++;
          } else {
            failureCount++;
          }
        }
      }
    }
    
    // If no operations found, check current metrics
    if (operations.length === 0) {
      const metrics = this.circuitBreaker.getMetrics();
      const totalOps = metrics.successCount + metrics.failureCount;
      if (totalOps > 0) {
        // Create synthetic operations based on current metrics
        for (let i = 0; i < metrics.successCount; i++) {
          operations.push({ success: true, responseTime: 100 });
        }
        for (let i = 0; i < metrics.failureCount; i++) {
          operations.push({ success: false, responseTime: 100 });
        }
      }
    }
    
    return operations;
  }

  private getTripsInTimeRange(startTime: number, endTime: number): number {
    return this.stateTransitions.filter(
      t => t.to === 'open' && t.timestamp >= startTime && t.timestamp <= endTime
    ).length;
  }

  private getRecoveriesInTimeRange(startTime: number, endTime: number): number {
    return this.stateTransitions.filter(
      t => t.to === 'closed' && t.from !== 'closed' && t.timestamp >= startTime && t.timestamp <= endTime
    ).length;
  }

  private checkStateTransition(previousState: CircuitBreakerState): void {
    const currentState = this.circuitBreaker.getState();
    if (currentState !== previousState) {
      if (previousState === 'half-open' && currentState === 'closed') {
        this.recordStateTransition(previousState, currentState, 'successful_request');
      }
    }
  }

  private recordStateTransition(from: string, to: string, reason?: string): void {
    this.stateTransitions.push({
      from,
      to,
      timestamp: Date.now(),
      reason: reason || undefined,
    });
  }

  private generateAlert(
    alertType: 'trip' | 'recovery' | 'threshold_exceeded',
    severity: 'low' | 'medium' | 'high' | 'critical',
    message: string,
    metadata?: Record<string, any>
  ): void {
    this.alerts.push({
      id: crypto.randomUUID(),
      circuitBreakerName: this.circuitBreaker.getName(),
      alertType,
      severity,
      timestamp: Date.now(),
      message,
      metadata: metadata || undefined,
    });
  }

  private checkTripRateThreshold(): void {
    if (!this.config.alertThresholds.tripRate) return;
    
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recentTrips = this.getTripsInTimeRange(oneHourAgo, Date.now());
    
    if (recentTrips > this.config.alertThresholds.tripRate) {
      this.generateAlert(
        'threshold_exceeded',
        'critical',
        `Trip rate exceeded threshold: ${recentTrips} trips in the last hour`,
        { tripRate: recentTrips, threshold: this.config.alertThresholds.tripRate }
      );
    }
  }

  private checkFailureRateThreshold(): void {
    if (!this.config.alertThresholds.failureRate) return;
    
    const metrics = this.getCurrentMetrics();
    if (metrics.failureRate > this.config.alertThresholds.failureRate) {
      this.generateAlert(
        'threshold_exceeded',
        'high',
        `Failure rate exceeded threshold: ${metrics.failureRate}%`,
        { failureRate: metrics.failureRate, threshold: this.config.alertThresholds.failureRate }
      );
    }
  }

  checkAlertThresholds(): void {
    this.checkTripRateThreshold();
    this.checkFailureRateThreshold();
  }

  getCurrentMetrics(): CircuitBreakerMetricsSnapshot {
    const metrics = this.circuitBreaker.getMetrics();
    const totalRequests = metrics.successCount + metrics.failureCount;
    
    // Calculate response times from stored data
    const responseTimes = this.operationMetrics.get('responseTimes') || [];
    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : undefined;
    
    return {
      timestamp: Date.now(),
      state: metrics.state,
      successCount: metrics.successCount,
      failureCount: metrics.failureCount,
      successRate: totalRequests > 0 ? (metrics.successCount / totalRequests) * 100 : 0,
      failureRate: totalRequests > 0 ? (metrics.failureCount / totalRequests) * 100 : 0,
      totalRequests,
      lastFailureTime: metrics.lastFailureTime > 0 ? metrics.lastFailureTime : undefined,
      averageResponseTime: averageResponseTime || undefined,
    };
  }

  getStateTransitions(): CircuitBreakerStateTransition[] {
    return [...this.stateTransitions];
  }

  getTimeSeries(metric: string): TimeSeriesDataPoint[] {
    return [...(this.timeSeries.get(metric) || [])];
  }

  addTimeSeriesDataPoint(metric: string, dataPoint: TimeSeriesDataPoint): void {
    const series = this.timeSeries.get(metric) || [];
    series.push(dataPoint);
    this.timeSeries.set(metric, series);
  }

  cleanupOldData(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    
    // Clean up time series data
    for (const [metric, series] of this.timeSeries.entries()) {
      this.timeSeries.set(
        metric,
        series.filter(point => point.timestamp > cutoffTime)
      );
    }
    
    // Clean up state transitions
    this.stateTransitions = this.stateTransitions.filter(
      transition => transition.timestamp > cutoffTime
    );
    
    // Clean up alerts
    this.alerts = this.alerts.filter(alert => alert.timestamp > cutoffTime);
    
    // Clean up operation metrics
    const keysToDelete: string[] = [];
    for (const key of this.operationMetrics.keys()) {
      const parts = key.split('_');
      if (parts.length === 0 || !parts[0]) continue;
      const timestamp = parseInt(parts[0], 10);
      if (isNaN(timestamp)) continue;
      if (timestamp < cutoffTime) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.operationMetrics.delete(key));
  }

  getAlerts(): CircuitBreakerAlert[] {
    return [...this.alerts];
  }

  getAggregations(period: 'minute' | 'hour' | 'day'): MetricsAggregation[] {
    return [...(this.aggregations.get(period) || [])];
  }

  getLatestAggregation(period: 'minute' | 'hour' | 'day'): MetricsAggregation {
    const aggregations = this.aggregations.get(period) || [];
    if (aggregations.length === 0) {
      // Create a default aggregation
      this.aggregate(period);
      const updated = this.aggregations.get(period) || [];
      return updated[updated.length - 1] || this.createDefaultAggregation(period);
    }
    return aggregations[aggregations.length - 1] || this.createDefaultAggregation(period);
  }

  export(): MetricsExportFormat {
    return {
      version: '1.0.0',
      exportedAt: Date.now(),
      circuitBreaker: {
        name: this.circuitBreaker.getName(),
        resourceType: this.resourceType,
        config: this.circuitBreaker.getConfig(),
      },
      metrics: {
        current: this.getCurrentMetrics(),
        stateTransitions: this.getStateTransitions(),
        timeSeries: {
          successRate: this.getTimeSeries('successRate'),
          failureRate: this.getTimeSeries('failureRate'),
          responseTime: this.getTimeSeries('responseTime'),
          totalRequests: this.getTimeSeries('totalRequests'),
        },
        aggregations: {
          hourly: this.getAggregations('hour'),
          daily: this.getAggregations('day'),
        },
        alerts: this.getAlerts(),
      },
    };
  }

  exportPrometheus(): string {
    const metrics = this.getCurrentMetrics();
    const name = this.circuitBreaker.getName();
    
    const lines: string[] = [];
    
    // State metric
    const states = ['closed', 'open', 'half-open'];
    for (const state of states) {
      const value = metrics.state === state ? 1 : 0;
      lines.push(`circuit_breaker_state{name="${name}",state="${state}"} ${value}`);
    }
    
    // Counter metrics
    lines.push(`circuit_breaker_requests_total{name="${name}",status="success"} ${metrics.successCount}`);
    lines.push(`circuit_breaker_requests_total{name="${name}",status="failure"} ${metrics.failureCount}`);
    
    // Rate metrics
    lines.push(`circuit_breaker_success_rate{name="${name}"} ${metrics.successRate}`);
    lines.push(`circuit_breaker_failure_rate{name="${name}"} ${metrics.failureRate}`);
    
    // Response time
    if (metrics.averageResponseTime !== undefined) {
      lines.push(`circuit_breaker_response_time_ms{name="${name}"} ${metrics.averageResponseTime}`);
    }
    
    // Trip and recovery counts
    lines.push(`circuit_breaker_trips_total{name="${name}"} ${this.tripCount}`);
    lines.push(`circuit_breaker_recoveries_total{name="${name}"} ${this.recoveryCount}`);
    
    return lines.join('\n');
  }

  getResourceType(): string {
    return this.resourceType;
  }

  getConfiguration(): any {
    return this.circuitBreaker.getConfig();
  }

  static validateConfiguration(config: any): void {
    if (config.failureThreshold <= 0) {
      throw new Error('Invalid configuration: failureThreshold must be positive');
    }
    if (config.resetTimeout <= 0) {
      throw new Error('Invalid configuration: resetTimeout must be positive');
    }
    if (config.halfOpenLimit <= 0) {
      throw new Error('Invalid configuration: halfOpenLimit must be positive');
    }
    if (config.monitoringPeriod <= 0) {
      throw new Error('Invalid configuration: monitoringPeriod must be positive');
    }
  }
  
  private createDefaultAggregation(period: 'minute' | 'hour' | 'day'): MetricsAggregation {
    const now = Date.now();
    const intervalMs = this.getIntervalMs(period);
    return {
      period,
      startTime: now - intervalMs,
      endTime: now,
      totalRequests: 0,
      successCount: 0,
      failureCount: 0,
      averageSuccessRate: 0,
      averageFailureRate: 0,
      tripCount: 0,
      recoveryCount: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
    };
  }
}