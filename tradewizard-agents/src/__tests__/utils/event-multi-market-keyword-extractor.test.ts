/**
 * Tests for AI-Powered Event Multi-Market Keyword Extractor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventMultiMarketKeywordExtractor } from './event-multi-market-keyword-extractor.js';
import type { PolymarketEvent, PolymarketMarket, PolymarketTag } from '../models/types.js';

// Mock LLM responses
const mockKeywordAnalysis = {
  primaryKeywords: ['election', 'president', 'vote'],
  semanticKeywords: ['campaign', 'candidate', 'ballot'],
  politicalKeywords: ['election', 'president', 'vote', 'campaign'],
  thematicClusters: [
    {
      theme: 'electoral_process',
      keywords: ['election', 'vote', 'ballot'],
      relevance: 0.9
    }
  ],
  contextualInsights: ['This is a presidential election event'],
  riskFactors: ['Polling uncertainty', 'Voter turnout'],
  confidence: 0.85
};

const mockConceptExtraction = {
  concepts: [
    {
      concept: 'Presidential Election',
      keywords: ['president', 'election', 'candidate'],
      category: 'event' as const,
      importance: 0.9,
      context: 'Major political event'
    }
  ],
  relationships: [
    {
      concept1: 'Presidential Election',
      concept2: 'Voting',
      relationship: 'involves',
      strength: 0.8
    }
  ]
};

// Mock LLM classes
const mockLLM = {
  withStructuredOutput: vi.fn().mockReturnValue({
    invoke: vi.fn()
  })
};

describe('EventMultiMarketKeywordExtractor', () => {
  let extractor: EventMultiMarketKeywordExtractor;
  let mockEvent: PolymarketEvent;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Setup mock LLM responses
    mockLLM.withStructuredOutput().invoke
      .mockResolvedValueOnce(mockKeywordAnalysis)
      .mockResolvedValueOnce(mockConceptExtraction);

    extractor = new EventMultiMarketKeywordExtractor('event_priority', {
      keywordAgent: mockLLM as any,
      conceptAgent: mockLLM as any
    });

    // Create mock event
    const mockTag: PolymarketTag = {
      id: 1,
      label: 'Politics',
      slug: 'politics',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      requiresTranslation: false
    };

    const mockMarket: PolymarketMarket = {
      id: 'market-1',
      question: 'Will the incumbent president win the 2024 election?',
      conditionId: 'condition-1',
      slug: 'president-2024-election',
      description: 'Market about the 2024 presidential election outcome',
      resolutionSource: 'Official election results',
      active: true,
      closed: false,
      archived: false,
      new: false,
      featured: true,
      restricted: false,
      volume: '1000000',
      volumeNum: 1000000,
      outcomes: '["Yes", "No"]',
      outcomePrices: '[0.55, 0.45]',
      startDate: '2024-01-01T00:00:00Z',
      endDate: '2024-12-31T23:59:59Z',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      marketMakerAddress: '0x123...',
      submitted_by: 'user123',
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
      showGmpSeries: false,
      showGmpOutcome: false,
      manualActivation: false,
      negRiskOther: false,
      pendingDeployment: false,
      deploying: false,
      rfqEnabled: false,
      holdingRewardsEnabled: false,
      feesEnabled: false,
      requiresTranslation: false,
    };

    mockEvent = {
      id: 'event-1',
      ticker: 'PRES2024',
      title: '2024 Presidential Election',
      description: 'Markets related to the 2024 US Presidential Election',
      slug: '2024-presidential-election',
      resolutionSource: 'Official election results',
      startDate: '2024-01-01T00:00:00Z',
      creationDate: '2024-01-01T00:00:00Z',
      endDate: '2024-11-05T00:00:00Z',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tags: [mockTag],
      markets: [mockMarket],
      active: true,
      closed: false,
      archived: false,
      new: false,
      featured: true,
      restricted: false,
      enableOrderBook: true,
      liquidity: 1000000,
      volume: 1000000,
      openInterest: 500000,
      competitive: 0.8,
      volume24hr: 50000,
      volume1wk: 200000,
      volume1mo: 800000,
      volume1yr: 5000000,
      liquidityClob: 1000000,
      negRisk: false,
      commentCount: 25,
      cyom: false,
      showAllOutcomes: true,
      showMarketImages: true,
      enableNegRisk: false,
      automaticallyActive: true,
      gmpChartMode: 'default',
      negRiskAugmented: false,
      cumulativeMarkets: false,
      pendingDeployment: false,
      deploying: false,
      requiresTranslation: false,
    };
  });

  describe('AI-powered keyword extraction', () => {
    it('should extract keywords using AI agents', async () => {
      const result = await extractor.extractKeywordsFromEvent(mockEvent);

      expect(result).toBeDefined();
      expect(result.eventLevel).toContain('election');
      expect(result.eventLevel).toContain('president');
      expect(result.combined.length).toBeGreaterThan(0);
      expect(result.themes.length).toBeGreaterThan(0);
      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.ranked.length).toBeGreaterThan(0);

      // Verify AI agents were called (may be called more times due to theme enhancement)
      expect(mockLLM.withStructuredOutput).toHaveBeenCalled();
      expect(mockLLM.withStructuredOutput().invoke).toHaveBeenCalled();
    });

    it('should fall back to traditional extraction on AI failure', async () => {
      // Make AI calls fail
      mockLLM.withStructuredOutput().invoke.mockRejectedValue(new Error('AI service unavailable'));

      const result = await extractor.extractKeywordsFromEvent(mockEvent);

      expect(result).toBeDefined();
      expect(result.eventLevel.length).toBeGreaterThan(0);
      expect(result.combined.length).toBeGreaterThan(0);
    });

    it('should enhance themes with AI insights', async () => {
      const result = await extractor.extractKeywordsFromEvent(mockEvent);

      expect(result.themes).toBeDefined();
      expect(result.themes.length).toBeGreaterThan(0);
      
      const electoralTheme = result.themes.find(t => 
        t.theme.toLowerCase().includes('electoral') || 
        t.theme.toLowerCase().includes('election')
      );
      expect(electoralTheme).toBeDefined();
    });

    it('should create enhanced concepts from AI analysis', async () => {
      const result = await extractor.extractKeywordsFromEvent(mockEvent);

      expect(result.concepts).toBeDefined();
      expect(result.concepts.length).toBeGreaterThan(0);
      
      const presidentialConcept = result.concepts.find(c => 
        c.concept.toLowerCase().includes('presidential') ||
        c.concept.toLowerCase().includes('election')
      );
      expect(presidentialConcept).toBeDefined();
    });

    it('should boost keyword relevance based on AI analysis', async () => {
      const result = await extractor.extractKeywordsFromEvent(mockEvent);

      expect(result.ranked).toBeDefined();
      expect(result.ranked.length).toBeGreaterThan(0);
      
      // AI-identified primary keywords should have high relevance
      const electionKeyword = result.ranked.find(k => 
        k.keyword.toLowerCase().includes('election') || 
        k.keyword.toLowerCase().includes('president')
      );
      expect(electionKeyword).toBeDefined();
      if (electionKeyword) {
        expect(electionKeyword.relevanceScore).toBeGreaterThan(0.3);
      }
    });
  });

  describe('traditional keyword extraction (fallback)', () => {
    it('should extract keywords from event tags', () => {
      const keywords = extractor.extractKeywordsFromEventTags(mockEvent.tags);
      
      expect(keywords).toContain('politics');
      expect(keywords.length).toBeGreaterThan(0);
    });

    it('should handle empty or invalid data gracefully', async () => {
      const emptyEvent: PolymarketEvent = {
        ...mockEvent,
        title: '',
        description: '',
        tags: [],
        markets: []
      };

      const result = await extractor.extractKeywordsFromEvent(emptyEvent);
      
      expect(result).toBeDefined();
      expect(result.eventLevel).toBeDefined();
      expect(result.combined).toBeDefined();
    });
  });
});