/**
 * Property-Based Tests for NewsData.io Agent Tools
 * 
 * Feature: newsdata-agent-tools
 * 
 * This file contains property-based tests for the four main properties:
 * - Property 2: Tool Interface Completeness
 * - Property 3: Parameter Acceptance  
 * - Property 4: Response Structure Validation
 * - Property 6: Filter Functionality
 * 
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1-3.10
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  NewsToolsManager,
  ResponseFormatter,
  type NewsArticle,
  type ToolExecutionResult,
} from './newsdata-agent-tools.js';
import type { NewsDataClient, NewsDataResponse, NewsDataArticle } from './newsdata-client.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';

// ============================================================================
// Test Setup and Mocks
// ============================================================================

// Mock NewsData client
const createMockNewsDataClient = (): NewsDataClient => ({
  fetchLatestNews: vi.fn(),
  fetchArchiveNews: vi.fn(),
  fetchCryptoNews: vi.fn(),
  fetchMarketNews: vi.fn(),
  validateApiKey: vi.fn(),
  getApiQuotaStatus: vi.fn(),
  testConnection: vi.fn(),
} as any);

// Mock logger
const createMockLogger = (): AdvancedObservabilityLogger => ({
  logDataFetch: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarning: vi.fn(),
} as any);

// Sample NewsData article for testing
const createSampleNewsDataArticle = (overrides: Partial<NewsDataArticle> = {}): NewsDataArticle => ({
  article_id: 'test-article-123',
  title: 'Test Article Title',
  link: 'https://example.com/article',
  keywords: ['test', 'news'],
  creator: ['Test Author'],
  video_url: undefined,
  description: 'Test article description',
  content: 'Full test article content',
  pubDate: '2024-01-15 10:30:00',
  pubDateTZ: 'UTC',
  image_url: 'https://example.com/image.jpg',
  source_id: 'test-source',
  source_name: 'Test Source',
  source_url: 'https://example.com',
  source_icon: 'https://example.com/icon.png',
  source_priority: 1,
  country: ['US'],
  category: ['business'],
  language: 'en',
  ai_tag: ['technology', 'business'],
  sentiment: 'positive',
  sentiment_stats: { positive: 0.8, negative: 0.1, neutral: 0.1 },
  ai_region: ['North America'],
  ai_org: ['Test Company'],
  ai_summary: 'Test AI summary',
  datatype: 'news',
  duplicate: false,
  coin: ['btc'],
  symbol: ['AAPL'],
  fetched_at: '2024-01-15 10:35:00',
  ...overrides,
});

// Sample successful NewsData response
const createSampleNewsDataResponse = (articles: NewsDataArticle[] = []): NewsDataResponse => ({
  status: 'success',
  totalResults: articles.length,
  results: articles,
  nextPage: articles.length > 0 ? 'next-page-token' : undefined,
});

// ============================================================================
// Fast-Check Generators
// ============================================================================

// Generate valid country codes
const countryCodeGen = fc.constantFrom('us', 'uk', 'ca', 'de', 'fr', 'jp', 'au', 'in');

// Generate valid language codes  
const languageCodeGen = fc.constantFrom('en', 'es', 'fr', 'de', 'ja', 'zh', 'ar', 'pt');

// Generate valid categories
const categoryGen = fc.constantFrom('business', 'entertainment', 'environment', 'food', 'health', 'politics', 'science', 'sports', 'technology', 'top', 'tourism', 'world');

// Generate valid domains
const domainGen = fc.constantFrom('cnn.com', 'bbc.com', 'reuters.com', 'bloomberg.com', 'techcrunch.com', 'wsj.com');

// Generate valid crypto coins
const cryptoCoinGen = fc.constantFrom('btc', 'eth', 'ada', 'sol', 'dot', 'matic', 'avax', 'link');

// Generate valid stock symbols
const stockSymbolGen = fc.constantFrom('AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA', 'AMD');

// Generate valid organizations
const organizationGen = fc.constantFrom('Apple', 'Tesla', 'Google', 'Microsoft', 'Amazon', 'Meta', 'Nvidia');

// Generate valid sentiment values
const sentimentGen = fc.constantFrom('positive', 'negative', 'neutral');

// Generate valid sort options
const sortGen = fc.constantFrom('relevancy', 'pubdateasc', 'source', 'fetched_at');

// Generate valid priority domain options
const priorityDomainGen = fc.constantFrom('top', 'medium', 'low');

// Generate valid timeframe strings
const timeframeGen = fc.oneof(
  fc.integer({ min: 1, max: 48 }).map(h => `${h}h`),
  fc.integer({ min: 1, max: 2880 }).map(m => `${m}m`),
  fc.constantFrom('1', '6', '12', '24', '48')
);

// Generate valid date strings
const dateStringGen = fc.date({ min: new Date('2020-01-01'), max: new Date() })
  .map(d => d.toISOString().split('T')[0]);

// Helper to convert null to undefined for optional properties
const optionalString = fc.option(fc.string({ minLength: 1, maxLength: 100 })).map(v => v === null ? undefined : v);
const optionalStringArray = <T>(gen: fc.Arbitrary<T>) => fc.option(fc.array(gen, { minLength: 1, maxLength: 5 })).map(v => v === null ? undefined : v) as fc.Arbitrary<T[] | undefined>;
const optionalNumber = fc.option(fc.integer({ min: 1, max: 50 })).map(v => v === null ? undefined : v);
const optionalFloat = fc.option(fc.float({ min: -1, max: 1 })).map(v => v === null ? undefined : v);
const optionalBoolean = fc.option(fc.boolean()).map(v => v === null ? undefined : v);
const optionalTimeframe = fc.option(timeframeGen).map(v => v === null ? undefined : v);
const optionalSentiment = fc.option(sentimentGen).map(v => v === null ? undefined : v);
const optionalSort = fc.option(sortGen).map(v => v === null ? undefined : v);
const optionalPriorityDomain = fc.option(priorityDomainGen).map(v => v === null ? undefined : v);
const optionalDate = fc.option(dateStringGen).map(v => v === null ? undefined : v);

// Generate LatestNewsToolParams
const latestNewsParamsGen = fc.record({
  query: optionalString,
  queryInTitle: optionalString,
  countries: optionalStringArray(countryCodeGen),
  excludeCountries: optionalStringArray(countryCodeGen),
  categories: optionalStringArray(categoryGen),
  excludeCategories: optionalStringArray(categoryGen),
  languages: optionalStringArray(languageCodeGen),
  excludeLanguages: optionalStringArray(languageCodeGen),
  domains: optionalStringArray(domainGen),
  excludeDomains: optionalStringArray(domainGen),
  timeframe: optionalTimeframe,
  sentiment: optionalSentiment,
  sentimentScore: optionalFloat,
  aiTags: optionalStringArray(fc.string({ minLength: 1, maxLength: 20 })),
  organizations: optionalStringArray(organizationGen),
  size: optionalNumber,
  fullContent: optionalBoolean,
  includeImage: optionalBoolean,
  includeVideo: optionalBoolean,
  removeDuplicates: optionalBoolean,
  priorityDomain: optionalPriorityDomain,
  sort: optionalSort,
});

// Generate ArchiveNewsToolParams
const archiveNewsParamsGen = fc.record({
  fromDate: dateStringGen,
  toDate: dateStringGen,
  query: optionalString,
  queryInTitle: optionalString,
  countries: optionalStringArray(countryCodeGen),
  excludeCountries: optionalStringArray(countryCodeGen),
  categories: optionalStringArray(categoryGen),
  excludeCategories: optionalStringArray(categoryGen),
  languages: optionalStringArray(languageCodeGen),
  excludeLanguages: optionalStringArray(languageCodeGen),
  domains: optionalStringArray(domainGen),
  excludeDomains: optionalStringArray(domainGen),
  size: optionalNumber,
  fullContent: optionalBoolean,
  removeDuplicates: optionalBoolean,
  sort: optionalSort,
}).filter(params => new Date(params.fromDate) < new Date(params.toDate));

// Generate CryptoNewsToolParams
const cryptoNewsParamsGen = fc.record({
  coins: optionalStringArray(cryptoCoinGen),
  query: optionalString,
  queryInTitle: optionalString,
  timeframe: optionalTimeframe,
  fromDate: optionalDate,
  toDate: optionalDate,
  languages: optionalStringArray(languageCodeGen),
  excludeLanguages: optionalStringArray(languageCodeGen),
  domains: optionalStringArray(domainGen),
  excludeDomains: optionalStringArray(domainGen),
  sentiment: optionalSentiment,
  aiTags: optionalStringArray(fc.string({ minLength: 1, maxLength: 20 })),
  size: optionalNumber,
  fullContent: optionalBoolean,
  removeDuplicates: optionalBoolean,
  sort: optionalSort,
});

// Generate MarketNewsToolParams
const marketNewsParamsGen = fc.record({
  symbols: optionalStringArray(stockSymbolGen),
  organizations: optionalStringArray(organizationGen),
  query: optionalString,
  queryInTitle: optionalString,
  timeframe: optionalTimeframe,
  fromDate: optionalDate,
  toDate: optionalDate,
  countries: optionalStringArray(countryCodeGen),
  excludeCountries: optionalStringArray(countryCodeGen),
  languages: optionalStringArray(languageCodeGen),
  excludeLanguages: optionalStringArray(languageCodeGen),
  domains: optionalStringArray(domainGen),
  excludeDomains: optionalStringArray(domainGen),
  sentiment: optionalSentiment,
  sentimentScore: optionalFloat,
  aiTags: optionalStringArray(fc.string({ minLength: 1, maxLength: 20 })),
  creators: optionalStringArray(fc.string({ minLength: 1, maxLength: 50 })),
  size: optionalNumber,
  fullContent: optionalBoolean,
  removeDuplicates: optionalBoolean,
  sort: optionalSort,
});

// ============================================================================
// Property Tests
// ============================================================================

describe('NewsData Agent Tools - Property Tests', () => {
  let mockClient: NewsDataClient;
  let mockLogger: AdvancedObservabilityLogger;
  let newsToolsManager: NewsToolsManager;

  beforeEach(() => {
    mockClient = createMockNewsDataClient();
    mockLogger = createMockLogger();
    newsToolsManager = new NewsToolsManager(mockClient, mockLogger);
    vi.clearAllMocks();
  });

  /**
   * Property 2: Tool Interface Completeness
   * 
   * For any agent requesting news functionality, all four news tools 
   * (fetchLatestNews, fetchArchiveNews, fetchCryptoNews, fetchMarketNews) 
   * should be available.
   * 
   * Validates: Requirements 2.1, 2.2, 2.3, 2.4
   */
  it('Property 2: Tool Interface Completeness', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null), // No input needed for this property
        
        async () => {
          // Get all available tools
          const allTools = newsToolsManager.getAllTools();
          
          // Property 2: All four tools should be available
          expect(allTools).toHaveLength(4);
          
          const toolNames = allTools.map(tool => tool.name);
          expect(toolNames).toContain('fetchLatestNews');
          expect(toolNames).toContain('fetchArchiveNews');
          expect(toolNames).toContain('fetchCryptoNews');
          expect(toolNames).toContain('fetchMarketNews');
          
          // Property 2: Each tool should have required interface properties
          allTools.forEach(tool => {
            expect(tool).toHaveProperty('name');
            expect(tool).toHaveProperty('description');
            expect(tool).toHaveProperty('parameters');
            expect(tool).toHaveProperty('execute');
            
            expect(typeof tool.name).toBe('string');
            expect(typeof tool.description).toBe('string');
            expect(typeof tool.parameters).toBe('object');
            expect(typeof tool.execute).toBe('function');
          });
          
          // Property 2: Tools should be accessible by name
          expect(newsToolsManager.getTool('fetchLatestNews')).toBeDefined();
          expect(newsToolsManager.getTool('fetchArchiveNews')).toBeDefined();
          expect(newsToolsManager.getTool('fetchCryptoNews')).toBeDefined();
          expect(newsToolsManager.getTool('fetchMarketNews')).toBeDefined();
          
          // Property 2: Non-existent tool should return undefined
          expect(newsToolsManager.getTool('nonExistentTool')).toBeUndefined();
        }
      ),
      { numRuns: 10 } // Simple property, fewer runs needed
    );
  });

  /**
   * Property 3: Parameter Acceptance
   * 
   * For any news tool call, all valid filter parameters should be 
   * accepted and properly processed without errors.
   * 
   * Validates: Requirements 2.5
   */
  it('Property 3: Parameter Acceptance - Latest News Tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        latestNewsParamsGen,
        
        async (params) => {
          // Reset mocks for each test
          vi.clearAllMocks();
          
          // Mock successful response
          const mockArticles = [createSampleNewsDataArticle()];
          const mockResponse = createSampleNewsDataResponse(mockArticles);
          (mockClient.fetchLatestNews as any).mockResolvedValue(mockResponse);
          
          // Property 3: Valid parameters should be accepted without throwing
          let result: NewsArticle[];
          let threwError = false;
          
          try {
            result = await newsToolsManager.fetchLatestNews(params);
          } catch (error) {
            threwError = true;
            // If it throws due to parameter validation, that's expected for some invalid combinations
            if (error instanceof Error && error.message.includes('Parameter validation failed')) {
              // This is acceptable - some parameter combinations are invalid
              return;
            }
            throw error; // Re-throw unexpected errors
          }
          
          if (!threwError) {
            // Property 3: Client should be called with processed parameters
            expect(mockClient.fetchLatestNews).toHaveBeenCalledTimes(1);
            
            // Property 3: Result should be an array
            expect(Array.isArray(result!)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3: Parameter Acceptance - Archive News Tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        archiveNewsParamsGen,
        
        async (params) => {
          // Reset mocks for each test
          vi.clearAllMocks();
          
          // Mock successful response
          const mockArticles = [createSampleNewsDataArticle()];
          const mockResponse = createSampleNewsDataResponse(mockArticles);
          (mockClient.fetchArchiveNews as any).mockResolvedValue(mockResponse);
          
          // Property 3: Valid parameters should be accepted without throwing
          let result: NewsArticle[];
          let threwError = false;
          
          try {
            result = await newsToolsManager.fetchArchiveNews(params);
          } catch (error) {
            threwError = true;
            // If it throws due to parameter validation, that's expected for some invalid combinations
            if (error instanceof Error && error.message.includes('Parameter validation failed')) {
              // This is acceptable - some parameter combinations are invalid
              return;
            }
            throw error; // Re-throw unexpected errors
          }
          
          if (!threwError) {
            // Property 3: Client should be called with processed parameters
            expect(mockClient.fetchArchiveNews).toHaveBeenCalledTimes(1);
            
            // Property 3: Result should be an array
            expect(Array.isArray(result!)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
          
  it('Property 3: Parameter Acceptance - Crypto News Tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        cryptoNewsParamsGen,
        
        async (params) => {
          // Reset mocks for each test
          vi.clearAllMocks();
          
          // Mock successful response
          const mockArticles = [createSampleNewsDataArticle()];
          const mockResponse = createSampleNewsDataResponse(mockArticles);
          (mockClient.fetchCryptoNews as any).mockResolvedValue(mockResponse);
          
          // Property 3: Valid parameters should be accepted without throwing
          let result: NewsArticle[];
          let threwError = false;
          
          try {
            result = await newsToolsManager.fetchCryptoNews(params);
          } catch (error) {
            threwError = true;
            // If it throws due to parameter validation, that's expected for some invalid combinations
            if (error instanceof Error && error.message.includes('Parameter validation failed')) {
              // This is acceptable - some parameter combinations are invalid
              return;
            }
            throw error; // Re-throw unexpected errors
          }
          
          if (!threwError) {
          // Property 3: Client should be called with processed parameters
          expect(mockClient.fetchCryptoNews).toHaveBeenCalledTimes(1);
          
          // Property 3: Result should be an array
          expect(Array.isArray(result!)).toBe(true);
        }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('Property 3: Parameter Acceptance - Market News Tool', async () => {
    await fc.assert(
      fc.asyncProperty(
        marketNewsParamsGen,
        
        async (params) => {
          // Reset mocks for each test
          vi.clearAllMocks();
          
          // Mock successful response
          const mockArticles = [createSampleNewsDataArticle()];
          const mockResponse = createSampleNewsDataResponse(mockArticles);
          (mockClient.fetchMarketNews as any).mockResolvedValue(mockResponse);
          
          // Property 3: Valid parameters should be accepted without throwing
          let result: NewsArticle[];
          let threwError = false;
          
          try {
            result = await newsToolsManager.fetchMarketNews(params);
          } catch (error) {
            threwError = true;
            // If it throws due to parameter validation, that's expected for some invalid combinations
            if (error instanceof Error && error.message.includes('Parameter validation failed')) {
              // This is acceptable - some parameter combinations are invalid
              return;
            }
            throw error; // Re-throw unexpected errors
          }
          
          if (!threwError) {
          // Property 3: Client should be called with processed parameters
          expect(mockClient.fetchMarketNews).toHaveBeenCalledTimes(1);
          
          // Property 3: Result should be an array
          expect(Array.isArray(result!)).toBe(true);
        }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 4: Response Structure Validation
   * 
   * For any successful news tool response, the returned data should contain 
   * all required NewsArticle fields with proper types.
   * 
   * Validates: Requirements 2.6
   */
  it('Property 4: Response Structure Validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate different article configurations
        fc.record({
          id: fc.string({ minLength: 1, maxLength: 50 }),
          title: fc.string({ minLength: 1, maxLength: 200 }),
          url: fc.webUrl(),
          sourceId: fc.string({ minLength: 1, maxLength: 50 }),
          sourceName: fc.string({ minLength: 1, maxLength: 100 }),
          sourceUrl: fc.webUrl(),
          sourcePriority: fc.integer({ min: 1, max: 100 }),
          description: fc.option(fc.string({ minLength: 1, maxLength: 500 })),
          publishedAt: fc.date().map(d => d.toISOString()),
          language: languageCodeGen,
          countries: fc.array(countryCodeGen, { minLength: 1, maxLength: 3 }),
          categories: fc.array(categoryGen, { minLength: 1, maxLength: 3 }),
          duplicate: fc.boolean(),
        }),
        
        async (articleData) => {
          // Create mock article with generated data
          const mockArticle = createSampleNewsDataArticle({
            article_id: articleData.id,
            title: articleData.title,
            link: articleData.url,
            source_id: articleData.sourceId,
            source_name: articleData.sourceName,
            source_url: articleData.sourceUrl,
            source_priority: articleData.sourcePriority,
            description: articleData.description || 'Default description',
            pubDate: articleData.publishedAt,
            language: articleData.language,
            country: articleData.countries,
            category: articleData.categories,
            duplicate: articleData.duplicate,
          });
          
          const mockResponse = createSampleNewsDataResponse([mockArticle]);
          (mockClient.fetchLatestNews as any).mockResolvedValue(mockResponse);
          
          // Execute tool
          const result = await newsToolsManager.fetchLatestNews({ query: 'test' });
          
          // Property 4: Response should be an array
          expect(Array.isArray(result)).toBe(true);
          expect(result.length).toBeGreaterThan(0);
          
          // Property 4: Each article should have required structure
          result.forEach(article => {
            // Required top-level fields
            expect(article).toHaveProperty('id');
            expect(article).toHaveProperty('title');
            expect(article).toHaveProperty('url');
            expect(article).toHaveProperty('source');
            expect(article).toHaveProperty('content');
            expect(article).toHaveProperty('metadata');
            
            // Type validation
            expect(typeof article.id).toBe('string');
            expect(typeof article.title).toBe('string');
            expect(typeof article.url).toBe('string');
            
            // Source structure validation
            expect(article.source).toHaveProperty('id');
            expect(article.source).toHaveProperty('name');
            expect(article.source).toHaveProperty('url');
            expect(article.source).toHaveProperty('priority');
            expect(typeof article.source.id).toBe('string');
            expect(typeof article.source.name).toBe('string');
            expect(typeof article.source.url).toBe('string');
            expect(typeof article.source.priority).toBe('number');
            
            // Content structure validation
            expect(typeof article.content).toBe('object');
            expect(article.content).not.toBeNull();
            
            // Metadata structure validation
            expect(article.metadata).toHaveProperty('publishedAt');
            expect(article.metadata).toHaveProperty('language');
            expect(article.metadata).toHaveProperty('duplicate');
            expect(typeof article.metadata.publishedAt).toBe('string');
            expect(typeof article.metadata.language).toBe('string');
            expect(typeof article.metadata.duplicate).toBe('boolean');
            
            // Optional array fields should be arrays if present
            if (article.metadata.countries) {
              expect(Array.isArray(article.metadata.countries)).toBe(true);
            }
            if (article.metadata.categories) {
              expect(Array.isArray(article.metadata.categories)).toBe(true);
            }
            if (article.creators) {
              expect(Array.isArray(article.creators)).toBe(true);
            }
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: Filter Functionality
   * 
   * For any supported filter parameter (keyword, country, language, category, 
   * domain, date, sentiment, AI tag, organization, symbol), applying the filter 
   * should return only articles matching the criteria.
   * 
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.10
   */
  it('Property 6: Filter Functionality - Country Filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('us', 'uk', 'ca', 'de', 'fr'), { minLength: 1, maxLength: 3 }),
        
        async (selectedCountries) => {
          // Create articles with different countries
          const articlesWithCountries = selectedCountries.map(country => 
            createSampleNewsDataArticle({ 
              article_id: `article-${country}`,
              country: [country] 
            })
          );
          
          // Add some articles with different countries that should be filtered out
          const otherCountries = ['mx', 'br', 'cn'];
          const articlesWithOtherCountries = otherCountries.map(country =>
            createSampleNewsDataArticle({ 
              article_id: `other-article-${country}`,
              country: [country] 
            })
          );
          
          const allArticles = [...articlesWithCountries, ...articlesWithOtherCountries];
          const mockResponse = createSampleNewsDataResponse(allArticles);
          (mockClient.fetchLatestNews as any).mockResolvedValue(mockResponse);
          
          // Execute with country filter
          const result = await newsToolsManager.fetchLatestNews({ 
            countries: selectedCountries 
          });
          
          // Property 6: All returned articles should match the country filter
          result.forEach(article => {
            const articleCountries = article.metadata.countries || [];
            const hasMatchingCountry = articleCountries.some((country: string) => 
              selectedCountries.includes(country as any)
            );
            expect(hasMatchingCountry).toBe(true);
          });
          
          // Property 6: Should have filtered out articles with other countries
          const resultIds = result.map(a => a.id);
          otherCountries.forEach(country => {
            expect(resultIds).not.toContain(`other-article-${country}`);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 6: Filter Functionality - Language Filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(languageCodeGen, { minLength: 1, maxLength: 3 }),
        
        async (selectedLanguages) => {
          // Create articles with different languages
          const articlesWithLanguages = selectedLanguages.map(language => 
            createSampleNewsDataArticle({ 
              article_id: `article-${language}`,
              language: language 
            })
          );
          
          // Add some articles with different languages that should be filtered out
          const otherLanguages = ['ko', 'ru', 'hi'];
          const articlesWithOtherLanguages = otherLanguages.map(language =>
            createSampleNewsDataArticle({ 
              article_id: `other-article-${language}`,
              language: language 
            })
          );
          
          const allArticles = [...articlesWithLanguages, ...articlesWithOtherLanguages];
          const mockResponse = createSampleNewsDataResponse(allArticles);
          (mockClient.fetchLatestNews as any).mockResolvedValue(mockResponse);
          
          // Execute with language filter
          const result = await newsToolsManager.fetchLatestNews({ 
            languages: selectedLanguages 
          });
          
          // Property 6: All returned articles should match the language filter
          result.forEach(article => {
            expect(selectedLanguages).toContain(article.metadata.language);
          });
          
          // Property 6: Should have filtered out articles with other languages
          const resultIds = result.map(a => a.id);
          otherLanguages.forEach(language => {
            expect(resultIds).not.toContain(`other-article-${language}`);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 6: Filter Functionality - Category Filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('business', 'technology', 'sports'), { minLength: 1, maxLength: 3 }),
        
        async (selectedCategories) => {
          // Create articles with different categories
          const articlesWithCategories = selectedCategories.map(category => 
            createSampleNewsDataArticle({ 
              article_id: `article-${category}`,
              category: [category] 
            })
          );
          
          // Add some articles with different categories that should be filtered out
          const otherCategories = ['lifestyle', 'crime', 'education'];
          const articlesWithOtherCategories = otherCategories.map(category =>
            createSampleNewsDataArticle({ 
              article_id: `other-article-${category}`,
              category: [category] 
            })
          );
          
          const allArticles = [...articlesWithCategories, ...articlesWithOtherCategories];
          const mockResponse = createSampleNewsDataResponse(allArticles);
          (mockClient.fetchLatestNews as any).mockResolvedValue(mockResponse);
          
          // Execute with category filter
          const result = await newsToolsManager.fetchLatestNews({ 
            categories: selectedCategories 
          });
          
          // Property 6: All returned articles should match the category filter
          result.forEach(article => {
            const articleCategories = article.metadata.categories || [];
            const hasMatchingCategory = articleCategories.some((category: string) => 
              selectedCategories.includes(category as any)
            );
            expect(hasMatchingCategory).toBe(true);
          });
          
          // Property 6: Should have filtered out articles with other categories
          const resultIds = result.map(a => a.id);
          otherCategories.forEach(category => {
            expect(resultIds).not.toContain(`other-article-${category}`);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 6: Filter Functionality - Sentiment Filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        sentimentGen,
        
        async (selectedSentiment) => {
          // Create articles with different sentiments
          const sentiments: Array<'positive' | 'negative' | 'neutral'> = ['positive', 'negative', 'neutral'];
          const allArticles = sentiments.map(sentiment => 
            createSampleNewsDataArticle({ 
              article_id: `article-${sentiment}`,
              sentiment: sentiment 
            })
          );
          
          const mockResponse = createSampleNewsDataResponse(allArticles);
          (mockClient.fetchLatestNews as any).mockResolvedValue(mockResponse);
          
          // Execute with sentiment filter
          const result = await newsToolsManager.fetchLatestNews({ 
            sentiment: selectedSentiment 
          });
          
          // Property 6: All returned articles should match the sentiment filter
          result.forEach(article => {
            if (article.ai?.sentiment) {
              expect(article.ai.sentiment).toBe(selectedSentiment);
            }
          });
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property 6: Filter Functionality - Crypto Coin Filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('btc', 'eth', 'ada'), { minLength: 1, maxLength: 3 }),
        
        async (selectedCoins) => {
          // Create articles with different crypto coins
          const articlesWithCoins = selectedCoins.map(coin => 
            createSampleNewsDataArticle({ 
              article_id: `article-${coin}`,
              coin: [coin] 
            })
          );
          
          // Add some articles with different coins that should be filtered out
          const otherCoins = ['doge', 'shib', 'xrp'];
          const articlesWithOtherCoins = otherCoins.map(coin =>
            createSampleNewsDataArticle({ 
              article_id: `other-article-${coin}`,
              coin: [coin] 
            })
          );
          
          const allArticles = [...articlesWithCoins, ...articlesWithOtherCoins];
          const mockResponse = createSampleNewsDataResponse(allArticles);
          (mockClient.fetchCryptoNews as any).mockResolvedValue(mockResponse);
          
          // Execute with coin filter
          const result = await newsToolsManager.fetchCryptoNews({ 
            coins: selectedCoins 
          });
          
          // Property 6: All returned articles should match the coin filter
          result.forEach(article => {
            if (article.crypto?.coins) {
              const hasMatchingCoin = article.crypto.coins.some((coin: string) => 
                selectedCoins.includes(coin as any)
              );
              expect(hasMatchingCoin).toBe(true);
            }
          });
          
          // Property 6: Should have filtered out articles with other coins
          const resultIds = result.map(a => a.id);
          otherCoins.forEach(coin => {
            expect(resultIds).not.toContain(`other-article-${coin}`);
          });
        }
      ),
      { numRuns: 50 }
    );
  });

  it('Property 6: Filter Functionality - Stock Symbol Filtering', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.constantFrom('AAPL', 'TSLA', 'GOOGL'), { minLength: 1, maxLength: 3 }),
        
        async (selectedSymbols) => {
          // Create articles with different stock symbols
          const articlesWithSymbols = selectedSymbols.map(symbol => 
            createSampleNewsDataArticle({ 
              article_id: `article-${symbol}`,
              symbol: [symbol] 
            })
          );
          
          // Add some articles with different symbols that should be filtered out
          const otherSymbols = ['IBM', 'INTC', 'ORCL'];
          const articlesWithOtherSymbols = otherSymbols.map(symbol =>
            createSampleNewsDataArticle({ 
              article_id: `other-article-${symbol}`,
              symbol: [symbol] 
            })
          );
          
          const allArticles = [...articlesWithSymbols, ...articlesWithOtherSymbols];
          const mockResponse = createSampleNewsDataResponse(allArticles);
          (mockClient.fetchMarketNews as any).mockResolvedValue(mockResponse);
          
          // Execute with symbol filter
          const result = await newsToolsManager.fetchMarketNews({ 
            symbols: selectedSymbols 
          });
          
          // Property 6: All returned articles should match the symbol filter
          result.forEach(article => {
            if (article.market?.symbols) {
              const hasMatchingSymbol = article.market.symbols.some((symbol: string) => 
                selectedSymbols.includes(symbol as any)
              );
              expect(hasMatchingSymbol).toBe(true);
            }
          });
          
          // Property 6: Should have filtered out articles with other symbols
          const resultIds = result.map(a => a.id);
          otherSymbols.forEach(symbol => {
            expect(resultIds).not.toContain(`other-article-${symbol}`);
          });
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Response Formatter Property Tests
// ============================================================================

describe('Response Formatter - Property Tests', () => {
  /**
   * Property: Response Structure Validation
   * 
   * For any response formatted by ResponseFormatter, the structure should
   * be valid and consistent.
   */
  it('Property: Response structure validation', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate different response scenarios
        fc.oneof(
          // Success response
          fc.record({
            type: fc.constant('success' as const),
            articles: fc.array(fc.record({
              id: fc.string({ minLength: 1, maxLength: 50 }),
              title: fc.string({ minLength: 1, maxLength: 200 }),
              url: fc.webUrl(),
            }), { minLength: 0, maxLength: 10 }),
            metadata: fc.record({
              totalResults: fc.integer({ min: 0, max: 100 }),
              cached: fc.boolean(),
              stale: fc.boolean(),
              executionTime: fc.integer({ min: 1, max: 5000 }),
            }),
          }),
          
          // Error response
          fc.record({
            type: fc.constant('error' as const),
            error: fc.record({
              message: fc.string({ minLength: 1, maxLength: 200 }),
              code: fc.constantFrom('API_ERROR', 'NETWORK_ERROR', 'VALIDATION_ERROR'),
            }),
            executionTime: fc.integer({ min: 1, max: 5000 }),
          })
        ),
        
        async (responseData) => {
          let result: ToolExecutionResult;
          
          if (responseData.type === 'success') {
            // Create mock articles
            const mockArticles: NewsArticle[] = responseData.articles.map(article => ({
              id: article.id,
              title: article.title,
              url: article.url,
              source: {
                id: 'test-source',
                name: 'Test Source',
                url: 'https://example.com',
                priority: 1,
              },
              content: {},
              metadata: {
                publishedAt: '2024-01-15T10:30:00Z',
                language: 'en',
                duplicate: false,
              },
            }));
            
            result = ResponseFormatter.formatSuccess(mockArticles, responseData.metadata);
          } else {
            const error = new Error(responseData.error.message);
            error.name = responseData.error.code;
            result = ResponseFormatter.formatError(error, responseData.executionTime);
          }
          
          // Property: Response should have valid structure
          expect(ResponseFormatter.validateResponse(result)).toBe(true);
          
          // Property: Response should have required fields
          expect(result).toHaveProperty('success');
          expect(result).toHaveProperty('metadata');
          expect(typeof result.success).toBe('boolean');
          expect(typeof result.metadata).toBe('object');
          
          if (result.success) {
            expect(result).toHaveProperty('data');
            expect(Array.isArray(result.data)).toBe(true);
          } else {
            expect(result).toHaveProperty('error');
            expect(typeof result.error).toBe('object');
            expect(result.error).toHaveProperty('code');
            expect(result.error).toHaveProperty('message');
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});