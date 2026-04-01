/**
 * Smoke test for tool registry
 *
 * This test verifies that the tool registry exports work correctly
 * and that tools can be created with proper structure.
 */

import { describe, it, expect } from 'vitest';
import { createPollingTools } from './index.js';
import type { ToolContext } from './index.js';
import { ToolCache } from '../utils/tool-cache.js';
import { createPolymarketClient } from '../utils/polymarket-client.js';
import type { EngineConfig } from '../config/index.js';

describe('Tool Registry', () => {
  // Create a minimal test config to avoid environment issues
  const testPolymarketConfig: EngineConfig['polymarket'] = {
    gammaApiUrl: 'https://gamma-api.polymarket.com',
    clobApiUrl: 'https://clob.polymarket.com',
    rateLimitBuffer: 80,
    politicsTagId: 2,
    eventsApiEndpoint: '/events',
    includeRelatedTags: true,
    maxEventsPerDiscovery: 20,
    maxMarketsPerEvent: 50,
    defaultSortBy: 'volume24hr',
    enableCrossMarketAnalysis: true,
    correlationThreshold: 0.3,
    arbitrageThreshold: 0.05,
    eventsApiRateLimit: 500,
    maxRequestsPerMinute: 60,
    rateLimitWindowMs: 60000,
    eventCacheTTL: 300,
    marketCacheTTL: 300,
    tagCacheTTL: 3600,
    correlationCacheTTL: 1800,
    enableEventBasedKeywords: true,
    enableMultiMarketAnalysis: true,
    enableCrossMarketCorrelation: true,
    enableArbitrageDetection: true,
    enableEventLevelIntelligence: true,
    enableEnhancedEventDiscovery: true,
    enableMultiMarketFiltering: true,
    enableEventRankingAlgorithm: true,
    enableCrossMarketOpportunities: true,
    maxRetries: 3,
    circuitBreakerThreshold: 5,
    fallbackToCache: true,
    enableGracefulDegradation: true,
    keywordExtractionMode: 'event_priority',
    correlationAnalysisDepth: 'basic',
    riskAssessmentLevel: 'moderate',
    environment: 'development',
    environmentConfigs: {},
  };

  it('should export createPollingTools function', () => {
    expect(createPollingTools).toBeDefined();
    expect(typeof createPollingTools).toBe('function');
  });

  it('should create an array of tools', () => {
    const polymarketClient = createPolymarketClient(testPolymarketConfig);
    const cache = new ToolCache('test-session');
    const auditLog: any[] = [];

    const context: ToolContext = {
      polymarketClient,
      cache,
      auditLog,
    };

    const tools = createPollingTools(context);

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(5);
  });

  it('should create tools with correct names', () => {
    const polymarketClient = createPolymarketClient(testPolymarketConfig);
    const cache = new ToolCache('test-session');
    const auditLog: any[] = [];

    const context: ToolContext = {
      polymarketClient,
      cache,
      auditLog,
    };

    const tools = createPollingTools(context);
    const toolNames = tools.map(tool => tool.name);

    expect(toolNames).toContain('fetchRelatedMarkets');
    expect(toolNames).toContain('fetchHistoricalPrices');
    expect(toolNames).toContain('fetchCrossMarketData');
    expect(toolNames).toContain('analyzeMarketMomentum');
    expect(toolNames).toContain('detectSentimentShifts');
  });

  it('should create tools with descriptions', () => {
    const polymarketClient = createPolymarketClient(testPolymarketConfig);
    const cache = new ToolCache('test-session');
    const auditLog: any[] = [];

    const context: ToolContext = {
      polymarketClient,
      cache,
      auditLog,
    };

    const tools = createPollingTools(context);

    for (const tool of tools) {
      expect(tool.description).toBeDefined();
      expect(typeof tool.description).toBe('string');
      expect(tool.description.length).toBeGreaterThan(0);
    }
  });

  it('should create tools with schemas', () => {
    const polymarketClient = createPolymarketClient(testPolymarketConfig);
    const cache = new ToolCache('test-session');
    const auditLog: any[] = [];

    const context: ToolContext = {
      polymarketClient,
      cache,
      auditLog,
    };

    const tools = createPollingTools(context);

    for (const tool of tools) {
      expect(tool.schema).toBeDefined();
      expect(typeof tool.schema).toBe('object');
    }
  });

  it('should create tools with func property', () => {
    const polymarketClient = createPolymarketClient(testPolymarketConfig);
    const cache = new ToolCache('test-session');
    const auditLog: any[] = [];

    const context: ToolContext = {
      polymarketClient,
      cache,
      auditLog,
    };

    const tools = createPollingTools(context);

    for (const tool of tools) {
      expect(tool.func).toBeDefined();
      expect(typeof tool.func).toBe('function');
    }
  });
});
