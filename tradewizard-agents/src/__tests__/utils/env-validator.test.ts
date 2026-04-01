/**
 * Tests for Environment Variable Validator
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateMonitorEnv } from './env-validator.js';

describe('Environment Variable Validator', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment and clear all env vars
    originalEnv = { ...process.env };
    
    // Clear all environment variables that the validator checks
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_KEY;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.POLYMARKET_GAMMA_API_URL;
    delete process.env.POLYMARKET_CLOB_API_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.LLM_SINGLE_PROVIDER;
    delete process.env.OPENAI_DEFAULT_MODEL;
    delete process.env.ANTHROPIC_DEFAULT_MODEL;
    delete process.env.GOOGLE_DEFAULT_MODEL;
    delete process.env.ANALYSIS_INTERVAL_HOURS;
    delete process.env.UPDATE_INTERVAL_HOURS;
    delete process.env.MAX_MARKETS_PER_CYCLE;
    delete process.env.HEALTH_CHECK_PORT;
    delete process.env.ENABLE_MANUAL_TRIGGERS;
    delete process.env.OPIK_API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  it('should validate when all required variables are present', () => {
    // Set all required variables
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when SUPABASE_URL is missing', () => {
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('SUPABASE_URL'))).toBe(true);
  });

  it('should fail when SUPABASE_KEY is missing', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('SUPABASE_KEY'))).toBe(true);
  });

  it('should fail when no LLM provider is configured', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('LLM provider'))).toBe(true);
  });

  it('should fail when single provider mode is set but provider is not configured', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.LLM_SINGLE_PROVIDER = 'openai';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('LLM_SINGLE_PROVIDER'))).toBe(true);
  });

  it('should validate with single provider mode correctly configured', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.LLM_SINGLE_PROVIDER = 'openai';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should warn when SUPABASE_SERVICE_ROLE_KEY is not set', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('SUPABASE_SERVICE_ROLE_KEY'))).toBe(true);
  });

  it('should warn when only one LLM provider is configured without single provider mode', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('one LLM provider'))).toBe(true);
  });

  it('should fail when SUPABASE_URL is not a valid URL', () => {
    process.env.SUPABASE_URL = 'not-a-url';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('SUPABASE_URL'))).toBe(true);
  });

  it('should fail when interval hours are not numbers', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = 'not-a-number';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('ANALYSIS_INTERVAL_HOURS'))).toBe(true);
  });

  it('should warn when analysis interval is less than 1 hour', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '0';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '3';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('ANALYSIS_INTERVAL_HOURS'))).toBe(true);
  });

  it('should warn when max markets per cycle is greater than 5', () => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_KEY = 'test-key';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.ANALYSIS_INTERVAL_HOURS = '24';
    process.env.UPDATE_INTERVAL_HOURS = '24';
    process.env.MAX_MARKETS_PER_CYCLE = '10';

    const result = validateMonitorEnv();

    expect(result.valid).toBe(true);
    expect(result.warnings.some(w => w.includes('MAX_MARKETS_PER_CYCLE'))).toBe(true);
  });
});
