#!/usr/bin/env node
/**
 * Environment Variable Validation Script
 * 
 * Standalone script to validate environment variables without starting the monitor.
 * Useful for checking configuration before deployment.
 * 
 * Usage:
 *   npm run validate:env
 *   tsx src/validate-env.ts
 */

import { config } from 'dotenv';
import { validateMonitorEnv, printValidationResult } from './utils/env-validator.js';

// Load .env file
config();

async function main(): Promise<void> {
  const result = validateMonitorEnv();
  printValidationResult(result);
  
  if (!result.valid) {
    console.error('Environment validation failed. Please fix the errors above.');
    process.exit(1);
  }
  
  console.log('✓ Environment is properly configured for the monitor');
  process.exit(0);
}

main().catch((error) => {
  console.error('Fatal error during validation:', error);
  process.exit(1);
});
