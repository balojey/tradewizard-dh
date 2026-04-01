/**
 * Unit tests for Market Ingestion Node
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { marketIngestionNode } from './market-ingestion.js';
import type { GraphStateType } from '../models/state.js';
import type { PolymarketClient } from '../utils/polymarket-client.js';
import type { MarketBriefingDocument, IngestionError } from '../models/types.js';

describe('Market Ingestion Node', () => {
  // Mock Polymarket client
  let mockPolymarketClient: PolymarketClient;

  beforeEach(() => {
    // Create a mock client with fetchMarketData method
    mockPolymarketClient = {
      fetchMarketData: vi.fn(),
    } as unknown as PolymarketClient;
  });

  describe('Successful market data fetch', () => {
    it('should fetch market data and create MBD', async () => {
      // Arrange
      const conditionId = 'test-condition-123';
      const mockMBD: MarketBriefingDocument = {
        marketId: 'test-market',
        conditionId,
        eventType: 'election',
        question: 'Will candidate X win the election?',
        resolutionCriteria: 'Resolves YES if candidate X wins',
        expiryTimestamp: Date.now() + 86400000,
        currentProbability: 0.65,
        liquidityScore: 7.5,
        bidAskSpread: 1.5,
        volatilityRegime: 'low',
        volume24h: 50000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [
            { event: 'Election day', timestamp: Date.now() + 86400000 },
          ],
        },
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: true,
        data: mockMBD,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeDefined();
      expect(result.mbd?.conditionId).toBe(conditionId);
      expect(result.mbd?.marketId).toBe('test-market');
      expect(result.ingestionError).toBeUndefined();
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog?.[0].stage).toBe('market_ingestion');
      expect(result.auditLog?.[0].data).toMatchObject({
        conditionId,
        success: true,
      });
    });

    it('should enhance MBD with volatility regime calculation', async () => {
      // Arrange
      const conditionId = 'test-condition-456';
      const mockMBD: MarketBriefingDocument = {
        marketId: 'test-market',
        conditionId,
        eventType: 'economic',
        question: 'Will Bitcoin reach $100k?',
        resolutionCriteria: 'Resolves YES if Bitcoin reaches $100k',
        expiryTimestamp: Date.now() + 86400000,
        currentProbability: 0.95, // Extreme probability
        liquidityScore: 3.0, // Low liquidity
        bidAskSpread: 8.0, // Wide spread
        volatilityRegime: 'low', // Will be recalculated
        volume24h: 10000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: true,
        data: mockMBD,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeDefined();
      expect(result.mbd?.volatilityRegime).toBe('high'); // Should be recalculated to high
    });

    it('should detect ambiguous resolution criteria', async () => {
      // Arrange
      const conditionId = 'test-condition-789';
      const mockMBD: MarketBriefingDocument = {
        marketId: 'test-market',
        conditionId,
        eventType: 'policy',
        question: 'Will there be a significant policy change soon?',
        resolutionCriteria:
          'Resolves YES if a major policy change occurs approximately in the near future',
        expiryTimestamp: Date.now() + 86400000,
        currentProbability: 0.5,
        liquidityScore: 5.0,
        bidAskSpread: 3.0,
        volatilityRegime: 'medium',
        volume24h: 25000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: true,
        data: mockMBD,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeDefined();
      expect(result.mbd?.metadata.ambiguityFlags.length).toBeGreaterThan(0);
      expect(
        result.mbd?.metadata.ambiguityFlags.some((flag) => flag.includes('significant'))
      ).toBe(true);
      expect(result.mbd?.metadata.ambiguityFlags.some((flag) => flag.includes('soon'))).toBe(
        true
      );
      expect(
        result.mbd?.metadata.ambiguityFlags.some((flag) => flag.includes('approximately'))
      ).toBe(true);
      expect(result.mbd?.metadata.ambiguityFlags.some((flag) => flag.includes('major'))).toBe(
        true
      );
    });
  });

  describe('Error handling', () => {
    it('should handle invalid market ID', async () => {
      // Arrange
      const conditionId = 'invalid-market';
      const error: IngestionError = {
        type: 'INVALID_MARKET_ID',
        marketId: conditionId,
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: false,
        error,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeUndefined();
      expect(result.ingestionError).toBeDefined();
      expect(result.ingestionError?.type).toBe('INVALID_MARKET_ID');
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog?.[0].data).toMatchObject({
        success: false,
      });
    });

    it('should handle API unavailability', async () => {
      // Arrange
      const conditionId = 'test-condition';
      const error: IngestionError = {
        type: 'API_UNAVAILABLE',
        message: 'Polymarket API is down',
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: false,
        error,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeUndefined();
      expect(result.ingestionError).toBeDefined();
      expect(result.ingestionError?.type).toBe('API_UNAVAILABLE');
      expect(result.auditLog?.[0].data).toMatchObject({
        success: false,
      });
    });

    it('should handle rate limit exceeded', async () => {
      // Arrange
      const conditionId = 'test-condition';
      const error: IngestionError = {
        type: 'RATE_LIMIT_EXCEEDED',
        retryAfter: 60,
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: false,
        error,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeUndefined();
      expect(result.ingestionError).toBeDefined();
      expect(result.ingestionError?.type).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should handle unexpected errors', async () => {
      // Arrange
      const conditionId = 'test-condition';

      vi.mocked(mockPolymarketClient.fetchMarketData).mockRejectedValue(
        new Error('Unexpected network error')
      );

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeUndefined();
      expect(result.ingestionError).toBeDefined();
      expect(result.ingestionError?.type).toBe('API_UNAVAILABLE');
      if (result.ingestionError?.type === 'API_UNAVAILABLE') {
        expect(result.ingestionError.message).toContain('Unexpected network error');
      }
    });
  });

  describe('Volatility regime classification', () => {
    it('should classify low volatility correctly', async () => {
      // Arrange
      const mockMBD: MarketBriefingDocument = {
        marketId: 'test-market',
        conditionId: 'test-condition',
        eventType: 'election',
        question: 'Test question',
        resolutionCriteria: 'Test criteria',
        expiryTimestamp: Date.now() + 86400000,
        currentProbability: 0.5, // Middle probability
        liquidityScore: 8.0, // High liquidity
        bidAskSpread: 1.0, // Narrow spread
        volatilityRegime: 'high', // Will be recalculated
        volume24h: 50000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: true,
        data: mockMBD,
      });

      const state: GraphStateType = {
        conditionId: 'test-condition',
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd?.volatilityRegime).toBe('low');
    });

    it('should classify medium volatility correctly', async () => {
      // Arrange
      const mockMBD: MarketBriefingDocument = {
        marketId: 'test-market',
        conditionId: 'test-condition',
        eventType: 'election',
        question: 'Test question',
        resolutionCriteria: 'Test criteria',
        expiryTimestamp: Date.now() + 86400000,
        currentProbability: 0.5,
        liquidityScore: 5.0, // Medium liquidity
        bidAskSpread: 3.5, // Medium spread
        volatilityRegime: 'low', // Will be recalculated
        volume24h: 25000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: true,
        data: mockMBD,
      });

      const state: GraphStateType = {
        conditionId: 'test-condition',
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd?.volatilityRegime).toBe('medium');
    });

    it('should classify high volatility correctly', async () => {
      // Arrange
      const mockMBD: MarketBriefingDocument = {
        marketId: 'test-market',
        conditionId: 'test-condition',
        eventType: 'election',
        question: 'Test question',
        resolutionCriteria: 'Test criteria',
        expiryTimestamp: Date.now() + 86400000,
        currentProbability: 0.05, // Extreme probability
        liquidityScore: 2.0, // Low liquidity
        bidAskSpread: 10.0, // Wide spread
        volatilityRegime: 'low', // Will be recalculated
        volume24h: 5000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: true,
        data: mockMBD,
      });

      const state: GraphStateType = {
        conditionId: 'test-condition',
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd?.volatilityRegime).toBe('high');
    });
  });

  describe('State updates', () => {
    it('should write MBD to state on success', async () => {
      // Arrange
      const conditionId = 'test-condition';
      const mockMBD: MarketBriefingDocument = {
        marketId: 'test-market',
        conditionId,
        eventType: 'election',
        question: 'Test question',
        resolutionCriteria: 'Test criteria',
        expiryTimestamp: Date.now() + 86400000,
        currentProbability: 0.65,
        liquidityScore: 7.5,
        bidAskSpread: 1.5,
        volatilityRegime: 'low',
        volume24h: 50000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: true,
        data: mockMBD,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeDefined();
      expect(result.mbd?.conditionId).toBe(conditionId);
      expect(result.ingestionError).toBeUndefined();
    });

    it('should write ingestionError to state on failure', async () => {
      // Arrange
      const conditionId = 'invalid-market';
      const error: IngestionError = {
        type: 'INVALID_MARKET_ID',
        marketId: conditionId,
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: false,
        error,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.mbd).toBeUndefined();
      expect(result.ingestionError).toBeDefined();
      expect(result.ingestionError?.type).toBe('INVALID_MARKET_ID');
    });

    it('should add audit log entry on success', async () => {
      // Arrange
      const conditionId = 'test-condition';
      const mockMBD: MarketBriefingDocument = {
        marketId: 'test-market',
        conditionId,
        eventType: 'election',
        question: 'Test question',
        resolutionCriteria: 'Test criteria',
        expiryTimestamp: Date.now() + 86400000,
        currentProbability: 0.65,
        liquidityScore: 7.5,
        bidAskSpread: 1.5,
        volatilityRegime: 'low',
        volume24h: 50000,
        metadata: {
          ambiguityFlags: [],
          keyCatalysts: [],
        },
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: true,
        data: mockMBD,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog?.length).toBe(1);
      expect(result.auditLog?.[0].stage).toBe('market_ingestion');
      expect(result.auditLog?.[0].data).toMatchObject({
        conditionId,
        success: true,
        marketId: 'test-market',
      });
    });

    it('should add audit log entry on failure', async () => {
      // Arrange
      const conditionId = 'invalid-market';
      const error: IngestionError = {
        type: 'INVALID_MARKET_ID',
        marketId: conditionId,
      };

      vi.mocked(mockPolymarketClient.fetchMarketData).mockResolvedValue({
        ok: false,
        error,
      });

      const state: GraphStateType = {
        conditionId,
        mbd: null,
        ingestionError: null,
        agentSignals: [],
        agentErrors: [],
        bullThesis: null,
        bearThesis: null,
        debateRecord: null,
        consensus: null,
        consensusError: null,
        recommendation: null,
        auditLog: [],
      };

      // Act
      const result = await marketIngestionNode(state, mockPolymarketClient);

      // Assert
      expect(result.auditLog).toBeDefined();
      expect(result.auditLog?.length).toBe(1);
      expect(result.auditLog?.[0].stage).toBe('market_ingestion');
      expect(result.auditLog?.[0].data).toMatchObject({
        conditionId,
        success: false,
      });
    });
  });
});
