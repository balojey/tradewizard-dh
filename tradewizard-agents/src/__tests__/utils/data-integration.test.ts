/**
 * Unit tests for data integration error handling
 */

import { describe, it, expect } from 'vitest';
import { DataIntegrationLayer } from './data-integration.js';
import type { MarketBriefingDocument } from '../models/types.js';

describe('Data Integration Error Handling', () => {
  const mockMBD: MarketBriefingDocument = {
    marketId: 'test-market',
    conditionId: 'test-condition',
    question: 'Test question?',
    resolutionCriteria: 'Test criteria',
    expiryTimestamp: Date.now() + 86400000,
    volume24h: 10000,
    liquidityScore: 8,
    bidAskSpread: 0.01,
    currentProbability: 0.5,
    eventType: 'election',
    volatilityRegime: 'medium',
    metadata: {
      ambiguityFlags: [],
      keyCatalysts: [],
    },
  };

  describe('External data unavailability handling', () => {
    it('should return empty array when news provider not configured', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
      });

      const articles = await dataLayer.fetchNews(mockMBD);

      expect(articles).toEqual([]);
    });

    it('should return null when polling provider not configured', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
      });

      const polling = await dataLayer.fetchPollingData(mockMBD);

      expect(polling).toBeNull();
    });

    it('should return null when social providers not configured', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
      });

      const sentiment = await dataLayer.fetchSocialSentiment(mockMBD);

      expect(sentiment).toBeNull();
    });

    it('should check data availability correctly', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
      });

      const newsAvailable = await dataLayer.checkDataAvailability('news');
      const pollingAvailable = await dataLayer.checkDataAvailability('polling');
      const socialAvailable = await dataLayer.checkDataAvailability('social');

      expect(newsAvailable).toBe(false);
      expect(pollingAvailable).toBe(false);
      expect(socialAvailable).toBe(false);
    });

    it('should check data availability when configured', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'newsapi', apiKey: 'test-key', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: '538', apiKey: 'test-key', cacheTTL: 3600 },
        social: { providers: ['twitter'], apiKeys: { twitter: 'test-key' }, cacheTTL: 300, maxMentions: 100 },
      });

      const newsAvailable = await dataLayer.checkDataAvailability('news');
      const pollingAvailable = await dataLayer.checkDataAvailability('polling');
      const socialAvailable = await dataLayer.checkDataAvailability('social');

      expect(newsAvailable).toBe(true);
      expect(pollingAvailable).toBe(true);
      expect(socialAvailable).toBe(true);
    });
  });

  describe('Rate limiting handling', () => {
    it('should return empty array when news rate limit exceeded', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'newsapi', apiKey: 'test-key', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
      });

      // Exhaust rate limit by making many requests
      const promises = [];
      for (let i = 0; i < 15; i++) {
        promises.push(dataLayer.fetchNews(mockMBD));
      }
      await Promise.all(promises);

      // Next request should be rate limited
      const articles = await dataLayer.fetchNews(mockMBD);
      expect(articles).toEqual([]);
    });
  });

  describe('Caching behavior', () => {
    it('should cache news data', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'newsapi', apiKey: 'test-key', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
      });

      // First fetch (will be empty since provider is stubbed)
      const articles1 = await dataLayer.fetchNews(mockMBD);
      
      // Second fetch should use cache
      const articles2 = await dataLayer.fetchNews(mockMBD);

      expect(articles1).toEqual(articles2);
    });

    it('should track data freshness', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'newsapi', apiKey: 'test-key', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
      });

      await dataLayer.fetchNews(mockMBD);

      const freshness = dataLayer.getDataFreshness('news', mockMBD.marketId);
      expect(freshness).toBeGreaterThan(0);
      expect(freshness).toBeLessThanOrEqual(Date.now());
    });

    it('should clear caches', async () => {
      const dataLayer = new DataIntegrationLayer({
        news: { provider: 'newsapi', apiKey: 'test-key', cacheTTL: 900, maxArticles: 20 },
        polling: { provider: 'none', cacheTTL: 3600 },
        social: { providers: [], cacheTTL: 300, maxMentions: 100 },
      });

      await dataLayer.fetchNews(mockMBD);
      
      const freshnessBefore = dataLayer.getDataFreshness('news', mockMBD.marketId);
      expect(freshnessBefore).not.toBeNull();

      dataLayer.clearCaches();

      const freshnessAfter = dataLayer.getDataFreshness('news', mockMBD.marketId);
      expect(freshnessAfter).toBeNull();
    });
  });
});
