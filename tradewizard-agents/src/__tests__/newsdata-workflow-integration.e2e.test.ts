/**
 * End-to-End Integration Tests for NewsData.io Workflow Integration
 *
 * These tests verify the complete workflow from agent request to news response,
 * including integration with the existing LangGraph workflow and database systems.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeMarket } from './workflow.js';
import type { EngineConfig } from './config/index.js';
import { createConfig } from './config/index.js';
import type { PolymarketClient } from './utils/polymarket-client.js';

describe('NewsData.io Workflow E2E Integration Tests', () => {
  let mockConfig: EngineConfig;
  let mockPolymarketClient: PolymarketClient;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Store original environment variables
    originalEnv = {
      NEWSDATA_INTEGRATION_ENABLED: process.env.NEWSDATA_INTEGRATION_ENABLED,
      NEWSDATA_API_KEY: process.env.NEWSDATA_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    };

    // Set test environment
    process.env.NEWSDATA_INTEGRATION_ENABLED = 'true';
    process.env.NEWSDATA_API_KEY = 'test-api-key';
    process.env.OPENAI_API_KEY = 'test-openai-key';

    // Create comprehensive mock config
    mockConfig = createConfig({
      opik: {
        projectName: 'test-newsdata-integration',
        tags: ['e2e-test', 'newsdata'],
        trackCosts: true,
      },
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: 'test-openai-key',
          defaultModel: 'gpt-4o-mini',
        },
      },
      agents: {
        timeoutMs: 30000, // Longer timeout for E2E tests
        minAgentsRequired: 2,
      },
    });

    // Mock Polymarket client
    mockPolymarketClient = {
      fetchMarketData: vi.fn().mockResolvedValue({
        id: 'test-market-123',
        conditionId: 'test-condition-456',
        question: 'Will the 2024 US Presidential Election be decided by November 15, 2024?',
        description: 'This market will resolve to "Yes" if major news outlets declare a winner.',
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        currentProbability: 0.75,
        volume24h: 150000,
        liquidity: 500000,
      }),
    } as any;
  });

  afterEach(() => {
    // Restore original environment variables
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });

    vi.clearAllMocks();
  });

  describe('Complete Workflow Integration', () => {
    test('should execute complete workflow with NewsData integration enabled', async () => {
      // Execute the workflow
      const result = await analyzeMarket('test-condition-456', mockConfig, mockPolymarketClient);

      // Verify workflow execution
      expect(result).toBeDefined();
      expect(result.recommendation).toBeDefined();
      expect(result.agentSignals).toBeDefined();
      expect(result.recommendation?.marketId).toBe('test-market-123');
      expect(result.recommendation?.action).toBeDefined();
      expect(result.recommendation?.explanation).toBeDefined();

      // Verify Polymarket client was called
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledWith('test-condition-456');
    }, 30000); // 30 second timeout for E2E test

    test('should handle NewsData integration disabled gracefully', async () => {
      // Disable NewsData integration
      process.env.NEWSDATA_INTEGRATION_ENABLED = 'false';

      // Execute workflow
      const result = await analyzeMarket('test-condition-456', mockConfig, mockPolymarketClient);

      // Verify workflow still completes
      expect(result).toBeDefined();
      expect(result.recommendation?.marketId).toBe('test-market-123');
      expect(result.recommendation?.action).toBeDefined();
    }, 30000);

    test('should handle missing NewsData API key gracefully', async () => {
      // Remove API key
      delete process.env.NEWSDATA_API_KEY;

      // Execute workflow
      const result = await analyzeMarket('test-condition-456', mockConfig, mockPolymarketClient);

      // Verify workflow still completes
      expect(result).toBeDefined();
      expect(result.recommendation?.marketId).toBe('test-market-123');
    }, 30000);
  });

  describe('Error Recovery and Resilience', () => {
    test('should handle Polymarket API failures', async () => {
      // Mock Polymarket failure
      mockPolymarketClient.fetchMarketData = vi.fn().mockRejectedValue(new Error('Polymarket API unavailable'));

      // Execute workflow - should handle the error gracefully
      const result = await analyzeMarket('test-condition-456', mockConfig, mockPolymarketClient);

      // Workflow should return null on critical failures
      expect(result).toBeNull();
    }, 30000);

    test('should handle invalid condition ID', async () => {
      // Mock invalid condition response
      mockPolymarketClient.fetchMarketData = vi.fn().mockResolvedValue(null);

      // Execute workflow
      const result = await analyzeMarket('invalid-condition', mockConfig, mockPolymarketClient);

      // Should handle gracefully
      expect(result).toBeNull();
    }, 30000);
  });

  describe('Performance Testing', () => {
    test('should complete workflow within reasonable time', async () => {
      const startTime = Date.now();
      
      const result = await analyzeMarket('test-condition-456', mockConfig, mockPolymarketClient);
      
      const executionTime = Date.now() - startTime;

      // Verify workflow completed
      expect(result).toBeDefined();
      
      // Verify reasonable performance (should complete within 30 seconds)
      expect(executionTime).toBeLessThan(30000);
    }, 35000); // 35 second timeout with buffer

    test('should handle concurrent workflow executions', async () => {
      // Execute 3 concurrent workflows with different condition IDs
      const promises = [
        analyzeMarket('test-condition-1', mockConfig, mockPolymarketClient),
        analyzeMarket('test-condition-2', mockConfig, mockPolymarketClient),
        analyzeMarket('test-condition-3', mockConfig, mockPolymarketClient),
      ];

      const results = await Promise.all(promises);

      // Verify all workflows completed
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.recommendation?.marketId).toBe('test-market-123');
      });

      // Verify Polymarket was called for each workflow
      expect(mockPolymarketClient.fetchMarketData).toHaveBeenCalledTimes(3);
    }, 45000); // 45 second timeout for concurrent test
  });
});