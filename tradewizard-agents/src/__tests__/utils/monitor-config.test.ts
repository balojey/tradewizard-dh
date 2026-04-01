/**
 * Unit tests for Monitor Configuration Management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { loadConfiguration, validateConfiguration, getDefaultConfig } from './monitor-config.js';
import type { MonitorConfig } from './monitor-config.js';

describe('Monitor Configuration Management', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and environment
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    // Restore environment
    process.env = originalEnv;
  });

  describe('Configuration loading', () => {
    it('should load valid configuration from environment', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      const config = loadConfiguration();

      expect(config).toBeDefined();
      expect(config.database.supabaseUrl).toBe('https://test.supabase.co');
      expect(config.database.supabaseKey).toBe('test-anon-key');
      expect(config.database.supabaseServiceRoleKey).toBe('test-service-role-key');
    });

    it('should apply default values for optional configuration', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      const config = loadConfiguration();

      expect(config.scheduling.analysisIntervalHours).toBe(24);
      expect(config.scheduling.updateIntervalHours).toBe(24);
      expect(config.scheduling.maxMarketsPerCycle).toBe(3);
      expect(config.quotas.newsApiDailyQuota).toBe(100);
      expect(config.quotas.twitterApiDailyQuota).toBe(500);
      expect(config.quotas.redditApiDailyQuota).toBe(60);
      expect(config.service.healthCheckPort).toBe(3000);
      expect(config.service.enableManualTriggers).toBe(true);
      expect(config.service.logLevel).toBe('info');
    });

    it('should override default values with environment variables', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
      process.env.ANALYSIS_INTERVAL_HOURS = '12';
      process.env.MAX_MARKETS_PER_CYCLE = '5';
      process.env.HEALTH_CHECK_PORT = '8080';
      process.env.LOG_LEVEL = 'debug';

      const config = loadConfiguration();

      expect(config.scheduling.analysisIntervalHours).toBe(12);
      expect(config.scheduling.maxMarketsPerCycle).toBe(5);
      expect(config.service.healthCheckPort).toBe(8080);
      expect(config.service.logLevel).toBe('debug');
    });

    it('should handle ENABLE_MANUAL_TRIGGERS=false', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
      process.env.ENABLE_MANUAL_TRIGGERS = 'false';

      const config = loadConfiguration();

      expect(config.service.enableManualTriggers).toBe(false);
    });

    it('should throw error when required configuration is missing', () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_KEY;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      expect(() => loadConfiguration()).toThrow(/Configuration validation failed/);
    });

    it('should throw error when SUPABASE_URL is invalid', () => {
      process.env.SUPABASE_URL = 'not-a-url';
      process.env.SUPABASE_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      expect(() => loadConfiguration()).toThrow(/Configuration validation failed/);
    });

    it('should throw error when SUPABASE_KEY is empty', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_KEY = '';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

      expect(() => loadConfiguration()).toThrow(/Configuration validation failed/);
    });
  });

  describe('Configuration validation', () => {
    it('should validate correct configuration', () => {
      const config: MonitorConfig = {
        database: {
          supabaseUrl: 'https://test.supabase.co',
          supabaseKey: 'test-anon-key',
          supabaseServiceRoleKey: 'test-service-role-key',
        },
        scheduling: {
          analysisIntervalHours: 24,
          updateIntervalHours: 24,
          maxMarketsPerCycle: 3,
        },
        quotas: {
          newsApiDailyQuota: 100,
          twitterApiDailyQuota: 500,
          redditApiDailyQuota: 60,
        },
        service: {
          healthCheckPort: 3000,
          enableManualTriggers: true,
          logLevel: 'info',
        },
      };

      expect(() => validateConfiguration(config)).not.toThrow();
    });

    it('should reject negative analysis interval', () => {
      const config: MonitorConfig = {
        database: {
          supabaseUrl: 'https://test.supabase.co',
          supabaseKey: 'test-anon-key',
          supabaseServiceRoleKey: 'test-service-role-key',
        },
        scheduling: {
          analysisIntervalHours: -1,
          updateIntervalHours: 24,
          maxMarketsPerCycle: 3,
        },
        quotas: {
          newsApiDailyQuota: 100,
          twitterApiDailyQuota: 500,
          redditApiDailyQuota: 60,
        },
        service: {
          healthCheckPort: 3000,
          enableManualTriggers: true,
          logLevel: 'info',
        },
      };

      expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
    });

    it('should reject zero max markets per cycle', () => {
      const config: MonitorConfig = {
        database: {
          supabaseUrl: 'https://test.supabase.co',
          supabaseKey: 'test-anon-key',
          supabaseServiceRoleKey: 'test-service-role-key',
        },
        scheduling: {
          analysisIntervalHours: 24,
          updateIntervalHours: 24,
          maxMarketsPerCycle: 0,
        },
        quotas: {
          newsApiDailyQuota: 100,
          twitterApiDailyQuota: 500,
          redditApiDailyQuota: 60,
        },
        service: {
          healthCheckPort: 3000,
          enableManualTriggers: true,
          logLevel: 'info',
        },
      };

      expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
    });

    it('should reject invalid log level', () => {
      const config: any = {
        database: {
          supabaseUrl: 'https://test.supabase.co',
          supabaseKey: 'test-anon-key',
          supabaseServiceRoleKey: 'test-service-role-key',
        },
        scheduling: {
          analysisIntervalHours: 24,
          updateIntervalHours: 24,
          maxMarketsPerCycle: 3,
        },
        quotas: {
          newsApiDailyQuota: 100,
          twitterApiDailyQuota: 500,
          redditApiDailyQuota: 60,
        },
        service: {
          healthCheckPort: 3000,
          enableManualTriggers: true,
          logLevel: 'invalid',
        },
      };

      expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
    });

    it('should reject negative health check port', () => {
      const config: MonitorConfig = {
        database: {
          supabaseUrl: 'https://test.supabase.co',
          supabaseKey: 'test-anon-key',
          supabaseServiceRoleKey: 'test-service-role-key',
        },
        scheduling: {
          analysisIntervalHours: 24,
          updateIntervalHours: 24,
          maxMarketsPerCycle: 3,
        },
        quotas: {
          newsApiDailyQuota: 100,
          twitterApiDailyQuota: 500,
          redditApiDailyQuota: 60,
        },
        service: {
          healthCheckPort: -1,
          enableManualTriggers: true,
          logLevel: 'info',
        },
      };

      expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
    });

    it('should reject invalid URL format', () => {
      const config: MonitorConfig = {
        database: {
          supabaseUrl: 'not-a-valid-url',
          supabaseKey: 'test-anon-key',
          supabaseServiceRoleKey: 'test-service-role-key',
        },
        scheduling: {
          analysisIntervalHours: 24,
          updateIntervalHours: 24,
          maxMarketsPerCycle: 3,
        },
        quotas: {
          newsApiDailyQuota: 100,
          twitterApiDailyQuota: 500,
          redditApiDailyQuota: 60,
        },
        service: {
          healthCheckPort: 3000,
          enableManualTriggers: true,
          logLevel: 'info',
        },
      };

      expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
    });
  });

  describe('Default values', () => {
    it('should return default configuration', () => {
      const defaults = getDefaultConfig();

      expect(defaults.scheduling?.analysisIntervalHours).toBe(24);
      expect(defaults.scheduling?.updateIntervalHours).toBe(24);
      expect(defaults.scheduling?.maxMarketsPerCycle).toBe(3);
      expect(defaults.quotas?.newsApiDailyQuota).toBe(100);
      expect(defaults.quotas?.twitterApiDailyQuota).toBe(500);
      expect(defaults.quotas?.redditApiDailyQuota).toBe(60);
      expect(defaults.service?.healthCheckPort).toBe(3000);
      expect(defaults.service?.enableManualTriggers).toBe(true);
      expect(defaults.service?.logLevel).toBe('info');
    });

    it('should not include required fields in defaults', () => {
      const defaults = getDefaultConfig();

      expect(defaults.database).toBeUndefined();
    });
  });

  describe('Invalid configuration handling', () => {
    it('should provide helpful error message for missing required fields', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      // Missing SUPABASE_KEY and SUPABASE_SERVICE_ROLE_KEY

      try {
        loadConfiguration();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Configuration validation failed');
        // Should mention at least one of the missing required fields
        const message = (error as Error).message;
        const hasMissingField = message.includes('database.supabaseKey') || 
                                message.includes('database.supabaseServiceRoleKey');
        expect(hasMissingField).toBe(true);
      }
    });

    it('should provide helpful error message for invalid values', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
      process.env.ANALYSIS_INTERVAL_HOURS = '-5';

      try {
        loadConfiguration();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('Configuration validation failed');
      }
    });

    it('should handle non-numeric environment variables gracefully', () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
      process.env.ANALYSIS_INTERVAL_HOURS = 'not-a-number';

      // parseInt returns NaN for invalid input, which should fail validation
      expect(() => loadConfiguration()).toThrow(/Configuration validation failed/);
    });
  });
});
