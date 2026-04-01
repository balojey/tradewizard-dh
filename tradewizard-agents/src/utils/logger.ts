/**
 * Comprehensive Logging Module
 *
 * This module provides structured logging for the Automated Market Monitor
 * using Pino for high-performance, structured JSON logging.
 *
 * Features:
 * - Structured JSON logging
 * - Configurable log levels
 * - Context-aware logging (discovery, analysis, storage, scheduler, quota)
 * - Error logging with full stack traces
 * - Log rotation support for production
 * - Pretty printing for development
 */

import pino from 'pino';
import type { Logger as PinoLogger } from 'pino';
import { MarketId } from '../models/types';

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level?: LogLevel;
  prettyPrint?: boolean;
  destination?: string; // File path for log output
  rotationEnabled?: boolean;
  rotationMaxSize?: string; // e.g., '10M', '100M'
  rotationMaxFiles?: number;
}

/**
 * Context for structured logging
 */
export interface LogContext {
  component?: 'discovery' | 'analysis' | 'storage' | 'scheduler' | 'quota' | 'health' | 'config' | 'monitor';
  marketId?: MarketId;
  conditionId?: string;
  operation?: string;
  duration?: number;
  cost?: number;
  [key: string]: unknown;
}

/**
 * Error context for detailed error logging
 */
export interface ErrorContext extends LogContext {
  error: Error | unknown;
  stack?: string;
  code?: string;
  retryAttempt?: number;
  maxRetries?: number;
}

/**
 * Create a logger instance with the specified configuration
 */
export function createLogger(config: LoggerConfig = {}): PinoLogger {
  const level = config.level || (process.env.LOG_LEVEL as LogLevel) || 'info';
  const prettyPrint = config.prettyPrint ?? process.env.NODE_ENV !== 'production';

  const pinoConfig: pino.LoggerOptions = {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    serializers: {
      error: pino.stdSerializers.err,
    },
  };

  // Add pretty printing for development
  const transport = prettyPrint
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined;

  if (transport) {
    return pino(pinoConfig, pino.transport(transport));
  }

  // For production, log to file if destination is specified
  // Note: Log rotation should be handled by external tools like logrotate
  // or by using pino-roll/rotating-file-stream packages
  // Configuration options (rotationEnabled, rotationMaxSize, rotationMaxFiles)
  // are provided for future integration with rotation libraries
  if (config.destination) {
    return pino(pinoConfig, pino.destination(config.destination));
  }

  return pino(pinoConfig);
}

/**
 * Global logger instance
 */
let globalLogger: PinoLogger | null = null;

/**
 * Initialize the global logger
 */
export function initializeLogger(config: LoggerConfig = {}): PinoLogger {
  globalLogger = createLogger(config);
  return globalLogger;
}

/**
 * Get the global logger instance
 */
export function getLogger(): PinoLogger {
  if (!globalLogger) {
    globalLogger = createLogger();
  }
  return globalLogger;
}

/**
 * Structured logger wrapper with convenience methods
 */
export class MonitorLogger {
  private logger: PinoLogger;

  constructor(logger?: PinoLogger) {
    this.logger = logger || getLogger();
  }

  /**
   * Log market discovery events
   */
  logDiscovery(message: string, context: LogContext = {}): void {
    this.logger.info({ ...context, component: 'discovery' }, message);
  }

  /**
   * Log market analysis events
   */
  logAnalysis(message: string, context: LogContext = {}): void {
    this.logger.info({ ...context, component: 'analysis' }, message);
  }

  /**
   * Log database storage events
   */
  logStorage(message: string, context: LogContext = {}): void {
    this.logger.info({ ...context, component: 'storage' }, message);
  }

  /**
   * Log scheduler events
   */
  logScheduler(message: string, context: LogContext = {}): void {
    this.logger.info({ ...context, component: 'scheduler' }, message);
  }

  /**
   * Log quota management events
   */
  logQuota(message: string, context: LogContext = {}): void {
    this.logger.info({ ...context, component: 'quota' }, message);
  }

  /**
   * Log health check events
   */
  logHealth(message: string, context: LogContext = {}): void {
    this.logger.info({ ...context, component: 'health' }, message);
  }

  /**
   * Log configuration events
   */
  logConfig(message: string, context: LogContext = {}): void {
    this.logger.info({ ...context, component: 'config' }, message);
  }

  /**
   * Log monitor service events
   */
  logMonitor(message: string, context: LogContext = {}): void {
    this.logger.info({ ...context, component: 'monitor' }, message);
  }

  /**
   * Log errors with full context and stack traces
   */
  logError(message: string, errorContext: ErrorContext): void {
    const { error, stack, component = 'monitor', ...rest } = errorContext;

    const errorDetails: Record<string, unknown> = {
      ...rest,
      component,
    };

    if (error instanceof Error) {
      errorDetails.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else {
      errorDetails.error = String(error);
    }

    if (stack) {
      errorDetails.stack = stack;
    }

    this.logger.error(errorDetails, message);
  }

  /**
   * Log warnings
   */
  logWarning(message: string, context: LogContext = {}): void {
    this.logger.warn(context, message);
  }

  /**
   * Log debug information
   */
  logDebug(message: string, context: LogContext = {}): void {
    this.logger.debug(context, message);
  }

  /**
   * Log trace information (very verbose)
   */
  logTrace(message: string, context: LogContext = {}): void {
    this.logger.trace(context, message);
  }

  /**
   * Log fatal errors (will typically cause process exit)
   */
  logFatal(message: string, errorContext: ErrorContext): void {
    const { error, stack, component = 'monitor', ...rest } = errorContext;

    const errorDetails: Record<string, unknown> = {
      ...rest,
      component,
    };

    if (error instanceof Error) {
      errorDetails.error = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    } else {
      errorDetails.error = String(error);
    }

    if (stack) {
      errorDetails.stack = stack;
    }

    this.logger.fatal(errorDetails, message);
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): MonitorLogger {
    const childLogger = this.logger.child(context);
    return new MonitorLogger(childLogger);
  }

  /**
   * Get the underlying Pino logger
   */
  getPinoLogger(): PinoLogger {
    return this.logger;
  }
}

/**
 * Create a monitor logger instance
 */
export function createMonitorLogger(config: LoggerConfig = {}): MonitorLogger {
  const logger = createLogger(config);
  return new MonitorLogger(logger);
}

/**
 * Default monitor logger instance
 */
let defaultMonitorLogger: MonitorLogger | null = null;

/**
 * Get the default monitor logger
 */
export function getMonitorLogger(): MonitorLogger {
  if (!defaultMonitorLogger) {
    defaultMonitorLogger = createMonitorLogger();
  }
  return defaultMonitorLogger;
}

/**
 * Initialize the default monitor logger
 */
export function initializeMonitorLogger(config: LoggerConfig = {}): MonitorLogger {
  defaultMonitorLogger = createMonitorLogger(config);
  return defaultMonitorLogger;
}

/**
 * Sanitize sensitive data from logs
 */
export function sanitizeLogData(data: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...data };
  const sensitiveKeys = ['apikey', 'password', 'token', 'secret', 'authorization'];

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      sanitized[key] = '***REDACTED***';
    }
  }

  return sanitized;
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  if (ms < 3600000) {
    return `${(ms / 60000).toFixed(2)}m`;
  }
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Format cost in USD
 */
export function formatCost(usd: number): string {
  return usd.toFixed(4);
}
