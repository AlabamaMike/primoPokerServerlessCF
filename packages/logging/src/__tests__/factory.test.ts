import { LoggerFactory } from '../factory';

describe('LoggerFactory', () => {
  beforeEach(() => {
    // Reset the singleton instance before each test
    (LoggerFactory as any).instance = undefined;
  });

  describe('deterministic cache key generation', () => {
    it('should generate identical cache keys for equivalent configurations with different property order', () => {
      const factory = LoggerFactory.getInstance();
      
      // Get logger with config properties in one order
      const logger1 = factory.getLogger('test', {
        minLevel: 'debug',
        enablePIIFiltering: true,
        enableSampling: false,
        samplingRate: 0.5,
      });
      
      // Get logger with same config but properties in different order
      const logger2 = factory.getLogger('test', {
        samplingRate: 0.5,
        enableSampling: false,
        minLevel: 'debug',
        enablePIIFiltering: true,
      });
      
      // Both should return the same logger instance
      expect(logger1).toBe(logger2);
    });

    it('should generate different cache keys for different configurations', () => {
      const factory = LoggerFactory.getInstance();
      
      const logger1 = factory.getLogger('test', {
        minLevel: 'debug',
        enablePIIFiltering: true,
      });
      
      const logger2 = factory.getLogger('test', {
        minLevel: 'info',
        enablePIIFiltering: true,
      });
      
      // Different configs should return different logger instances
      expect(logger1).not.toBe(logger2);
    });

    it('should generate different cache keys for different namespaces', () => {
      const factory = LoggerFactory.getInstance();
      
      const logger1 = factory.getLogger('namespace1', {
        minLevel: 'debug',
      });
      
      const logger2 = factory.getLogger('namespace2', {
        minLevel: 'debug',
      });
      
      // Different namespaces should return different logger instances
      expect(logger1).not.toBe(logger2);
    });

    it('should handle nested objects in configuration', () => {
      const factory = LoggerFactory.getInstance();
      
      const logger1 = factory.getLogger('test', {
        minLevel: 'debug',
        metadata: {
          service: 'api',
          version: '1.0.0',
          features: ['auth', 'logging'],
        },
      } as any);
      
      const logger2 = factory.getLogger('test', {
        metadata: {
          features: ['auth', 'logging'],
          version: '1.0.0',
          service: 'api',
        },
        minLevel: 'debug',
      } as any);
      
      // Should return the same logger instance despite different property order
      expect(logger1).toBe(logger2);
    });

    it('should cache loggers with no additional config', () => {
      const factory = LoggerFactory.getInstance();
      
      const logger1 = factory.getLogger('test');
      const logger2 = factory.getLogger('test');
      
      // Should return the same instance
      expect(logger1).toBe(logger2);
    });

    it('should treat undefined and empty config as equivalent', () => {
      const factory = LoggerFactory.getInstance();
      
      const logger1 = factory.getLogger('test');
      const logger2 = factory.getLogger('test', {});
      const logger3 = factory.getLogger('test', undefined);
      
      // All should return the same instance
      expect(logger1).toBe(logger2);
      expect(logger1).toBe(logger3);
    });
  });
});