/**
 * Unit tests for Enhanced Event Briefing Generator
 * Tests cross-market correlation and opportunity detection functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnhancedEventBriefingGenerator } from './enhanced-event-briefing-generator.js';
import type { PolymarketEvent, PolymarketMarket, PolymarketTag } from '../models/types.js';

describe('EnhancedEventBriefingGenerator', () => {
  let generator: EnhancedEventBriefingGenerator;
  let mockEvent: PolymarketEvent;
  let mockMarkets: PolymarketMarket[];

  beforeEach(() => {
    generator = new EnhancedEventBriefingGenerator({
      enableCrossMarketAnalysis: true,
      enableArbitrageDetection: true,
      keywordExtractionMode: 'event_priority',
    });

    // Create mock markets with different characteristics
    mockMarkets = [
      {
        id: 'market1',
        question: 'Will candidate A win the 2024 presidential election?',
        conditionId: 'cond1',
        slug: 'candidate-a-win',
        description: 'Presidential election outcome for candidate A',
        resolutionSource: 'Official election results',
        active: true,
        closed: false,
        archived: false,
        new: false,
        featured: true,
        restricted: false,
        liquidity: '1000',
        liquidityNum: 1000,
        volume: '5000',
        volumeNum: 5000,
        volume24hr: 500,
        volume1wk: 2000,
        volume1mo: 4000,
        volume1yr: 5000,
        outcomes: '["Yes", "No"]',
        outcomePrices: '[0.55, 0.45]',
        lastTradePrice: 0.55,
        bestBid: 0.54,
        bestAsk: 0.56,
        spread: 0.02,
        oneDayPriceChange: 0.02,
        oneWeekPriceChange: 0.05,
        oneMonthPriceChange: 0.10,
        oneYearPriceChange: 0.15,
        competitive: 0.8,
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-11-05T23:59:59Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
        marketMakerAddress: '0x123',
        submitted_by: 'user1',
        enableOrderBook: true,
        negRisk: false,
        ready: true,
        funded: true,
        cyom: false,
        pagerDutyNotificationEnabled: false,
        approved: true,
        automaticallyActive: true,
        clearBookOnStart: false,
        seriesColor: '#FF0000',
        showGmpSeries: true,
        showGmpOutcome: true,
        manualActivation: false,
        negRiskOther: false,
        pendingDeployment: false,
        deploying: false,
        rfqEnabled: false,
        holdingRewardsEnabled: false,
        feesEnabled: true,
        requiresTranslation: false,
      },
      {
        id: 'market2',
        question: 'Will candidate A win more than 300 electoral votes?',
        conditionId: 'cond2',
        slug: 'candidate-a-electoral-votes',
        description: 'Electoral vote count for candidate A',
        resolutionSource: 'Official election results',
        active: true,
        closed: false,
        archived: false,
        new: false,
        featured: false,
        restricted: false,
        liquidity: '800',
        liquidityNum: 800,
        volume: '3000',
        volumeNum: 3000,
        volume24hr: 300,
        volume1wk: 1200,
        volume1mo: 2400,
        volume1yr: 3000,
        outcomes: '["Yes", "No"]',
        outcomePrices: '[0.45, 0.55]',
        lastTradePrice: 0.45,
        bestBid: 0.44,
        bestAsk: 0.46,
        spread: 0.02,
        oneDayPriceChange: 0.01,
        oneWeekPriceChange: 0.03,
        oneMonthPriceChange: 0.08,
        oneYearPriceChange: 0.12,
        competitive: 0.7,
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-11-05T23:59:59Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
        marketMakerAddress: '0x456',
        submitted_by: 'user2',
        enableOrderBook: true,
        negRisk: false,
        ready: true,
        funded: true,
        cyom: false,
        pagerDutyNotificationEnabled: false,
        approved: true,
        automaticallyActive: true,
        clearBookOnStart: false,
        seriesColor: '#00FF00',
        showGmpSeries: true,
        showGmpOutcome: true,
        manualActivation: false,
        negRiskOther: false,
        pendingDeployment: false,
        deploying: false,
        rfqEnabled: false,
        holdingRewardsEnabled: false,
        feesEnabled: true,
        requiresTranslation: false,
      },
      {
        id: 'market3',
        question: 'Will candidate B win the 2024 presidential election?',
        conditionId: 'cond3',
        slug: 'candidate-b-win',
        description: 'Presidential election outcome for candidate B',
        resolutionSource: 'Official election results',
        active: true,
        closed: false,
        archived: false,
        new: false,
        featured: false,
        restricted: false,
        liquidity: '1200',
        liquidityNum: 1200,
        volume: '4000',
        volumeNum: 4000,
        volume24hr: 400,
        volume1wk: 1600,
        volume1mo: 3200,
        volume1yr: 4000,
        outcomes: '["Yes", "No"]',
        outcomePrices: '[0.40, 0.60]',
        lastTradePrice: 0.40,
        bestBid: 0.39,
        bestAsk: 0.41,
        spread: 0.02,
        oneDayPriceChange: -0.02,
        oneWeekPriceChange: -0.05,
        oneMonthPriceChange: -0.10,
        oneYearPriceChange: -0.15,
        competitive: 0.75,
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-11-05T23:59:59Z',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-15T00:00:00Z',
        marketMakerAddress: '0x789',
        submitted_by: 'user3',
        enableOrderBook: true,
        negRisk: false,
        ready: true,
        funded: true,
        cyom: false,
        pagerDutyNotificationEnabled: false,
        approved: true,
        automaticallyActive: true,
        clearBookOnStart: false,
        seriesColor: '#0000FF',
        showGmpSeries: true,
        showGmpOutcome: true,
        manualActivation: false,
        negRiskOther: false,
        pendingDeployment: false,
        deploying: false,
        rfqEnabled: false,
        holdingRewardsEnabled: false,
        feesEnabled: true,
        requiresTranslation: false,
      },
    ];

    const mockTags: PolymarketTag[] = [
      {
        id: 2,
        label: 'Politics',
        slug: 'politics',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        requiresTranslation: false,
      },
      {
        id: 3,
        label: 'Elections',
        slug: 'elections',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        requiresTranslation: false,
      },
    ];

    mockEvent = {
      id: 'event1',
      ticker: 'PRES2024',
      slug: '2024-presidential-election',
      title: '2024 Presidential Election',
      description: 'Markets related to the 2024 US Presidential Election',
      resolutionSource: 'Official election results',
      active: true,
      closed: false,
      archived: false,
      new: false,
      featured: true,
      restricted: false,
      startDate: '2024-01-01T00:00:00Z',
      creationDate: '2024-01-01T00:00:00Z',
      endDate: '2024-11-05T23:59:59Z',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-15T00:00:00Z',
      liquidity: 3000,
      volume: 12000,
      openInterest: 8000,
      competitive: 0.75,
      volume24hr: 1200,
      volume1wk: 4800,
      volume1mo: 9600,
      volume1yr: 12000,
      enableOrderBook: true,
      liquidityClob: 3000,
      negRisk: false,
      commentCount: 150,
      markets: mockMarkets,
      tags: mockTags,
      cyom: false,
      showAllOutcomes: true,
      showMarketImages: true,
      enableNegRisk: false,
      automaticallyActive: true,
      gmpChartMode: 'standard',
      negRiskAugmented: false,
      cumulativeMarkets: false,
      pendingDeployment: false,
      deploying: false,
      requiresTranslation: false,
    };
  });

  describe('Cross-Market Correlation Analysis', () => {
    it('should detect correlated markets based on question similarity', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      expect(briefing.eventData).toBeDefined();
      expect(briefing.eventData!.marketRelationships).toBeDefined();
      
      const relationships = briefing.eventData!.marketRelationships;
      
      // Should find correlation between candidate A markets
      const candidateARelationship = relationships.find(rel => 
        (rel.market1.id === 'market1' && rel.market2.id === 'market2') ||
        (rel.market1.id === 'market2' && rel.market2.id === 'market1')
      );
      
      expect(candidateARelationship).toBeDefined();
      expect(candidateARelationship!.relationshipType).toBe('correlated');
      expect(candidateARelationship!.strength).toBeGreaterThan(0.5);
    });

    it('should detect competitive markets between opposing candidates', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const relationships = briefing.eventData!.marketRelationships;
      
      // Should find competitive relationship between candidate A and B
      const competitiveRelationship = relationships.find(rel => 
        (rel.market1.id === 'market1' && rel.market2.id === 'market3') ||
        (rel.market1.id === 'market3' && rel.market2.id === 'market1')
      );
      
      if (competitiveRelationship) {
        expect(['competitive', 'correlated']).toContain(competitiveRelationship.relationshipType);
      }
    });

    it('should calculate event metrics correctly', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const eventMetrics = briefing.eventData!.eventMetrics;
      
      expect(eventMetrics.totalVolume).toBe(12000); // Sum of all market volumes
      expect(eventMetrics.totalLiquidity).toBe(3000); // Sum of all market liquidity
      expect(eventMetrics.marketCount).toBe(3);
      expect(eventMetrics.activeMarketCount).toBe(3);
      expect(eventMetrics.averageCompetitive).toBeCloseTo(0.75, 1);
      expect(eventMetrics.volumeDistribution).toHaveLength(3);
    });
  });

  describe('Cross-Market Opportunity Detection', () => {
    it('should detect arbitrage opportunities with price discrepancies', async () => {
      // Modify market prices to create arbitrage opportunity
      mockMarkets[0].outcomePrices = '[0.60, 0.40]'; // Higher price
      mockMarkets[1].outcomePrices = '[0.50, 0.50]'; // Lower price for similar outcome
      
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const opportunities = briefing.eventData!.crossMarketOpportunities;
      const arbitrageOpps = opportunities.filter(opp => opp.type === 'arbitrage');
      
      expect(arbitrageOpps.length).toBeGreaterThan(0);
      
      if (arbitrageOpps.length > 0) {
        const arbitrage = arbitrageOpps[0];
        expect(arbitrage.expectedReturn).toBeGreaterThan(0);
        expect(arbitrage.riskLevel).toMatch(/^(low|medium|high)$/);
        expect(arbitrage.description).toContain('discrepancy');
      }
    });

    it('should detect hedging opportunities among correlated markets', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const opportunities = briefing.eventData!.crossMarketOpportunities;
      const hedgeOpps = opportunities.filter(opp => opp.type === 'hedge');
      
      expect(hedgeOpps.length).toBeGreaterThan(0);
      
      if (hedgeOpps.length > 0) {
        const hedge = hedgeOpps[0];
        expect(hedge.markets.length).toBeGreaterThanOrEqual(2);
        expect(hedge.expectedReturn).toBeGreaterThan(0);
        expect(hedge.description).toContain('hedge');
      }
    });

    it('should detect correlation plays with volume imbalances', async () => {
      // Create volume imbalance
      mockMarkets[0].volumeNum = 10000; // High volume
      mockMarkets[1].volumeNum = 1000;  // Low volume
      
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const opportunities = briefing.eventData!.crossMarketOpportunities;
      const correlationOpps = opportunities.filter(opp => opp.type === 'correlation_play');
      
      // May or may not find correlation plays depending on correlation strength
      if (correlationOpps.length > 0) {
        const correlationPlay = correlationOpps[0];
        expect(correlationPlay.markets.length).toBe(2);
        expect(correlationPlay.expectedReturn).toBeGreaterThan(0);
        expect(correlationPlay.description).toContain('correlation');
      }
    });

    it('should filter opportunities by minimum expected return', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const opportunities = briefing.eventData!.crossMarketOpportunities;
      
      // All opportunities should meet minimum return threshold
      opportunities.forEach(opp => {
        expect(opp.expectedReturn).toBeGreaterThan(0.01); // 1% minimum
      });
    });

    it('should limit opportunities to reasonable number', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const opportunities = briefing.eventData!.crossMarketOpportunities;
      
      // Should not return excessive number of opportunities
      expect(opportunities.length).toBeLessThanOrEqual(10);
    });
  });

  describe('Event-Level Intelligence Integration', () => {
    it('should generate event-level insights', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      expect(briefing.metadata.eventIntelligence).toBeDefined();
      
      const intelligence = briefing.metadata.eventIntelligence!;
      expect(intelligence.eventLevelInsights).toBeDefined();
      expect(intelligence.crossMarketPatterns).toBeDefined();
      expect(intelligence.riskFactors).toBeDefined();
      expect(intelligence.opportunityAreas).toBeDefined();
      expect(intelligence.marketInteractions).toBeDefined();
      
      // Should have meaningful insights
      expect(intelligence.eventLevelInsights.length).toBeGreaterThan(0);
      expect(intelligence.marketInteractions.length).toBeGreaterThan(0);
    });

    it('should identify market interactions correctly', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const interactions = briefing.metadata.eventIntelligence!.marketInteractions;
      
      interactions.forEach(interaction => {
        expect(interaction.markets.length).toBeGreaterThanOrEqual(2);
        expect(interaction.interactionType).toMatch(/^(substitution|complementarity|independence|causality)$/);
        expect(interaction.strength).toBeGreaterThanOrEqual(0);
        expect(interaction.strength).toBeLessThanOrEqual(1);
        expect(interaction.description).toBeTruthy();
        expect(interaction.implications.length).toBeGreaterThan(0);
      });
    });

    it('should assess event-level risk factors', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const riskFactors = briefing.metadata.eventIntelligence!.riskFactors;
      
      // Should identify relevant risk factors
      expect(Array.isArray(riskFactors)).toBe(true);
      
      // Risk factors should be meaningful strings
      riskFactors.forEach(risk => {
        expect(typeof risk).toBe('string');
        expect(risk.length).toBeGreaterThan(10);
      });
    });

    it('should identify opportunity areas from cross-market analysis', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const opportunityAreas = briefing.metadata.eventIntelligence!.opportunityAreas;
      
      expect(Array.isArray(opportunityAreas)).toBe(true);
      
      // Should describe opportunity types found
      opportunityAreas.forEach(area => {
        expect(typeof area).toBe('string');
        expect(area.length).toBeGreaterThan(10);
      });
    });
  });

  describe('Enhanced Metadata Generation', () => {
    it('should include all event-specific metadata fields', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const metadata = briefing.metadata;
      
      expect(metadata.eventId).toBe('event1');
      expect(metadata.eventTitle).toBe('2024 Presidential Election');
      expect(metadata.eventDescription).toBe('Markets related to the 2024 US Presidential Election');
      expect(metadata.marketIds).toEqual(['market1', 'market2', 'market3']);
      expect(metadata.politicalCategory).toBeTruthy();
      expect(metadata.eventThemes).toBeDefined();
      expect(metadata.subCategories).toBeDefined();
    });

    it('should identify dominant market correctly', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const metadata = briefing.metadata;
      
      expect(metadata.dominantMarketId).toBeTruthy();
      
      // Dominant market should be the one with highest volume (market1 with 5000)
      expect(metadata.dominantMarketId).toBe('market1');
    });

    it('should extract event catalysts', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const metadata = briefing.metadata;
      
      expect(metadata.eventCatalysts).toBeDefined();
      expect(metadata.eventCatalysts!.length).toBeGreaterThan(0);
      
      // Should include event creation and resolution deadline
      const catalystEvents = metadata.eventCatalysts!.map(c => c.event);
      expect(catalystEvents).toContain('Event created');
      expect(catalystEvents).toContain('Event resolution deadline');
    });

    it('should extract market catalysts', async () => {
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      const metadata = briefing.metadata;
      
      expect(metadata.marketCatalysts).toBeDefined();
      expect(metadata.marketCatalysts!.length).toBeGreaterThan(0);
      
      // Should have catalysts for each market
      expect(metadata.marketCatalysts!.length).toBe(3); // One per market
    });
  });

  describe('Multi-Market Briefing Generation', () => {
    it('should generate briefings for multiple markets', async () => {
      const briefings = await generator.generateMultiMarketBriefings(mockEvent);
      
      expect(briefings.length).toBeGreaterThan(0);
      expect(briefings.length).toBeLessThanOrEqual(3); // Should not exceed market count
      
      // Each briefing should be valid
      briefings.forEach(briefing => {
        expect(briefing.marketId).toBeTruthy();
        expect(briefing.eventData).toBeDefined();
        expect(briefing.eventData!.event.id).toBe('event1');
      });
    });

    it('should filter markets by quality thresholds', async () => {
      // Create generator with high quality thresholds
      const strictGenerator = new EnhancedEventBriefingGenerator({
        qualityThresholds: {
          minLiquidity: 2000, // Higher than any of our test markets
          minCompetitive: 0.9,
          minVolume: 10000,
        },
      });
      
      const briefings = await strictGenerator.generateMultiMarketBriefings(mockEvent);
      
      // Should generate fewer briefings due to strict thresholds
      expect(briefings.length).toBeLessThan(3);
    });
  });

  describe('Error Handling', () => {
    it('should handle markets with missing price data', async () => {
      // Remove price data from one market
      mockMarkets[0].outcomePrices = '';
      
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      // Should still generate briefing without crashing
      expect(briefing).toBeDefined();
      expect(briefing.eventData).toBeDefined();
    });

    it('should handle markets with invalid JSON in outcomes', async () => {
      // Invalid JSON in outcomes
      mockMarkets[0].outcomePrices = 'invalid json';
      
      const briefing = await generator.generateEventBriefing(mockEvent);
      
      // Should still generate briefing
      expect(briefing).toBeDefined();
      expect(briefing.eventData!.crossMarketOpportunities).toBeDefined();
    });

    it('should handle events with no markets', async () => {
      const emptyEvent = { ...mockEvent, markets: [] };
      
      const briefing = await generator.generateEventBriefing(emptyEvent);
      
      // Should handle gracefully
      expect(briefing).toBeDefined();
      expect(briefing.eventData!.markets).toHaveLength(0);
      expect(briefing.eventData!.marketRelationships).toHaveLength(0);
      expect(briefing.eventData!.crossMarketOpportunities).toHaveLength(0);
    });

    it('should handle events with single market', async () => {
      const singleMarketEvent = { ...mockEvent, markets: [mockMarkets[0]] };
      
      const briefing = await generator.generateEventBriefing(singleMarketEvent);
      
      // Should handle single market event
      expect(briefing).toBeDefined();
      expect(briefing.eventData!.markets).toHaveLength(1);
      expect(briefing.eventData!.marketRelationships).toHaveLength(0); // No relationships possible
    });
  });
});