/**
 * Enhanced Event-Based Polymarket Client Integration Tests
 *
 * Integration tests that verify the enhanced client works with the real Polymarket API.
 * These tests are designed to validate the actual API integration.
 */

import { describe, it, expect } from 'vitest';
import { EnhancedEventPolymarketClient } from './enhanced-event-polymarket-client.js';

// Mock configuration for integration testing
const integrationConfig = {
  gammaApiUrl: 'https://gamma-api.polymarket.com',
  clobApiUrl: 'https://clob.polymarket.com',
  rateLimitBuffer: 80,
  politicsTagId: 2,
  eventsApiEndpoint: '/events',
  includeRelatedTags: true,
  maxEventsPerDiscovery: 5, // Small number for testing
  maxMarketsPerEvent: 50,
  defaultSortBy: 'volume24hr' as const,
  enableCrossMarketAnalysis: true,
  correlationThreshold: 0.3,
  arbitrageThreshold: 0.05,
  eventsApiRateLimit: 500,
  eventCacheTTL: 300,
  marketCacheTTL: 300,
  tagCacheTTL: 3600,
  correlationCacheTTL: 1800,
  enableEventBasedKeywords: true,
  enableMultiMarketAnalysis: true,
  enableCrossMarketCorrelation: true,
  enableArbitrageDetection: true,
  enableEventLevelIntelligence: true,
  maxRetries: 3,
  circuitBreakerThreshold: 5,
  fallbackToCache: true,
  enableGracefulDegradation: true,
  keywordExtractionMode: 'event_priority' as const,
  correlationAnalysisDepth: 'basic' as const,
  riskAssessmentLevel: 'moderate' as const,
};

describe('EnhancedEventPolymarketClient Integration Tests', () => {
  let client: EnhancedEventPolymarketClient;

  beforeEach(() => {
    client = new EnhancedEventPolymarketClient(integrationConfig);
  });

  it('should successfully discover political events from real API', async () => {
    const events = await client.discoverPoliticalEvents({ limit: 3 });

    expect(events).toBeDefined();
    expect(Array.isArray(events)).toBe(true);
    
    if (events.length > 0) {
      const event = events[0];
      
      // Log the event structure for debugging
      console.log('Event tags:', event.tags.map(tag => ({ id: tag.id, label: tag.label })));
      
      // Verify event structure
      expect(event.id).toBeDefined();
      expect(event.title).toBeDefined();
      expect(event.slug).toBeDefined();
      expect(Array.isArray(event.markets)).toBe(true);
      expect(Array.isArray(event.tags)).toBe(true);
      
      // Check if any political-related tags are present (more flexible check)
      const hasPoliticalTag = event.tags.some(tag => 
        tag.label.toLowerCase().includes('politic') || 
        tag.id === 2 || 
        tag.slug.includes('politic')
      );
      expect(hasPoliticalTag).toBe(true);
      
      // If event has markets, verify market structure
      if (event.markets.length > 0) {
        const market = event.markets[0];
        expect(market.id).toBeDefined();
        expect(market.question).toBeDefined();
        expect(market.conditionId).toBeDefined();
      }
    }
  }, 30000); // 30 second timeout for API calls

  it('should successfully fetch events by tag', async () => {
    const events = await client.fetchEventsByTag(2, { limit: 2 }); // Politics tag

    expect(events).toBeDefined();
    expect(Array.isArray(events)).toBe(true);
    
    if (events.length > 0) {
      const event = events[0];
      expect(event.id).toBeDefined();
      expect(event.title).toBeDefined();
      
      // Log tags for debugging
      console.log('Event tags by tag filter:', event.tags.map(tag => ({ id: tag.id, label: tag.label })));
      
      // More flexible check for political content
      const hasPoliticalTag = event.tags.some(tag => 
        tag.label.toLowerCase().includes('politic') || 
        tag.id === 2 || 
        tag.slug.includes('politic')
      );
      expect(hasPoliticalTag).toBe(true);
    }
  }, 30000);

  it('should successfully check API health', async () => {
    const health = await client.checkEventsApiHealth();

    expect(health).toBeDefined();
    expect(health.healthy).toBeDefined();
    expect(health.responseTime).toBeGreaterThanOrEqual(0);
    expect(health.timestamp).toBeGreaterThan(0);
  }, 10000);

  it('should provide rate limit status', () => {
    const status = client.getRateLimitStatus();

    expect(status).toBeDefined();
    expect(status.tokensRemaining).toBeGreaterThanOrEqual(0);
    expect(status.resetTime).toBeGreaterThanOrEqual(Date.now());
    expect(status.requestsInWindow).toBeGreaterThanOrEqual(0);
    expect(status.windowSizeMs).toBe(10000);
  });

  it('should handle enhanced event analysis when event has multiple markets', async () => {
    const events = await client.discoverPoliticalEvents({ limit: 5 });
    
    // Find an event with multiple markets
    const multiMarketEvent = events.find(event => event.markets.length > 1);
    
    if (multiMarketEvent) {
      const enhancedEvent = await client.fetchEventWithAllMarkets(multiMarketEvent.id);
      
      expect(enhancedEvent).toBeDefined();
      expect(enhancedEvent.event).toBeDefined();
      expect(enhancedEvent.markets).toBeDefined();
      expect(enhancedEvent.eventLevelMetrics).toBeDefined();
      expect(enhancedEvent.crossMarketCorrelations).toBeDefined();
      
      // Verify metrics calculation
      expect(enhancedEvent.eventLevelMetrics.marketCount).toBe(enhancedEvent.markets.length);
      expect(enhancedEvent.eventLevelMetrics.totalVolume).toBeGreaterThanOrEqual(0);
      expect(enhancedEvent.eventLevelMetrics.totalLiquidity).toBeGreaterThanOrEqual(0);
    }
  }, 30000);
});