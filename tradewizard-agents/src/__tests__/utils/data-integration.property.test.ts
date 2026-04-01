/**
 * Property-based tests for data integration error handling
 * 
 * Feature: advanced-agent-league
 * Property 9: External data unavailability graceful degradation
 * Validates: Requirements 1.5, 2.6, 3.7, 7.4, 14.2
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { DataIntegrationLayer } from './data-integration.js';
import type { MarketBriefingDocument, Catalyst } from '../models/types.js';
import type { DataSourceConfig } from './data-integration.js';

describe('Data Integration Property Tests', () => {
  // Generator for catalysts
  const catalystGenerator = fc.record({
    event: fc.string({ minLength: 5, maxLength: 100 }),
    timestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
  }) as fc.Arbitrary<Catalyst>;

  // Generator for market briefing documents
  const mbdGenerator = fc.record({
    marketId: fc.string({ minLength: 1, maxLength: 50 }),
    conditionId: fc.string({ minLength: 1, maxLength: 50 }),
    question: fc.string({ minLength: 10, maxLength: 200 }),
    resolutionCriteria: fc.string({ minLength: 10, maxLength: 500 }),
    expiryTimestamp: fc.integer({ min: Date.now(), max: Date.now() + 365 * 24 * 60 * 60 * 1000 }),
    volume24h: fc.integer({ min: 0, max: 1000000 }),
    liquidityScore: fc.integer({ min: 0, max: 10 }),
    bidAskSpread: fc.float({ min: 0, max: 1 }),
    currentProbability: fc.float({ min: 0, max: 1 }),
    eventType: fc.constantFrom('election', 'court', 'policy', 'economic', 'geopolitical', 'other'),
    volatilityRegime: fc.constantFrom('low', 'medium', 'high'),
    metadata: fc.record({
      ambiguityFlags: fc.array(fc.string(), { maxLength: 5 }),
      keyCatalysts: fc.array(catalystGenerator, { maxLength: 3 }),
    }),
  }) as fc.Arbitrary<MarketBriefingDocument>;

  // Generator for data source configurations (with unavailable sources)
  const unavailableConfigGenerator = fc.record({
    news: fc.record({
      provider: fc.constant('none' as const),
      cacheTTL: fc.integer({ min: 60, max: 3600 }),
      maxArticles: fc.integer({ min: 1, max: 100 }),
    }),
    polling: fc.record({
      provider: fc.constant('none' as const),
      cacheTTL: fc.integer({ min: 60, max: 7200 }),
    }),
    social: fc.record({
      providers: fc.constant([] as ('twitter' | 'reddit')[]),
      cacheTTL: fc.integer({ min: 60, max: 1800 }),
      maxMentions: fc.integer({ min: 10, max: 500 }),
    }),
  }) as fc.Arbitrary<DataSourceConfig>;

  describe('Property 9: External data unavailability graceful degradation', () => {
    it('should continue analysis when news data unavailable', async () => {
      await fc.assert(
        fc.asyncProperty(
          mbdGenerator,
          unavailableConfigGenerator,
          async (mbd, config) => {
            const dataLayer = new DataIntegrationLayer(config);

            // Fetch news should not throw
            const articles = await dataLayer.fetchNews(mbd);

            // Should return empty array, not throw error
            expect(Array.isArray(articles)).toBe(true);
            expect(articles.length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should continue analysis when polling data unavailable', async () => {
      await fc.assert(
        fc.asyncProperty(
          mbdGenerator,
          unavailableConfigGenerator,
          async (mbd, config) => {
            const dataLayer = new DataIntegrationLayer(config);

            // Fetch polling should not throw
            const polling = await dataLayer.fetchPollingData(mbd);

            // Should return null, not throw error
            expect(polling).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should continue analysis when social data unavailable', async () => {
      await fc.assert(
        fc.asyncProperty(
          mbdGenerator,
          unavailableConfigGenerator,
          async (mbd, config) => {
            const dataLayer = new DataIntegrationLayer(config);

            // Fetch social should not throw
            const sentiment = await dataLayer.fetchSocialSentiment(mbd);

            // Should return null, not throw error
            expect(sentiment).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should report data availability correctly when sources unavailable', async () => {
      await fc.assert(
        fc.asyncProperty(
          unavailableConfigGenerator,
          async (config) => {
            const dataLayer = new DataIntegrationLayer(config);

            // Check availability
            const newsAvailable = await dataLayer.checkDataAvailability('news');
            const pollingAvailable = await dataLayer.checkDataAvailability('polling');
            const socialAvailable = await dataLayer.checkDataAvailability('social');

            // All should be unavailable
            expect(newsAvailable).toBe(false);
            expect(pollingAvailable).toBe(false);
            expect(socialAvailable).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle multiple concurrent requests when data unavailable', async () => {
      await fc.assert(
        fc.asyncProperty(
          mbdGenerator,
          unavailableConfigGenerator,
          fc.integer({ min: 1, max: 10 }),
          async (mbd, config, requestCount) => {
            const dataLayer = new DataIntegrationLayer(config);

            // Make multiple concurrent requests
            const promises = [];
            for (let i = 0; i < requestCount; i++) {
              promises.push(dataLayer.fetchNews(mbd));
              promises.push(dataLayer.fetchPollingData(mbd));
              promises.push(dataLayer.fetchSocialSentiment(mbd));
            }

            // All should complete without throwing
            const results = await Promise.all(promises);

            // All results should be valid (empty arrays or nulls)
            for (const result of results) {
              expect(result === null || Array.isArray(result)).toBe(true);
            }
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
