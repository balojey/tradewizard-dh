/**
 * Property-based tests for WorkflowServiceClient
 *
 * Tests universal properties that should hold across all inputs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { WorkflowServiceClient } from './workflow-service-client.js';

describe('WorkflowServiceClient - Property-Based Tests', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * Property 3: Response Validation
   * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**
   *
   * For any workflow service response, the client SHALL validate that it contains
   * a "recommendation" field (object or null), an "agentSignals" field (array),
   * and an optional "cost" field (number), and SHALL throw a validation error
   * if any required field is missing or has an incorrect type.
   */
  describe('Property 3: Response Validation', () => {
    it('should accept any response with valid structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            recommendation: fc.oneof(
              fc.constant(null),
              fc.object() // Any object
            ),
            agentSignals: fc.array(fc.object()), // Array of any objects
            cost: fc.option(fc.double({ min: 0, max: 1000, noNaN: true }), { nil: undefined }),
          }),
          async (validResponse) => {
            const client = new WorkflowServiceClient({
              url: 'https://test.example.com/analyze',
              timeoutMs: 5000,
              authToken: 'test-token',
            });

            fetchMock.mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => validResponse,
            });

            const result = await client.analyzeMarket('test-id');

            // Should not throw and should return the response
            expect(result.recommendation).toEqual(validResponse.recommendation);
            expect(result.agentSignals).toEqual(validResponse.agentSignals);
            expect(result.cost).toEqual(validResponse.cost);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject responses missing recommendation field', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            agentSignals: fc.array(fc.object()),
            cost: fc.option(fc.double({ min: 0, max: 1000, noNaN: true })),
          }),
          async (invalidResponse) => {
            const client = new WorkflowServiceClient({
              url: 'https://test.example.com/analyze',
              timeoutMs: 5000,
              authToken: 'test-token',
            });

            fetchMock.mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => invalidResponse,
            });

            await expect(client.analyzeMarket('test-id')).rejects.toThrow(
              'Invalid response: missing required field "recommendation"'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject responses missing agentSignals field', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            recommendation: fc.oneof(fc.constant(null), fc.object()),
            cost: fc.option(fc.double({ min: 0, max: 1000, noNaN: true })),
          }),
          async (invalidResponse) => {
            const client = new WorkflowServiceClient({
              url: 'https://test.example.com/analyze',
              timeoutMs: 5000,
              authToken: 'test-token',
            });

            fetchMock.mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => invalidResponse,
            });

            await expect(client.analyzeMarket('test-id')).rejects.toThrow(
              'Invalid response: missing required field "agentSignals"'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject responses where recommendation is not object or null', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.array(fc.anything())
          ),
          async (invalidRecommendation) => {
            const client = new WorkflowServiceClient({
              url: 'https://test.example.com/analyze',
              timeoutMs: 5000,
              authToken: 'test-token',
            });

            const invalidResponse = {
              recommendation: invalidRecommendation,
              agentSignals: [],
            };

            fetchMock.mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => invalidResponse,
            });

            await expect(client.analyzeMarket('test-id')).rejects.toThrow(
              'Invalid response: recommendation must be an object or null'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject responses where agentSignals is not an array', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.object()
          ),
          async (invalidAgentSignals) => {
            const client = new WorkflowServiceClient({
              url: 'https://test.example.com/analyze',
              timeoutMs: 5000,
              authToken: 'test-token',
            });

            const invalidResponse = {
              recommendation: null,
              agentSignals: invalidAgentSignals,
            };

            fetchMock.mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => invalidResponse,
            });

            await expect(client.analyzeMarket('test-id')).rejects.toThrow(
              'Invalid response: agentSignals must be an array'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject responses where cost is not a number', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string(),
            fc.boolean(),
            fc.object(),
            fc.array(fc.anything())
          ),
          async (invalidCost) => {
            const client = new WorkflowServiceClient({
              url: 'https://test.example.com/analyze',
              timeoutMs: 5000,
              authToken: 'test-token',
            });

            const invalidResponse = {
              recommendation: null,
              agentSignals: [],
              cost: invalidCost,
            };

            fetchMock.mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => invalidResponse,
            });

            await expect(client.analyzeMarket('test-id')).rejects.toThrow(
              'Invalid response: cost must be a number'
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should reject non-object responses', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.oneof(
            fc.string(),
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.array(fc.anything())
          ),
          async (invalidResponse) => {
            const client = new WorkflowServiceClient({
              url: 'https://test.example.com/analyze',
              timeoutMs: 5000,
              authToken: 'test-token',
            });

            fetchMock.mockResolvedValueOnce({
              ok: true,
              status: 200,
              json: async () => invalidResponse,
            });

            await expect(client.analyzeMarket('test-id')).rejects.toThrow(
              'Invalid response: response must be an object'
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
