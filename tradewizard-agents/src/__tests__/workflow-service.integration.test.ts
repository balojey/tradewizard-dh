/**
 * Integration Tests for End-to-End Workflow Service Flow
 *
 * Task 7.1: Create integration test for end-to-end workflow service flow
 *
 * Tests the complete flow of:
 * 1. Setting up a mock workflow service endpoint
 * 2. Configuring the system to use the mock endpoint
 * 3. Executing analysis through the workflow service
 * 4. Verifying the complete request/response flow
 * 5. Testing both success and failure scenarios
 *
 * Requirements tested: 1.3, 2.1, 2.2, 2.3, 2.4, 2.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeMarket } from './workflow.js';
import { createConfig, loadConfig } from './config/index.js';
import { PolymarketClient } from './utils/polymarket-client.js';
import type { TradeRecommendation, AgentSignal } from './models/types.js';
import type { EngineConfig } from './config/index.js';

// Mock fetch globally
const originalFetch = global.fetch;

describe('Workflow Service Integration - End-to-End Flow', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockFetch: ReturnType<typeof vi.fn>;
  let testConfig: EngineConfig;
  let polymarketClient: PolymarketClient;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Ensure required environment variables are set for config validation
    process.env.POLYMARKET_ENVIRONMENT = 'development';
    process.env.POLYMARKET_GAMMA_API_URL = 'https://gamma-api.polymarket.com';
    process.env.POLYMARKET_CLOB_API_URL = 'https://clob.polymarket.com';

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    // Mock console methods to reduce noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;

    // Restore fetch
    global.fetch = originalFetch;

    // Restore console
    vi.restoreAllMocks();
  });

  /**
   * Helper function to create test configuration with workflow service
   * Uses createConfig directly with minimal overrides (same pattern as workflow.integration.test.ts)
   */
  const createTestConfig = (workflowUrl: string, timeoutMs = 120000): EngineConfig => {
    return createConfig({
      llm: {
        singleProvider: 'openai',
        openai: {
          apiKey: process.env.OPENAI_API_KEY || 'test-key',
          defaultModel: 'gpt-4o-mini',
        },
      },
      workflowService: {
        url: workflowUrl,
        timeoutMs,
      },
      agents: {
        timeoutMs: 10000,
        minAgentsRequired: 2,
      },
    });
  };

  /**
   * Helper function to create a complete mock response
   */
  const createMockAnalysisResponse = (conditionId: string) => {
    const mockRecommendation: TradeRecommendation = {
      marketId: conditionId,
      action: 'LONG_YES',
      entryZone: [0.45, 0.50],
      targetZone: [0.60, 0.70],
      expectedValue: 25.5,
      winProbability: 0.65,
      liquidityRisk: 'medium',
      explanation: {
        summary: 'Strong bullish signal based on polling data and market sentiment',
        coreThesis: 'Recent polls show increasing support with favorable market conditions',
        keyCatalysts: ['Poll release', 'Debate performance', 'News coverage'],
        failureScenarios: ['Unexpected negative news', 'Market reversal', 'Low turnout'],
      },
      metadata: {
        consensusProbability: 0.65,
        marketProbability: 0.48,
        edge: 0.17,
        confidenceBand: [0.60, 0.70],
      },
    };

    const mockAgentSignals: AgentSignal[] = [
      {
        agentName: 'polling_intelligence',
        timestamp: Date.now(),
        confidence: 0.85,
        direction: 'YES',
        fairProbability: 0.67,
        keyDrivers: ['Recent poll data', 'Historical patterns', 'Demographic trends'],
        riskFactors: ['Sample size', 'Timing uncertainty'],
        metadata: { pollCount: 5, avgSampleSize: 1200 },
      },
      {
        agentName: 'market_microstructure',
        timestamp: Date.now(),
        confidence: 0.78,
        direction: 'YES',
        fairProbability: 0.63,
        keyDrivers: ['Order book depth', 'Volume analysis', 'Price momentum'],
        riskFactors: ['Low liquidity', 'Wide spread'],
        metadata: { volumeRatio: 1.5, spreadBps: 150 },
      },
      {
        agentName: 'sentiment_narrative',
        timestamp: Date.now(),
        confidence: 0.72,
        direction: 'YES',
        fairProbability: 0.65,
        keyDrivers: ['Positive news sentiment', 'Social media trends'],
        riskFactors: ['Sentiment volatility', 'Echo chamber effects'],
        metadata: { sentimentScore: 0.68 },
      },
    ];

    return {
      recommendation: mockRecommendation,
      agentSignals: mockAgentSignals,
      cost: 0.45,
    };
  };

  describe('Success Scenarios - Complete Flow', () => {
    it('should execute complete end-to-end analysis via workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-complete-flow';
      const mockResponse = createMockAnalysisResponse(conditionId);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      });

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-integration-token-12345';

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act
      const result = await analyzeMarket(conditionId, testConfig, polymarketClient);

      // Assert - Verify request was sent correctly (Requirements 2.1, 2.2, 2.3)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        workflowUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-integration-token-12345',
          }),
          body: JSON.stringify({ conditionId }),
        })
      );

      // Assert - Verify response was parsed correctly (Requirements 2.4, 2.5)
      expect(result).toBeDefined();
      expect(result.recommendation).toEqual(mockResponse.recommendation);
      expect(result.agentSignals).toEqual(mockResponse.agentSignals);
      expect(result.cost).toBe(mockResponse.cost);

      // Assert - Verify recommendation structure
      expect(result.recommendation?.marketId).toBe(conditionId);
      expect(result.recommendation?.action).toBe('LONG_YES');
      expect(result.recommendation?.entryZone).toEqual([0.45, 0.50]);
      expect(result.recommendation?.targetZone).toEqual([0.60, 0.70]);
      expect(result.recommendation?.expectedValue).toBe(25.5);
      expect(result.recommendation?.winProbability).toBe(0.65);
      expect(result.recommendation?.liquidityRisk).toBe('medium');
      expect(result.recommendation?.explanation).toBeDefined();
      expect(result.recommendation?.metadata).toBeDefined();

      // Assert - Verify agent signals structure
      expect(result.agentSignals).toHaveLength(3);
      expect(result.agentSignals[0].agentName).toBe('polling_intelligence');
      expect(result.agentSignals[0].confidence).toBe(0.85);
      expect(result.agentSignals[0].direction).toBe('YES');
    });

    it('should handle null recommendation from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-null-recommendation';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: null,
          agentSignals: [],
          cost: 0.10,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act
      const result = await analyzeMarket(conditionId, testConfig, polymarketClient);

      // Assert
      expect(result.recommendation).toBeNull();
      expect(result.agentSignals).toEqual([]);
      expect(result.cost).toBe(0.10);
    });

    it('should handle NO_TRADE recommendation from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-no-trade';

      const noTradeRecommendation: TradeRecommendation = {
        marketId: conditionId,
        action: 'NO_TRADE',
        entryZone: [0, 0],
        targetZone: [0, 0],
        expectedValue: 0,
        winProbability: 0,
        liquidityRisk: 'low',
        explanation: {
          summary: 'No clear edge detected in this market',
          coreThesis: 'Market appears fairly priced',
          keyCatalysts: [],
          failureScenarios: [],
        },
        metadata: {
          consensusProbability: 0.50,
          marketProbability: 0.50,
          edge: 0,
          confidenceBand: [0.45, 0.55],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: noTradeRecommendation,
          agentSignals: [],
          cost: 0.25,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act
      const result = await analyzeMarket(conditionId, testConfig, polymarketClient);

      // Assert
      expect(result.recommendation?.action).toBe('NO_TRADE');
      expect(result.recommendation?.expectedValue).toBe(0);
    });

    it('should handle LONG_NO recommendation from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-long-no';

      const longNoRecommendation: TradeRecommendation = {
        marketId: conditionId,
        action: 'LONG_NO',
        entryZone: [0.30, 0.35],
        targetZone: [0.50, 0.60],
        expectedValue: 18.5,
        winProbability: 0.58,
        liquidityRisk: 'medium',
        explanation: {
          summary: 'Bearish signal detected',
          coreThesis: 'Market overvalued based on fundamentals',
          keyCatalysts: ['Negative news', 'Poll decline'],
          failureScenarios: ['Unexpected positive development'],
        },
        metadata: {
          consensusProbability: 0.42,
          marketProbability: 0.35,
          edge: 0.07,
          confidenceBand: [0.38, 0.46],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: longNoRecommendation,
          agentSignals: [
            {
              agentName: 'risk_philosophy',
              timestamp: Date.now(),
              confidence: 0.75,
              direction: 'NO',
              fairProbability: 0.42,
              keyDrivers: ['Risk assessment'],
              riskFactors: ['Market volatility'],
              metadata: {},
            },
          ],
          cost: 0.35,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act
      const result = await analyzeMarket(conditionId, testConfig, polymarketClient);

      // Assert
      expect(result.recommendation?.action).toBe('LONG_NO');
      expect(result.recommendation?.expectedValue).toBe(18.5);
      expect(result.agentSignals).toHaveLength(1);
    });
  });

  describe('Failure Scenarios - Error Handling', () => {
    it('should handle 500 Internal Server Error from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-500-error';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Service temporarily unavailable due to maintenance',
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Workflow service error \(500\)/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Service may be experiencing issues/
      );
    });

    it('should handle 503 Service Unavailable from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-503-error';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => 'Service is overloaded',
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Workflow service error \(503\)/
      );
    });

    it('should handle 401 Unauthorized from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-401-error';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid authentication token',
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Authentication failed/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Check DIGITALOCEAN_API_TOKEN/
      );
    });

    it('should handle 403 Forbidden from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-403-error';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => 'Token does not have required permissions',
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Authentication failed/
      );
    });

    it('should handle 400 Bad Request from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-400-error';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid conditionId format',
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Bad request \(400\)/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Invalid conditionId format/
      );
    });

    it('should handle 404 Not Found from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/wrong-endpoint';
      const conditionId = '0xe2e-test-404-error';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Endpoint not found',
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Workflow service endpoint not found \(404\)/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Check WORKFLOW_SERVICE_URL configuration/
      );
    });

    it('should handle 429 Rate Limit Exceeded from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-429-error';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => 'Rate limit exceeded, retry after 60 seconds',
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Rate limit exceeded \(429\)/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Too many requests/
      );
    });

    it('should handle network connection refused error', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-connection-refused';

      const networkError = new Error('fetch failed') as Error & { code: string };
      networkError.code = 'ECONNREFUSED';
      mockFetch.mockRejectedValueOnce(networkError);

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Workflow service is unreachable/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /connection refused/
      );
    });

    it('should handle DNS lookup failure', async () => {
      // Arrange
      const workflowUrl = 'https://nonexistent-domain-12345.example.com/analyze';
      const conditionId = '0xe2e-test-dns-failure';

      const dnsError = new Error('getaddrinfo ENOTFOUND') as Error & { code: string };
      dnsError.code = 'ENOTFOUND';
      mockFetch.mockRejectedValueOnce(dnsError);

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Workflow service is unreachable/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /DNS lookup failed/
      );
    });

    it('should handle request timeout', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-timeout';

      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      testConfig = createTestConfig(workflowUrl, 5000); // Short timeout
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /timed out after 5000ms/
      );
    });

    it('should handle invalid JSON response', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-invalid-json';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token in JSON');
        },
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow();
    });

    it('should handle missing required fields in response', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-missing-fields';

      // Missing agentSignals field
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: null,
          cost: 0.25,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Invalid response/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /missing required field/
      );
    });

    it('should handle invalid recommendation type in response', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-invalid-recommendation';

      // recommendation is a string instead of object or null
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: 'invalid-string',
          agentSignals: [],
          cost: 0.25,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Invalid response/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /recommendation must be an object or null/
      );
    });

    it('should handle invalid agentSignals type in response', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-invalid-signals';

      // agentSignals is an object instead of array
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: null,
          agentSignals: { invalid: 'object' },
          cost: 0.25,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Invalid response/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /agentSignals must be an array/
      );
    });

    it('should handle invalid cost type in response', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-invalid-cost';

      // cost is a string instead of number
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: null,
          agentSignals: [],
          cost: '0.25',
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /Invalid response/
      );
      await expect(analyzeMarket(conditionId, testConfig, polymarketClient)).rejects.toThrow(
        /cost must be a number/
      );
    });
  });

  describe('Configuration and Routing', () => {
    it('should use workflow service when URL is configured (Requirement 1.3)', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-routing';
      const consoleLogSpy = vi.spyOn(console, 'log');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: null,
          agentSignals: [],
          cost: 0,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act
      await analyzeMarket(conditionId, testConfig, polymarketClient);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Workflow] Using workflow service at')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(workflowUrl)
      );
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should include authentication token in request headers', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-auth-header';
      const authToken = 'test-auth-token-xyz-789';

      process.env.DIGITALOCEAN_API_TOKEN = authToken;

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: null,
          agentSignals: [],
          cost: 0,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act
      await analyzeMarket(conditionId, testConfig, polymarketClient);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        workflowUrl,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Bearer ${authToken}`,
          }),
        })
      );
    });

    it('should send correct request body format', async () => {
      // Arrange
      const workflowUrl = 'https://workflow-service.example.com/analyze';
      const conditionId = '0xe2e-test-request-body';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: null,
          agentSignals: [],
          cost: 0,
        }),
      });

      testConfig = createTestConfig(workflowUrl);
      polymarketClient = new PolymarketClient(testConfig.polymarket);

      // Act
      await analyzeMarket(conditionId, testConfig, polymarketClient);

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        workflowUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ conditionId }),
        })
      );
    });
  });
});
