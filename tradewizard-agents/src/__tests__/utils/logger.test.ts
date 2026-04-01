/**
 * Unit tests for the logging module
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createLogger,
  createMonitorLogger,
  MonitorLogger,
  sanitizeLogData,
  formatDuration,
  formatCost,
  type LogContext,
  type ErrorContext,
} from './logger.js';

describe('Logger Module', () => {
  describe('createLogger', () => {
    it('should create a logger with default configuration', () => {
      const logger = createLogger();
      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');
    });

    it('should create a logger with custom log level', () => {
      const logger = createLogger({ level: 'debug' });
      expect(logger).toBeDefined();
      expect(logger.level).toBe('debug');
    });

    it('should respect LOG_LEVEL environment variable', () => {
      const originalEnv = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'warn';

      const logger = createLogger();
      expect(logger.level).toBe('warn');

      process.env.LOG_LEVEL = originalEnv;
    });

    it('should create logger with all supported log levels', () => {
      const levels: Array<'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'> = [
        'trace',
        'debug',
        'info',
        'warn',
        'error',
        'fatal',
      ];

      for (const level of levels) {
        const logger = createLogger({ level });
        expect(logger.level).toBe(level);
      }
    });
  });

  describe('MonitorLogger', () => {
    let logger: MonitorLogger;
    let mockPinoLogger: any;

    beforeEach(() => {
      // Create a mock Pino logger
      mockPinoLogger = {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        fatal: vi.fn(),
        child: vi.fn().mockReturnThis(),
        level: 'info',
      };

      logger = new MonitorLogger(mockPinoLogger);
    });

    describe('Component-specific logging', () => {
      it('should log discovery events with correct component', () => {
        const message = 'Discovered 5 markets';
        const context: LogContext = { marketCount: 5 };

        logger.logDiscovery(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { ...context, component: 'discovery' },
          message
        );
      });

      it('should log analysis events with correct component', () => {
        const message = 'Analyzing market';
        const context: LogContext = { conditionId: 'test-123', operation: 'analyze' };

        logger.logAnalysis(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { ...context, component: 'analysis' },
          message
        );
      });

      it('should log storage events with correct component', () => {
        const message = 'Stored recommendation';
        const context: LogContext = { marketId: 'market-456', operation: 'store' };

        logger.logStorage(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { ...context, component: 'storage' },
          message
        );
      });

      it('should log scheduler events with correct component', () => {
        const message = 'Scheduler started';
        const context: LogContext = { interval: 86400000 };

        logger.logScheduler(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { ...context, component: 'scheduler' },
          message
        );
      });

      it('should log quota events with correct component', () => {
        const message = 'Quota usage updated';
        const context: LogContext = { source: 'newsapi', usage: 50, limit: 100 };

        logger.logQuota(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { ...context, component: 'quota' },
          message
        );
      });

      it('should log health check events with correct component', () => {
        const message = 'Health check passed';
        const context: LogContext = { status: 'healthy' };

        logger.logHealth(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { ...context, component: 'health' },
          message
        );
      });

      it('should log configuration events with correct component', () => {
        const message = 'Configuration loaded';
        const context: LogContext = { configKeys: ['apiKey', 'interval'] };

        logger.logConfig(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { ...context, component: 'config' },
          message
        );
      });

      it('should log monitor service events with correct component', () => {
        const message = 'Monitor initialized';
        const context: LogContext = { version: '1.0.0' };

        logger.logMonitor(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { ...context, component: 'monitor' },
          message
        );
      });
    });

    describe('Error logging', () => {
      it('should log errors with Error objects', () => {
        const error = new Error('Test error');
        const message = 'Operation failed';
        const errorContext: ErrorContext = {
          error,
          component: 'analysis',
          conditionId: 'test-123',
        };

        logger.logError(message, errorContext);

        expect(mockPinoLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            component: 'analysis',
            conditionId: 'test-123',
            error: {
              name: 'Error',
              message: 'Test error',
              stack: expect.any(String),
            },
          }),
          message
        );
      });

      it('should log errors with non-Error objects', () => {
        const error = 'String error';
        const message = 'Operation failed';
        const errorContext: ErrorContext = {
          error,
          component: 'storage',
        };

        logger.logError(message, errorContext);

        expect(mockPinoLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            component: 'storage',
            error: 'String error',
          }),
          message
        );
      });

      it('should include retry information in error logs', () => {
        const error = new Error('API timeout');
        const message = 'API call failed';
        const errorContext: ErrorContext = {
          error,
          component: 'discovery',
          retryAttempt: 2,
          maxRetries: 3,
        };

        logger.logError(message, errorContext);

        expect(mockPinoLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            component: 'discovery',
            retryAttempt: 2,
            maxRetries: 3,
          }),
          message
        );
      });

      it('should include custom stack traces', () => {
        const error = new Error('Test error');
        const customStack = 'Custom stack trace';
        const message = 'Operation failed';
        const errorContext: ErrorContext = {
          error,
          stack: customStack,
        };

        logger.logError(message, errorContext);

        expect(mockPinoLogger.error).toHaveBeenCalledWith(
          expect.objectContaining({
            stack: customStack,
          }),
          message
        );
      });
    });

    describe('Log levels', () => {
      it('should log warnings', () => {
        const message = 'Warning message';
        const context: LogContext = { component: 'quota' };

        logger.logWarning(message, context);

        expect(mockPinoLogger.warn).toHaveBeenCalledWith(context, message);
      });

      it('should log debug messages', () => {
        const message = 'Debug message';
        const context: LogContext = { component: 'analysis' };

        logger.logDebug(message, context);

        expect(mockPinoLogger.debug).toHaveBeenCalledWith(context, message);
      });

      it('should log trace messages', () => {
        const message = 'Trace message';
        const context: LogContext = { component: 'storage' };

        logger.logTrace(message, context);

        expect(mockPinoLogger.trace).toHaveBeenCalledWith(context, message);
      });

      it('should log fatal errors', () => {
        const error = new Error('Fatal error');
        const message = 'Fatal error occurred';
        const errorContext: ErrorContext = {
          error,
          component: 'monitor',
        };

        logger.logFatal(message, errorContext);

        expect(mockPinoLogger.fatal).toHaveBeenCalledWith(
          expect.objectContaining({
            component: 'monitor',
            error: {
              name: 'Error',
              message: 'Fatal error',
              stack: expect.any(String),
            },
          }),
          message
        );
      });
    });

    describe('Child logger', () => {
      it('should create a child logger with additional context', () => {
        const context: LogContext = { marketId: 'market-123' };

        const childLogger = logger.child(context);

        expect(childLogger).toBeInstanceOf(MonitorLogger);
        expect(mockPinoLogger.child).toHaveBeenCalledWith(context);
      });
    });

    describe('Context handling', () => {
      it('should handle empty context', () => {
        const message = 'Test message';

        logger.logDiscovery(message);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(
          { component: 'discovery' },
          message
        );
      });

      it('should handle complex context objects', () => {
        const message = 'Complex context';
        const context: LogContext = {
          component: 'analysis',
          marketId: 'market-123',
          duration: 5000,
          cost: 0.05,
          metadata: {
            agents: ['agent1', 'agent2'],
            signals: [{ name: 'signal1' }, { name: 'signal2' }],
          },
        };

        logger.logAnalysis(message, context);

        expect(mockPinoLogger.info).toHaveBeenCalledWith(context, message);
      });
    });
  });

  describe('Utility functions', () => {
    describe('sanitizeLogData', () => {
      it('should redact sensitive keys', () => {
        const data = {
          apiKey: 'secret-key',
          password: 'secret-password',
          token: 'secret-token',
          secret: 'secret-value',
          authorization: 'Bearer token',
          normalKey: 'normal-value',
        };

        const sanitized = sanitizeLogData(data);

        expect(sanitized.apiKey).toBe('***REDACTED***');
        expect(sanitized.password).toBe('***REDACTED***');
        expect(sanitized.token).toBe('***REDACTED***');
        expect(sanitized.secret).toBe('***REDACTED***');
        expect(sanitized.authorization).toBe('***REDACTED***');
        expect(sanitized.normalKey).toBe('normal-value');
      });

      it('should handle case-insensitive sensitive keys', () => {
        const data = {
          ApiKey: 'secret',
          PASSWORD: 'secret',
          Token: 'secret',
          normalKey: 'normal',
        };

        const sanitized = sanitizeLogData(data);

        expect(sanitized.ApiKey).toBe('***REDACTED***');
        expect(sanitized.PASSWORD).toBe('***REDACTED***');
        expect(sanitized.Token).toBe('***REDACTED***');
        expect(sanitized.normalKey).toBe('normal');
      });

      it('should not modify original data', () => {
        const data = {
          apiKey: 'secret-key',
          normalKey: 'normal-value',
        };

        const sanitized = sanitizeLogData(data);

        expect(data.apiKey).toBe('secret-key');
        expect(sanitized.apiKey).toBe('***REDACTED***');
      });
    });

    describe('formatDuration', () => {
      it('should format milliseconds', () => {
        expect(formatDuration(500)).toBe('500ms');
        expect(formatDuration(999)).toBe('999ms');
      });

      it('should format seconds', () => {
        expect(formatDuration(1000)).toBe('1.00s');
        expect(formatDuration(5500)).toBe('5.50s');
        expect(formatDuration(59999)).toBe('60.00s');
      });

      it('should format minutes', () => {
        expect(formatDuration(60000)).toBe('1.00m');
        expect(formatDuration(150000)).toBe('2.50m');
        expect(formatDuration(3599999)).toBe('60.00m');
      });

      it('should format hours', () => {
        expect(formatDuration(3600000)).toBe('1.00h');
        expect(formatDuration(7200000)).toBe('2.00h');
        expect(formatDuration(86400000)).toBe('24.00h');
      });
    });

    describe('formatCost', () => {
      it('should format cost with 4 decimal places', () => {
        expect(formatCost(0.0001)).toBe('0.0001');
        expect(formatCost(0.05)).toBe('0.0500');
        expect(formatCost(1.2345)).toBe('1.2345');
        expect(formatCost(10)).toBe('10.0000');
      });

      it('should handle zero cost', () => {
        expect(formatCost(0)).toBe('0.0000');
      });

      it('should handle large costs', () => {
        expect(formatCost(1000.5678)).toBe('1000.5678');
      });
    });
  });

  describe('Integration', () => {
    it('should create a functional monitor logger', () => {
      const logger = createMonitorLogger({ level: 'info' });

      expect(logger).toBeInstanceOf(MonitorLogger);
      expect(logger.getPinoLogger()).toBeDefined();
    });

    it('should log messages without errors', () => {
      const logger = createMonitorLogger({ level: 'info' });

      // These should not throw
      expect(() => {
        logger.logDiscovery('Test discovery');
        logger.logAnalysis('Test analysis');
        logger.logStorage('Test storage');
        logger.logScheduler('Test scheduler');
        logger.logQuota('Test quota');
        logger.logHealth('Test health');
        logger.logConfig('Test config');
        logger.logMonitor('Test monitor');
      }).not.toThrow();
    });

    it('should handle error logging without errors', () => {
      const logger = createMonitorLogger({ level: 'info' });

      expect(() => {
        logger.logError('Test error', {
          error: new Error('Test'),
          component: 'analysis',
        });
      }).not.toThrow();
    });
  });
});
