/**
 * Property-Based Tests for Enhanced Event Ranking Algorithm
 * 
 * Tests the comprehensive event ranking algorithm with cross-market analysis,
 * multi-period volume analysis, and event quality assessment.
 * 
 * **Feature: polymarket-integration-enhancement, Property 3.2: Comprehensive Event Ranking Algorithm**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { EnhancedEventPolymarketClient, type PolymarketEvent, type PolymarketMarket, type PolymarketTag } from './enhanced-event-polymarket-client.js';
import type { EngineConfig } from '../config/index.js';

// Test configuration
const testConfig: EngineConfig['polymarket'] = {
  gammaApiUrl: 'https://gamma-api.polymarket.com',
  clobApiUrl: 'https://clob.polymarket.com',
  rateLimitBuffer: 80,
  politicsTagId: 2,
  maxRequestsPerMinute: 60,
  eventsApiRateLimit: 30,
  eventCacheTTL: 300,
  marketCacheTTL: 300,
  tagCacheTTL: 3600,
  correlationCacheTTL: 1800,
  circuitBreakerThreshold: 5,
};

// Generators for test data
const generatePolymarketTag = (): fc.Arbitrary<PolymarketTag> =>
  fc.record({
    id: fc.integer({ min: 1, max: 100 }),
    label: fc.string({ minLength: 3, maxLength: 20 }),
    slug: fc.string({ minLength: 3, maxLength: 20 }),
    forceShow: fc.option(fc.boolean()),
    forceHide: fc.option(fc.boolean()),
    publishedAt: fc.option(fc.date().map(d => d.toISOString())),
    updatedBy: fc.option(fc.integer({ min: 1, max: 1000 })),
    createdAt: fc.date().map(d => d.toISOString()),
    updatedAt: fc.date().map(d => d.toISOString()),
    isCarousel: fc.option(fc.boolean()),
    requiresTranslation: fc.boolean(),
  });

const generatePolymarketMarket = (): fc.Arbitrary<PolymarketMarket> =>
  fc.record({
    id: fc.string({ minLength: 10, maxLength: 50 }),
    question: fc.string({ minLength: 10, maxLength: 200 }),
    conditionId: fc.string({ minLength: 10, maxLength: 50 }),
    slug: fc.string({ minLength: 5, maxLength: 50 }),
    description: fc.string({ minLength: 10, maxLength: 500 }),
    resolutionSource: fc.oneof(
      fc.constant('Official Government Source'),
      fc.constant('Reuters'),
      fc.constant('AP News'),
      fc.constant('News Media'),
      fc.constant('Custom Source')
    ),
    active: fc.boolean(),
    closed: fc.boolean(),
    archived: fc.boolean(),
    new: fc.boolean(),
    featured: fc.boolean(),
    restricted: fc.boolean(),
    liquidity: fc.option(fc.float({ min: 0, max: 1000000 }).map(String)),
    liquidityNum: fc.option(fc.float({ min: 0, max: 1000000 })),
    volume: fc.float({ min: 0, max: 10000000 }).map(String),
    volumeNum: fc.float({ min: 0, max: 10000000 }),
    volume24hr: fc.option(fc.float({ min: 0, max: 1000000 })),
    volume1wk: fc.option(fc.float({ min: 0, max: 5000000 })),
    volume1mo: fc.option(fc.float({ min: 0, max: 20000000 })),
    volume1yr: fc.option(fc.float({ min: 0, max: 100000000 })),
    outcomes: fc.array(fc.string({ minLength: 2, maxLength: 10 }), { minLength: 2, maxLength: 5 }).map(arr => JSON.stringify(arr)),
    outcomePrices: fc.array(fc.float({ min: 0.01, max: 0.99 }), { minLength: 2, maxLength: 5 }).map(arr => JSON.stringify(arr)),
    lastTradePrice: fc.option(fc.float({ min: 0.01, max: 0.99 })),
    bestBid: fc.option(fc.float({ min: 0.01, max: 0.99 })),
    bestAsk: fc.option(fc.float({ min: 0.01, max: 0.99 })),
    spread: fc.option(fc.float({ min: 0.001, max: 0.1 })),
    oneDayPriceChange: fc.option(fc.float({ min: -0.5, max: 0.5 })),
    oneHourPriceChange: fc.option(fc.float({ min: -0.2, max: 0.2 })),
    oneWeekPriceChange: fc.option(fc.float({ min: -0.8, max: 0.8 })),
    oneMonthPriceChange: fc.option(fc.float({ min: -1.0, max: 1.0 })),
    oneYearPriceChange: fc.option(fc.float({ min: -2.0, max: 2.0 })),
    competitive: fc.option(fc.float({ min: 0, max: 1 })),
    startDate: fc.date().map(d => d.toISOString()),
    endDate: fc.date().map(d => d.toISOString()),
    createdAt: fc.date().map(d => d.toISOString()),
    updatedAt: fc.date().map(d => d.toISOString()),
    closedTime: fc.option(fc.date().map(d => d.toISOString())),
    marketMakerAddress: fc.string({ minLength: 20, maxLength: 50 }),
    submitted_by: fc.string({ minLength: 5, maxLength: 30 }),
    resolvedBy: fc.option(fc.string({ minLength: 5, maxLength: 30 })),
    groupItemTitle: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
    groupItemThreshold: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
    questionID: fc.option(fc.string({ minLength: 10, maxLength: 50 })),
    umaEndDate: fc.option(fc.date().map(d => d.toISOString())),
    umaResolutionStatus: fc.option(fc.string({ minLength: 5, maxLength: 20 })),
    umaResolutionStatuses: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
    umaBond: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
    umaReward: fc.option(fc.string({ minLength: 1, maxLength: 20 })),
    enableOrderBook: fc.boolean(),
    orderPriceMinTickSize: fc.option(fc.float({ min: 0.001, max: 0.1 })),
    orderMinSize: fc.option(fc.float({ min: 0.01, max: 100 })),
    acceptingOrders: fc.option(fc.boolean()),
    acceptingOrdersTimestamp: fc.option(fc.date().map(d => d.toISOString())),
    clobTokenIds: fc.option(fc.string({ minLength: 5, maxLength: 50 })),
    liquidityClob: fc.option(fc.float({ min: 0, max: 1000000 })),
    volumeClob: fc.option(fc.float({ min: 0, max: 10000000 })),
    volume24hrClob: fc.option(fc.float({ min: 0, max: 1000000 })),
    volume1wkClob: fc.option(fc.float({ min: 0, max: 5000000 })),
    volume1moClob: fc.option(fc.float({ min: 0, max: 20000000 })),
    volume1yrClob: fc.option(fc.float({ min: 0, max: 100000000 })),
    customLiveness: fc.option(fc.integer({ min: 1, max: 86400 })),
    negRisk: fc.boolean(),
    negRiskRequestID: fc.option(fc.string({ minLength: 10, maxLength: 50 })),
    negRiskMarketID: fc.option(fc.string({ minLength: 10, maxLength: 50 })),
    ready: fc.boolean(),
    funded: fc.boolean(),
    cyom: fc.boolean(),
    pagerDutyNotificationEnabled: fc.boolean(),
    approved: fc.boolean(),
    rewardsMinSize: fc.option(fc.float({ min: 0.01, max: 100 })),
    rewardsMaxSpread: fc.option(fc.float({ min: 0.001, max: 0.1 })),
    automaticallyResolved: fc.option(fc.boolean()),
    automaticallyActive: fc.boolean(),
    clearBookOnStart: fc.boolean(),
    seriesColor: fc.string({ minLength: 3, maxLength: 10 }),
    showGmpSeries: fc.boolean(),
    showGmpOutcome: fc.boolean(),
    manualActivation: fc.boolean(),
    negRiskOther: fc.boolean(),
    pendingDeployment: fc.boolean(),
    deploying: fc.boolean(),
    deployingTimestamp: fc.option(fc.date().map(d => d.toISOString())),
    rfqEnabled: fc.boolean(),
    holdingRewardsEnabled: fc.boolean(),
    feesEnabled: fc.boolean(),
    requiresTranslation: fc.boolean(),
    image: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
    icon: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
    endDateIso: fc.option(fc.date().map(d => d.toISOString())),
    startDateIso: fc.option(fc.date().map(d => d.toISOString())),
    hasReviewedDates: fc.option(fc.boolean()),
  });

const generatePolymarketEvent = (): fc.Arbitrary<PolymarketEvent> =>
  fc.record({
    id: fc.string({ minLength: 10, maxLength: 50 }),
    ticker: fc.string({ minLength: 2, maxLength: 10 }),
    slug: fc.string({ minLength: 5, maxLength: 50 }),
    title: fc.string({ minLength: 10, maxLength: 200 }),
    description: fc.string({ minLength: 20, maxLength: 1000 }),
    resolutionSource: fc.oneof(
      fc.constant('Official Government Source'),
      fc.constant('Reuters'),
      fc.constant('AP News'),
      fc.constant('News Media'),
      fc.constant('Custom Source')
    ),
    active: fc.boolean(),
    closed: fc.boolean(),
    archived: fc.boolean(),
    new: fc.boolean(),
    featured: fc.boolean(),
    restricted: fc.boolean(),
    startDate: fc.date().map(d => d.toISOString()),
    creationDate: fc.date().map(d => d.toISOString()),
    endDate: fc.date().map(d => d.toISOString()),
    createdAt: fc.date().map(d => d.toISOString()),
    updatedAt: fc.date().map(d => d.toISOString()),
    liquidity: fc.float({ min: 0, max: 10000000 }),
    volume: fc.float({ min: 0, max: 100000000 }),
    openInterest: fc.float({ min: 0, max: 50000000 }),
    competitive: fc.float({ min: 0, max: 1 }),
    volume24hr: fc.float({ min: 0, max: 10000000 }),
    volume1wk: fc.float({ min: 0, max: 50000000 }),
    volume1mo: fc.float({ min: 0, max: 200000000 }),
    volume1yr: fc.float({ min: 0, max: 1000000000 }),
    enableOrderBook: fc.boolean(),
    liquidityClob: fc.float({ min: 0, max: 10000000 }),
    negRisk: fc.boolean(),
    negRiskMarketID: fc.option(fc.string({ minLength: 10, maxLength: 50 })),
    commentCount: fc.integer({ min: 0, max: 1000 }),
    image: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
    icon: fc.option(fc.string({ minLength: 10, maxLength: 100 })),
    markets: fc.array(generatePolymarketMarket(), { minLength: 1, maxLength: 10 }),
    tags: fc.array(generatePolymarketTag(), { minLength: 1, maxLength: 5 }),
    cyom: fc.boolean(),
    showAllOutcomes: fc.boolean(),
    showMarketImages: fc.boolean(),
    enableNegRisk: fc.boolean(),
    automaticallyActive: fc.boolean(),
    gmpChartMode: fc.oneof(fc.constant('default'), fc.constant('advanced'), fc.constant('simple')),
    negRiskAugmented: fc.boolean(),
    cumulativeMarkets: fc.boolean(),
    pendingDeployment: fc.boolean(),
    deploying: fc.boolean(),
    requiresTranslation: fc.boolean(),
  });

describe('Enhanced Event Ranking Algorithm Property Tests', () => {
  let client: EnhancedEventPolymarketClient;

  beforeEach(() => {
    client = new EnhancedEventPolymarketClient(testConfig);
  });

  describe('Property 1: Event Trending Score Calculation', () => {
    it('should calculate trending scores using total volume, liquidity, competitive scores, market count, and recency', () => {
      fc.assert(
        fc.property(
          fc.array(generatePolymarketEvent(), { minLength: 1, maxLength: 20 }),
          (events) => {
            // Access private method through type assertion for testing
            const rankedEvents = (client as any).rankEventsByTrendingScore(events);

            // Validate that all events have trending scores
            expect(rankedEvents).toHaveLength(events.length);
            
            for (const rankedEvent of rankedEvents) {
              // Trending score should be a valid number between 0 and 1
              expect(rankedEvent.trendingScore).toBeTypeOf('number');
              expect(rankedEvent.trendingScore).toBeGreaterThanOrEqual(0);
              expect(rankedEvent.trendingScore).toBeLessThanOrEqual(1);

              // Ranking factors should include all required components
              const factors = rankedEvent.rankingFactors;
              expect(factors.totalVolumeScore).toBeTypeOf('number');
              expect(factors.totalLiquidityScore).toBeTypeOf('number');
              expect(factors.averageCompetitiveScore).toBeTypeOf('number');
              expect(factors.marketCountScore).toBeTypeOf('number');
              expect(factors.recencyScore).toBeTypeOf('number');
              expect(factors.activityScore).toBeTypeOf('number');

              // Enhanced factors should be present
              expect(factors.multiPeriodVolumeScore).toBeTypeOf('number');
              expect(factors.eventQualityScore).toBeTypeOf('number');
              expect(factors.crossMarketCorrelationScore).toBeTypeOf('number');
              expect(factors.marketDiversityScore).toBeTypeOf('number');
              expect(factors.liquidityDistributionScore).toBeTypeOf('number');

              // All scores should be normalized (0-1 range)
              Object.values(factors).forEach(score => {
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(1);
              });
            }

            // Events should be sorted by trending score (descending)
            for (let i = 1; i < rankedEvents.length; i++) {
              expect(rankedEvents[i - 1].trendingScore).toBeGreaterThanOrEqual(rankedEvents[i].trendingScore);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 2: Multi-Period Analysis Support', () => {
    it('should support multiple time period analysis (24hr, 1wk, 1mo, 1yr) across all markets in events', () => {
      fc.assert(
        fc.property(
          generatePolymarketEvent(),
          (event) => {
            // Access private method through type assertion for testing
            const multiPeriodAnalysis = (client as any).calculateMultiPeriodAnalysis(event);

            // Should have analysis for all time periods
            expect(multiPeriodAnalysis.volume24hr).toBeDefined();
            expect(multiPeriodAnalysis.volume1wk).toBeDefined();
            expect(multiPeriodAnalysis.volume1mo).toBeDefined();
            expect(multiPeriodAnalysis.volume1yr).toBeDefined();

            // Each period should have complete metrics
            const periods = [
              multiPeriodAnalysis.volume24hr,
              multiPeriodAnalysis.volume1wk,
              multiPeriodAnalysis.volume1mo,
              multiPeriodAnalysis.volume1yr
            ];

            for (const period of periods) {
              expect(period.totalVolume).toBeTypeOf('number');
              expect(period.averageVolume).toBeTypeOf('number');
              expect(period.marketCount).toBeTypeOf('number');
              expect(period.activeMarketCount).toBeTypeOf('number');
              expect(period.dominantMarketVolume).toBeTypeOf('number');
              expect(period.volumeDistribution).toBeTypeOf('number');
              expect(period.correlationStrength).toBeTypeOf('number');

              // Validate ranges
              expect(period.totalVolume).toBeGreaterThanOrEqual(0);
              expect(period.averageVolume).toBeGreaterThanOrEqual(0);
              expect(period.marketCount).toBe(event.markets.length);
              expect(period.activeMarketCount).toBeLessThanOrEqual(period.marketCount);
              expect(period.volumeDistribution).toBeGreaterThanOrEqual(0);
              expect(period.volumeDistribution).toBeLessThanOrEqual(1);
              expect(period.correlationStrength).toBeGreaterThanOrEqual(0);
              expect(period.correlationStrength).toBeLessThanOrEqual(1);
            }

            // Volume trend should be valid
            expect(['increasing', 'decreasing', 'stable']).toContain(multiPeriodAnalysis.volumeTrend);

            // Scores should be normalized
            expect(multiPeriodAnalysis.momentumScore).toBeGreaterThanOrEqual(0);
            expect(multiPeriodAnalysis.momentumScore).toBeLessThanOrEqual(1);
            expect(multiPeriodAnalysis.consistencyScore).toBeGreaterThanOrEqual(0);
            expect(multiPeriodAnalysis.consistencyScore).toBeLessThanOrEqual(1);
            expect(multiPeriodAnalysis.growthRate).toBeGreaterThanOrEqual(-1);
            expect(multiPeriodAnalysis.growthRate).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 3: Event Quality Assessment', () => {
    it('should implement event quality assessment incorporating metrics from all constituent markets', () => {
      fc.assert(
        fc.property(
          generatePolymarketEvent(),
          (event) => {
            // Access private methods through type assertion for testing
            const marketAnalysis = (client as any).analyzeEventMarkets(event);
            const eventQualityMetrics = (client as any).calculateEventQualityMetrics(event, marketAnalysis);

            // Overall quality score should be present and normalized
            expect(eventQualityMetrics.overallQualityScore).toBeTypeOf('number');
            expect(eventQualityMetrics.overallQualityScore).toBeGreaterThanOrEqual(0);
            expect(eventQualityMetrics.overallQualityScore).toBeLessThanOrEqual(1);

            // Liquidity quality metrics
            const lq = eventQualityMetrics.liquidityQuality;
            expect(lq.totalLiquidity).toBeTypeOf('number');
            expect(lq.averageLiquidity).toBeTypeOf('number');
            expect(lq.liquidityDistribution).toBeTypeOf('number');
            expect(lq.liquidityDepth).toBeTypeOf('number');
            expect(lq.liquidityStability).toBeTypeOf('number');

            expect(lq.totalLiquidity).toBeGreaterThanOrEqual(0);
            expect(lq.averageLiquidity).toBeGreaterThanOrEqual(0);
            expect(lq.liquidityDistribution).toBeGreaterThanOrEqual(0);
            expect(lq.liquidityDistribution).toBeLessThanOrEqual(1);
            expect(lq.liquidityDepth).toBeGreaterThanOrEqual(0);
            expect(lq.liquidityDepth).toBeLessThanOrEqual(1);
            expect(lq.liquidityStability).toBeGreaterThanOrEqual(0);
            expect(lq.liquidityStability).toBeLessThanOrEqual(1);

            // Market quality metrics
            const mq = eventQualityMetrics.marketQuality;
            expect(mq.averageCompetitive).toBeTypeOf('number');
            expect(mq.competitiveConsistency).toBeTypeOf('number');
            expect(mq.marketMaturity).toBeTypeOf('number');
            expect(mq.resolutionReliability).toBeTypeOf('number');
            expect(mq.tradingActivity).toBeTypeOf('number');

            expect(mq.averageCompetitive).toBeGreaterThanOrEqual(0);
            expect(mq.averageCompetitive).toBeLessThanOrEqual(1);
            expect(mq.competitiveConsistency).toBeGreaterThanOrEqual(0);
            expect(mq.competitiveConsistency).toBeLessThanOrEqual(1);
            expect(mq.marketMaturity).toBeGreaterThanOrEqual(0);
            expect(mq.marketMaturity).toBeLessThanOrEqual(1);
            expect(mq.resolutionReliability).toBeGreaterThanOrEqual(0);
            expect(mq.resolutionReliability).toBeLessThanOrEqual(1);
            expect(mq.tradingActivity).toBeGreaterThanOrEqual(0);
            expect(mq.tradingActivity).toBeLessThanOrEqual(1);

            // Competitive balance metrics
            const cb = eventQualityMetrics.competitiveBalance;
            expect(cb.priceBalance).toBeTypeOf('number');
            expect(cb.volumeBalance).toBeTypeOf('number');
            expect(cb.liquidityBalance).toBeTypeOf('number');
            expect(cb.overallBalance).toBeTypeOf('number');

            expect(cb.priceBalance).toBeGreaterThanOrEqual(0);
            expect(cb.priceBalance).toBeLessThanOrEqual(1);
            expect(cb.volumeBalance).toBeGreaterThanOrEqual(0);
            expect(cb.volumeBalance).toBeLessThanOrEqual(1);
            expect(cb.liquidityBalance).toBeGreaterThanOrEqual(0);
            expect(cb.liquidityBalance).toBeLessThanOrEqual(1);
            expect(cb.overallBalance).toBeGreaterThanOrEqual(0);
            expect(cb.overallBalance).toBeLessThanOrEqual(1);

            // Diversity metrics
            const dm = eventQualityMetrics.diversityMetrics;
            expect(dm.marketTypeDiversity).toBeTypeOf('number');
            expect(dm.outcomeDiversity).toBeTypeOf('number');
            expect(dm.participantDiversity).toBeTypeOf('number');
            expect(dm.topicDiversity).toBeTypeOf('number');

            expect(dm.marketTypeDiversity).toBeGreaterThanOrEqual(0);
            expect(dm.marketTypeDiversity).toBeLessThanOrEqual(1);
            expect(dm.outcomeDiversity).toBeGreaterThanOrEqual(0);
            expect(dm.outcomeDiversity).toBeLessThanOrEqual(1);
            expect(dm.participantDiversity).toBeGreaterThanOrEqual(0);
            expect(dm.participantDiversity).toBeLessThanOrEqual(1);
            expect(dm.topicDiversity).toBeGreaterThanOrEqual(0);
            expect(dm.topicDiversity).toBeLessThanOrEqual(1);

            // Risk metrics
            const rm = eventQualityMetrics.riskMetrics;
            expect(rm.concentrationRisk).toBeTypeOf('number');
            expect(rm.correlationRisk).toBeTypeOf('number');
            expect(rm.liquidityRisk).toBeTypeOf('number');
            expect(rm.resolutionRisk).toBeTypeOf('number');
            expect(rm.overallRisk).toBeTypeOf('number');

            expect(rm.concentrationRisk).toBeGreaterThanOrEqual(0);
            expect(rm.concentrationRisk).toBeLessThanOrEqual(1);
            expect(rm.correlationRisk).toBeGreaterThanOrEqual(0);
            expect(rm.correlationRisk).toBeLessThanOrEqual(1);
            expect(rm.liquidityRisk).toBeGreaterThanOrEqual(0);
            expect(rm.liquidityRisk).toBeLessThanOrEqual(1);
            expect(rm.resolutionRisk).toBeGreaterThanOrEqual(0);
            expect(rm.resolutionRisk).toBeLessThanOrEqual(1);
            expect(rm.overallRisk).toBeGreaterThanOrEqual(0);
            expect(rm.overallRisk).toBeLessThanOrEqual(1);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 4: Cross-Market Analysis Integration', () => {
    it('should incorporate cross-market correlations and analysis into ranking', () => {
      fc.assert(
        fc.property(
          fc.array(generatePolymarketEvent(), { minLength: 2, maxLength: 10 }),
          (events) => {
            // Filter events to have multiple markets for meaningful cross-market analysis
            const multiMarketEvents = events.filter(event => event.markets.length >= 2);
            
            if (multiMarketEvents.length === 0) return; // Skip if no multi-market events

            const rankedEvents = (client as any).rankEventsByTrendingScore(multiMarketEvents);

            for (const rankedEvent of rankedEvents) {
              // Should have market analysis with correlations
              expect(rankedEvent.marketAnalysis.correlations).toBeDefined();
              expect(Array.isArray(rankedEvent.marketAnalysis.correlations)).toBe(true);

              // Cross-market correlation score should be calculated
              expect(rankedEvent.rankingFactors.crossMarketCorrelationScore).toBeTypeOf('number');
              expect(rankedEvent.rankingFactors.crossMarketCorrelationScore).toBeGreaterThanOrEqual(0);
              expect(rankedEvent.rankingFactors.crossMarketCorrelationScore).toBeLessThanOrEqual(1);

              // Correlations should have valid structure
              for (const correlation of rankedEvent.marketAnalysis.correlations) {
                expect(correlation.market1Id).toBeTypeOf('string');
                expect(correlation.market2Id).toBeTypeOf('string');
                expect(correlation.correlationCoefficient).toBeTypeOf('number');
                expect(correlation.correlationCoefficient).toBeGreaterThanOrEqual(-1);
                expect(correlation.correlationCoefficient).toBeLessThanOrEqual(1);
                expect(['positive', 'negative', 'neutral']).toContain(correlation.correlationType);
              }

              // Market analysis should include cross-market metrics
              expect(rankedEvent.marketAnalysis.dominantMarket).toBeDefined();
              expect(Array.isArray(rankedEvent.marketAnalysis.opportunityMarkets)).toBe(true);
              expect(Array.isArray(rankedEvent.marketAnalysis.volumeDistribution)).toBe(true);
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 5: Ranking Consistency and Monotonicity', () => {
    it('should maintain consistent ranking order based on comprehensive scoring', () => {
      fc.assert(
        fc.property(
          fc.array(generatePolymarketEvent(), { minLength: 3, maxLength: 15 }),
          (events) => {
            const rankedEvents = (client as any).rankEventsByTrendingScore(events);

            // Ranking should be consistent (sorted by trending score)
            for (let i = 1; i < rankedEvents.length; i++) {
              expect(rankedEvents[i - 1].trendingScore).toBeGreaterThanOrEqual(rankedEvents[i].trendingScore);
            }

            // Higher volume events should generally rank higher (with some exceptions due to other factors)
            const highVolumeEvents = rankedEvents.filter(re => re.event.volume > 1000000);
            const lowVolumeEvents = rankedEvents.filter(re => re.event.volume < 100000);

            if (highVolumeEvents.length > 0 && lowVolumeEvents.length > 0) {
              const avgHighVolumeScore = highVolumeEvents.reduce((sum, re) => sum + re.trendingScore, 0) / highVolumeEvents.length;
              const avgLowVolumeScore = lowVolumeEvents.reduce((sum, re) => sum + re.trendingScore, 0) / lowVolumeEvents.length;
              
              // High volume events should generally have higher average scores
              // (allowing some tolerance due to other ranking factors)
              expect(avgHighVolumeScore).toBeGreaterThanOrEqual(avgLowVolumeScore * 0.8);
            }

            // Events with more markets should generally have higher market count scores
            for (const rankedEvent of rankedEvents) {
              const marketCount = rankedEvent.event.markets.length;
              const marketCountScore = rankedEvent.rankingFactors.marketCountScore;
              
              // Market count score should increase with market count (with diminishing returns)
              expect(marketCountScore).toBeGreaterThanOrEqual(0);
              expect(marketCountScore).toBeLessThanOrEqual(1);
              
              if (marketCount >= 10) {
                expect(marketCountScore).toBe(1); // Should max out at 1.0
              } else {
                expect(marketCountScore).toBeCloseTo(marketCount / 10, 1);
              }
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Property 6: Enhanced Ranking Factors Validation', () => {
    it('should include all enhanced ranking factors in comprehensive scoring', () => {
      fc.assert(
        fc.property(
          generatePolymarketEvent(),
          (event) => {
            const rankedEvents = (client as any).rankEventsByTrendingScore([event]);
            const rankedEvent = rankedEvents[0];

            // Validate all enhanced factors are present and contribute to score
            const factors = rankedEvent.rankingFactors;
            
            // Original factors
            expect(factors.totalVolumeScore).toBeDefined();
            expect(factors.totalLiquidityScore).toBeDefined();
            expect(factors.averageCompetitiveScore).toBeDefined();
            expect(factors.marketCountScore).toBeDefined();
            expect(factors.recencyScore).toBeDefined();
            expect(factors.activityScore).toBeDefined();

            // Enhanced factors
            expect(factors.multiPeriodVolumeScore).toBeDefined();
            expect(factors.eventQualityScore).toBeDefined();
            expect(factors.crossMarketCorrelationScore).toBeDefined();
            expect(factors.marketDiversityScore).toBeDefined();
            expect(factors.liquidityDistributionScore).toBeDefined();

            // Enhanced analysis should be present
            expect(rankedEvent.multiPeriodAnalysis).toBeDefined();
            expect(rankedEvent.eventQualityMetrics).toBeDefined();

            // Trending score should be influenced by all factors
            // Test by manually calculating expected score
            const expectedScore = (
              factors.totalVolumeScore * 0.18 +
              factors.totalLiquidityScore * 0.15 +
              factors.averageCompetitiveScore * 0.12 +
              factors.marketCountScore * 0.10 +
              factors.recencyScore * 0.10 +
              factors.activityScore * 0.08 +
              factors.multiPeriodVolumeScore * 0.12 +
              factors.eventQualityScore * 0.08 +
              factors.crossMarketCorrelationScore * 0.04 +
              factors.marketDiversityScore * 0.02 +
              factors.liquidityDistributionScore * 0.01
            );

            expect(rankedEvent.trendingScore).toBeCloseTo(expectedScore, 3);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});