/**
 * NewsData.io Agent Tools
 * 
 * Provides specialized news fetching tools that agents can use to get targeted
 * news information relevant to their specific analysis needs.
 * 
 * Features:
 * - Four specialized tools: Latest, Archive, Crypto, and Market news
 * - Comprehensive parameter validation and processing
 * - Structured response formatting with error handling
 * - Integration with NewsData client, caching, and rate limiting
 */

import type { 
  NewsDataClient, 
  NewsDataArticle, 
  LatestNewsParams,
  ArchiveNewsParams,
  CryptoNewsParams,
  MarketNewsParams
} from './newsdata-client.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';
import type { NewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import { getNewsDataObservabilityLogger } from './newsdata-observability-logger.js';

// ============================================================================
// Validation and Processing Types
// ============================================================================

/**
 * Parameter validation error
 */
export class ParameterValidationError extends Error {
  constructor(
    message: string,
    public parameter: string,
    public value: any
  ) {
    super(message);
    this.name = 'ParameterValidationError';
  }
}

/**
 * Parameter processing result
 */
export interface ParameterProcessingResult {
  valid: boolean;
  processed?: any;
  errors: ParameterValidationError[];
}

/**
 * Filter combination logic
 */
export interface FilterCombination {
  include: string[];
  exclude: string[];
  priority: 'include' | 'exclude';
}

// ============================================================================
// Tool Interface Types
// ============================================================================

/**
 * Base interface for all news tools
 */
export interface BaseNewsTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute(params: any, agentName?: string): Promise<NewsArticle[]>;
}

/**
 * Standardized news article format for agent consumption
 */
export interface NewsArticle {
  id: string;
  title: string;
  url: string;
  source: {
    id: string;
    name: string;
    url: string;
    icon?: string;
    priority: number;
  };
  content: {
    description?: string;
    fullContent?: string;
    keywords?: string[];
    imageUrl?: string;
    videoUrl?: string;
  };
  metadata: {
    publishedAt: string;
    publishedAtTZ?: string;
    fetchedAt?: string;
    language: string;
    countries?: string[];
    categories?: string[];
    datatype?: string;
    duplicate: boolean;
  };
  creators?: string[];
  // AI-enhanced fields (paid plans)
  ai?: {
    tags?: string[];
    sentiment?: 'positive' | 'negative' | 'neutral';
    sentimentStats?: {
      negative: number;
      neutral: number;
      positive: number;
    };
    regions?: string[];
    organizations?: string[];
    summary?: string;
  };
  // Domain-specific fields
  crypto?: {
    coins?: string[];
  };
  market?: {
    symbols?: string[];
  };
}

/**
 * Tool execution result with error handling
 */
export interface ToolExecutionResult {
  success: boolean;
  data?: NewsArticle[];
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    totalResults: number;
    cached: boolean;
    stale: boolean;
    executionTime: number;
    nextPage?: string;
  };
}

/**
 * Response formatter for consistent tool responses
 */
export class ResponseFormatter {
  
  /**
   * Format successful response
   */
  static formatSuccess(
    articles: NewsArticle[],
    metadata: {
      totalResults?: number;
      cached?: boolean;
      stale?: boolean;
      executionTime: number;
      nextPage?: string;
    }
  ): ToolExecutionResult {
    return {
      success: true,
      data: articles,
      metadata: {
        totalResults: metadata.totalResults || articles.length,
        cached: metadata.cached || false,
        stale: metadata.stale || false,
        executionTime: metadata.executionTime,
        nextPage: metadata.nextPage,
      },
    };
  }

  /**
   * Format error response
   */
  static formatError(
    error: Error,
    executionTime: number,
    cached: boolean = false,
    stale: boolean = false
  ): ToolExecutionResult {
    let code = 'UNKNOWN_ERROR';
    let details: any = undefined;

    // Categorize error types
    if (error instanceof ParameterValidationError) {
      code = 'PARAMETER_VALIDATION_ERROR';
      details = { parameter: error.parameter, value: error.value };
    } else if (error.name === 'NewsDataError') {
      code = 'API_ERROR';
      details = (error as any).response;
    } else if (error.name === 'NewsDataRateLimitError') {
      code = 'RATE_LIMIT_ERROR';
    } else if (error.name === 'NewsDataQuotaExceededError') {
      code = 'QUOTA_EXCEEDED_ERROR';
    } else if (error.name === 'NewsDataValidationError') {
      code = 'VALIDATION_ERROR';
    } else if (error.message.includes('timeout')) {
      code = 'TIMEOUT_ERROR';
    } else if (error.message.includes('network') || error.message.includes('fetch')) {
      code = 'NETWORK_ERROR';
    }

    return {
      success: false,
      error: {
        code,
        message: error.message,
        details,
      },
      metadata: {
        totalResults: 0,
        cached,
        stale,
        executionTime,
      },
    };
  }

  /**
   * Validate response structure
   */
  static validateResponse(response: any): boolean {
    if (!response || typeof response !== 'object') {
      return false;
    }

    // Check required fields
    if (typeof response.success !== 'boolean') {
      return false;
    }

    if (!response.metadata || typeof response.metadata !== 'object') {
      return false;
    }

    const metadata = response.metadata;
    if (
      typeof metadata.totalResults !== 'number' ||
      typeof metadata.cached !== 'boolean' ||
      typeof metadata.stale !== 'boolean' ||
      typeof metadata.executionTime !== 'number'
    ) {
      return false;
    }

    // If success, check data field
    if (response.success) {
      if (!Array.isArray(response.data)) {
        return false;
      }
      
      // Validate each article structure
      return response.data.every((article: any) => this.validateArticleStructure(article));
    } else {
      // If error, check error field
      if (!response.error || typeof response.error !== 'object') {
        return false;
      }
      
      const error = response.error;
      if (typeof error.code !== 'string' || typeof error.message !== 'string') {
        return false;
      }
    }

    return true;
  }

  /**
   * Validate individual article structure
   */
  static validateArticleStructure(article: any): boolean {
    if (!article || typeof article !== 'object') {
      return false;
    }

    // Check required fields
    const requiredFields = ['id', 'title', 'url', 'source', 'content', 'metadata'];
    for (const field of requiredFields) {
      if (!(field in article)) {
        return false;
      }
    }

    // Validate source structure
    const source = article.source;
    if (!source || typeof source !== 'object') {
      return false;
    }
    
    const requiredSourceFields = ['id', 'name', 'url', 'priority'];
    for (const field of requiredSourceFields) {
      if (!(field in source)) {
        return false;
      }
    }

    // Validate content structure
    const content = article.content;
    if (!content || typeof content !== 'object') {
      return false;
    }

    // Validate metadata structure
    const metadata = article.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }
    
    const requiredMetadataFields = ['publishedAt', 'language', 'duplicate'];
    for (const field of requiredMetadataFields) {
      if (!(field in metadata)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Sanitize and normalize article data
   */
  static sanitizeArticle(article: NewsArticle): NewsArticle {
    return {
      id: this.sanitizeString(article.id),
      title: this.sanitizeString(article.title),
      url: this.sanitizeUrl(article.url),
      source: {
        id: this.sanitizeString(article.source.id),
        name: this.sanitizeString(article.source.name),
        url: this.sanitizeUrl(article.source.url),
        icon: article.source.icon ? this.sanitizeUrl(article.source.icon) : undefined,
        priority: Math.max(0, Math.min(100, article.source.priority)),
      },
      content: {
        description: article.content.description ? this.sanitizeString(article.content.description) : undefined,
        fullContent: article.content.fullContent ? this.sanitizeString(article.content.fullContent) : undefined,
        keywords: article.content.keywords?.map(k => this.sanitizeString(k)).filter(k => k.length > 0),
        imageUrl: article.content.imageUrl ? this.sanitizeUrl(article.content.imageUrl) : undefined,
        videoUrl: article.content.videoUrl ? this.sanitizeUrl(article.content.videoUrl) : undefined,
      },
      metadata: {
        publishedAt: this.sanitizeString(article.metadata.publishedAt),
        publishedAtTZ: article.metadata.publishedAtTZ ? this.sanitizeString(article.metadata.publishedAtTZ) : undefined,
        fetchedAt: article.metadata.fetchedAt ? this.sanitizeString(article.metadata.fetchedAt) : undefined,
        language: this.sanitizeString(article.metadata.language),
        countries: article.metadata.countries?.map(c => this.sanitizeString(c)).filter(c => c.length > 0),
        categories: article.metadata.categories?.map(c => this.sanitizeString(c)).filter(c => c.length > 0),
        datatype: article.metadata.datatype ? this.sanitizeString(article.metadata.datatype) : undefined,
        duplicate: Boolean(article.metadata.duplicate),
      },
      creators: article.creators?.map(c => this.sanitizeString(c)).filter(c => c.length > 0),
      ai: article.ai ? {
        tags: Array.isArray(article.ai.tags) ? article.ai.tags.map(t => this.sanitizeString(t)).filter(t => t.length > 0) : undefined,
        sentiment: article.ai.sentiment,
        sentimentStats: article.ai.sentimentStats,
        regions: Array.isArray(article.ai.regions) ? article.ai.regions.map(r => this.sanitizeString(r)).filter(r => r.length > 0) : undefined,
        organizations: Array.isArray(article.ai.organizations) ? article.ai.organizations.map(o => this.sanitizeString(o)).filter(o => o.length > 0) : undefined,
        summary: article.ai.summary ? this.sanitizeString(article.ai.summary) : undefined,
      } : undefined,
      crypto: article.crypto ? {
        coins: Array.isArray(article.crypto.coins) ? article.crypto.coins.map(c => this.sanitizeString(c)).filter(c => c.length > 0) : undefined,
      } : undefined,
      market: article.market ? {
        symbols: Array.isArray(article.market.symbols) ? article.market.symbols.map(s => this.sanitizeString(s)).filter(s => s.length > 0) : undefined,
      } : undefined,
    };
  }

  /**
   * Sanitize string content
   */
  private static sanitizeString(str: string): string {
    if (typeof str !== 'string') {
      return String(str);
    }
    
    // Remove null bytes and control characters except newlines and tabs
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
              .trim();
  }

  /**
   * Sanitize and validate URL
   */
  private static sanitizeUrl(url: string): string {
    if (typeof url !== 'string') {
      return '';
    }
    
    const sanitized = this.sanitizeString(url);
    
    // Basic URL validation
    try {
      new URL(sanitized);
      return sanitized;
    } catch {
      return '';
    }
  }
}

// ============================================================================
// Tool Parameter Interfaces
// ============================================================================

/**
 * Latest News Tool Parameters
 */
export interface LatestNewsToolParams {
  // Search parameters
  query?: string;
  queryInTitle?: string;
  queryInMeta?: string;
  
  // Filtering parameters
  countries?: string[];
  excludeCountries?: string[];
  categories?: string[];
  excludeCategories?: string[];
  languages?: string[];
  excludeLanguages?: string[];
  domains?: string[];
  excludeDomains?: string[];
  domainUrls?: string[];
  
  // Time filtering
  timeframe?: string; // e.g., "6", "24", "15m", "90m"
  
  // Content filtering
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentimentScore?: number;
  aiTags?: string[];
  organizations?: string[];
  regions?: string[];
  creators?: string[];
  
  // Response configuration
  size?: number; // 1-50
  fullContent?: boolean;
  includeImage?: boolean;
  includeVideo?: boolean;
  removeDuplicates?: boolean;
  priorityDomain?: 'top' | 'medium' | 'low';
  sort?: 'relevancy' | 'pubdateasc' | 'source' | 'fetched_at';
  excludeFields?: string[];
  timezone?: string;
  
  // Pagination
  page?: string;
}

/**
 * Archive News Tool Parameters
 */
export interface ArchiveNewsToolParams {
  // Required date range
  fromDate: string; // YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
  toDate: string;   // YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
  
  // Search parameters
  query?: string;
  queryInTitle?: string;
  queryInMeta?: string;
  
  // Filtering parameters
  countries?: string[];
  excludeCountries?: string[];
  categories?: string[];
  excludeCategories?: string[];
  languages?: string[];
  excludeLanguages?: string[];
  domains?: string[];
  excludeDomains?: string[];
  domainUrls?: string[];
  
  // Response configuration
  size?: number; // 1-50
  fullContent?: boolean;
  includeImage?: boolean;
  includeVideo?: boolean;
  removeDuplicates?: boolean;
  priorityDomain?: 'top' | 'medium' | 'low';
  sort?: 'relevancy' | 'pubdateasc' | 'source' | 'fetched_at';
  excludeFields?: string[];
  timezone?: string;
  
  // Pagination
  page?: string;
}

/**
 * Crypto News Tool Parameters
 */
export interface CryptoNewsToolParams {
  // Crypto-specific filtering
  coins?: string[]; // e.g., ['btc', 'eth', 'ada']
  
  // Search parameters
  query?: string;
  queryInTitle?: string;
  queryInMeta?: string;
  
  // Time filtering
  timeframe?: string;
  fromDate?: string;
  toDate?: string;
  
  // Filtering parameters
  languages?: string[];
  excludeLanguages?: string[];
  domains?: string[];
  excludeDomains?: string[];
  domainUrls?: string[];
  
  // Content filtering
  sentiment?: 'positive' | 'negative' | 'neutral';
  aiTags?: string[];
  
  // Response configuration
  size?: number; // 1-50
  fullContent?: boolean;
  includeImage?: boolean;
  includeVideo?: boolean;
  removeDuplicates?: boolean;
  priorityDomain?: 'top' | 'medium' | 'low';
  sort?: 'relevancy' | 'pubdateasc' | 'source' | 'fetched_at';
  excludeFields?: string[];
  timezone?: string;
  
  // Pagination
  page?: string;
}

/**
 * Market News Tool Parameters
 */
export interface MarketNewsToolParams {
  // Market-specific filtering
  symbols?: string[]; // e.g., ['AAPL', 'TSLA', 'MSFT']
  organizations?: string[]; // e.g., ['Apple', 'Tesla', 'Microsoft']
  
  // Search parameters
  query?: string;
  queryInTitle?: string;
  queryInMeta?: string;
  
  // Time filtering
  timeframe?: string;
  fromDate?: string;
  toDate?: string;
  
  // Filtering parameters
  countries?: string[];
  excludeCountries?: string[];
  languages?: string[];
  excludeLanguages?: string[];
  domains?: string[];
  excludeDomains?: string[];
  domainUrls?: string[];
  
  // Content filtering
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentimentScore?: number;
  aiTags?: string[];
  creators?: string[];
  
  // Response configuration
  size?: number; // 1-50
  fullContent?: boolean;
  includeImage?: boolean;
  includeVideo?: boolean;
  removeDuplicates?: boolean;
  priorityDomain?: 'top' | 'medium' | 'low';
  sort?: 'relevancy' | 'pubdateasc' | 'source' | 'fetched_at';
  excludeFields?: string[];
  timezone?: string;
  
  // Pagination
  page?: string;
}

// ============================================================================
// Tool Implementation Classes
// ============================================================================

/**
 * Latest News Tool - Fetch the latest news articles from the past 48 hours
 */
export class LatestNewsTool implements BaseNewsTool {
  name = 'fetchLatestNews';
  description = 'Fetch the latest news articles from the past 48 hours with comprehensive filtering options';
  
  parameters = {
    query: { type: 'string', description: 'Search query for article content' },
    queryInTitle: { type: 'string', description: 'Search query for article titles only' },
    queryInMeta: { type: 'string', description: 'Search query for article metadata' },
    countries: { type: 'array', items: { type: 'string' }, description: 'Country codes to include (e.g., ["us", "uk"])' },
    excludeCountries: { type: 'array', items: { type: 'string' }, description: 'Country codes to exclude' },
    categories: { type: 'array', items: { type: 'string' }, description: 'News categories to include' },
    excludeCategories: { type: 'array', items: { type: 'string' }, description: 'News categories to exclude' },
    languages: { type: 'array', items: { type: 'string' }, description: 'Language codes to include' },
    excludeLanguages: { type: 'array', items: { type: 'string' }, description: 'Language codes to exclude' },
    domains: { type: 'array', items: { type: 'string' }, description: 'Specific domains to include' },
    excludeDomains: { type: 'array', items: { type: 'string' }, description: 'Specific domains to exclude' },
    timeframe: { type: 'string', description: 'Time window (1-48h or 1m-2880m)' },
    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'Article sentiment' },
    size: { type: 'number', minimum: 1, maximum: 50, description: 'Number of articles to return' },
    fullContent: { type: 'boolean', description: 'Include full article content' },
    includeImage: { type: 'boolean', description: 'Include articles with images' },
    includeVideo: { type: 'boolean', description: 'Include articles with videos' },
    removeDuplicates: { type: 'boolean', description: 'Remove duplicate articles' },
    priorityDomain: { type: 'string', enum: ['top', 'medium', 'low'], description: 'Domain priority level' },
    sort: { type: 'string', enum: ['relevancy', 'pubdateasc', 'source', 'fetched_at'], description: 'Sort order' },
  };

  constructor(
    private newsDataClient: NewsDataClient,
    private logger?: AdvancedObservabilityLogger,
    private newsDataLogger?: NewsDataObservabilityLogger
  ) {
    this.newsDataLogger = newsDataLogger || getNewsDataObservabilityLogger();
  }

  async execute(params: LatestNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    return this.executeWithFormatting(params, agentName);
  }

  async executeWithFormatting(params: LatestNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    const startTime = Date.now();
    
    try {
      // Validate and process parameters
      const processingResult = ParameterProcessor.processParameters(params, 'latest');
      
      if (!processingResult.valid) {
        const errorMessages = processingResult.errors.map(e => `${e.parameter}: ${e.message}`).join('; ');
        throw new ParameterValidationError(
          `Parameter validation failed: ${errorMessages}`,
          'validation',
          processingResult.errors
        );
      }
      
      // Transform processed parameters to NewsData client format
      const clientParams: LatestNewsParams = this.transformLatestParams(processingResult.processed!);
      
      // Execute request through NewsData client
      const response = await this.newsDataClient.fetchLatestNews(clientParams, agentName);
      
      // Transform response to standardized format
      const articles = transformArticles(response.results || []);
      
      // Sanitize articles
      const sanitizedArticles = articles.map(article => ResponseFormatter.sanitizeArticle(article));
      
      // Log successful execution (legacy logger)
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: true,
        cached: false, // TODO: Detect if response was cached
        stale: false,
        freshness: 0,
        itemCount: sanitizedArticles.length,
        duration: Date.now() - startTime,
      });
      
      return sanitizedArticles;
      
    } catch (error) {
      // Log failed execution (legacy logger)
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      });
      
      throw error;
    }
  }

  async executeWithStructuredResponse(params: LatestNewsToolParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const articles = await this.executeWithFormatting(params);
      
      return ResponseFormatter.formatSuccess(articles, {
        totalResults: articles.length,
        cached: false, // TODO: Detect if response was cached
        stale: false,
        executionTime: Date.now() - startTime,
      });
      
    } catch (error) {
      return ResponseFormatter.formatError(
        error as Error,
        Date.now() - startTime,
        false, // TODO: Detect if response was cached
        false
      );
    }
  }

  private transformLatestParams(params: LatestNewsToolParams): LatestNewsParams {
    return {
      q: params.query,
      qInTitle: params.queryInTitle,
      qInMeta: params.queryInMeta,
      country: params.countries,
      excludecountry: params.excludeCountries,
      category: params.categories,
      excludecategory: params.excludeCategories,
      language: params.languages,
      excludelanguage: params.excludeLanguages,
      domain: params.domains,
      excludedomain: params.excludeDomains,
      domainurl: params.domainUrls,
      timeframe: params.timeframe,
      sentiment: params.sentiment,
      sentiment_score: params.sentimentScore,
      tag: params.aiTags,
      organization: params.organizations,
      region: params.regions,
      creator: params.creators,
      size: params.size,
      ...(params.fullContent ? { full_content: 1 } : {}),
      image: params.includeImage ? 1 : 0,
      video: params.includeVideo ? 1 : 0,
      removeduplicate: params.removeDuplicates ? 1 : 0,
      prioritydomain: params.priorityDomain,
      sort: params.sort,
      excludefield: params.excludeFields,
      timezone: params.timezone,
      page: params.page,
    };
  }
}

/**
 * Archive News Tool - Fetch historical news articles with date range filtering
 */
export class ArchiveNewsTool implements BaseNewsTool {
  name = 'fetchArchiveNews';
  description = 'Fetch historical news articles with date range filtering and comprehensive search options';
  
  parameters = {
    fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)', required: true },
    toDate: { type: 'string', description: 'End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)', required: true },
    query: { type: 'string', description: 'Search query for article content' },
    queryInTitle: { type: 'string', description: 'Search query for article titles only' },
    queryInMeta: { type: 'string', description: 'Search query for article metadata' },
    countries: { type: 'array', items: { type: 'string' }, description: 'Country codes to include' },
    excludeCountries: { type: 'array', items: { type: 'string' }, description: 'Country codes to exclude' },
    categories: { type: 'array', items: { type: 'string' }, description: 'News categories to include' },
    excludeCategories: { type: 'array', items: { type: 'string' }, description: 'News categories to exclude' },
    languages: { type: 'array', items: { type: 'string' }, description: 'Language codes to include' },
    excludeLanguages: { type: 'array', items: { type: 'string' }, description: 'Language codes to exclude' },
    domains: { type: 'array', items: { type: 'string' }, description: 'Specific domains to include' },
    excludeDomains: { type: 'array', items: { type: 'string' }, description: 'Specific domains to exclude' },
    size: { type: 'number', minimum: 1, maximum: 50, description: 'Number of articles to return' },
    fullContent: { type: 'boolean', description: 'Include full article content' },
    removeDuplicates: { type: 'boolean', description: 'Remove duplicate articles' },
    sort: { type: 'string', enum: ['relevancy', 'pubdateasc', 'source', 'fetched_at'], description: 'Sort order' },
  };

  constructor(
    private newsDataClient: NewsDataClient,
    private logger?: AdvancedObservabilityLogger,
    private newsDataLogger?: NewsDataObservabilityLogger
  ) {
    this.newsDataLogger = newsDataLogger || getNewsDataObservabilityLogger();
  }

  async execute(params: ArchiveNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    return this.executeWithFormatting(params, agentName);
  }

  async executeWithFormatting(params: ArchiveNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    const startTime = Date.now();
    
    try {
      // Validate and process parameters
      const processingResult = ParameterProcessor.processParameters(params, 'archive');
      
      if (!processingResult.valid) {
        const errorMessages = processingResult.errors.map(e => `${e.parameter}: ${e.message}`).join('; ');
        throw new ParameterValidationError(
          `Parameter validation failed: ${errorMessages}`,
          'validation',
          processingResult.errors
        );
      }
      
      // Transform processed parameters to NewsData client format
      const clientParams: ArchiveNewsParams = this.transformArchiveParams(processingResult.processed!);
      
      // Execute request through NewsData client
      const response = await this.newsDataClient.fetchArchiveNews(clientParams, agentName);
      
      // Transform response to standardized format
      const articles = transformArticles(response.results || []);
      
      // Sanitize articles
      const sanitizedArticles = articles.map(article => ResponseFormatter.sanitizeArticle(article));
      
      // Log successful execution
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: true,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: sanitizedArticles.length,
        duration: Date.now() - startTime,
      });
      
      return sanitizedArticles;
      
    } catch (error) {
      // Log failed execution
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      });
      
      throw error;
    }
  }

  async executeWithStructuredResponse(params: ArchiveNewsToolParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const articles = await this.executeWithFormatting(params);
      
      return ResponseFormatter.formatSuccess(articles, {
        totalResults: articles.length,
        cached: false,
        stale: false,
        executionTime: Date.now() - startTime,
      });
      
    } catch (error) {
      return ResponseFormatter.formatError(
        error as Error,
        Date.now() - startTime,
        false,
        false
      );
    }
  }

  private transformArchiveParams(params: ArchiveNewsToolParams): ArchiveNewsParams {
    return {
      from_date: params.fromDate,
      to_date: params.toDate,
      q: params.query,
      qInTitle: params.queryInTitle,
      qInMeta: params.queryInMeta,
      country: params.countries,
      excludecountry: params.excludeCountries,
      category: params.categories,
      excludecategory: params.excludeCategories,
      language: params.languages,
      excludelanguage: params.excludeLanguages,
      domain: params.domains,
      excludedomain: params.excludeDomains,
      domainurl: params.domainUrls,
      size: params.size,
      ...(params.fullContent ? { full_content: 1 } : {}),
      removeduplicate: params.removeDuplicates ? 1 : 0,
      prioritydomain: params.priorityDomain,
      sort: params.sort,
      excludefield: params.excludeFields,
      timezone: params.timezone,
      page: params.page,
    };
  }
}

/**
 * Crypto News Tool - Fetch cryptocurrency and blockchain related news
 */
export class CryptoNewsTool implements BaseNewsTool {
  name = 'fetchCryptoNews';
  description = 'Fetch cryptocurrency and blockchain related news with coin-specific filtering';
  
  parameters = {
    coins: { type: 'array', items: { type: 'string' }, description: 'Crypto symbols (e.g., ["btc", "eth", "ada"])' },
    query: { type: 'string', description: 'Search query for article content' },
    queryInTitle: { type: 'string', description: 'Search query for article titles only' },
    queryInMeta: { type: 'string', description: 'Search query for article metadata' },
    timeframe: { type: 'string', description: 'Time window for news' },
    fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)' },
    toDate: { type: 'string', description: 'End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)' },
    languages: { type: 'array', items: { type: 'string' }, description: 'Language codes to include' },
    excludeLanguages: { type: 'array', items: { type: 'string' }, description: 'Language codes to exclude' },
    domains: { type: 'array', items: { type: 'string' }, description: 'Specific domains to include' },
    excludeDomains: { type: 'array', items: { type: 'string' }, description: 'Specific domains to exclude' },
    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'Article sentiment' },
    aiTags: { type: 'array', items: { type: 'string' }, description: 'AI-generated tags to filter by' },
    size: { type: 'number', minimum: 1, maximum: 50, description: 'Number of articles to return' },
    fullContent: { type: 'boolean', description: 'Include full article content' },
    removeDuplicates: { type: 'boolean', description: 'Remove duplicate articles' },
    sort: { type: 'string', enum: ['relevancy', 'pubdateasc', 'source', 'fetched_at'], description: 'Sort order' },
  };

  constructor(
    private newsDataClient: NewsDataClient,
    private logger?: AdvancedObservabilityLogger,
    private newsDataLogger?: NewsDataObservabilityLogger
  ) {
    this.newsDataLogger = newsDataLogger || getNewsDataObservabilityLogger();
  }

  async execute(params: CryptoNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    return this.executeWithFormatting(params, agentName);
  }

  async executeWithFormatting(params: CryptoNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    const startTime = Date.now();
    
    try {
      // Validate and process parameters
      const processingResult = ParameterProcessor.processParameters(params, 'crypto');
      
      if (!processingResult.valid) {
        const errorMessages = processingResult.errors.map(e => `${e.parameter}: ${e.message}`).join('; ');
        throw new ParameterValidationError(
          `Parameter validation failed: ${errorMessages}`,
          'validation',
          processingResult.errors
        );
      }
      
      // Transform processed parameters to NewsData client format
      const clientParams: CryptoNewsParams = this.transformCryptoParams(processingResult.processed!);
      
      // Execute request through NewsData client
      const response = await this.newsDataClient.fetchCryptoNews(clientParams, agentName);
      
      // Transform response to standardized format
      const articles = transformArticles(response.results || []);
      
      // Sanitize articles
      const sanitizedArticles = articles.map(article => ResponseFormatter.sanitizeArticle(article));
      
      // Log successful execution
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: true,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: sanitizedArticles.length,
        duration: Date.now() - startTime,
      });
      
      return sanitizedArticles;
      
    } catch (error) {
      // Log failed execution
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      });
      
      throw error;
    }
  }

  async executeWithStructuredResponse(params: CryptoNewsToolParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const articles = await this.executeWithFormatting(params);
      
      return ResponseFormatter.formatSuccess(articles, {
        totalResults: articles.length,
        cached: false,
        stale: false,
        executionTime: Date.now() - startTime,
      });
      
    } catch (error) {
      return ResponseFormatter.formatError(
        error as Error,
        Date.now() - startTime,
        false,
        false
      );
    }
  }

  private transformCryptoParams(params: CryptoNewsToolParams): CryptoNewsParams {
    return {
      coin: params.coins,
      q: params.query,
      qInTitle: params.queryInTitle,
      qInMeta: params.queryInMeta,
      timeframe: params.timeframe,
      from_date: params.fromDate,
      to_date: params.toDate,
      language: params.languages,
      excludelanguage: params.excludeLanguages,
      domain: params.domains,
      excludedomain: params.excludeDomains,
      domainurl: params.domainUrls,
      sentiment: params.sentiment,
      tag: params.aiTags,
      size: params.size,
      ...(params.fullContent ? { full_content: 1 } : {}),
      removeduplicate: params.removeDuplicates ? 1 : 0,
      prioritydomain: params.priorityDomain,
      sort: params.sort,
      excludefield: params.excludeFields,
      timezone: params.timezone,
      page: params.page,
    };
  }
}

/**
 * Market News Tool - Fetch financial and business market news
 */
export class MarketNewsTool implements BaseNewsTool {
  name = 'fetchMarketNews';
  description = 'Fetch financial and business market news with symbol and organization filtering';
  
  parameters = {
    symbols: { type: 'array', items: { type: 'string' }, description: 'Stock symbols (e.g., ["AAPL", "TSLA", "MSFT"])' },
    organizations: { type: 'array', items: { type: 'string' }, description: 'Company names to filter by' },
    query: { type: 'string', description: 'Search query for article content' },
    queryInTitle: { type: 'string', description: 'Search query for article titles only' },
    queryInMeta: { type: 'string', description: 'Search query for article metadata' },
    timeframe: { type: 'string', description: 'Time window for news' },
    fromDate: { type: 'string', description: 'Start date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)' },
    toDate: { type: 'string', description: 'End date (YYYY-MM-DD or YYYY-MM-DD HH:MM:SS)' },
    countries: { type: 'array', items: { type: 'string' }, description: 'Country codes to include' },
    excludeCountries: { type: 'array', items: { type: 'string' }, description: 'Country codes to exclude' },
    languages: { type: 'array', items: { type: 'string' }, description: 'Language codes to include' },
    excludeLanguages: { type: 'array', items: { type: 'string' }, description: 'Language codes to exclude' },
    domains: { type: 'array', items: { type: 'string' }, description: 'Specific domains to include' },
    excludeDomains: { type: 'array', items: { type: 'string' }, description: 'Specific domains to exclude' },
    sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral'], description: 'Article sentiment' },
    sentimentScore: { type: 'number', description: 'Sentiment score threshold' },
    aiTags: { type: 'array', items: { type: 'string' }, description: 'AI-generated tags to filter by' },
    creators: { type: 'array', items: { type: 'string' }, description: 'Article creators to filter by' },
    size: { type: 'number', minimum: 1, maximum: 50, description: 'Number of articles to return' },
    fullContent: { type: 'boolean', description: 'Include full article content' },
    removeDuplicates: { type: 'boolean', description: 'Remove duplicate articles' },
    sort: { type: 'string', enum: ['relevancy', 'pubdateasc', 'source', 'fetched_at'], description: 'Sort order' },
  };

  constructor(
    private newsDataClient: NewsDataClient,
    private logger?: AdvancedObservabilityLogger,
    private newsDataLogger?: NewsDataObservabilityLogger
  ) {
    this.newsDataLogger = newsDataLogger || getNewsDataObservabilityLogger();
  }

  async execute(params: MarketNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    return this.executeWithFormatting(params, agentName);
  }

  async executeWithFormatting(params: MarketNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    const startTime = Date.now();
    
    try {
      // Validate and process parameters
      const processingResult = ParameterProcessor.processParameters(params, 'market');
      
      if (!processingResult.valid) {
        const errorMessages = processingResult.errors.map(e => `${e.parameter}: ${e.message}`).join('; ');
        throw new ParameterValidationError(
          `Parameter validation failed: ${errorMessages}`,
          'validation',
          processingResult.errors
        );
      }
      
      // Transform processed parameters to NewsData client format
      const clientParams: MarketNewsParams = this.transformMarketParams(processingResult.processed!);
      
      // Execute request through NewsData client
      const response = await this.newsDataClient.fetchMarketNews(clientParams, agentName);
      
      // Transform response to standardized format
      const articles = transformArticles(response.results || []);
      
      // Sanitize articles
      const sanitizedArticles = articles.map(article => ResponseFormatter.sanitizeArticle(article));
      
      // Log successful execution
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: true,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: sanitizedArticles.length,
        duration: Date.now() - startTime,
      });
      
      return sanitizedArticles;
      
    } catch (error) {
      // Log failed execution
      this.logger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: (error as Error).message,
        duration: Date.now() - startTime,
      });
      
      throw error;
    }
  }

  async executeWithStructuredResponse(params: MarketNewsToolParams): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    
    try {
      const articles = await this.executeWithFormatting(params);
      
      return ResponseFormatter.formatSuccess(articles, {
        totalResults: articles.length,
        cached: false,
        stale: false,
        executionTime: Date.now() - startTime,
      });
      
    } catch (error) {
      return ResponseFormatter.formatError(
        error as Error,
        Date.now() - startTime,
        false,
        false
      );
    }
  }

  private transformMarketParams(params: MarketNewsToolParams): MarketNewsParams {
    return {
      symbol: params.symbols,
      organization: params.organizations,
      q: params.query,
      qInTitle: params.queryInTitle,
      qInMeta: params.queryInMeta,
      timeframe: params.timeframe,
      from_date: params.fromDate,
      to_date: params.toDate,
      country: params.countries,
      excludecountry: params.excludeCountries,
      language: params.languages,
      excludelanguage: params.excludeLanguages,
      domain: params.domains,
      excludedomain: params.excludeDomains,
      domainurl: params.domainUrls,
      sentiment: params.sentiment,
      sentiment_score: params.sentimentScore,
      tag: params.aiTags,
      creator: params.creators,
      size: params.size,
      ...(params.fullContent ? { full_content: 1 } : {}),
      removeduplicate: params.removeDuplicates ? 1 : 0,
      prioritydomain: params.priorityDomain,
      sort: params.sort,
      excludefield: params.excludeFields,
      timezone: params.timezone,
      page: params.page,
    };
  }
}

// ============================================================================
// Parameter Validation and Processing Utilities
// ============================================================================

/**
 * Parameter validator class with comprehensive validation rules
 */
export class ParameterValidator {
  
  /**
   * Validate query parameters
   */
  static validateQuery(query: string | undefined, paramName: string): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    
    if (query !== undefined) {
      if (typeof query !== 'string') {
        errors.push(new ParameterValidationError(
          `${paramName} must be a string`,
          paramName,
          query
        ));
      } else if (query.length === 0) {
        errors.push(new ParameterValidationError(
          `${paramName} cannot be empty`,
          paramName,
          query
        ));
      } else if (query.length > 512) {
        errors.push(new ParameterValidationError(
          `${paramName} cannot exceed 512 characters`,
          paramName,
          query
        ));
      }
    }
    
    return errors;
  }

  /**
   * Validate array parameters (countries, categories, languages, etc.)
   */
  static validateStringArray(
    array: string[] | undefined, 
    paramName: string, 
    options: {
      maxLength?: number;
      allowedValues?: string[];
      minItems?: number;
      maxItems?: number;
    } = {}
  ): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    const { maxLength = 100, allowedValues, minItems = 0, maxItems = 50 } = options;
    
    if (array !== undefined) {
      if (!Array.isArray(array)) {
        errors.push(new ParameterValidationError(
          `${paramName} must be an array`,
          paramName,
          array
        ));
        return errors;
      }
      
      if (array.length < minItems) {
        errors.push(new ParameterValidationError(
          `${paramName} must have at least ${minItems} items`,
          paramName,
          array
        ));
      }
      
      if (array.length > maxItems) {
        errors.push(new ParameterValidationError(
          `${paramName} cannot have more than ${maxItems} items`,
          paramName,
          array
        ));
      }
      
      array.forEach((item, index) => {
        if (typeof item !== 'string') {
          errors.push(new ParameterValidationError(
            `${paramName}[${index}] must be a string`,
            `${paramName}[${index}]`,
            item
          ));
        } else if (item.length === 0) {
          errors.push(new ParameterValidationError(
            `${paramName}[${index}] cannot be empty`,
            `${paramName}[${index}]`,
            item
          ));
        } else if (item.length > maxLength) {
          errors.push(new ParameterValidationError(
            `${paramName}[${index}] cannot exceed ${maxLength} characters`,
            `${paramName}[${index}]`,
            item
          ));
        } else if (allowedValues && !allowedValues.includes(item)) {
          errors.push(new ParameterValidationError(
            `${paramName}[${index}] must be one of: ${allowedValues.join(', ')}`,
            `${paramName}[${index}]`,
            item
          ));
        }
      });
    }
    
    return errors;
  }

  /**
   * Validate date parameters
   */
  static validateDate(date: string | undefined, paramName: string, required: boolean = false): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    
    if (required && date === undefined) {
      errors.push(new ParameterValidationError(
        `${paramName} is required`,
        paramName,
        date
      ));
      return errors;
    }
    
    if (date !== undefined) {
      if (typeof date !== 'string') {
        errors.push(new ParameterValidationError(
          `${paramName} must be a string`,
          paramName,
          date
        ));
        return errors;
      }
      
      // Validate date format: YYYY-MM-DD or YYYY-MM-DD HH:MM:SS
      const dateRegex = /^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}:\d{2})?$/;
      if (!dateRegex.test(date)) {
        errors.push(new ParameterValidationError(
          `${paramName} must be in format YYYY-MM-DD or YYYY-MM-DD HH:MM:SS`,
          paramName,
          date
        ));
        return errors;
      }
      
      // Validate actual date
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) {
        errors.push(new ParameterValidationError(
          `${paramName} is not a valid date`,
          paramName,
          date
        ));
      }
    }
    
    return errors;
  }

  /**
   * Validate date range
   */
  static validateDateRange(
    fromDate: string | undefined, 
    toDate: string | undefined,
    required: boolean = false
  ): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    
    // Validate individual dates first
    errors.push(...this.validateDate(fromDate, 'fromDate', required));
    errors.push(...this.validateDate(toDate, 'toDate', required));
    
    // If both dates are valid, check range
    if (fromDate && toDate && errors.length === 0) {
      const from = new Date(fromDate);
      const to = new Date(toDate);
      
      if (from >= to) {
        errors.push(new ParameterValidationError(
          'fromDate must be before toDate',
          'dateRange',
          { fromDate, toDate }
        ));
      }
      
      // Check if date range is reasonable (not more than 1 year for archive)
      const daysDiff = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
      if (daysDiff > 365) {
        errors.push(new ParameterValidationError(
          'Date range cannot exceed 365 days',
          'dateRange',
          { fromDate, toDate, daysDiff }
        ));
      }
    }
    
    return errors;
  }

  /**
   * Validate numeric parameters
   */
  static validateNumber(
    value: number | undefined, 
    paramName: string, 
    options: {
      min?: number;
      max?: number;
      integer?: boolean;
      required?: boolean;
    } = {}
  ): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    const { min, max, integer = false, required = false } = options;
    
    if (required && value === undefined) {
      errors.push(new ParameterValidationError(
        `${paramName} is required`,
        paramName,
        value
      ));
      return errors;
    }
    
    if (value !== undefined) {
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push(new ParameterValidationError(
          `${paramName} must be a valid number`,
          paramName,
          value
        ));
        return errors;
      }
      
      if (integer && !Number.isInteger(value)) {
        errors.push(new ParameterValidationError(
          `${paramName} must be an integer`,
          paramName,
          value
        ));
      }
      
      if (min !== undefined && value < min) {
        errors.push(new ParameterValidationError(
          `${paramName} must be at least ${min}`,
          paramName,
          value
        ));
      }
      
      if (max !== undefined && value > max) {
        errors.push(new ParameterValidationError(
          `${paramName} cannot exceed ${max}`,
          paramName,
          value
        ));
      }
    }
    
    return errors;
  }

  /**
   * Validate enum parameters
   */
  static validateEnum(
    value: string | undefined, 
    paramName: string, 
    allowedValues: string[],
    required: boolean = false
  ): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    
    if (required && value === undefined) {
      errors.push(new ParameterValidationError(
        `${paramName} is required`,
        paramName,
        value
      ));
      return errors;
    }
    
    if (value !== undefined) {
      if (typeof value !== 'string') {
        errors.push(new ParameterValidationError(
          `${paramName} must be a string`,
          paramName,
          value
        ));
      } else if (!allowedValues.includes(value)) {
        errors.push(new ParameterValidationError(
          `${paramName} must be one of: ${allowedValues.join(', ')}`,
          paramName,
          value
        ));
      }
    }
    
    return errors;
  }

  /**
   * Validate boolean parameters
   */
  static validateBoolean(
    value: boolean | undefined, 
    paramName: string,
    required: boolean = false
  ): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    
    if (required && value === undefined) {
      errors.push(new ParameterValidationError(
        `${paramName} is required`,
        paramName,
        value
      ));
      return errors;
    }
    
    if (value !== undefined && typeof value !== 'boolean') {
      errors.push(new ParameterValidationError(
        `${paramName} must be a boolean`,
        paramName,
        value
      ));
    }
    
    return errors;
  }

  /**
   * Validate timeframe parameter
   */
  static validateTimeframe(timeframe: string | undefined): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    
    if (timeframe !== undefined) {
      if (typeof timeframe !== 'string') {
        errors.push(new ParameterValidationError(
          'timeframe must be a string',
          'timeframe',
          timeframe
        ));
        return errors;
      }
      
      // Validate timeframe format: number followed by optional 'h' or 'm'
      // Examples: "6", "24", "15m", "90m", "2h"
      const timeframeRegex = /^(\d+)([hm]?)$/;
      const match = timeframe.match(timeframeRegex);
      
      if (!match) {
        errors.push(new ParameterValidationError(
          'timeframe must be a number optionally followed by "h" or "m" (e.g., "6", "24", "15m", "2h")',
          'timeframe',
          timeframe
        ));
        return errors;
      }
      
      const [, numberStr, unit] = match;
      const number = parseInt(numberStr, 10);
      
      // Validate ranges based on unit
      if (unit === 'm' || unit === '') {
        // Minutes: 1-2880 (48 hours)
        if (number < 1 || number > 2880) {
          errors.push(new ParameterValidationError(
            'timeframe in minutes must be between 1 and 2880',
            'timeframe',
            timeframe
          ));
        }
      } else if (unit === 'h') {
        // Hours: 1-48
        if (number < 1 || number > 48) {
          errors.push(new ParameterValidationError(
            'timeframe in hours must be between 1 and 48',
            'timeframe',
            timeframe
          ));
        }
      }
    }
    
    return errors;
  }

  /**
   * Validate mutually exclusive parameters
   */
  static validateMutuallyExclusive(
    params: Record<string, any>, 
    exclusiveGroups: string[][]
  ): ParameterValidationError[] {
    const errors: ParameterValidationError[] = [];
    
    exclusiveGroups.forEach(group => {
      const presentParams = group.filter(param => params[param] !== undefined);
      if (presentParams.length > 1) {
        errors.push(new ParameterValidationError(
          `Parameters ${presentParams.join(', ')} are mutually exclusive`,
          'mutualExclusion',
          presentParams
        ));
      }
    });
    
    return errors;
  }
}

/**
 * Parameter processor class for transforming and normalizing parameters
 */
export class ParameterProcessor {
  
  /**
   * Normalize string arrays (remove duplicates, trim, lowercase where appropriate)
   */
  static normalizeStringArray(
    array: string[] | undefined,
    options: {
      lowercase?: boolean;
      trim?: boolean;
      removeDuplicates?: boolean;
    } = {}
  ): string[] | undefined {
    if (!array) return undefined;
    
    const { lowercase = false, trim = true, removeDuplicates = true } = options;
    
    let processed = array.map(item => {
      let result = item;
      if (trim) result = result.trim();
      if (lowercase) result = result.toLowerCase();
      return result;
    });
    
    if (removeDuplicates) {
      processed = [...new Set(processed)];
    }
    
    return processed.length > 0 ? processed : undefined;
  }

  /**
   * Process country codes (normalize to lowercase, validate format)
   */
  static processCountryCodes(countries: string[] | undefined): string[] | undefined {
    if (!countries) return undefined;
    
    return this.normalizeStringArray(countries, { 
      lowercase: true, 
      trim: true, 
      removeDuplicates: true 
    })?.filter(code => {
      // Basic validation: 2-letter country codes
      return /^[a-z]{2}$/.test(code);
    });
  }

  /**
   * Process language codes (normalize to lowercase, validate format)
   */
  static processLanguageCodes(languages: string[] | undefined): string[] | undefined {
    if (!languages) return undefined;
    
    return this.normalizeStringArray(languages, { 
      lowercase: true, 
      trim: true, 
      removeDuplicates: true 
    })?.filter(code => {
      // Basic validation: 2-letter language codes
      return /^[a-z]{2}$/.test(code);
    });
  }

  /**
   * Process category names (normalize case, validate against known categories)
   */
  static processCategories(categories: string[] | undefined): string[] | undefined {
    if (!categories) return undefined;
    
    const knownCategories = [
      'business', 'entertainment', 'environment', 'food', 'health',
      'politics', 'science', 'sports', 'technology', 'top', 'tourism', 'world'
    ];
    
    return this.normalizeStringArray(categories, { 
      lowercase: true, 
      trim: true, 
      removeDuplicates: true 
    })?.filter(category => knownCategories.includes(category));
  }

  /**
   * Process domain names (normalize, validate format)
   */
  static processDomains(domains: string[] | undefined): string[] | undefined {
    if (!domains) return undefined;
    
    return this.normalizeStringArray(domains, { 
      lowercase: true, 
      trim: true, 
      removeDuplicates: true 
    })?.filter(domain => {
      // Basic domain validation
      return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain);
    });
  }

  /**
   * Process crypto coin symbols (normalize to lowercase)
   */
  static processCryptoCoins(coins: string[] | undefined): string[] | undefined {
    if (!coins) return undefined;
    
    return this.normalizeStringArray(coins, { 
      lowercase: true, 
      trim: true, 
      removeDuplicates: true 
    })?.filter(coin => {
      // Basic validation: 2-10 character symbols
      return /^[a-z0-9]{2,10}$/.test(coin);
    });
  }

  /**
   * Process stock symbols (normalize to uppercase)
   */
  static processStockSymbols(symbols: string[] | undefined): string[] | undefined {
    if (!symbols) return undefined;
    
    return this.normalizeStringArray(symbols, { 
      lowercase: false, 
      trim: true, 
      removeDuplicates: true 
    })?.map(symbol => symbol.toUpperCase())
      .filter(symbol => {
        // Basic validation: 1-5 character symbols
        return /^[A-Z]{1,5}$/.test(symbol);
      });
  }

  /**
   * Process organization names (normalize case, trim)
   */
  static processOrganizations(organizations: string[] | undefined): string[] | undefined {
    if (!organizations) return undefined;
    
    return this.normalizeStringArray(organizations, { 
      lowercase: false, 
      trim: true, 
      removeDuplicates: true 
    })?.filter(org => org.length > 0);
  }

  /**
   * Process AI tags (normalize case, validate format)
   */
  static processAITags(tags: string[] | undefined): string[] | undefined {
    if (!tags) return undefined;
    
    return this.normalizeStringArray(tags, { 
      lowercase: true, 
      trim: true, 
      removeDuplicates: true 
    })?.filter(tag => {
      // Basic validation: alphanumeric and spaces, 1-50 characters
      return /^[a-z0-9\s]{1,50}$/.test(tag);
    });
  }

  /**
   * Combine include/exclude filters with proper logic
   */
  static combineFilters(
    include: string[] | undefined,
    exclude: string[] | undefined
  ): FilterCombination {
    const includeList = include || [];
    const excludeList = exclude || [];
    
    // If both are provided, include takes priority but exclude is still applied
    return {
      include: includeList,
      exclude: excludeList,
      priority: includeList.length > 0 ? 'include' : 'exclude'
    };
  }

  /**
   * Process and validate complete parameter set
   */
  static processParameters(params: any, toolType: 'latest' | 'archive' | 'crypto' | 'market'): ParameterProcessingResult {
    const errors: ParameterValidationError[] = [];
    const processed: any = { ...params };
    
    // Common validations for all tools
    errors.push(...ParameterValidator.validateQuery(params.query, 'query'));
    errors.push(...ParameterValidator.validateQuery(params.queryInTitle, 'queryInTitle'));
    errors.push(...ParameterValidator.validateQuery(params.queryInMeta, 'queryInMeta'));
    
    // Validate mutually exclusive query parameters
    errors.push(...ParameterValidator.validateMutuallyExclusive(params, [
      ['query', 'queryInTitle', 'queryInMeta']
    ]));
    
    // Common array validations
    errors.push(...ParameterValidator.validateStringArray(params.languages, 'languages', { maxItems: 5 }));
    errors.push(...ParameterValidator.validateStringArray(params.excludeLanguages, 'excludeLanguages', { maxItems: 5 }));
    errors.push(...ParameterValidator.validateStringArray(params.domains, 'domains', { maxItems: 5 }));
    errors.push(...ParameterValidator.validateStringArray(params.excludeDomains, 'excludeDomains', { maxItems: 5 }));
    errors.push(...ParameterValidator.validateStringArray(params.domainUrls, 'domainUrls', { maxItems: 5 }));
    
    // Common enum validations
    errors.push(...ParameterValidator.validateEnum(params.sentiment, 'sentiment', ['positive', 'negative', 'neutral']));
    errors.push(...ParameterValidator.validateEnum(params.sort, 'sort', ['relevancy', 'pubdateasc', 'source', 'fetched_at']));
    errors.push(...ParameterValidator.validateEnum(params.priorityDomain, 'priorityDomain', ['top', 'medium', 'low']));
    
    // Common numeric validations
    errors.push(...ParameterValidator.validateNumber(params.size, 'size', { min: 1, max: 50, integer: true }));
    errors.push(...ParameterValidator.validateNumber(params.sentimentScore, 'sentimentScore', { min: -1, max: 1 }));
    
    // Common boolean validations
    errors.push(...ParameterValidator.validateBoolean(params.fullContent, 'fullContent'));
    errors.push(...ParameterValidator.validateBoolean(params.includeImage, 'includeImage'));
    errors.push(...ParameterValidator.validateBoolean(params.includeVideo, 'includeVideo'));
    errors.push(...ParameterValidator.validateBoolean(params.removeDuplicates, 'removeDuplicates'));
    
    // Tool-specific validations
    switch (toolType) {
      case 'latest':
        errors.push(...ParameterValidator.validateStringArray(params.countries, 'countries', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateStringArray(params.excludeCountries, 'excludeCountries', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateStringArray(params.categories, 'categories', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateStringArray(params.excludeCategories, 'excludeCategories', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateTimeframe(params.timeframe));
        break;
        
      case 'archive':
        errors.push(...ParameterValidator.validateDateRange(params.fromDate, params.toDate, true));
        errors.push(...ParameterValidator.validateStringArray(params.countries, 'countries', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateStringArray(params.excludeCountries, 'excludeCountries', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateStringArray(params.categories, 'categories', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateStringArray(params.excludeCategories, 'excludeCategories', { maxItems: 5 }));
        break;
        
      case 'crypto':
        errors.push(...ParameterValidator.validateStringArray(params.coins, 'coins', { maxItems: 10 }));
        errors.push(...ParameterValidator.validateTimeframe(params.timeframe));
        errors.push(...ParameterValidator.validateDate(params.fromDate, 'fromDate'));
        errors.push(...ParameterValidator.validateDate(params.toDate, 'toDate'));
        if (params.fromDate && params.toDate) {
          errors.push(...ParameterValidator.validateDateRange(params.fromDate, params.toDate));
        }
        break;
        
      case 'market':
        errors.push(...ParameterValidator.validateStringArray(params.symbols, 'symbols', { maxItems: 10 }));
        errors.push(...ParameterValidator.validateStringArray(params.organizations, 'organizations', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateStringArray(params.countries, 'countries', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateStringArray(params.excludeCountries, 'excludeCountries', { maxItems: 5 }));
        errors.push(...ParameterValidator.validateTimeframe(params.timeframe));
        errors.push(...ParameterValidator.validateDate(params.fromDate, 'fromDate'));
        errors.push(...ParameterValidator.validateDate(params.toDate, 'toDate'));
        if (params.fromDate && params.toDate) {
          errors.push(...ParameterValidator.validateDateRange(params.fromDate, params.toDate));
        }
        break;
    }
    
    // Process and normalize parameters if no validation errors
    if (errors.length === 0) {
      // Normalize arrays
      processed.languages = this.processLanguageCodes(params.languages);
      processed.excludeLanguages = this.processLanguageCodes(params.excludeLanguages);
      processed.domains = this.processDomains(params.domains);
      processed.excludeDomains = this.processDomains(params.excludeDomains);
      processed.domainUrls = this.processDomains(params.domainUrls);
      
      // Tool-specific processing
      switch (toolType) {
        case 'latest':
        case 'archive':
        case 'market':
          processed.countries = this.processCountryCodes(params.countries);
          processed.excludeCountries = this.processCountryCodes(params.excludeCountries);
          if (toolType !== 'market') {
            processed.categories = this.processCategories(params.categories);
            processed.excludeCategories = this.processCategories(params.excludeCategories);
          }
          if (toolType === 'market') {
            processed.symbols = this.processStockSymbols(params.symbols);
            processed.organizations = this.processOrganizations(params.organizations);
          }
          break;
          
        case 'crypto':
          processed.coins = this.processCryptoCoins(params.coins);
          break;
      }
      
      // Process AI tags for all tools
      processed.aiTags = this.processAITags(params.aiTags);
      processed.creators = this.processOrganizations(params.creators);
    }
    
    return {
      valid: errors.length === 0,
      processed: errors.length === 0 ? processed : undefined,
      errors
    };
  }
}

// ============================================================================
// Shared Utility Methods
// ============================================================================

/**
 * Transform NewsData articles to standardized format
 * This method is shared across all tool classes
 */
function transformArticles(articles: NewsDataArticle[]): NewsArticle[] {
  return articles.map((article: NewsDataArticle) => ({
    id: article.article_id,
    title: article.title,
    url: article.link,
    source: {
      id: article.source_id,
      name: article.source_name,
      url: article.source_url,
      icon: article.source_icon,
      priority: article.source_priority,
    },
    content: {
      description: article.description,
      fullContent: article.content,
      keywords: article.keywords,
      imageUrl: article.image_url,
      videoUrl: article.video_url,
    },
    metadata: {
      publishedAt: article.pubDate,
      publishedAtTZ: article.pubDateTZ,
      fetchedAt: article.fetched_at,
      language: article.language,
      countries: article.country,
      categories: article.category,
      datatype: article.datatype,
      duplicate: article.duplicate,
    },
    creators: article.creator,
    ai: article.ai_tag || article.sentiment || article.sentiment_stats || article.ai_region || article.ai_org || article.ai_summary ? {
      tags: article.ai_tag,
      sentiment: article.sentiment,
      sentimentStats: article.sentiment_stats,
      regions: article.ai_region,
      organizations: article.ai_org,
      summary: article.ai_summary,
    } : undefined,
    crypto: article.coin ? {
      coins: article.coin,
    } : undefined,
    market: article.symbol ? {
      symbols: article.symbol,
    } : undefined,
  }));
}

// ============================================================================
// News Tools Manager
// ============================================================================

/**
 * News Tools Manager - Provides centralized access to all news tools
 */
export class NewsToolsManager {
  private latestNewsTool: LatestNewsTool;
  private archiveNewsTool: ArchiveNewsTool;
  private cryptoNewsTool: CryptoNewsTool;
  private marketNewsTool: MarketNewsTool;

  constructor(
    newsDataClient: NewsDataClient,
    logger?: AdvancedObservabilityLogger,
    newsDataLogger?: NewsDataObservabilityLogger
  ) {
    this.latestNewsTool = new LatestNewsTool(newsDataClient, logger, newsDataLogger);
    this.archiveNewsTool = new ArchiveNewsTool(newsDataClient, logger, newsDataLogger);
    this.cryptoNewsTool = new CryptoNewsTool(newsDataClient, logger, newsDataLogger);
    this.marketNewsTool = new MarketNewsTool(newsDataClient, logger, newsDataLogger);
  }

  /**
   * Get all available news tools
   */
  getAllTools(): BaseNewsTool[] {
    return [
      this.latestNewsTool,
      this.archiveNewsTool,
      this.cryptoNewsTool,
      this.marketNewsTool,
    ];
  }

  /**
   * Get tool by name
   */
  getTool(name: string): BaseNewsTool | undefined {
    const tools = this.getAllTools();
    return tools.find(tool => tool.name === name);
  }

  /**
   * Execute tool by name
   */
  async executeTool(name: string, params: any, agentName?: string): Promise<NewsArticle[]> {
    const tool = this.getTool(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return await tool.execute(params, agentName);
  }

  // Direct access methods for convenience
  async fetchLatestNews(params: LatestNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    return await this.latestNewsTool.execute(params, agentName);
  }

  async fetchArchiveNews(params: ArchiveNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    return await this.archiveNewsTool.execute(params, agentName);
  }

  async fetchCryptoNews(params: CryptoNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    return await this.cryptoNewsTool.execute(params, agentName);
  }

  async fetchMarketNews(params: MarketNewsToolParams, agentName?: string): Promise<NewsArticle[]> {
    return await this.marketNewsTool.execute(params, agentName);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsToolsManager instance
 */
export function createNewsToolsManager(
  newsDataClient: NewsDataClient,
  logger?: AdvancedObservabilityLogger,
  newsDataLogger?: NewsDataObservabilityLogger
): NewsToolsManager {
  return new NewsToolsManager(newsDataClient, logger, newsDataLogger);
}

/**
 * Create individual news tools
 */
export function createLatestNewsTool(
  newsDataClient: NewsDataClient,
  logger?: AdvancedObservabilityLogger,
  newsDataLogger?: NewsDataObservabilityLogger
): LatestNewsTool {
  return new LatestNewsTool(newsDataClient, logger, newsDataLogger);
}

export function createArchiveNewsTool(
  newsDataClient: NewsDataClient,
  logger?: AdvancedObservabilityLogger,
  newsDataLogger?: NewsDataObservabilityLogger
): ArchiveNewsTool {
  return new ArchiveNewsTool(newsDataClient, logger, newsDataLogger);
}

export function createCryptoNewsTool(
  newsDataClient: NewsDataClient,
  logger?: AdvancedObservabilityLogger,
  newsDataLogger?: NewsDataObservabilityLogger
): CryptoNewsTool {
  return new CryptoNewsTool(newsDataClient, logger, newsDataLogger);
}

export function createMarketNewsTool(
  newsDataClient: NewsDataClient,
  logger?: AdvancedObservabilityLogger,
  newsDataLogger?: NewsDataObservabilityLogger
): MarketNewsTool {
  return new MarketNewsTool(newsDataClient, logger, newsDataLogger);
}