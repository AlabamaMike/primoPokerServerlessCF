import { Logger } from '../logger';
import { LogAggregator } from '../types';
import { RequestContext } from '../correlation';

// Stop the cleanup timer after all tests to prevent Jest hanging
afterAll(() => {
  RequestContext.stopCleanupTimer();
});

describe('ContextualLogger', () => {
  let logger: Logger;
  let mockConsole: { [key: string]: jest.SpyInstance };
  let mockAggregator: LogAggregator;

  beforeEach(() => {
    // Mock console methods
    mockConsole = {
      debug: jest.spyOn(console, 'debug').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };

    // Mock aggregator
    mockAggregator = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    logger = new Logger({ minLevel: 'debug', outputFormat: 'json' });
    logger.setAggregator(mockAggregator);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('withContext()', () => {
    it('should create a contextual logger that includes base context', () => {
      const contextualLogger = logger.withContext({ userId: '123', sessionId: 'abc' });
      
      contextualLogger.info('Test message');
      
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"userId":"123"')
      );
      expect(mockConsole.info).toHaveBeenCalledWith(
        expect.stringContaining('"sessionId":"abc"')
      );
    });

    it('should merge contexts when logging with additional context', () => {
      const contextualLogger = logger.withContext({ userId: '123' });
      
      contextualLogger.info('Test message', { operation: 'test', requestId: 'req-1' });
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.context).toMatchObject({
        userId: '123',
        operation: 'test',
        requestId: 'req-1',
      });
    });

    it('should support nested contextual loggers', () => {
      const contextualLogger1 = logger.withContext({ layer: 'service', serviceId: 'auth' });
      const contextualLogger2 = contextualLogger1.withContext({ operation: 'login', userId: '456' });
      
      contextualLogger2.info('Nested context test');
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.context).toMatchObject({
        layer: 'service',
        serviceId: 'auth',
        operation: 'login',
        userId: '456',
      });
    });

    it('should share the same aggregator with parent logger', async () => {
      const contextualLogger = logger.withContext({ context: 'test' });
      
      contextualLogger.info('Test message');
      logger.info('Parent message');
      
      await logger.flush();
      
      expect(mockAggregator.send).toHaveBeenCalledTimes(1);
      expect(mockAggregator.send).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ message: 'Test message' }),
          expect.objectContaining({ message: 'Parent message' }),
        ])
      );
    });

    it('should handle error logging with context', () => {
      const contextualLogger = logger.withContext({ component: 'auth' });
      const testError = new Error('Test error');
      
      contextualLogger.error('An error occurred', testError, { errorCode: 'AUTH_001' });
      
      const logOutput = mockConsole.error.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.context).toMatchObject({
        component: 'auth',
        errorCode: 'AUTH_001',
      });
      expect(parsed.error).toMatchObject({
        name: 'Error',
        message: 'Test error',
      });
    });

    it('should respect log levels from parent logger', () => {
      const warnLogger = new Logger({ minLevel: 'warn' });
      const contextualLogger = warnLogger.withContext({ context: 'test' });
      
      contextualLogger.debug('Debug message');
      contextualLogger.info('Info message');
      contextualLogger.warn('Warn message');
      
      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it('should handle overlapping context keys with last-write-wins', () => {
      const contextualLogger = logger.withContext({ userId: '123', role: 'admin' });
      
      contextualLogger.info('Test', { userId: '456', operation: 'update' });
      
      const logOutput = mockConsole.info.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);
      
      expect(parsed.context.userId).toBe('456'); // Additional context overwrites base context
      expect(parsed.context.role).toBe('admin');
      expect(parsed.context.operation).toBe('update');
    });

    it('should propagate flush calls to parent logger', async () => {
      const contextualLogger = logger.withContext({ context: 'test' });
      const flushSpy = jest.spyOn(logger, 'flush');
      
      await contextualLogger.flush();
      
      expect(flushSpy).toHaveBeenCalled();
    });

    it('should handle all log levels correctly', () => {
      const contextualLogger = logger.withContext({ component: 'test' });
      
      contextualLogger.debug('Debug msg');
      contextualLogger.info('Info msg');
      contextualLogger.warn('Warn msg');
      contextualLogger.error('Error msg');
      
      expect(mockConsole.debug).toHaveBeenCalledTimes(1);
      expect(mockConsole.info).toHaveBeenCalledTimes(1);
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      
      // Verify context is included in all levels
      [mockConsole.debug, mockConsole.info, mockConsole.warn, mockConsole.error].forEach(spy => {
        const logOutput = spy.mock.calls[0][0];
        expect(logOutput).toContain('"component":"test"');
      });
    });

    it('should maintain independence between different contextual loggers', () => {
      const contextLogger1 = logger.withContext({ service: 'api' });
      const contextLogger2 = logger.withContext({ service: 'worker' });
      
      contextLogger1.info('API log');
      contextLogger2.info('Worker log');
      
      const apiLog = JSON.parse(mockConsole.info.mock.calls[0][0]);
      const workerLog = JSON.parse(mockConsole.info.mock.calls[1][0]);
      
      expect(apiLog.context.service).toBe('api');
      expect(workerLog.context.service).toBe('worker');
    });
  });
});