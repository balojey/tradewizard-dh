/**
 * Property-Based Tests for NewsData.io Client Endpoint Routing
 * 
 * Feature: newsdata-agent-tools, Property 1: Endpoint Routing Correctness
 * Validates: Requirements 1.2, 1.3, 1.4, 1.5
 * 
 * Property: For any news request type (latest, archive, crypto, market), 
 * the system should route to the correct NewsData.io API endpoint
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  NewsDataClient,
  type NewsDataConfig,
  type LatestNewsParams,
  type ArchiveNewsParams,
  type CryptoNewsParams,
  type MarketNewsParams,
  DEFAULT_NEWSDATA_CONFIG,
} from './newsdata-client.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('NewsData Client - Endpoint Routing Property Tests', () => {
  let mockConfig: NewsDataConfig;
  let client: NewsDataClient;

  beforeEach(() => {
    mockConfig = {
      apiKey: 'test-api-key-123',
      ...DEFAULT_NEWSDATA_CONFIG,
    } as NewsDataConfig;

    client = new NewsDataClient(mockConfig);
    vi.clearAllMocks();
  });

  /**
   * Property 1: Endpoint Routing Correctness
   * 
   * For any news request type (latest, archive, crypto, market), the system should 
   * route to the correct NewsData.io API endpoint with proper URL construction.
   * 
   * This ensures that:
   * - Latest news requests go to /latest endpoint
   * - Archive news requests go to /archive endpoint  
   * - Crypto news requests go to /crypto endpoint
   * - Market news requests go to /market endpoint
   * - All requests include the API key
   * - Parameters are properly encoded in the URL
   */
  it('Property 1: Endpoint routing correctness', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate different request types and parameters
        fc.oneof(
          // Latest news parameters
          fc.record({
            type: fc.constant('latest' as const),
            params: fc.record({
              q: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
              country: fc.option(fc.array(fc.constantFrom('us', 'uk', 'ca', 'de', 'fr'), { minLength: 1, maxLength: 3 }), { nil: undefined }),
              category: fc.option(fc.array(fc.constantFrom('business', 'technology', 'sports', 'politics'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
              language: fc.option(fc.array(fc.constantFrom('en', 'es', 'fr', 'de'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
              size: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
              timeframe: fc.option(fc.constantFrom('1', '6', '12', '24', '48'), { nil: undefined }),
            }),
          }),
          
          // Archive news parameters
          fc.record({
            type: fc.constant('archive' as const),
            params: fc.record({
              q: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
              from_date: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0]), { nil: undefined }),
              to_date: fc.option(fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0]), { nil: undefined }),
              country: fc.option(fc.array(fc.constantFrom('us', 'uk', 'ca'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
              category: fc.option(fc.array(fc.constantFrom('business', 'technology'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
              size: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
            }),
          }),
          
          // Crypto news parameters
          fc.record({
            type: fc.constant('crypto' as const),
            params: fc.record({
              coin: fc.option(fc.array(fc.constantFrom('btc', 'eth', 'ada', 'sol'), { minLength: 1, maxLength: 3 }), { nil: undefined }),
              q: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
              timeframe: fc.option(fc.constantFrom('1', '6', '12', '24'), { nil: undefined }),
              sentiment: fc.option(fc.constantFrom('positive', 'negative', 'neutral'), { nil: undefined }),
              size: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
            }),
          }),
          
          // Market news parameters
          fc.record({
            type: fc.constant('market' as const),
            params: fc.record({
              symbol: fc.option(fc.array(fc.constantFrom('AAPL', 'TSLA', 'GOOGL', 'MSFT'), { minLength: 1, maxLength: 3 }), { nil: undefined }),
              organization: fc.option(fc.array(fc.constantFrom('Apple', 'Tesla', 'Google'), { minLength: 1, maxLength: 2 }), { nil: undefined }),
              q: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
              sentiment: fc.option(fc.constantFrom('positive', 'negative', 'neutral'), { nil: undefined }),
              size: fc.option(fc.integer({ min: 1, max: 50 }), { nil: undefined }),
            }),
          })
        ),
        
        async (requestConfig) => {
          // Clear mocks for this iteration
          vi.clearAllMocks();
          
          // Mock successful response
          const mockResponse = {
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
              status: 'success',
              totalResults: 10,
              results: [],
            }),
          };
          
          (global.fetch as any).mockResolvedValue(mockResponse);
          
          // Make the request based on type
          let response;
          switch (requestConfig.type) {
            case 'latest':
              response = await client.fetchLatestNews(requestConfig.params as LatestNewsParams);
              break;
            case 'archive':
              // Archive needs at least one parameter, so add a default query if none provided
              const archiveParams = { ...requestConfig.params } as ArchiveNewsParams;
              if (!archiveParams.q && !archiveParams.country && !archiveParams.category) {
                archiveParams.q = 'test';
              }
              response = await client.fetchArchiveNews(archiveParams);
              break;
            case 'crypto':
              response = await client.fetchCryptoNews(requestConfig.params as CryptoNewsParams);
              break;
            case 'market':
              response = await client.fetchMarketNews(requestConfig.params as MarketNewsParams);
              break;
          }
          
          // Verify the request was made
          expect(global.fetch).toHaveBeenCalledTimes(1);
          
          const [url] = (global.fetch as any).mock.calls[0];
          const parsedUrl = new URL(url);
          
          // Property 1: Verify correct endpoint routing
          expect(parsedUrl.pathname).toBe(`/api/1/${requestConfig.type}`);
          
          // Property 1: Verify API key is included
          expect(parsedUrl.searchParams.get('apikey')).toBe(mockConfig.apiKey);
          
          // Property 1: Verify parameters are properly encoded
          Object.entries(requestConfig.params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
              const urlParam = parsedUrl.searchParams.get(key);
              if (Array.isArray(value)) {
                expect(urlParam).toBe(value.join(','));
              } else {
                expect(urlParam).toBe(String(value));
              }
            }
          });
          
          // Property 1: Verify response structure
          expect(response).toHaveProperty('status', 'success');
          expect(response).toHaveProperty('totalResults');
          expect(response).toHaveProperty('results');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1b: Base URL construction consistency
   * 
   * For any valid NewsData client configuration, all endpoint URLs should
   * use the configured base URL consistently.
   */
  it('Property 1b: Base URL construction consistency', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate different base URLs
        fc.oneof(
          fc.constant('https://newsdata.io/api/1'),
          fc.constant('https://api.newsdata.io/v1'),
          fc.constant('https://custom-newsdata-proxy.com/api')
        ),
        
        // Generate endpoint type
        fc.constantFrom('latest', 'archive', 'crypto', 'market'),
        
        async (baseUrl, endpoint) => {
          // Clear mocks for this iteration
          vi.clearAllMocks();
          
          // Create client with custom base URL
          const customConfig = { ...mockConfig, baseUrl };
          const customClient = new NewsDataClient(customConfig);
          
          // Mock successful response
          const mockResponse = {
            ok: true,
            status: 200,
            json: vi.fn().mockResolvedValue({
              status: 'success',
              totalResults: 0,
              results: [],
            }),
          };
          
          (global.fetch as any).mockResolvedValue(mockResponse);
          
          // Make a minimal request
          const params = endpoint === 'archive' ? { q: 'test' } : {};
          
          switch (endpoint) {
            case 'latest':
              await customClient.fetchLatestNews(params);
              break;
            case 'archive':
              await customClient.fetchArchiveNews(params);
              break;
            case 'crypto':
              await customClient.fetchCryptoNews(params);
              break;
            case 'market':
              await customClient.fetchMarketNews(params);
              break;
          }
          
          // Verify the URL uses the correct base URL
          const [url] = (global.fetch as any).mock.calls[0];
          const parsedUrl = new URL(url);
          
          // Property 1b: Base URL should match configuration
          const expectedUrl = `${baseUrl}/${endpoint}`;
          const actualUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;
          expect(actualUrl).toBe(expectedUrl);
        }
      ),
      { numRuns: 50 }
    );
  });
});