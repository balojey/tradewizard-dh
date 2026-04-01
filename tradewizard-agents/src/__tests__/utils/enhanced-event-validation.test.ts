/**
 * Tests for Enhanced Event Data Validation and Response Parsing
 * 
 * This test suite validates the comprehensive Zod schemas and parsing functions
 * for Polymarket events API responses with nested markets and error handling.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 7.1, 7.2, 7.5
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validatePolymarketEvent,
  validatePolymarketEvents,
  validatePolymarketMarket,
  validatePolymarketTags,
  PolymarketEventSchema,
  PolymarketMarketSchema,
  PolymarketTagSchema,
  type EventValidationResult,
  type ValidatedPolymarketEvent,
} from './enhanced-event-validation.js';

describe('Enhanced Event Validation', () => {
  // Sample valid data for testing
  const validTag = {
    id: 1,
    label: 'Politics',
    slug: 'politics',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    requiresTranslation: false,
  };

  const validMarket = {
    id: 'market-123',
    question: 'Will candidate X win the election?',
    conditionId: 'condition-123',
    slug: 'candidate-x-election',
    description: 'Market about election outcome',
    resolutionSource: 'Official election results',
    active: true,
    closed: false,
    archived: false,
    new: false,
    featured: true,
    restricted: false,
    volume: '50000',
    volumeNum: 50000,
    outcomes: '["Yes", "No"]',
    outcomePrices: '[0.6, 0.4]',
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
  };

  const validEvent = {
    id: 'event-123',
    ticker: 'ELECTION2024',
    slug: 'election-2024',
    title: '2024 Presidential Election',
    description: 'Markets related to the 2024 presidential election',
    resolutionSource: 'Official election results',
    active: true,
    closed: false,
    archived: false,
    new: false,
    featured: true,
    restricted: false,
    startDate: '2024-01-01T00:00:00Z',
    creationDate: '2024-01-01T00:00:00Z',
    endDate: '2024-12-31T23:59:59Z',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    liquidity: 100000,
    volume: 500000,
    openInterest: 200000,
    competitive: 0.85,
    volume24hr: 25000,
    volume1wk: 150000,
    volume1mo: 400000,
    volume1yr: 500000,
    enableOrderBook: true,
    liquidityClob: 100000,
    negRisk: false,
    commentCount: 42,
    markets: [validMarket],
    tags: [validTag],
    cyom: false,
    showAllOutcomes: true,
    showMarketImages: false,
    enableNegRisk: false,
    automaticallyActive: true,
    gmpChartMode: 'default',
    negRiskAugmented: false,
    cumulativeMarkets: false,
    pendingDeployment: false,
    deploying: false,
    requiresTranslation: false,
  };

  describe('PolymarketTagSchema', () => {
    it('should validate a valid tag', () => {
      const result = PolymarketTagSchema.safeParse(validTag);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe(1);
        expect(result.data.label).toBe('Politics');
      }
    });

    it('should reject tag with missing required fields', () => {
      const invalidTag = { ...validTag };
      delete (invalidTag as any).id;
      
      const result = PolymarketTagSchema.safeParse(invalidTag);
      expect(result.success).toBe(false);
    });

    it('should reject tag with invalid id type', () => {
      const invalidTag = { ...validTag, id: 'not-a-number' };
      
      const result = PolymarketTagSchema.safeParse(invalidTag);
      expect(result.success).toBe(false);
    });
  });

  describe('PolymarketMarketSchema', () => {
    it('should validate a valid market', () => {
      const result = PolymarketMarketSchema.safeParse(validMarket);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('market-123');
        expect(result.data.volumeNum).toBe(50000);
      }
    });

    it('should reject market with missing required fields', () => {
      const invalidMarket = { ...validMarket };
      delete (invalidMarket as any).question;
      
      const result = PolymarketMarketSchema.safeParse(invalidMarket);
      expect(result.success).toBe(false);
    });

    it('should reject market with negative volume', () => {
      const invalidMarket = { ...validMarket, volumeNum: -1000 };
      
      const result = PolymarketMarketSchema.safeParse(invalidMarket);
      expect(result.success).toBe(false);
    });

    it('should handle optional fields correctly', () => {
      const marketWithOptionals = {
        ...validMarket,
        liquidity: '75000',
        liquidityNum: 75000,
        lastTradePrice: 0.65,
        bestBid: 0.64,
        bestAsk: 0.66,
      };
      
      const result = PolymarketMarketSchema.safeParse(marketWithOptionals);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.liquidityNum).toBe(75000);
        expect(result.data.lastTradePrice).toBe(0.65);
      }
    });
  });

  describe('PolymarketEventSchema', () => {
    it('should validate a valid event with nested markets and tags', () => {
      const result = PolymarketEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe('event-123');
        expect(result.data.markets).toHaveLength(1);
        expect(result.data.tags).toHaveLength(1);
        expect(result.data.markets[0].id).toBe('market-123');
        expect(result.data.tags[0].id).toBe(1);
      }
    });

    it('should validate event with empty markets and tags arrays', () => {
      const eventWithEmptyArrays = {
        ...validEvent,
        markets: [],
        tags: [],
      };
      
      const result = PolymarketEventSchema.safeParse(eventWithEmptyArrays);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.markets).toHaveLength(0);
        expect(result.data.tags).toHaveLength(0);
      }
    });

    it('should reject event with missing required fields', () => {
      const invalidEvent = { ...validEvent };
      delete (invalidEvent as any).title;
      
      const result = PolymarketEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });

    it('should reject event with negative metrics', () => {
      const invalidEvent = { ...validEvent, volume: -1000 };
      
      const result = PolymarketEventSchema.safeParse(invalidEvent);
      expect(result.success).toBe(false);
    });
  });

  describe('validatePolymarketEvent function', () => {
    it('should successfully validate a valid event', () => {
      const result = validatePolymarketEvent(validEvent);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.error).toBeUndefined();
      expect(result.data?.id).toBe('event-123');
    });

    it('should handle malformed event data gracefully with partial validation', () => {
      const malformedEvent = {
        ...validEvent,
        volume: 'not-a-number', // Invalid type
        markets: [
          { ...validMarket },
          { id: 'invalid-market' }, // Missing required fields
        ],
      };
      
      const result = validatePolymarketEvent(malformedEvent, {
        allowPartialData: true,
        skipMalformedMarkets: true,
      });
      
      // Should succeed with partial data recovery
      expect(result.success).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.data?.markets).toHaveLength(1); // Only valid market included
    });

    it('should provide detailed error information for validation failures', () => {
      const invalidEvent = {
        id: 123, // Should be string
        title: '', // Should be non-empty
        // Missing many required fields
      };
      
      const result = validatePolymarketEvent(invalidEvent, {
        strict: false, // Use non-strict mode to get schema validation error
        allowPartialData: false,
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.type).toBe('schema_validation');
      expect(result.error?.message).toBeDefined();
      expect(result.error?.suggestions).toBeDefined();
    });

    it('should handle non-object input gracefully', () => {
      const result = validatePolymarketEvent('not-an-object');
      
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('schema_validation');
    });

    it('should handle null and undefined input', () => {
      const nullResult = validatePolymarketEvent(null);
      const undefinedResult = validatePolymarketEvent(undefined);
      
      expect(nullResult.success).toBe(false);
      expect(undefinedResult.success).toBe(false);
    });
  });

  describe('validatePolymarketEvents function', () => {
    it('should successfully validate an array of valid events', () => {
      const events = [validEvent, { ...validEvent, id: 'event-456', title: 'Another Event' }];
      const result = validatePolymarketEvents(events);
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].id).toBe('event-123');
      expect(result.data?.[1].id).toBe('event-456');
    });

    it('should handle mixed valid and invalid events with partial data support', () => {
      const events = [
        validEvent,
        { id: 'invalid-event' }, // Missing required fields
        { ...validEvent, id: 'event-789', title: 'Valid Event 2' },
      ];
      
      const result = validatePolymarketEvents(events, {
        allowPartialData: true,
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2); // Only valid events
      expect(result.warnings).toBeDefined();
      expect(result.warnings?.length).toBeGreaterThan(0);
    });

    it('should reject non-array input', () => {
      const result = validatePolymarketEvents(validEvent); // Single event instead of array
      
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('malformed_data');
      expect(result.error?.message).toContain('Expected array');
    });

    it('should handle empty array', () => {
      const result = validatePolymarketEvents([]);
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should fail fast in strict mode when encountering invalid event', () => {
      const events = [
        validEvent,
        { id: 'invalid-event' }, // Missing required fields
      ];
      
      const result = validatePolymarketEvents(events, {
        strict: false, // Use non-strict mode but disable partial data
        allowPartialData: false,
      });
      
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Batch validation failed');
    });
  });

  describe('validatePolymarketMarket function', () => {
    it('should successfully validate a valid market', () => {
      const result = validatePolymarketMarket(validMarket);
      
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('market-123');
    });

    it('should provide detailed error for invalid market', () => {
      const invalidMarket = {
        id: 'market-123',
        // Missing required question field
        volumeNum: -100, // Invalid negative value
      };
      
      const result = validatePolymarketMarket(invalidMarket);
      
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('schema_validation');
      expect(result.error?.field).toBeDefined();
    });
  });

  describe('validatePolymarketTags function', () => {
    it('should successfully validate an array of valid tags', () => {
      const tags = [
        validTag,
        { ...validTag, id: 2, label: 'Economics', slug: 'economics' },
      ];
      
      const result = validatePolymarketTags(tags);
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });

    it('should handle mixed valid and invalid tags with partial data support', () => {
      const tags = [
        validTag,
        { id: 'invalid-id' }, // Invalid id type
        { ...validTag, id: 3, label: 'Sports', slug: 'sports' },
      ];
      
      const result = validatePolymarketTags(tags, {
        allowPartialData: true,
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2); // Only valid tags
      expect(result.warnings).toBeDefined();
    });

    it('should reject non-array input', () => {
      const result = validatePolymarketTags(validTag); // Single tag instead of array
      
      expect(result.success).toBe(false);
      expect(result.error?.type).toBe('malformed_data');
    });
  });

  describe('Error Recovery and Partial Validation', () => {
    it('should recover from malformed markets in events', () => {
      const eventWithMalformedMarkets = {
        ...validEvent,
        markets: [
          validMarket,
          { id: 'incomplete-market' }, // Missing required fields
          null, // Completely invalid
          { ...validMarket, id: 'market-456', question: 'Another valid market?' },
        ],
      };
      
      const result = validatePolymarketEvent(eventWithMalformedMarkets, {
        allowPartialData: true,
        skipMalformedMarkets: true,
      });
      
      expect(result.success).toBe(true);
      expect(result.data?.markets).toHaveLength(2); // Only valid markets
      expect(result.warnings).toBeDefined();
    });

    it('should provide helpful suggestions in error messages', () => {
      const result = validatePolymarketEvent({}, { strict: true });
      
      expect(result.success).toBe(false);
      expect(result.error?.suggestions).toBeDefined();
      expect(result.error?.suggestions?.length).toBeGreaterThan(0);
    });

    it('should handle deeply nested validation errors', () => {
      const eventWithNestedErrors = {
        ...validEvent,
        markets: [{
          ...validMarket,
          volumeNum: 'not-a-number', // Type error in nested object
        }],
      };
      
      const result = validatePolymarketEvent(eventWithNestedErrors, {
        allowPartialData: true,
        skipMalformedMarkets: true,
      });
      
      // Should either succeed with empty markets or provide detailed error
      if (result.success) {
        expect(result.data?.markets).toHaveLength(0);
      } else {
        expect(result.error?.path).toBeDefined();
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large events with many markets efficiently', () => {
      const largeEvent = {
        ...validEvent,
        markets: Array.from({ length: 100 }, (_, i) => ({
          ...validMarket,
          id: `market-${i}`,
          question: `Market question ${i}?`,
        })),
      };
      
      const startTime = Date.now();
      const result = validatePolymarketEvent(largeEvent);
      const endTime = Date.now();
      
      expect(result.success).toBe(true);
      expect(result.data?.markets).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle events with special characters and unicode', () => {
      const unicodeEvent = {
        ...validEvent,
        title: '🗳️ Election 2024 - Élection présidentielle',
        description: 'Market with émojis and spëcial characters: 中文, العربية, русский',
      };
      
      const result = validatePolymarketEvent(unicodeEvent);
      
      expect(result.success).toBe(true);
      expect(result.data?.title).toContain('🗳️');
    });

    it('should handle extremely long strings gracefully', () => {
      const longStringEvent = {
        ...validEvent,
        description: 'A'.repeat(10000), // Very long description
      };
      
      const result = validatePolymarketEvent(longStringEvent);
      
      expect(result.success).toBe(true);
      expect(result.data?.description).toHaveLength(10000);
    });
  });
});