/**
 * Environment-specific test configuration
 * Adjusts test thresholds and timeouts based on environment
 */

export const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
export const isSlowEnvironment = process.env.SLOW_TEST_ENV === 'true';

/**
 * Performance thresholds that adjust based on environment
 */
export const performanceThresholds = {
  handEvaluation: {
    local: 0.1,  // 0.1ms locally
    ci: 0.5,     // 0.5ms in CI (more lenient)
    slow: 1.0    // 1ms in slow environments
  },
  gameInitialization: {
    local: 1,    // 1ms locally
    ci: 5,       // 5ms in CI
    slow: 10     // 10ms in slow environments
  },
  websocketBroadcast: {
    local: 5,    // 5ms for 100 connections locally
    ci: 20,      // 20ms in CI
    slow: 50     // 50ms in slow environments
  },
  bettingAction: {
    local: 0.5,  // 0.5ms locally
    ci: 2,       // 2ms in CI
    slow: 5      // 5ms in slow environments
  }
};

/**
 * Test timeouts that adjust based on environment
 */
export const testTimeouts = {
  unit: {
    local: 5000,      // 5s locally
    ci: 10000,        // 10s in CI
    slow: 20000       // 20s in slow environments
  },
  integration: {
    local: 10000,     // 10s locally
    ci: 30000,        // 30s in CI
    slow: 60000       // 60s in slow environments
  },
  e2e: {
    local: 30000,     // 30s locally
    ci: 60000,        // 60s in CI
    slow: 120000      // 120s in slow environments
  },
  websocket: {
    local: 5000,      // 5s locally
    ci: 15000,        // 15s in CI
    slow: 30000       // 30s in slow environments
  }
};

/**
 * Retry configuration for flaky tests
 */
export const retryConfig = {
  e2e: {
    retries: isCI ? 3 : 1,    // More retries in CI
    backoff: isCI ? 2000 : 500 // Longer backoff in CI
  },
  websocket: {
    retries: isCI ? 2 : 0,    // Retry websocket tests in CI
    backoff: 1000
  }
};

/**
 * Get performance threshold for current environment
 */
export function getPerformanceThreshold(metric: keyof typeof performanceThresholds): number {
  const thresholds = performanceThresholds[metric];
  if (isSlowEnvironment) return thresholds.slow;
  if (isCI) return thresholds.ci;
  return thresholds.local;
}

/**
 * Get test timeout for current environment
 */
export function getTestTimeout(type: keyof typeof testTimeouts): number {
  const timeouts = testTimeouts[type];
  if (isSlowEnvironment) return timeouts.slow;
  if (isCI) return timeouts.ci;
  return timeouts.local;
}

/**
 * Get retry configuration for test type
 */
export function getRetryConfig(type: keyof typeof retryConfig) {
  return retryConfig[type];
}

/**
 * Environment-aware wait utility
 */
export async function waitFor(ms: number): Promise<void> {
  const multiplier = isSlowEnvironment ? 3 : isCI ? 2 : 1;
  return new Promise(resolve => setTimeout(resolve, ms * multiplier));
}

/**
 * Environment-aware polling utility
 */
export async function pollUntil<T>(
  fn: () => T | Promise<T>,
  predicate: (result: T) => boolean,
  options: {
    timeout?: number;
    interval?: number;
  } = {}
): Promise<T> {
  const timeout = options.timeout || getTestTimeout('integration');
  const interval = options.interval || (isCI ? 200 : 100);
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await fn();
    if (predicate(result)) {
      return result;
    }
    await waitFor(interval);
  }

  throw new Error(`Polling timed out after ${timeout}ms`);
}