/**
 * Monitor Configuration Management
 *
 * Loads and validates configuration for the Automated Market Monitor service.
 * Handles environment variables, default values, and configuration validation.
 */

import { z } from 'zod';

/**
 * Monitor configuration schema
 */
const MonitorConfigSchema = z.object({
  // Database configuration
  database: z.object({
    supabaseUrl: z.string().url(),
    supabaseKey: z.string().min(1),
    supabaseServiceRoleKey: z.string().min(1),
  }),

  // Scheduling configuration
  scheduling: z.object({
    analysisIntervalHours: z.number().positive().default(24),
    updateIntervalHours: z.number().positive().default(24),
    maxMarketsPerCycle: z.number().positive().default(3),
  }),

  // API quota configuration
  quotas: z.object({
    newsApiDailyQuota: z.number().positive().default(100),
    twitterApiDailyQuota: z.number().positive().default(500),
    redditApiDailyQuota: z.number().positive().default(60),
  }),

  // Service configuration
  service: z.object({
    healthCheckPort: z.number().positive().default(3000),
    enableManualTriggers: z.boolean().default(true),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
});

export type MonitorConfig = z.infer<typeof MonitorConfigSchema>;

/**
 * Load and validate configuration from environment variables
 *
 * @throws {Error} If required configuration is missing or invalid
 * @returns Validated monitor configuration
 */
export function loadConfiguration(): MonitorConfig {
  console.log('[MonitorConfig] Loading configuration from environment variables');

  // Build configuration object from environment
  const config: MonitorConfig = {
    database: {
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseKey: process.env.SUPABASE_KEY || '',
      supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    },
    scheduling: {
      analysisIntervalHours: parseInt(process.env.ANALYSIS_INTERVAL_HOURS || '24', 10),
      updateIntervalHours: parseInt(process.env.UPDATE_INTERVAL_HOURS || '24', 10),
      maxMarketsPerCycle: parseInt(process.env.MAX_MARKETS_PER_CYCLE || '3', 10),
    },
    quotas: {
      newsApiDailyQuota: parseInt(process.env.NEWS_API_DAILY_QUOTA || '100', 10),
      twitterApiDailyQuota: parseInt(process.env.TWITTER_API_DAILY_QUOTA || '500', 10),
      redditApiDailyQuota: parseInt(process.env.REDDIT_API_DAILY_QUOTA || '60', 10),
    },
    service: {
      healthCheckPort: parseInt(process.env.HEALTH_CHECK_PORT || '3000', 10),
      enableManualTriggers: process.env.ENABLE_MANUAL_TRIGGERS !== 'false',
      logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    },
  };

  // Validate configuration
  try {
    const validated = validateConfiguration(config);
    logConfiguration(validated);
    return validated;
  } catch (error) {
    handleConfigurationError(error);
    throw error;
  }
}

/**
 * Validate configuration against schema
 *
 * @param config - Configuration to validate
 * @throws {Error} If configuration is invalid
 * @returns Validated configuration
 */
export function validateConfiguration(config: MonitorConfig): MonitorConfig {
  try {
    return MonitorConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((issue) => {
        const path = issue.path.join('.');
        return `  - ${path}: ${issue.message}`;
      });

      throw new Error(
        `Configuration validation failed:\n${errorMessages.join('\n')}\n\n` +
          'Please check your environment variables and ensure all required values are set correctly.'
      );
    }
    throw error;
  }
}

/**
 * Log configuration (excluding secrets)
 *
 * @param config - Configuration to log
 */
function logConfiguration(config: MonitorConfig): void {
  console.log('[MonitorConfig] Configuration loaded successfully:');
  console.log('  Database:');
  console.log(`    - Supabase URL: ${config.database.supabaseUrl}`);
  console.log(`    - Supabase Key: ${maskSecret(config.database.supabaseKey)}`);
  console.log(`    - Service Role Key: ${maskSecret(config.database.supabaseServiceRoleKey)}`);
  console.log('  Scheduling:');
  console.log(`    - Analysis Interval: ${config.scheduling.analysisIntervalHours}h`);
  console.log(`    - Update Interval: ${config.scheduling.updateIntervalHours}h`);
  console.log(`    - Max Markets Per Cycle: ${config.scheduling.maxMarketsPerCycle}`);
  console.log('  Quotas:');
  console.log(`    - NewsAPI Daily Quota: ${config.quotas.newsApiDailyQuota}`);
  console.log(`    - Twitter Daily Quota: ${config.quotas.twitterApiDailyQuota}`);
  console.log(`    - Reddit Daily Quota: ${config.quotas.redditApiDailyQuota}`);
  console.log('  Service:');
  console.log(`    - Health Check Port: ${config.service.healthCheckPort}`);
  console.log(`    - Enable Manual Triggers: ${config.service.enableManualTriggers}`);
  console.log(`    - Log Level: ${config.service.logLevel}`);
}

/**
 * Mask secret values for logging
 *
 * @param secret - Secret to mask
 * @returns Masked secret (shows first 4 and last 4 characters)
 */
function maskSecret(secret: string): string {
  if (secret.length <= 8) {
    return '***';
  }
  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

/**
 * Handle configuration errors
 *
 * @param error - Error to handle
 */
function handleConfigurationError(error: unknown): void {
  console.error('[MonitorConfig] Configuration error:');

  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error('Unknown configuration error:', error);
  }

  console.error('\nRequired environment variables:');
  console.error('  - SUPABASE_URL: Supabase project URL');
  console.error('  - SUPABASE_KEY: Supabase anon key');
  console.error('  - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key');
  console.error('\nOptional environment variables (with defaults):');
  console.error('  - ANALYSIS_INTERVAL_HOURS (default: 24)');
  console.error('  - UPDATE_INTERVAL_HOURS (default: 24)');
  console.error('  - MAX_MARKETS_PER_CYCLE (default: 3)');
  console.error('  - NEWS_API_DAILY_QUOTA (default: 100)');
  console.error('  - TWITTER_API_DAILY_QUOTA (default: 500)');
  console.error('  - REDDIT_API_DAILY_QUOTA (default: 60)');
  console.error('  - HEALTH_CHECK_PORT (default: 3000)');
  console.error('  - ENABLE_MANUAL_TRIGGERS (default: true)');
  console.error('  - LOG_LEVEL (default: info)');
}

/**
 * Get default configuration values
 *
 * Returns the default configuration without loading from environment variables.
 * Useful for testing or documentation purposes.
 *
 * @returns Default configuration object (partial, missing required fields)
 */
export function getDefaultConfig(): Partial<MonitorConfig> {
  return {
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
}
