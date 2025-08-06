import { Logger } from '../logger';
import { DefaultPIIFilter } from '../pii-filter';
import { LoggerFactory } from '../factory';
import { RequestContext } from '../correlation';

// Stop the cleanup timer after all tests to prevent Jest hanging
afterAll(() => {
  RequestContext.stopCleanupTimer();
});

describe('Logger', () => {
  let logger: Logger;
  let mockConsole: { [key: string]: jest.SpyInstance };

  beforeEach(() => {
    // Mock console methods
    mockConsole = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      log: jest.spyOn(console, 'log').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };

    logger = new Logger({ minLevel: 'debug' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Log Levels', () => {
    it('should log messages at or above the configured level', () => {
      logger = new Logger({ minLevel: 'warn' });

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalled();
    });
  });

  describe('Context', () => {
    it('should include context in log entries', () => {
      logger.info('Test message', { userId: '123', operation: 'test' });

      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('Test message')
      );
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('userId')
      );
    });

    it('should create child logger with merged context', () => {
      const childLogger = logger.withContext({ requestId: 'req-123' });
      
      childLogger.info('Child message', { userId: 'user-456' });

      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('requestId');
      expect(logCall).toContain('userId');
    });
  });

  describe('PII Filtering', () => {
    it('should filter sensitive data when enabled', () => {
      logger = new Logger({ 
        minLevel: 'info',
        enablePIIFiltering: true 
      });

      logger.info('User login', {
        email: 'test@example.com',
        password: 'secret123',
        userId: '123',
      });

      const logCall = mockConsole.info.mock.calls[0][0];
      expect(logCall).toContain('[EMAIL_REDACTED]');
      expect(logCall).toContain('[REDACTED]');
      expect(logCall).not.toContain('test@example.com');
      expect(logCall).not.toContain('secret123');
    });
  });

  describe('Sampling', () => {
    it('should sample logs based on configured rate', () => {
      logger = new Logger({
        minLevel: 'info',
        enableSampling: true,
        samplingRate: 0.5,
      });

      // Mock crypto.getRandomValues to control sampling
      const originalGetRandomValues = global.crypto.getRandomValues;
      let callCount = 0;
      
      global.crypto.getRandomValues = jest.fn((array: Uint8Array) => {
        // First call - should log (value < 0.5 * 256 = 128)
        if (callCount === 0) {
          array[0] = 64; // 64/256 = 0.25 < 0.5
        } else {
          // Second call - should not log (value > 0.5 * 256 = 128)
          array[0] = 200; // 200/256 = 0.78 > 0.5
        }
        callCount++;
        return array;
      });
      
      logger.info('Message 1');
      logger.info('Message 2');

      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      
      // Restore original function
      global.crypto.getRandomValues = originalGetRandomValues;
    });
  });

  describe('Error Logging', () => {
    it('should include error details in log entry', () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\n    at test.js:10';

      logger.error('Operation failed', error, { operation: 'test' });

      const logCall = mockConsole.error.mock.calls[0][0];
      expect(logCall).toContain('Operation failed');
      expect(logCall).toContain('Test error');
    });
  });
});

describe('PII Filter', () => {
  let filter: DefaultPIIFilter;

  beforeEach(() => {
    filter = new DefaultPIIFilter();
  });

  it('should filter email addresses', () => {
    const result = filter.filter('Contact me at john@example.com');
    expect(result).toBe('Contact me at [EMAIL_REDACTED]');
  });

  it('should filter credit card numbers', () => {
    const result = filter.filter('Card: 1234 5678 9012 3456');
    expect(result).toBe('Card: [CC_REDACTED]');
  });

  it('should filter JWT tokens', () => {
    const result = filter.filter('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c');
    expect(result).toBe('Bearer [TOKEN_REDACTED]');
  });

  it('should filter objects recursively', () => {
    const data = {
      user: {
        email: 'test@example.com',
        name: 'John Doe',
        password: 'secret123',
      },
      apiKey: 'sk_test_123456',
      metadata: {
        ip: '192.168.1.1',
      },
    };

    const result = filter.filter(data) as any;
    
    expect(result.user.email).toBe('[EMAIL_REDACTED]');
    expect(result.user.name).toBe('John Doe');
    expect(result.user.password).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
    expect(result.metadata.ip).toBe('[IP_REDACTED]');
  });
});

describe('LoggerFactory', () => {
  beforeEach(() => {
    // Clear singleton instance
    (LoggerFactory as any).instance = undefined;
  });

  it('should create loggers with factory configuration', () => {
    LoggerFactory.initialize({
      defaultLevel: 'warn',
      enablePIIFiltering: true,
    });

    const logger = LoggerFactory.getInstance().getLogger('test');
    
    // Mock console to verify behavior
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation();

    logger.warn('Warning message');
    logger.info('Info message');

    expect(warnSpy).toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('should create request logger with correlation ID', () => {
    LoggerFactory.initialize();
    
    const factory = LoggerFactory.getInstance();
    const request = new Request('https://example.com/api/test', {
      headers: {
        'x-correlation-id': 'existing-id',
      },
    });

    const logger = factory.createRequestLogger(request);
    
    const infoSpy = jest.spyOn(console, 'info').mockImplementation();
    logger.info('Request processed');

    const logCall = infoSpy.mock.calls[0][0];
    expect(logCall).toContain('existing-id');

    jest.restoreAllMocks();
  });
});