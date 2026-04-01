/**
 * CLI Integration Tests for Workflow Service URL Configuration
 *
 * Tests task 6.1: Test CLI with workflow service URL configured
 *
 * Requirements tested:
 * - 3.1: CLI uses workflow service when URL is set
 * - 3.3: CLI displays recommendations correctly
 * - 3.4: CLI shows error messages when service fails
 * - 3.5: CLI logs execution mode
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { analyzeMarket } from '../workflow.js';
import { loadConfig, createConfig } from '../config/index.js';
import { PolymarketClient } from '../utils/polymarket-client.js';
import type { TradeRecommendation, AgentSignal } from '../models/types.js';

// Mock fetch globally
const originalFetch = global.fetch;

describe('CLI Workflow Service Integration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Mock fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch as any;

    // Clear console spies
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

  // Helper function to create test config
  const createTestConfig = (workflowUrl: string, timeoutMs = 120000) => {
    // Use loadConfig() which properly loads from environment and has defaults
    const baseConfig = loadConfig();
    return createConfig({
      ...baseConfig,
      workflowService: {
        url: workflowUrl,
        timeoutMs,
      },
    });
  };

  describe('Requirement 3.1: CLI uses workflow service when URL is set', () => {
    it('should send request to workflow URL when configured', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0x1234567890abcdef';
      const mockResponse: any = {
        recommendation: {
          marketId: conditionId,
          action: 'LONG_YES',
          entryZone: [0.45, 0.50],
          targetZone: [0.60, 0.70],
          expectedValue: 25.5,
          winProbability: 0.65,
          liquidityRisk: 'medium',
          explanation: {
            summary: 'Test summary',
            coreThesis: 'Test thesis',
            keyCatalysts: ['Catalyst 1'],
            failureScenarios: ['Scenario 1'],
          },
          metadata: {
            consensusProbability: 0.65,
            marketProbability: 0.48,
            edge: 0.17,
            confidenceBand: [0.60, 0.70],
          },
        },
        agentSignals: [
          {
            agentName: 'test_agent',
            timestamp: Date.now(),
            confidence: 0.85,
            direction: 'YES',
            fairProbability: 0.67,
            keyDrivers: ['Driver 1'],
            riskFactors: ['Risk 1'],
            metadata: {},
          },
        ],
        cost: 0.45,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponse,
        text: async () => JSON.stringify(mockResponse),
      });

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-123';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act
      const result = await analyzeMarket(conditionId, config, polymarketClient);

      // Assert
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        workflowUrl,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token-123',
          }),
          body: JSON.stringify({ conditionId }),
        })
      );

      expect(result.recommendation).toBeDefined();
      expect(result.recommendation?.action).toBe('LONG_YES');
      expect(result.agentSignals).toHaveLength(1);
      expect(result.cost).toBe(0.45);
    });
  });

  describe('Requirement 3.3: CLI displays recommendations correctly', () => {
    it('should return recommendation in correct format from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xabcdef1234567890';
      const mockRecommendation: TradeRecommendation = {
        marketId: conditionId,
        action: 'LONG_NO',
        entryZone: [0.30, 0.35],
        targetZone: [0.50, 0.60],
        expectedValue: 15.2,
        winProbability: 0.55,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Bearish signal based on market data',
          coreThesis: 'Market overvalued',
          keyCatalysts: ['News event', 'Poll data'],
          failureScenarios: ['Unexpected reversal'],
        },
        metadata: {
          consensusProbability: 0.55,
          marketProbability: 0.35,
          edge: 0.20,
          confidenceBand: [0.50, 0.60],
        },
      };

      const mockSignals: AgentSignal[] = [
        {
          agentName: 'market_microstructure',
          timestamp: Date.now(),
          confidence: 0.90,
          direction: 'NO',
          fairProbability: 0.55,
          keyDrivers: ['Volume analysis', 'Order book depth'],
          riskFactors: ['Low liquidity'],
          metadata: {},
        },
        {
          agentName: 'probability_baseline',
          timestamp: Date.now(),
          confidence: 0.75,
          direction: 'NO',
          fairProbability: 0.58,
          keyDrivers: ['Historical data'],
          riskFactors: ['Data quality'],
          metadata: {},
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: mockRecommendation,
          agentSignals: mockSignals,
          cost: 0.32,
        }),
      });

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-456';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act
      const result = await analyzeMarket(conditionId, config, polymarketClient);

      // Assert - Verify recommendation structure matches expected format
      expect(result.recommendation).toEqual(mockRecommendation);
      expect(result.agentSignals).toEqual(mockSignals);
      expect(result.cost).toBe(0.32);

      // Verify all required recommendation fields are present
      expect(result.recommendation?.marketId).toBe(conditionId);
      expect(result.recommendation?.action).toBe('LONG_NO');
      expect(result.recommendation?.entryZone).toEqual([0.30, 0.35]);
      expect(result.recommendation?.targetZone).toEqual([0.50, 0.60]);
      expect(result.recommendation?.expectedValue).toBe(15.2);
      expect(result.recommendation?.winProbability).toBe(0.55);
      expect(result.recommendation?.liquidityRisk).toBe('low');
      expect(result.recommendation?.explanation).toBeDefined();
      expect(result.recommendation?.metadata).toBeDefined();
    });

    it('should handle null recommendation from workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xnullrec123456';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          recommendation: null,
          agentSignals: [],
          cost: 0.10,
        }),
      });

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-789';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act
      const result = await analyzeMarket(conditionId, config, polymarketClient);

      // Assert
      expect(result.recommendation).toBeNull();
      expect(result.agentSignals).toEqual([]);
      expect(result.cost).toBe(0.10);
    });
  });

  describe('Requirement 3.4: CLI shows error messages when service fails', () => {
    it('should display clear error when workflow service returns 500', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xerror500';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Service temporarily unavailable',
      });

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-error';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /Workflow service error \(500\)/
      );
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /Service may be experiencing issues/
      );
    });

    it('should display clear error when workflow service is unreachable', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xunreachable';

      const networkError = new Error('fetch failed') as Error & { code: string };
      networkError.code = 'ECONNREFUSED';
      mockFetch.mockRejectedValueOnce(networkError);

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-unreachable';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /Workflow service is unreachable/
      );
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /connection refused/
      );
    });

    it('should display clear error when authentication fails', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xauth401';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid token',
      });

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'invalid-token';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /Authentication failed/
      );
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /Check DIGITALOCEAN_API_TOKEN/
      );
    });

    it('should display clear error when request times out', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xtimeout';

      // Simulate timeout by rejecting with AbortError
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      mockFetch.mockRejectedValueOnce(abortError);

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-timeout';

      const config = createTestConfig(workflowUrl, 5000); // Short timeout for test

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /timed out after 5000ms/
      );
    });

    it('should display clear error when response is invalid', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xinvalidresponse';

      // Missing required fields
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          // Missing recommendation and agentSignals
          cost: 0.25,
        }),
      });

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-invalid';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act & Assert
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /Invalid response/
      );
      await expect(analyzeMarket(conditionId, config, polymarketClient)).rejects.toThrow(
        /missing required field/
      );
    });
  });

  describe('Requirement 3.5: CLI logs execution mode', () => {
    it('should log "Using workflow service" when URL is configured', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xlogtest1';
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

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-log';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act
      await analyzeMarket(conditionId, config, polymarketClient);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Workflow] Using workflow service at')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(workflowUrl)
      );
    });

    it('should log "Using local workflow execution" when URL is not configured', async () => {
      // Arrange
      const conditionId = '0xlogtest2';
      const consoleLogSpy = vi.spyOn(console, 'log');

      // Don't set WORKFLOW_SERVICE_URL
      delete process.env.WORKFLOW_SERVICE_URL;

      const baseConfig = loadConfig();
      const config = createConfig({
        ...baseConfig,
        // No workflowService configuration
      });

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act
      // This will fail because we don't have a real Polymarket setup,
      // but we can check the log before it fails
      try {
        await analyzeMarket(conditionId, config, polymarketClient);
      } catch (error) {
        // Expected to fail in test environment
      }

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[Workflow] Using local workflow execution'
      );
    });

    it('should log request details when sending to workflow service', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xlogtest3';
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

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-details';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act
      await analyzeMarket(conditionId, config, polymarketClient);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WorkflowService] Sending analysis request for')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(conditionId)
      );
    });

    it('should log success with duration when request completes', async () => {
      // Arrange
      const workflowUrl = 'https://workflow.example.com/analyze';
      const conditionId = '0xlogtest4';
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

      process.env.WORKFLOW_SERVICE_URL = workflowUrl;
      process.env.DIGITALOCEAN_API_TOKEN = 'test-token-success';

      const config = createTestConfig(workflowUrl);

      const polymarketClient = new PolymarketClient(config.polymarket);

      // Act
      await analyzeMarket(conditionId, config, polymarketClient);

      // Assert
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[WorkflowService\] Analysis completed successfully in \d+ms/)
      );
    });
  });
});
