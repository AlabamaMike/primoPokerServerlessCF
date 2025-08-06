/**
 * Constants for monitoring and metrics collection
 */

// Time-to-live (TTL) values in seconds
export const METRICS_TTL = {
  REQUEST: 86400,          // 24 hours
  RESPONSE_TIME: 3600,     // 1 hour  
  HEALTH_CHECK: 300,       // 5 minutes
  RATE_LIMIT: 3600,        // 1 hour
  ERROR_STORAGE: 604800,   // 7 days
} as const;

// Time windows in milliseconds
export const TIME_WINDOWS = {
  ONE_MINUTE: 60000,
  FIVE_MINUTES: 300000,
  FIFTEEN_MINUTES: 900000,
  ONE_HOUR: 3600000,
} as const;

// Performance thresholds
export const PERFORMANCE_THRESHOLDS = {
  SLOW_REQUEST_MS: 1000,   // 1 second
  MAX_RESPONSE_TIMES: 100, // Keep last 100 response times for percentiles
} as const;

// Sampling rates
export const SAMPLING_RATES = {
  PRODUCTION: 0.1,         // 10% in production
  DEVELOPMENT: 1.0,        // 100% in development
} as const;

// Flush intervals
export const FLUSH_INTERVALS = {
  ERROR_REPORTER: 30000,   // 30 seconds
  METRICS_CLEANUP: 3600000, // 1 hour
} as const;

// Percentile calculations
export const PERCENTILES = {
  P50: 0.5,
  P95: 0.95,
  P99: 0.99,
} as const;