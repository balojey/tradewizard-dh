/**
 * Unit tests for WorkflowServiceClient
 *
 * Tests response validation logic with specific examples
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkflowServiceClient } from './workflow-service-client.js';
import type { WorkflowServiceResponse } from './workflow-service-client.js';

describe('WorkflowServiceClient - Response Validation', () => {
  let client: WorkflowServiceClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new WorkflowServiceClient({
      url: 'https://test.example.com/analyze',
      timeoutMs: 5000,
      authToken: 'test-token',
    });

    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Valid responses', () => {
    it('should accept response with recommendation object and agentSignals array', async () => {
      const validResponse: WorkflowServiceResponse = {
        recommendation: {
          marketId: '0x123',
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

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validResponse,
      });

      const result = await client.analyzeMarket('test-condition-id');

      expect(result).toEqual(validResponse);
    });

    it('should accept response with null recommendation', async () => {
      const validResponse: WorkflowServiceResponse = {
        recommendation: null,
        agentSignals: [],
        cost: 0,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validResponse,
      });

      const result = await client.analyzeMarket('test-condition-id');

      expect(result.recommendation).toBeNull();
      expect(result.agentSignals).toEqual([]);
    });

    it('should accept response without cost field', async () => {
      const validResponse = {
        recommendation: null,
        agentSignals: [],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validResponse,
      });

      const result = await client.analyzeMarket('test-condition-id');

      expect(result.cost).toBeUndefined();
    });

    it('should accept response with empty agentSignals array', async () => {
      const validResponse: WorkflowServiceResponse = {
        recommendation: null,
        agentSignals: [],
        cost: 0,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validResponse,
      });

      const result = await client.analyzeMarket('test-condition-id');

      expect(result.agentSignals).toEqual([]);
    });
  });

  describe('Invalid responses - missing fields (Requirement 7.4)', () => {
    it('should throw error when recommendation field is missing', async () => {
      const invalidResponse = {
        agentSignals: [],
        cost: 0,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      await expect(client.analyzeMarket('test-condition-id')).rejects.toThrow(
        'Invalid response: missing required field "recommendation"'
      );
    });

    it('should throw error when agentSignals field is missing', async () => {
      const invalidResponse = {
        recommendation: null,
        cost: 0,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      await expect(client.analyzeMarket('test-condition-id')).rejects.toThrow(
        'Invalid response: missing required field "agentSignals"'
      );
    });
  });

  describe('Invalid responses - wrong types (Requirements 7.1, 7.2, 7.3)', () => {
    it('should throw error when recommendation is not an object or null', async () => {
      const invalidResponse = {
        recommendation: 'invalid',
        agentSignals: [],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      await expect(client.analyzeMarket('test-condition-id')).rejects.toThrow(
        'Invalid response: recommendation must be an object or null'
      );
    });

    it('should throw error when agentSignals is not an array', async () => {
      const invalidResponse = {
        recommendation: null,
        agentSignals: 'invalid',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      await expect(client.analyzeMarket('test-condition-id')).rejects.toThrow(
        'Invalid response: agentSignals must be an array'
      );
    });

    it('should throw error when cost is not a number', async () => {
      const invalidResponse = {
        recommendation: null,
        agentSignals: [],
        cost: 'invalid',
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => invalidResponse,
      });

      await expect(client.analyzeMarket('test-condition-id')).rejects.toThrow(
        'Invalid response: cost must be a number'
      );
    });

    it('should throw error when response is not an object', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => 'invalid',
      });

      await expect(client.analyzeMarket('test-condition-id')).rejects.toThrow(
        'Invalid response: response must be an object'
      );
    });

    it('should throw error when response is null', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      });

      await expect(client.analyzeMarket('test-condition-id')).rejects.toThrow(
        'Invalid response: response must be an object'
      );
    });
  });

  describe('Edge cases', () => {
    it('should accept recommendation as empty object', async () => {
      const validResponse = {
        recommendation: {},
        agentSignals: [],
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validResponse,
      });

      const result = await client.analyzeMarket('test-condition-id');

      expect(result.recommendation).toEqual({});
    });

    it('should accept cost as zero', async () => {
      const validResponse: WorkflowServiceResponse = {
        recommendation: null,
        agentSignals: [],
        cost: 0,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validResponse,
      });

      const result = await client.analyzeMarket('test-condition-id');

      expect(result.cost).toBe(0);
    });

    it('should accept negative cost', async () => {
      const validResponse: WorkflowServiceResponse = {
        recommendation: null,
        agentSignals: [],
        cost: -1,
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => validResponse,
      });

      const result = await client.analyzeMarket('test-condition-id');

      expect(result.cost).toBe(-1);
    });
  });
});
