import { RecoveryStrategies, RecoveryContext, ErrorType } from '../recovery-strategies';

describe('RecoveryStrategies', () => {
  let strategies: RecoveryStrategies;

  beforeEach(() => {
    strategies = new RecoveryStrategies();
  });

  describe('getStrategy', () => {
    it('should return appropriate strategy for network errors', () => {
      const context: RecoveryContext = {
        errorType: 'NETWORK_ERROR',
        error: new Error('Connection timeout'),
        attemptCount: 1,
        resourceType: 'api',
      };

      const strategy = strategies.getStrategy(context);

      expect(strategy.shouldRetry).toBe(true);
      expect(strategy.retryPolicy).toBeDefined();
      expect(strategy.retryPolicy?.maxAttempts).toBeGreaterThan(1);
    });

    it('should not retry validation errors', () => {
      const context: RecoveryContext = {
        errorType: 'VALIDATION_ERROR',
        error: new Error('Invalid input'),
        attemptCount: 1,
        resourceType: 'input',
      };

      const strategy = strategies.getStrategy(context);

      expect(strategy.shouldRetry).toBe(false);
      expect(strategy.fallbackAction).toBe('reject');
    });

    it('should use circuit breaker for external service errors', () => {
      const context: RecoveryContext = {
        errorType: 'EXTERNAL_SERVICE_ERROR',
        error: new Error('Service unavailable'),
        attemptCount: 1,
        resourceType: 'external-api',
      };

      const strategy = strategies.getStrategy(context);

      expect(strategy.useCircuitBreaker).toBe(true);
      expect(strategy.circuitBreakerConfig).toBeDefined();
    });

    it('should handle rate limit errors with backoff', () => {
      const context: RecoveryContext = {
        errorType: 'RATE_LIMIT_ERROR',
        error: new Error('Rate limit exceeded'),
        attemptCount: 1,
        resourceType: 'api',
        metadata: {
          retryAfter: 60,
        },
      };

      const strategy = strategies.getStrategy(context);

      expect(strategy.shouldRetry).toBe(true);
      expect(strategy.retryPolicy?.initialDelay).toBeGreaterThanOrEqual(60000);
    });
  });

  describe('categorizeError', () => {
    it('should categorize network-related errors', () => {
      const networkErrors = [
        new Error('ECONNREFUSED'),
        new Error('ETIMEDOUT'),
        new Error('Network timeout'),
        new Error('Connection reset'),
      ];

      networkErrors.forEach(error => {
        const category = strategies.categorizeError(error);
        expect(category).toBe('NETWORK_ERROR');
      });
    });

    it('should categorize authentication errors', () => {
      const authErrors = [
        new Error('Unauthorized'),
        new Error('Invalid token'),
        new Error('Authentication failed'),
        { status: 401, message: 'Unauthorized' },
      ];

      authErrors.forEach(error => {
        const category = strategies.categorizeError(error);
        expect(category).toBe('AUTH_ERROR');
      });
    });

    it('should categorize rate limit errors', () => {
      const rateLimitErrors = [
        new Error('Rate limit exceeded'),
        new Error('Too many requests'),
        { status: 429, message: 'Too Many Requests' },
      ];

      rateLimitErrors.forEach(error => {
        const category = strategies.categorizeError(error);
        expect(category).toBe('RATE_LIMIT_ERROR');
      });
    });

    it('should categorize validation errors', () => {
      const validationErrors = [
        new Error('Validation failed'),
        new Error('Invalid input'),
        new Error('Missing required field'),
        { status: 400, message: 'Bad Request' },
      ];

      validationErrors.forEach(error => {
        const category = strategies.categorizeError(error);
        expect(category).toBe('VALIDATION_ERROR');
      });
    });

    it('should categorize server errors', () => {
      const serverErrors = [
        new Error('Internal server error'),
        { status: 500, message: 'Internal Server Error' },
        { status: 503, message: 'Service Unavailable' },
      ];

      serverErrors.forEach(error => {
        const category = strategies.categorizeError(error);
        expect(category).toBe('SERVER_ERROR');
      });
    });

    it('should return UNKNOWN_ERROR for unrecognized errors', () => {
      const unknownError = new Error('Something weird happened');
      const category = strategies.categorizeError(unknownError);
      expect(category).toBe('UNKNOWN_ERROR');
    });
  });

  describe('shouldRetry', () => {
    it('should retry transient errors', () => {
      const transientErrors: ErrorType[] = [
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'SERVER_ERROR',
        'RATE_LIMIT_ERROR',
      ];

      transientErrors.forEach(errorType => {
        const shouldRetry = strategies.shouldRetry(errorType);
        expect(shouldRetry).toBe(true);
      });
    });

    it('should not retry permanent errors', () => {
      const permanentErrors: ErrorType[] = [
        'VALIDATION_ERROR',
        'AUTH_ERROR',
        'NOT_FOUND_ERROR',
        'PERMISSION_ERROR',
      ];

      permanentErrors.forEach(errorType => {
        const shouldRetry = strategies.shouldRetry(errorType);
        expect(shouldRetry).toBe(false);
      });
    });
  });

  describe('getRetryDelay', () => {
    it('should calculate exponential backoff delays', () => {
      const delays = [];
      for (let i = 1; i <= 5; i++) {
        delays.push(strategies.getRetryDelay(i, 'exponential', 100));
      }

      expect(delays[0]).toBe(100);  // 100ms
      expect(delays[1]).toBe(200);  // 200ms
      expect(delays[2]).toBe(400);  // 400ms
      expect(delays[3]).toBe(800);  // 800ms
      expect(delays[4]).toBe(1600); // 1600ms
    });

    it('should respect maximum delay', () => {
      const delay = strategies.getRetryDelay(10, 'exponential', 100, 1000);
      expect(delay).toBe(1000);
    });

    it('should add jitter when requested', () => {
      // Mock Math.random for predictable tests
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      
      const delayWithJitter = strategies.getRetryDelay(2, 'exponential', 100, 5000, true);
      const expectedBase = 200;
      const expectedJitter = expectedBase * 0.5 * 0.5; // 50% jitter * 0.5 random
      
      expect(delayWithJitter).toBeCloseTo(expectedBase + expectedJitter);
      
      randomSpy.mockRestore();
    });
  });

  describe('custom strategies', () => {
    it('should allow registering custom strategies', () => {
      strategies.registerStrategy('CUSTOM_ERROR', {
        shouldRetry: true,
        retryPolicy: {
          maxAttempts: 5,
          backoffStrategy: 'linear',
          initialDelay: 200,
          maxDelay: 2000,
          jitter: false,
        },
        useCircuitBreaker: false,
        fallbackAction: 'custom-fallback',
      });

      const context: RecoveryContext = {
        errorType: 'CUSTOM_ERROR',
        error: new Error('Custom error'),
        attemptCount: 1,
        resourceType: 'custom',
      };

      const strategy = strategies.getStrategy(context);
      expect(strategy.retryPolicy?.maxAttempts).toBe(5);
      expect(strategy.fallbackAction).toBe('custom-fallback');
    });
  });

  describe('WebSocket-specific strategies', () => {
    it('should handle WebSocket disconnections', () => {
      const context: RecoveryContext = {
        errorType: 'WEBSOCKET_ERROR',
        error: new Error('WebSocket disconnected'),
        attemptCount: 1,
        resourceType: 'websocket',
        metadata: {
          connectionDuration: 30000,
          lastActivity: Date.now() - 5000,
        },
      };

      const strategy = strategies.getStrategy(context);
      
      expect(strategy.shouldRetry).toBe(true);
      expect(strategy.retryPolicy?.backoffStrategy).toBe('exponential');
      expect(strategy.fallbackAction).toBe('reconnect');
    });

    it('should terminate stale WebSocket connections', () => {
      const context: RecoveryContext = {
        errorType: 'WEBSOCKET_ERROR',
        error: new Error('WebSocket timeout'),
        attemptCount: 10,
        resourceType: 'websocket',
        metadata: {
          connectionDuration: 300000, // 5 minutes
          lastActivity: Date.now() - 300000,
        },
      };

      const strategy = strategies.getStrategy(context);
      
      expect(strategy.shouldRetry).toBe(false);
      expect(strategy.fallbackAction).toBe('terminate');
    });
  });

  describe('game-specific strategies', () => {
    it('should handle player disconnections during game', () => {
      const context: RecoveryContext = {
        errorType: 'PLAYER_DISCONNECTED',
        error: new Error('Player lost connection'),
        attemptCount: 1,
        resourceType: 'game',
        metadata: {
          playerId: 'player-123',
          gamePhase: 'FLOP',
          hasActiveBet: true,
        },
      };

      const strategy = strategies.getStrategy(context);
      
      expect(strategy.shouldRetry).toBe(true);
      expect(strategy.fallbackAction).toBe('grace-period');
      expect(strategy.metadata?.gracePeriodMs).toBe(30000);
    });

    it('should auto-fold after grace period', () => {
      const context: RecoveryContext = {
        errorType: 'PLAYER_DISCONNECTED',
        error: new Error('Player timeout'),
        attemptCount: 5,
        resourceType: 'game',
        metadata: {
          playerId: 'player-123',
          gamePhase: 'TURN',
          hasActiveBet: true,
          disconnectDuration: 35000,
        },
      };

      const strategy = strategies.getStrategy(context);
      
      expect(strategy.shouldRetry).toBe(false);
      expect(strategy.fallbackAction).toBe('auto-fold');
    });
  });

  describe('resource exhaustion strategies', () => {
    it('should handle memory exhaustion', () => {
      const context: RecoveryContext = {
        errorType: 'RESOURCE_EXHAUSTED',
        error: new Error('Out of memory'),
        attemptCount: 1,
        resourceType: 'system',
        metadata: {
          resourceType: 'memory',
          usage: 0.95,
        },
      };

      const strategy = strategies.getStrategy(context);
      
      expect(strategy.shouldRetry).toBe(false);
      expect(strategy.fallbackAction).toBe('shed-load');
      expect(strategy.useCircuitBreaker).toBe(true);
    });

    it('should handle CPU exhaustion', () => {
      const context: RecoveryContext = {
        errorType: 'RESOURCE_EXHAUSTED',
        error: new Error('CPU limit exceeded'),
        attemptCount: 1,
        resourceType: 'system',
        metadata: {
          resourceType: 'cpu',
          usage: 0.98,
        },
      };

      const strategy = strategies.getStrategy(context);
      
      expect(strategy.shouldRetry).toBe(false);
      expect(strategy.fallbackAction).toBe('throttle');
    });
  });
});