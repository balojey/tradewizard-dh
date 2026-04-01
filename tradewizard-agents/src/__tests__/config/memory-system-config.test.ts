/**
 * Unit tests for Memory System Configuration
 *
 * Tests the memory system feature flag and configuration options
 * to ensure they are properly loaded from environment variables.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConfig } from './index.js';
import type { EngineConfig } from './index.js';

describe('Memory System Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set required environment variables for tests
    process.env.POLYMARKET_ENVIRONMENT = 'development';
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Feature Flag', () => {
    it('should default to disabled when not set', () => {
      delete process.env.MEMORY_SYSTEM_ENABLED;

      const config = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
      });

      expect(config.memorySystem.enabled).toBe(false);
    });

    it('should enable when set to true', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'true';

      const config = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
      });

      expect(config.memorySystem.enabled).toBe(true);
    });

    it('should remain disabled when set to false', () => {
      process.env.MEMORY_SYSTEM_ENABLED = 'false';

      const config = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
      });

      expect(config.memorySystem.enabled).toBe(false);
    });
  });

  describe('Configuration Parameters', () => {
    it('should use default values when not set', () => {
      delete process.env.MEMORY_SYSTEM_MAX_SIGNALS_PER_AGENT;
      delete process.env.MEMORY_SYSTEM_QUERY_TIMEOUT_MS;
      delete process.env.MEMORY_SYSTEM_RETRY_ATTEMPTS;

      const config = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
      });

      expect(config.memorySystem.maxSignalsPerAgent).toBe(3);
      expect(config.memorySystem.queryTimeoutMs).toBe(5000);
      expect(config.memorySystem.retryAttempts).toBe(3);
    });

    it('should load custom maxSignalsPerAgent', () => {
      process.env.MEMORY_SYSTEM_MAX_SIGNALS_PER_AGENT = '5';

      const config = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
      });

      expect(config.memorySystem.maxSignalsPerAgent).toBe(5);
    });

    it('should load custom queryTimeoutMs', () => {
      process.env.MEMORY_SYSTEM_QUERY_TIMEOUT_MS = '10000';

      const config = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
      });

      expect(config.memorySystem.queryTimeoutMs).toBe(10000);
    });

    it('should load custom retryAttempts', () => {
      process.env.MEMORY_SYSTEM_RETRY_ATTEMPTS = '5';

      const config = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
      });

      expect(config.memorySystem.retryAttempts).toBe(5);
    });

    it('should validate maxSignalsPerAgent range (1-10)', () => {
      // Test minimum boundary
      const config1 = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
        memorySystem: {
          enabled: false,
          maxSignalsPerAgent: 1,
          queryTimeoutMs: 5000,
          retryAttempts: 3,
        },
      });
      expect(config1.memorySystem.maxSignalsPerAgent).toBe(1);

      // Test maximum boundary
      const config2 = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
        memorySystem: {
          enabled: false,
          maxSignalsPerAgent: 10,
          queryTimeoutMs: 5000,
          retryAttempts: 3,
        },
      });
      expect(config2.memorySystem.maxSignalsPerAgent).toBe(10);
    });

    it('should validate retryAttempts range (0-5)', () => {
      // Test minimum boundary
      const config1 = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
        memorySystem: {
          enabled: false,
          maxSignalsPerAgent: 3,
          queryTimeoutMs: 5000,
          retryAttempts: 0,
        },
      });
      expect(config1.memorySystem.retryAttempts).toBe(0);

      // Test maximum boundary
      const config2 = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
        memorySystem: {
          enabled: false,
          maxSignalsPerAgent: 3,
          queryTimeoutMs: 5000,
          retryAttempts: 5,
        },
      });
      expect(config2.memorySystem.retryAttempts).toBe(5);
    });
  });

  describe('Configuration Override', () => {
    it('should allow overriding memory system configuration', () => {
      const config = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
        memorySystem: {
          enabled: true,
          maxSignalsPerAgent: 7,
          queryTimeoutMs: 8000,
          retryAttempts: 4,
        },
      });

      expect(config.memorySystem.enabled).toBe(true);
      expect(config.memorySystem.maxSignalsPerAgent).toBe(7);
      expect(config.memorySystem.queryTimeoutMs).toBe(8000);
      expect(config.memorySystem.retryAttempts).toBe(4);
    });
  });

  describe('Type Safety', () => {
    it('should have correct TypeScript types', () => {
      const config: EngineConfig = createConfig({
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          environment: 'development' as const,
          eventsApiEndpoint: '',
          includeRelatedTags: false,
          maxEventsPerDiscovery: 0,
          maxMarketsPerEvent: 0,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: false,
          correlationThreshold: 0,
          arbitrageThreshold: 0,
          eventsApiRateLimit: 0,
          maxRequestsPerMinute: 0,
          rateLimitWindowMs: 0,
          eventCacheTTL: 0,
          marketCacheTTL: 0,
          tagCacheTTL: 0,
          correlationCacheTTL: 0,
          enableEventBasedKeywords: false,
          enableMultiMarketAnalysis: false,
          enableCrossMarketCorrelation: false,
          enableArbitrageDetection: false,
          enableEventLevelIntelligence: false,
          enableEnhancedEventDiscovery: false,
          enableMultiMarketFiltering: false,
          enableEventRankingAlgorithm: false,
          enableCrossMarketOpportunities: false,
          maxRetries: 0,
          circuitBreakerThreshold: 0,
          fallbackToCache: false,
          enableGracefulDegradation: false,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'conservative',
          environmentConfigs: { development: { eventsApiRateLimit: 100, maxRequestsPerMinute: 60, eventCacheTTL: 300, enableDebugLogging: false, enableMockData: false } },
        },
        llm: {
          openai: {
            apiKey: 'test-key',
            defaultModel: 'gpt-4',
          },
        },
      });

      // Type assertions to verify structure
      const memoryConfig = config.memorySystem;
      expect(typeof memoryConfig.enabled).toBe('boolean');
      expect(typeof memoryConfig.maxSignalsPerAgent).toBe('number');
      expect(typeof memoryConfig.queryTimeoutMs).toBe('number');
      expect(typeof memoryConfig.retryAttempts).toBe('number');
    });
  });
});
