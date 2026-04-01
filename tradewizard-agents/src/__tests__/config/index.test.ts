/**
 * Unit tests for configuration error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Configuration Error Handling', () => {
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

  describe('Configuration validation', () => {
    it('should load valid configuration', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      // Dynamically import to get fresh config
      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config).toBeDefined();
      expect(config.llm.openai).toBeDefined();
      expect(config.llm.openai!.apiKey).toBe('test-key');
    });

    it('should handle missing API keys gracefully', async () => {
      // No API keys set
      delete process.env.OPENAI_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.GOOGLE_API_KEY;

      const { loadConfig } = await import('./index.js');
      expect(() => loadConfig()).toThrow();
    });

    it('should validate single-provider mode', async () => {
      process.env.LLM_SINGLE_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.llm.singleProvider).toBe('openai');
      expect(config.llm.openai).toBeDefined();
    });

    it('should reject single-provider mode without provider configured', async () => {
      process.env.LLM_SINGLE_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;

      const { loadConfig } = await import('./index.js');
      expect(() => loadConfig()).toThrow();
    });
  });

  describe('Agent group validation', () => {
    it('should disable event intelligence when news not configured', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.ADVANCED_AGENTS_EVENT_INTELLIGENCE_ENABLED = 'true';
      process.env.EXTERNAL_DATA_NEWS_PROVIDER = 'none';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.advancedAgents.eventIntelligence.enabled).toBe(false);
    });

    it('should disable polling agents when polling not configured', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.ADVANCED_AGENTS_POLLING_STATISTICAL_ENABLED = 'true';
      process.env.EXTERNAL_DATA_POLLING_PROVIDER = 'none';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.advancedAgents.pollingStatistical.enabled).toBe(false);
    });

    it('should disable sentiment agents when no data sources configured', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.ADVANCED_AGENTS_SENTIMENT_NARRATIVE_ENABLED = 'true';
      process.env.EXTERNAL_DATA_NEWS_PROVIDER = 'none';
      process.env.EXTERNAL_DATA_SOCIAL_PROVIDERS = '';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.advancedAgents.sentimentNarrative.enabled).toBe(false);
    });

    it('should allow event intelligence when news configured', async () => {
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.ADVANCED_AGENTS_EVENT_INTELLIGENCE_ENABLED = 'true';
      process.env.EXTERNAL_DATA_NEWS_PROVIDER = 'newsapi';
      process.env.EXTERNAL_DATA_NEWS_API_KEY = 'news-key';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.advancedAgents.eventIntelligence.enabled).toBe(true);
    });
  });

  describe('Environment-specific configuration', () => {
    it('should load development environment configuration', async () => {
      process.env.NODE_ENV = 'development';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.POLYMARKET_DEV_EVENTS_API_RATE_LIMIT = '150';
      process.env.POLYMARKET_DEV_ENABLE_DEBUG_LOGGING = 'true';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.polymarket.environment).toBe('development');
      expect(config.polymarket.environmentConfigs?.development?.eventsApiRateLimit).toBe(150);
      expect(config.polymarket.environmentConfigs?.development?.enableDebugLogging).toBe(true);
    });

    it('should load staging environment configuration', async () => {
      process.env.NODE_ENV = 'staging';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.POLYMARKET_STAGING_EVENTS_API_RATE_LIMIT = '350';
      process.env.POLYMARKET_STAGING_ENABLE_DEBUG_LOGGING = 'false';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.polymarket.environment).toBe('staging');
      expect(config.polymarket.environmentConfigs?.staging?.eventsApiRateLimit).toBe(350);
      expect(config.polymarket.environmentConfigs?.staging?.enableDebugLogging).toBe(false);
    });

    it('should load production environment configuration', async () => {
      process.env.NODE_ENV = 'production';
      process.env.OPENAI_API_KEY = 'test-key';
      process.env.POLYMARKET_PROD_EVENTS_API_RATE_LIMIT = '600';
      process.env.POLYMARKET_PROD_ENABLE_DEBUG_LOGGING = 'false';

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.polymarket.environment).toBe('production');
      expect(config.polymarket.environmentConfigs?.production?.eventsApiRateLimit).toBe(600);
      expect(config.polymarket.environmentConfigs?.production?.enableDebugLogging).toBe(false);
    });

    it('should use environment defaults when specific env vars not set', async () => {
      process.env.NODE_ENV = 'development';
      process.env.OPENAI_API_KEY = 'test-key';
      // Don't set specific dev environment variables

      const { loadConfig } = await import('./index.js');
      const config = loadConfig();

      expect(config.polymarket.environment).toBe('development');
      expect(config.polymarket.environmentConfigs?.development?.eventsApiRateLimit).toBe(100);
      expect(config.polymarket.environmentConfigs?.development?.enableDebugLogging).toBe(true);
    });

    it('should validate environment configuration', async () => {
      process.env.NODE_ENV = 'production';
      process.env.OPENAI_API_KEY = 'test-key';

      const { loadConfig, validateEnvironmentConfig } = await import('./index.js');
      const config = loadConfig();
      const validation = validateEnvironmentConfig(config);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid production configuration', async () => {
      process.env.NODE_ENV = 'production';
      process.env.OPENAI_API_KEY = 'test-key';

      const { createConfig, validateEnvironmentConfig } = await import('./index.js');
      const config = createConfig({
        polymarket: {
          environment: 'production',
          environmentConfigs: {
            production: {
              eventsApiRateLimit: 50, // Too low for production
              enableDebugLogging: true, // Should be false in production
              enableMockData: true, // Should be false in production
            },
          },
        },
      });

      const validation = validateEnvironmentConfig(config);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Debug logging should be disabled in production environment');
      expect(validation.errors).toContain('Mock data should be disabled in production environment');
      expect(validation.errors).toContain('Production events API rate limit seems too low: 50');
    });

    it('should get current environment configuration', async () => {
      process.env.NODE_ENV = 'staging';
      process.env.OPENAI_API_KEY = 'test-key';

      const { loadConfig, getCurrentEnvironmentConfig } = await import('./index.js');
      const config = loadConfig();
      const envConfig = getCurrentEnvironmentConfig(config);

      expect(envConfig.eventsApiRateLimit).toBe(300); // Staging default
      expect(envConfig.enableDebugLogging).toBe(false); // Staging default
    });
  });

  describe('Configuration overrides', () => {
    it('should apply configuration overrides', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const { createConfig } = await import('./index.js');
      const config = createConfig({
        opik: {
          projectName: 'custom-project',
        },
      });

      expect(config.opik.projectName).toBe('custom-project');
    });

    it('should validate overridden configuration', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const { createConfig } = await import('./index.js');
      expect(() =>
        createConfig({
          agents: {
            timeoutMs: -1000, // Invalid
            minAgentsRequired: 2,
          },
        })
      ).toThrow();
    });

    it('should merge nested configuration correctly', async () => {
      process.env.OPENAI_API_KEY = 'test-key';

      const { createConfig } = await import('./index.js');
      const config = createConfig({
        advancedAgents: {
          eventIntelligence: {
            enabled: false, // Disabled, so no data source needed
            breakingNews: false,
          },
        },
      });

      expect(config.advancedAgents.eventIntelligence.enabled).toBe(false);
      expect(config.advancedAgents.eventIntelligence.breakingNews).toBe(false);
      // Other fields should remain at defaults
      expect(config.advancedAgents.pollingStatistical.enabled).toBe(false);
    });
  });
});
