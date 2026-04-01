/**
 * Property-Based Tests for Monitor Configuration Validation
 *
 * Feature: automated-market-monitor, Property 10: Configuration validation
 * Validates: Requirements 8.3
 *
 * Property: For any invalid configuration (missing required variables, invalid values),
 * the system should log validation errors and exit with a non-zero code before starting
 * any operations.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateConfiguration } from './monitor-config.js';
import type { MonitorConfig } from './monitor-config.js';

describe('Monitor Configuration Property Tests', () => {
  /**
   * Generator for valid Supabase URLs
   */
  const validSupabaseUrlGen = fc.constantFrom(
    'https://test.supabase.co',
    'https://project.supabase.co',
    'https://my-project-123.supabase.co',
    'https://prod-db.supabase.co'
  );

  /**
   * Generator for invalid URLs (strings that fail URL parsing)
   */
  const invalidUrlGen = fc.constantFrom(
    'not-a-url',
    '',
    'just-text',
    '://missing-protocol',
    'http://',
    'https://'
  );

  /**
   * Generator for valid API keys (non-empty strings)
   */
  const validApiKeyGen = fc.string({ minLength: 1, maxLength: 100 });

  /**
   * Generator for invalid API keys (empty strings)
   */
  const invalidApiKeyGen = fc.constant('');

  /**
   * Generator for positive numbers
   */
  const positiveNumberGen = fc.integer({ min: 1, max: 10000 });

  /**
   * Generator for invalid numbers (zero or negative)
   */
  const invalidNumberGen = fc.integer({ min: -1000, max: 0 });

  /**
   * Generator for valid log levels
   */
  const validLogLevelGen = fc.constantFrom('debug', 'info', 'warn', 'error');

  /**
   * Property 10: Configuration validation
   *
   * For any configuration with invalid required fields, validation should fail
   * with a descriptive error message.
   */
  it('should reject configuration with invalid Supabase URL', () => {
    fc.assert(
      fc.property(
        invalidUrlGen,
        validApiKeyGen,
        validApiKeyGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        fc.boolean(),
        validLogLevelGen,
        (
          invalidUrl,
          key,
          serviceKey,
          analysisInterval,
          updateInterval,
          maxMarkets,
          newsQuota,
          twitterQuota,
          redditQuota,
          port,
          enableTriggers,
          logLevel
        ) => {
          const config: MonitorConfig = {
            database: {
              supabaseUrl: invalidUrl,
              supabaseKey: key,
              supabaseServiceRoleKey: serviceKey,
            },
            scheduling: {
              analysisIntervalHours: analysisInterval,
              updateIntervalHours: updateInterval,
              maxMarketsPerCycle: maxMarkets,
            },
            quotas: {
              newsApiDailyQuota: newsQuota,
              twitterApiDailyQuota: twitterQuota,
              redditApiDailyQuota: redditQuota,
            },
            service: {
              healthCheckPort: port,
              enableManualTriggers: enableTriggers,
              logLevel,
            },
          };

          // Should throw validation error
          expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject configuration with empty API keys', () => {
    fc.assert(
      fc.property(
        validSupabaseUrlGen,
        invalidApiKeyGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        fc.boolean(),
        validLogLevelGen,
        (
          url,
          invalidKey,
          analysisInterval,
          updateInterval,
          maxMarkets,
          newsQuota,
          twitterQuota,
          redditQuota,
          port,
          enableTriggers,
          logLevel
        ) => {
          const config: MonitorConfig = {
            database: {
              supabaseUrl: url,
              supabaseKey: invalidKey,
              supabaseServiceRoleKey: 'valid-service-key',
            },
            scheduling: {
              analysisIntervalHours: analysisInterval,
              updateIntervalHours: updateInterval,
              maxMarketsPerCycle: maxMarkets,
            },
            quotas: {
              newsApiDailyQuota: newsQuota,
              twitterApiDailyQuota: twitterQuota,
              redditApiDailyQuota: redditQuota,
            },
            service: {
              healthCheckPort: port,
              enableManualTriggers: enableTriggers,
              logLevel,
            },
          };

          // Should throw validation error
          expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject configuration with invalid scheduling intervals', () => {
    fc.assert(
      fc.property(
        validSupabaseUrlGen,
        validApiKeyGen,
        validApiKeyGen,
        invalidNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        fc.boolean(),
        validLogLevelGen,
        (
          url,
          key,
          serviceKey,
          invalidInterval,
          maxMarkets,
          newsQuota,
          twitterQuota,
          redditQuota,
          port,
          enableTriggers,
          logLevel
        ) => {
          const config: MonitorConfig = {
            database: {
              supabaseUrl: url,
              supabaseKey: key,
              supabaseServiceRoleKey: serviceKey,
            },
            scheduling: {
              analysisIntervalHours: invalidInterval,
              updateIntervalHours: 24,
              maxMarketsPerCycle: maxMarkets,
            },
            quotas: {
              newsApiDailyQuota: newsQuota,
              twitterApiDailyQuota: twitterQuota,
              redditApiDailyQuota: redditQuota,
            },
            service: {
              healthCheckPort: port,
              enableManualTriggers: enableTriggers,
              logLevel,
            },
          };

          // Should throw validation error
          expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject configuration with invalid max markets per cycle', () => {
    fc.assert(
      fc.property(
        validSupabaseUrlGen,
        validApiKeyGen,
        validApiKeyGen,
        positiveNumberGen,
        positiveNumberGen,
        invalidNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        fc.boolean(),
        validLogLevelGen,
        (
          url,
          key,
          serviceKey,
          analysisInterval,
          updateInterval,
          invalidMaxMarkets,
          newsQuota,
          twitterQuota,
          redditQuota,
          port,
          enableTriggers,
          logLevel
        ) => {
          const config: MonitorConfig = {
            database: {
              supabaseUrl: url,
              supabaseKey: key,
              supabaseServiceRoleKey: serviceKey,
            },
            scheduling: {
              analysisIntervalHours: analysisInterval,
              updateIntervalHours: updateInterval,
              maxMarketsPerCycle: invalidMaxMarkets,
            },
            quotas: {
              newsApiDailyQuota: newsQuota,
              twitterApiDailyQuota: twitterQuota,
              redditApiDailyQuota: redditQuota,
            },
            service: {
              healthCheckPort: port,
              enableManualTriggers: enableTriggers,
              logLevel,
            },
          };

          // Should throw validation error
          expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject configuration with invalid quota values', () => {
    fc.assert(
      fc.property(
        validSupabaseUrlGen,
        validApiKeyGen,
        validApiKeyGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        invalidNumberGen,
        positiveNumberGen,
        fc.boolean(),
        validLogLevelGen,
        (
          url,
          key,
          serviceKey,
          analysisInterval,
          updateInterval,
          maxMarkets,
          invalidQuota,
          port,
          enableTriggers,
          logLevel
        ) => {
          const config: MonitorConfig = {
            database: {
              supabaseUrl: url,
              supabaseKey: key,
              supabaseServiceRoleKey: serviceKey,
            },
            scheduling: {
              analysisIntervalHours: analysisInterval,
              updateIntervalHours: updateInterval,
              maxMarketsPerCycle: maxMarkets,
            },
            quotas: {
              newsApiDailyQuota: invalidQuota,
              twitterApiDailyQuota: 500,
              redditApiDailyQuota: 60,
            },
            service: {
              healthCheckPort: port,
              enableManualTriggers: enableTriggers,
              logLevel,
            },
          };

          // Should throw validation error
          expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject configuration with invalid health check port', () => {
    fc.assert(
      fc.property(
        validSupabaseUrlGen,
        validApiKeyGen,
        validApiKeyGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        invalidNumberGen,
        fc.boolean(),
        validLogLevelGen,
        (
          url,
          key,
          serviceKey,
          analysisInterval,
          updateInterval,
          maxMarkets,
          newsQuota,
          twitterQuota,
          redditQuota,
          invalidPort,
          enableTriggers,
          logLevel
        ) => {
          const config: MonitorConfig = {
            database: {
              supabaseUrl: url,
              supabaseKey: key,
              supabaseServiceRoleKey: serviceKey,
            },
            scheduling: {
              analysisIntervalHours: analysisInterval,
              updateIntervalHours: updateInterval,
              maxMarketsPerCycle: maxMarkets,
            },
            quotas: {
              newsApiDailyQuota: newsQuota,
              twitterApiDailyQuota: twitterQuota,
              redditApiDailyQuota: redditQuota,
            },
            service: {
              healthCheckPort: invalidPort,
              enableManualTriggers: enableTriggers,
              logLevel,
            },
          };

          // Should throw validation error
          expect(() => validateConfiguration(config)).toThrow(/Configuration validation failed/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: For any valid configuration, validation should succeed
   */
  it('should accept configuration with all valid values', () => {
    fc.assert(
      fc.property(
        validSupabaseUrlGen,
        validApiKeyGen,
        validApiKeyGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        positiveNumberGen,
        fc.boolean(),
        validLogLevelGen,
        (
          url,
          key,
          serviceKey,
          analysisInterval,
          updateInterval,
          maxMarkets,
          newsQuota,
          twitterQuota,
          redditQuota,
          port,
          enableTriggers,
          logLevel
        ) => {
          const config: MonitorConfig = {
            database: {
              supabaseUrl: url,
              supabaseKey: key,
              supabaseServiceRoleKey: serviceKey,
            },
            scheduling: {
              analysisIntervalHours: analysisInterval,
              updateIntervalHours: updateInterval,
              maxMarketsPerCycle: maxMarkets,
            },
            quotas: {
              newsApiDailyQuota: newsQuota,
              twitterApiDailyQuota: twitterQuota,
              redditApiDailyQuota: redditQuota,
            },
            service: {
              healthCheckPort: port,
              enableManualTriggers: enableTriggers,
              logLevel,
            },
          };

          // Should not throw - configuration is valid
          expect(() => validateConfiguration(config)).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });
});
