/**
 * Environment Variable Validator
 * 
 * Validates that all required environment variables are present and valid
 * before starting the monitor service.
 * 
 * This prevents runtime errors and provides clear feedback about missing configuration.
 */

import { z } from 'zod';

/**
 * Required environment variables for the monitor
 */
const MonitorEnvSchema = z.object({
  // Supabase (REQUIRED)
  SUPABASE_URL: z.string().url('SUPABASE_URL must be a valid URL'),
  SUPABASE_KEY: z.string().min(1, 'SUPABASE_KEY is required (anon key)'),
  
  // Polymarket (REQUIRED)
  POLYMARKET_GAMMA_API_URL: z.string().url('POLYMARKET_GAMMA_API_URL must be a valid URL'),
  POLYMARKET_CLOB_API_URL: z.string().url('POLYMARKET_CLOB_API_URL must be a valid URL'),
  
  // LLM Provider (at least one REQUIRED)
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  
  // AWS Credentials (for Nova)
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().optional(),
  
  // LLM Configuration
  LLM_SINGLE_PROVIDER: z.enum(['openai', 'anthropic', 'google', 'nova']).optional(),
  OPENAI_DEFAULT_MODEL: z.string().optional(),
  ANTHROPIC_DEFAULT_MODEL: z.string().optional(),
  GOOGLE_DEFAULT_MODEL: z.string().optional(),
  NOVA_MODEL_NAME: z.string().optional(),
  
  // News API Configuration
  NEWS_API_PROVIDER: z.enum(['newsapi', 'newsdata']).optional(),
  NEWS_API_KEY: z.string().optional(),
  NEWSDATA_API_KEY: z.string().optional(),
  NEWSDATA_ENABLED: z.string().optional(),
  
  // News Migration Configuration
  NEWS_MIGRATION_ENABLED: z.string().optional(),
  NEWS_MIGRATION_STRATEGY: z.enum(['newsapi-only', 'newsdata-only', 'dual-provider', 'gradual-migration']).optional(),
  NEWS_MIGRATION_PERCENTAGE: z.string().regex(/^\d+$/, 'NEWS_MIGRATION_PERCENTAGE must be a number').optional(),
  NEWS_MIGRATION_FALLBACK_ENABLED: z.string().optional(),
  
  // Monitor Configuration (REQUIRED)
  ANALYSIS_INTERVAL_HOURS: z.string().regex(/^\d+$/, 'ANALYSIS_INTERVAL_HOURS must be a number'),
  UPDATE_INTERVAL_HOURS: z.string().regex(/^\d+$/, 'UPDATE_INTERVAL_HOURS must be a number'),
  MAX_MARKETS_PER_CYCLE: z.string().regex(/^\d+$/, 'MAX_MARKETS_PER_CYCLE must be a number'),
  
  // Health Check Configuration
  HEALTH_CHECK_PORT: z.string().regex(/^\d+$/, 'HEALTH_CHECK_PORT must be a number').optional(),
  ENABLE_MANUAL_TRIGGERS: z.string().optional(),
  
  // Optional but recommended
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  OPIK_API_KEY: z.string().optional(),
  NODE_ENV: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
}).refine(
  (data) => {
    // At least one LLM provider must be configured
    return !!(data.OPENAI_API_KEY || data.ANTHROPIC_API_KEY || data.GOOGLE_API_KEY || 
              (data.AWS_ACCESS_KEY_ID && data.AWS_SECRET_ACCESS_KEY && data.AWS_REGION));
  },
  {
    message: 'At least one LLM provider API key is required (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, or AWS credentials for Nova)',
  }
).refine(
  (data) => {
    // If single provider mode is set, that provider must be configured
    if (data.LLM_SINGLE_PROVIDER === 'openai' && !data.OPENAI_API_KEY) {
      return false;
    }
    if (data.LLM_SINGLE_PROVIDER === 'anthropic' && !data.ANTHROPIC_API_KEY) {
      return false;
    }
    if (data.LLM_SINGLE_PROVIDER === 'google' && !data.GOOGLE_API_KEY) {
      return false;
    }
    if (data.LLM_SINGLE_PROVIDER === 'nova' && 
        !(data.AWS_ACCESS_KEY_ID && data.AWS_SECRET_ACCESS_KEY && data.AWS_REGION)) {
      return false;
    }
    return true;
  },
  {
    message: 'When LLM_SINGLE_PROVIDER is set, the corresponding API key/credentials must be configured',
  }
).refine(
  (data) => {
    // If migration is enabled, validate migration configuration
    if (data.NEWS_MIGRATION_ENABLED === 'true') {
      // Migration strategy must be set
      if (!data.NEWS_MIGRATION_STRATEGY) {
        return false;
      }
      
      // If using NewsData.io, API key must be provided
      if ((data.NEWS_MIGRATION_STRATEGY === 'newsdata-only' || 
           data.NEWS_MIGRATION_STRATEGY === 'dual-provider' || 
           data.NEWS_MIGRATION_STRATEGY === 'gradual-migration') && 
          !data.NEWSDATA_API_KEY) {
        return false;
      }
      
      // If using NewsAPI, API key must be provided
      if ((data.NEWS_MIGRATION_STRATEGY === 'newsapi-only' || 
           data.NEWS_MIGRATION_STRATEGY === 'dual-provider' || 
           data.NEWS_MIGRATION_STRATEGY === 'gradual-migration') && 
          !data.NEWS_API_KEY) {
        return false;
      }
      
      // Migration percentage must be valid
      if (data.NEWS_MIGRATION_PERCENTAGE) {
        const percentage = parseInt(data.NEWS_MIGRATION_PERCENTAGE, 10);
        if (percentage < 0 || percentage > 100) {
          return false;
        }
      }
    }
    
    return true;
  },
  {
    message: 'Invalid news migration configuration - check API keys and migration settings',
  }
);

export type MonitorEnv = z.infer<typeof MonitorEnvSchema>;

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  env?: MonitorEnv;
}

/**
 * Validate environment variables for the monitor
 * 
 * @returns Validation result with errors and warnings
 */
export function validateMonitorEnv(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Parse and validate environment variables
    const env = MonitorEnvSchema.parse(process.env);
    
    // Additional warnings for optional but recommended variables
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
      warnings.push('SUPABASE_SERVICE_ROLE_KEY not set - using anon key (may have limited permissions)');
    }
    
    if (!env.OPIK_API_KEY) {
      warnings.push('OPIK_API_KEY not set - LLM tracing and cost tracking will be disabled');
    }
    
    if (!env.NODE_ENV) {
      warnings.push('NODE_ENV not set - defaulting to development mode');
    }
    
    // News API configuration warnings
    if (!env.NEWS_API_KEY && !env.NEWSDATA_API_KEY) {
      warnings.push('No news API keys configured - news data will not be available');
    }
    
    if (env.NEWS_MIGRATION_ENABLED === 'true') {
      if (!env.NEWS_MIGRATION_STRATEGY) {
        warnings.push('NEWS_MIGRATION_ENABLED is true but NEWS_MIGRATION_STRATEGY not set');
      }
      
      if (env.NEWS_MIGRATION_STRATEGY === 'gradual-migration' && !env.NEWS_MIGRATION_PERCENTAGE) {
        warnings.push('Gradual migration enabled but NEWS_MIGRATION_PERCENTAGE not set - defaulting to 0%');
      }
    } else if (env.NEWSDATA_API_KEY && !env.NEWS_API_KEY) {
      warnings.push('NewsData.io API key configured but migration not enabled - consider enabling migration');
    }
    
    if (env.NEWSDATA_ENABLED === 'true' && !env.NEWSDATA_API_KEY) {
      warnings.push('NEWSDATA_ENABLED is true but NEWSDATA_API_KEY not set');
    }
    
    // Check if multiple LLM providers are configured (recommended for better quality)
    const llmProviders = [
      env.OPENAI_API_KEY ? 'OpenAI' : null,
      env.ANTHROPIC_API_KEY ? 'Anthropic' : null,
      env.GOOGLE_API_KEY ? 'Google' : null,
      (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) ? 'Nova' : null,
    ].filter(Boolean);
    
    if (llmProviders.length === 1 && !env.LLM_SINGLE_PROVIDER) {
      warnings.push(
        `Only one LLM provider configured (${llmProviders[0]}). ` +
        'Consider adding more providers for better quality or set LLM_SINGLE_PROVIDER to suppress this warning.'
      );
    }
    
    // Check interval values are reasonable
    const analysisInterval = parseInt(env.ANALYSIS_INTERVAL_HOURS, 10);
    if (analysisInterval < 1) {
      warnings.push('ANALYSIS_INTERVAL_HOURS is less than 1 hour - this may cause high API usage');
    }
    
    const maxMarkets = parseInt(env.MAX_MARKETS_PER_CYCLE, 10);
    if (maxMarkets > 5) {
      warnings.push('MAX_MARKETS_PER_CYCLE is greater than 5 - this may exceed API quotas');
    }
    
    return {
      valid: true,
      errors: [],
      warnings,
      env,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Extract error messages with field names
      for (const issue of error.issues) {
        const field = issue.path.join('.');
        const message = issue.message;
        
        // Make error messages more user-friendly
        if (issue.code === 'invalid_type' && 'received' in issue && issue.received === 'undefined') {
          errors.push(`${field} is required but not set`);
        } else {
          errors.push(`${field}: ${message}`);
        }
      }
    } else {
      errors.push(`Unexpected validation error: ${error}`);
    }
    
    return {
      valid: false,
      errors,
      warnings,
    };
  }
}

/**
 * Print validation results to console
 * 
 * @param result - Validation result
 */
export function printValidationResult(result: ValidationResult): void {
  console.log('='.repeat(80));
  console.log('Environment Variable Validation');
  console.log('='.repeat(80));
  console.log();
  
  if (result.valid) {
    console.log('✓ All required environment variables are present and valid');
    console.log();
    
    if (result.warnings.length > 0) {
      console.log('Warnings:');
      for (const warning of result.warnings) {
        console.log(`  ⚠ ${warning}`);
      }
      console.log();
    }
  } else {
    console.log('✗ Environment validation failed');
    console.log();
    console.log('Errors:');
    for (const error of result.errors) {
      console.log(`  ✗ ${error}`);
    }
    console.log();
    
    console.log('Please check your .env file and ensure all required variables are set.');
    console.log('See .env.monitor.example for a complete list of required variables.');
    console.log();
  }
  
  console.log('='.repeat(80));
  console.log();
}

/**
 * Validate environment and exit if invalid
 * 
 * This function validates the environment and exits the process if validation fails.
 * Use this at the start of the monitor to ensure all required variables are present.
 */
export function validateMonitorEnvOrExit(): MonitorEnv {
  const result = validateMonitorEnv();
  printValidationResult(result);
  
  if (!result.valid) {
    process.exit(1);
  }
  
  return result.env!;
}
