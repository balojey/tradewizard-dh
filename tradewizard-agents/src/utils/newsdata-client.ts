/**
 * NewsData.io API Client
 * 
 * Provides a comprehensive client for interacting with NewsData.io API endpoints
 * including latest news, crypto news, market news, and archive news.
 * 
 * Features:
 * - Type-safe interfaces for all API endpoints
 * - Built-in rate limiting and quota management
 * - Intelligent caching with TTL support
 * - Circuit breaker for resilience
 * - Comprehensive error handling
 * - Request/response validation
 */

import type { AdvancedObservabilityLogger } from './audit-logger.js';
import type { NewsDataCacheManager } from './newsdata-cache-manager.js';
import type { NewsDataRateLimiter } from './newsdata-rate-limiter.js';
import type { NewsDataCircuitBreaker } from './newsdata-circuit-breaker.js';
import type { NewsDataFallbackManager } from './newsdata-fallback-manager.js';
import type { NewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import { getNewsDataObservabilityLogger } from './newsdata-observability-logger.js';
import type { NewsDataErrorHandler } from './newsdata-error-handler.js';
import { getNewsDataErrorHandler } from './newsdata-error-handler.js';
import type { NewsDataAgentUsageTracker } from './newsdata-agent-usage-tracker.js';
import { getNewsDataAgentUsageTracker } from './newsdata-agent-usage-tracker.js';
import type { NewsDataPerformanceMonitor } from './newsdata-performance-monitor.js';

// ============================================================================
// Core Configuration Types
// ============================================================================

export interface NewsDataConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
  retryDelay?: number;
  isFreeTier?: boolean; // Whether using free tier plan (excludes size/timeframe params)
  
  // Rate limiting configuration
  rateLimiting: {
    requestsPerWindow: number; // requests per 15 minutes
    windowSizeMs: number; // 15 minutes in milliseconds
    dailyQuota?: number; // daily API credit limit
  };
  
  // Cache configuration
  cache: {
    enabled: boolean;
    ttl: {
      latest: number; // seconds
      crypto: number; // seconds
      market: number; // seconds
      archive: number; // seconds
    };
    maxSize?: number; // maximum cache entries
  };
  
  // Circuit breaker configuration
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    resetTimeoutMs: number;
    halfOpenMaxCalls?: number;
  };
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface NewsDataBaseParams {
  apikey?: string; // Will be set automatically
  id?: string | string[];
  q?: string;
  qInTitle?: string;
  qInMeta?: string;
  language?: string | string[];
  excludelanguage?: string | string[];
  sort?: 'pubdateasc' | 'relevancy' | 'source' | 'fetched_at';
  url?: string;
  domain?: string | string[];
  domainurl?: string | string[];
  excludedomain?: string | string[];
  excludefield?: string | string[];
  prioritydomain?: 'top' | 'medium' | 'low';
  timezone?: string;
  full_content?: 0 | 1;
  image?: 0 | 1;
  video?: 0 | 1;
  removeduplicate?: 0 | 1;
  size?: number;
  page?: string;
}

export interface LatestNewsParams extends NewsDataBaseParams {
  timeframe?: string; // e.g., "6", "24", "15m", "90m"
  country?: string | string[];
  excludecountry?: string | string[];
  category?: string | string[];
  excludecategory?: string | string[];
  datatype?: string | string[];
  sentiment_score?: number;
  creator?: string | string[];
  tag?: string | string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  organization?: string | string[];
  region?: string | string[];
}

export interface CryptoNewsParams extends NewsDataBaseParams {
  coin?: string | string[];
  timeframe?: string;
  from_date?: string;
  to_date?: string;
  tag?: string | string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
}

export interface MarketNewsParams extends NewsDataBaseParams {
  timeframe?: string;
  from_date?: string;
  to_date?: string;
  country?: string | string[];
  excludecountry?: string | string[];
  symbol?: string | string[];
  organization?: string | string[];
  tag?: string | string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  datatype?: string | string[];
  sentiment_score?: number;
  creator?: string | string[];
}

export interface ArchiveNewsParams extends NewsDataBaseParams {
  from_date?: string;
  to_date?: string;
  country?: string | string[];
  excludecountry?: string | string[];
  category?: string | string[];
  excludecategory?: string | string[];
}

// ============================================================================
// Response Types
// ============================================================================

export interface NewsDataArticle {
  article_id: string;
  title: string;
  link: string;
  source_id: string;
  source_name: string;
  source_url: string;
  source_icon?: string;
  source_priority: number;
  keywords?: string[];
  creator?: string[];
  image_url?: string;
  video_url?: string;
  description?: string;
  pubDate: string;
  pubDateTZ?: string;
  content?: string;
  country?: string[];
  category?: string[];
  datatype?: string;
  fetched_at?: string;
  language: string;
  
  // AI-enhanced fields (paid plans)
  ai_tag?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  sentiment_stats?: {
    negative: number;
    neutral: number;
    positive: number;
  };
  ai_region?: string[];
  ai_org?: string[];
  ai_summary?: string;
  
  // Crypto-specific fields
  coin?: string[];
  
  // Market-specific fields
  symbol?: string[];
  
  // Metadata
  duplicate: boolean;
}

export interface NewsDataResponse {
  status: 'success' | 'error';
  totalResults?: number;
  results?: NewsDataArticle[];
  nextPage?: string;
  
  // Error fields
  code?: string;
  message?: string;
}

// ============================================================================
// Key State Management Types
// ============================================================================

interface KeyState {
  key: string;                    // Full API key
  keyId: string;                  // First 8 chars for logging
  isRateLimited: boolean;         // Currently rate-limited?
  rateLimitExpiry: Date | null;   // When rate limit expires
  totalRequests: number;          // Lifetime request count
  lastUsed: Date | null;          // Last request timestamp
}

// ============================================================================
// Error Types
// ============================================================================

export class NewsDataError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'NewsDataError';
  }
}

export class NewsDataRateLimitError extends NewsDataError {
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'NewsDataRateLimitError';
  }
}

export class NewsDataQuotaExceededError extends NewsDataError {
  constructor(message: string = 'Daily quota exceeded') {
    super(message, 'QUOTA_EXCEEDED', 429);
    this.name = 'NewsDataQuotaExceededError';
  }
}

export class NewsDataValidationError extends NewsDataError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'NewsDataValidationError';
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_NEWSDATA_CONFIG: Partial<NewsDataConfig> = {
  baseUrl: 'https://newsdata.io/api/1',
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second
  
  rateLimiting: {
    requestsPerWindow: 1800, // paid plan default
    windowSizeMs: 15 * 60 * 1000, // 15 minutes
    dailyQuota: 20000, // basic plan default
  },
  
  cache: {
    enabled: true,
    ttl: {
      latest: 900, // 15 minutes
      crypto: 600, // 10 minutes
      market: 600, // 10 minutes
      archive: 3600, // 1 hour (less frequent updates)
    },
    maxSize: 1000,
  },
  
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    resetTimeoutMs: 60000, // 1 minute
    halfOpenMaxCalls: 3,
  },
};

// ============================================================================
// NewsData.io Client Class
// ============================================================================

export class NewsDataClient {
  private config: NewsDataConfig;
  private observabilityLogger?: AdvancedObservabilityLogger;
  private newsDataLogger: NewsDataObservabilityLogger;
  private errorHandler: NewsDataErrorHandler;
  private usageTracker: NewsDataAgentUsageTracker;
  private cacheManager?: NewsDataCacheManager;
  // private rateLimiter?: NewsDataRateLimiter; // TODO: Implement rate limiting
  private circuitBreaker?: NewsDataCircuitBreaker;
  private fallbackManager?: NewsDataFallbackManager;
  private performanceMonitor?: NewsDataPerformanceMonitor;
  
  // Multi-key rotation properties
  private apiKeys: string[];
  private keyStates: Map<string, KeyState>;
  private currentKeyIndex: number;
  
  constructor(
    config: NewsDataConfig, 
    observabilityLogger?: AdvancedObservabilityLogger,
    cacheManager?: NewsDataCacheManager,
    _rateLimiter?: NewsDataRateLimiter, // TODO: Implement rate limiting
    circuitBreaker?: NewsDataCircuitBreaker,
    fallbackManager?: NewsDataFallbackManager,
    newsDataLogger?: NewsDataObservabilityLogger,
    errorHandler?: NewsDataErrorHandler,
    usageTracker?: NewsDataAgentUsageTracker,
    performanceMonitor?: NewsDataPerformanceMonitor
  ) {
    // Parse comma-separated API keys
    const apiKeyString = config.apiKey || '';
    this.apiKeys = apiKeyString
      .split(',')
      .map(key => key.trim())
      .filter(key => key.length > 0);
    
    // Validate that at least one valid key is provided
    if (this.apiKeys.length === 0) {
      throw new NewsDataValidationError('At least one API key must be provided');
    }
    
    // Initialize key state management
    this.keyStates = new Map();
    for (const key of this.apiKeys) {
      const keyId = this.getKeyId(key);
      this.keyStates.set(keyId, {
        key,
        keyId,
        isRateLimited: false,
        rateLimitExpiry: null,
        totalRequests: 0,
        lastUsed: null
      });
    }
    
    // Initialize current key index
    this.currentKeyIndex = 0;
    
    // Merge with defaults
    this.config = {
      ...DEFAULT_NEWSDATA_CONFIG,
      ...config,
      rateLimiting: {
        ...DEFAULT_NEWSDATA_CONFIG.rateLimiting!,
        ...config.rateLimiting,
      },
      cache: {
        ...DEFAULT_NEWSDATA_CONFIG.cache!,
        ...config.cache,
        ttl: {
          ...DEFAULT_NEWSDATA_CONFIG.cache!.ttl,
          ...config.cache.ttl,
        },
      },
      circuitBreaker: {
        ...DEFAULT_NEWSDATA_CONFIG.circuitBreaker!,
        ...config.circuitBreaker,
      },
    };
    
    this.observabilityLogger = observabilityLogger;
    this.newsDataLogger = newsDataLogger || getNewsDataObservabilityLogger();
    this.errorHandler = errorHandler || getNewsDataErrorHandler();
    this.usageTracker = usageTracker || getNewsDataAgentUsageTracker();
    this.cacheManager = cacheManager;
    // Rate limiter will be implemented in future iterations
    this.circuitBreaker = circuitBreaker;
    this.fallbackManager = fallbackManager;
    this.performanceMonitor = performanceMonitor;
    
    // Log client initialization
    console.log('[NewsDataClient] Initialized with configuration:', {
      baseUrl: this.config.baseUrl,
      apiKeyCount: this.apiKeys.length,
      isFreeTier: this.config.isFreeTier || false,
      rateLimiting: this.config.rateLimiting,
      cache: this.config.cache,
      circuitBreaker: this.config.circuitBreaker,
    });
    
    // Log free tier detection
    if (this.config.isFreeTier) {
      console.log('[NewsDataClient] Free tier detected, excluding size and timeframe parameters');
    }
  }
  
  /**
   * Get client configuration
   */
  getConfig(): NewsDataConfig {
    return { ...this.config };
  }
  
  /**
   * Get key identifier (first 8 characters) for logging
   */
  private getKeyId(key: string): string {
    return key.length >= 8 ? key.substring(0, 8) : key;
  }
  
  /**
   * Update client configuration
   */
  updateConfig(updates: Partial<NewsDataConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      rateLimiting: {
        ...this.config.rateLimiting,
        ...updates.rateLimiting,
      },
      cache: {
        ...this.config.cache,
        ...updates.cache,
        ttl: {
          ...this.config.cache.ttl,
          ...updates.cache?.ttl,
        },
      },
      circuitBreaker: {
        ...this.config.circuitBreaker,
        ...updates.circuitBreaker,
      },
    };
    
    console.log('[NewsDataClient] Configuration updated');
  }
  
  /**
   * Validate API key format
   */
  private validateApiKey(): void {
    if (!this.config.apiKey || typeof this.config.apiKey !== 'string') {
      throw new NewsDataValidationError('Invalid API key format');
    }
    
    // Basic format validation (NewsData.io API keys can contain alphanumeric and some special characters)
    if (!/^[a-zA-Z0-9_-]+$/.test(this.config.apiKey)) {
      throw new NewsDataValidationError('API key contains invalid characters');
    }
  }
  
  /**
   * Build base HTTP client configuration
   */
  private getHttpConfig() {
    return {
      timeout: this.config.timeout,
      headers: {
        'User-Agent': 'TradeWizard-NewsData-Client/1.0',
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };
  }
  
  /**
   * Build URL with parameters
   */
  private buildUrl(endpoint: string, params: Record<string, any>): string {
    const url = new URL(`${this.config.baseUrl}/${endpoint}`);
    
    // Add API key
    url.searchParams.set('apikey', this.config.apiKey);
    
    // Add other parameters, excluding size and timeframe for free tier
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        // Skip size and timeframe parameters for free tier
        if (this.config.isFreeTier && (key === 'size' || key === 'timeframe')) {
          return;
        }
        
        if (Array.isArray(value)) {
          url.searchParams.set(key, value.join(','));
        } else {
          url.searchParams.set(key, String(value));
        }
      }
    });
    
    return url.toString();
  }
  
  /**
   * Validate request parameters
   */
  private validateParams(params: any, endpoint: string): void {
    // Common validations
    if (params.size !== undefined && (params.size < 1 || params.size > 50)) {
      throw new NewsDataValidationError('Size parameter must be between 1 and 50');
    }
    
    if (params.q && params.q.length > 512) {
      throw new NewsDataValidationError('Query parameter cannot exceed 512 characters');
    }
    
    if (params.qInTitle && params.qInTitle.length > 512) {
      throw new NewsDataValidationError('qInTitle parameter cannot exceed 512 characters');
    }
    
    if (params.qInMeta && params.qInMeta.length > 512) {
      throw new NewsDataValidationError('qInMeta parameter cannot exceed 512 characters');
    }
    
    // Mutual exclusivity checks
    const queryParams = [params.q, params.qInTitle, params.qInMeta].filter(Boolean);
    if (queryParams.length > 1) {
      throw new NewsDataValidationError('Cannot use q, qInTitle, and qInMeta parameters simultaneously');
    }
    
    // Date format validation
    const dateRegex = /^\d{4}-\d{2}-\d{2}(\s\d{2}:\d{2}:\d{2})?$/;
    if (params.from_date && !dateRegex.test(params.from_date)) {
      throw new NewsDataValidationError('Invalid from_date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS');
    }
    
    if (params.to_date && !dateRegex.test(params.to_date)) {
      throw new NewsDataValidationError('Invalid to_date format. Use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS');
    }
    
    // Endpoint-specific validations
    if (endpoint === 'archive') {
      // Archive endpoint requires at least one specific parameter
      const requiredParams = ['q', 'qInTitle', 'qInMeta', 'domain', 'country', 'category', 'language', 'full_content', 'image', 'video', 'prioritydomain', 'domainurl'];
      const hasRequiredParam = requiredParams.some(param => params[param] !== undefined);
      
      if (!hasRequiredParam) {
        throw new NewsDataValidationError(`Archive endpoint requires at least one of: ${requiredParams.join(', ')}`);
      }
    }
  }
  
  /**
   * Test API connectivity and authentication
   */
  async testConnection(): Promise<boolean> {
    try {
      this.validateApiKey();
      
      // Make a minimal request to test connectivity
      const url = this.buildUrl('latest', { size: 1 });
      const response = await fetch(url, {
        ...this.getHttpConfig(),
        method: 'GET',
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new NewsDataError('Invalid API key', 'INVALID_API_KEY', 401);
        }
        throw new NewsDataError(`HTTP ${response.status}: ${response.statusText}`, 'HTTP_ERROR', response.status);
      }
      
      const data = await response.json() as any;
      
      if (data.status === 'error') {
        throw new NewsDataError(data.message || 'API error', data.code);
      }
      
      console.log('[NewsDataClient] Connection test successful');
      return true;
      
    } catch (error) {
      console.error('[NewsDataClient] Connection test failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // Core API Methods
  // ============================================================================

  /**
   * Make HTTP request with circuit breaker protection and fallback mechanisms
   */
  private async makeRequest(url: string, endpoint: string, agentName?: string): Promise<NewsDataResponse> {
    const startTime = Date.now();
    let success = false;
    let timeout = false;
    
    try {
      // Generate cache key for fallback purposes
      const cacheKey = this.cacheManager?.generateCacheKey(endpoint, this.extractParamsFromUrl(url)) || url;
      
      let result: NewsDataResponse;
      
      // If circuit breaker is available, use it with fallback
      if (this.circuitBreaker && this.fallbackManager) {
        const circuitResult = await this.circuitBreaker.execute(
          () => this.makeDirectRequest(url, endpoint, agentName),
          () => this.executeFallback(cacheKey)
        );
        
        if (circuitResult.success && circuitResult.data) {
          result = circuitResult.data;
          success = true;
        } else if (circuitResult.fromFallback && circuitResult.data) {
          result = circuitResult.data;
          success = true;
        } else {
          throw circuitResult.error || new Error('Request failed and no fallback available');
        }
      } else {
        // Fallback to direct request if circuit breaker not available
        result = await this.makeDirectRequest(url, endpoint, agentName);
        success = true;
      }
      
      // Record performance metrics
      const responseTime = Date.now() - startTime;
      this.performanceMonitor?.recordResponseTime(endpoint, responseTime, success, timeout);
      
      // Record throughput metrics
      if (result.results) {
        const responseSize = JSON.stringify(result).length;
        this.performanceMonitor?.recordThroughput(endpoint, responseSize, result.results.length);
      }
      
      return result;
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Check if it's a timeout error
      timeout = error instanceof Error && (
        error.message.includes('timeout') || 
        error.message.includes('ETIMEDOUT') ||
        error.name === 'TimeoutError'
      );
      
      // Record performance metrics for failed requests
      this.performanceMonitor?.recordResponseTime(endpoint, responseTime, success, timeout);
      
      throw error;
    }
  }
  
  /**
   * Execute fallback strategy when primary request fails
   */
  private async executeFallback(cacheKey: string): Promise<NewsDataResponse> {
    if (!this.fallbackManager) {
      throw new Error('No fallback manager available');
    }
    
    const fallbackResult = await this.fallbackManager.executeFallback(cacheKey);
    
    if (fallbackResult.success && fallbackResult.data) {
      return fallbackResult.data;
    }
    
    throw fallbackResult.error || new Error('Fallback failed');
  }
  
  /**
   * Extract parameters from URL for cache key generation
   */
  private extractParamsFromUrl(url: string): Record<string, any> {
    try {
      const urlObj = new URL(url);
      const params: Record<string, any> = {};
      
      urlObj.searchParams.forEach((value, key) => {
        if (key !== 'apikey') { // Exclude API key from cache key
          params[key] = value;
        }
      });
      
      return params;
    } catch {
      return {};
    }
  }

  /**
   * Make direct HTTP request with error handling and retries
   */
  private async makeDirectRequest(url: string, endpoint?: string, agentName?: string): Promise<NewsDataResponse> {
    const startTime = Date.now();
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    let lastError: Error | null = null;
    
    // Extract parameters for logging
    const params = this.extractParamsFromUrl(url);
    
    for (let attempt = 1; attempt <= (this.config.retryAttempts || 3); attempt++) {
      try {
        // Get current API key and update usage statistics
        const currentKey = this.apiKeys[this.currentKeyIndex];
        const currentKeyId = this.getKeyId(currentKey);
        const state = this.keyStates.get(currentKeyId)!;
        
        // Update usage statistics before each request
        state.totalRequests++;
        state.lastUsed = new Date();
        
        // Update URL with current key
        const urlWithKey = this.updateUrlApiKey(url, currentKey);
        
        console.log(`[NewsDataClient] Making request (attempt ${attempt}): ${urlWithKey.replace(/apikey=[^&]+/, 'apikey=***')}`);
        
        const response = await fetch(urlWithKey, {
          ...this.getHttpConfig(),
          method: 'GET',
        });
        
        const duration = Date.now() - startTime;
        
        // Handle rate limiting with rotation BEFORE other error handling
        if (response.status === 429 && this.isRateLimitError(response)) {
          const retryAfter = this.extractRetryAfter(response);
          
          // Prepare request context for logging
          const requestContext = {
            endpoint,
            agentName,
            params,
          };
          
          // Attempt rotation
          const nextKey = this.rotateApiKey(retryAfter, requestContext);
          
          if (nextKey === null) {
            // All keys exhausted - graceful degradation
            console.warn('[NewsDataClient] All API keys exhausted, returning empty result set');
            
            // Log graceful degradation
            this.newsDataLogger.logKeyRotation({
              timestamp: Date.now(),
              eventType: 'graceful_degradation',
              endpoint,
              agentName,
              parameters: params,
              message: 'Returning empty result set due to all keys exhausted',
            });
            
            return {
              status: 'success',
              totalResults: 0,
              results: []
            };
          }
          
          // Retry with new key (don't count as retry attempt)
          // Continue to next iteration of the loop
          continue;
        }
        
        // Handle HTTP errors
        if (!response.ok) {
          const errorText = await response.text();
          let errorData: any = {};
          
          try {
            errorData = JSON.parse(errorText);
          } catch {
            // If not JSON, use the text as message
            errorData = { message: errorText };
          }
          
          // Create error context for detailed logging
          const errorContext = {
            requestId,
            endpoint: endpoint as any,
            agentName,
            parameters: params,
            url: url.replace(/apikey=[^&]+/, 'apikey=***'),
            httpStatus: response.status,
            apiErrorCode: errorData.code,
            retryAttempt: attempt,
            maxRetries: this.config.retryAttempts || 3,
            fallbackUsed: false,
            performanceInfo: {
              responseTime: duration,
              requestStartTime: startTime,
            },
            additionalContext: {
              responseData: errorData,
              statusText: response.statusText,
            },
          };

          // Create appropriate error
          let error: Error;
          switch (response.status) {
            case 400:
              error = new NewsDataValidationError(errorData.message || 'Bad request - parameter missing or invalid');
              break;
            case 401:
              error = new NewsDataError('Unauthorized - invalid API key', 'INVALID_API_KEY', 401, errorData);
              break;
            case 403:
              error = new NewsDataError('Forbidden - CORS policy failed or IP/Domain restricted', 'FORBIDDEN', 403, errorData);
              break;
            case 409:
              error = new NewsDataValidationError('Parameter duplicate - duplicate parameter values detected');
              break;
            case 415:
              error = new NewsDataError('Unsupported type - request format not supported', 'UNSUPPORTED_TYPE', 415, errorData);
              break;
            case 422:
              error = new NewsDataValidationError('Unprocessable entity - semantic error in request');
              break;
            case 429:
              // This case should not be reached due to early rate limit handling above,
              // but kept for completeness
              error = new NewsDataRateLimitError(errorData.message || 'Too many requests - rate limit exceeded');
              // Handle rate limit specifically
              await this.errorHandler.handleRateLimitExceeded({
                requestsInWindow: 0, // TODO: Get from rate limiter
                windowSizeMs: 15 * 60 * 1000, // 15 minutes
                limitExceeded: true,
                retryAfter: this.extractRetryAfter(response) * 1000, // Convert seconds to milliseconds
              }, errorContext);
              break;
            case 500:
              error = new NewsDataError('Internal server error - temporary issue', 'SERVER_ERROR', 500, errorData);
              break;
            default:
              error = new NewsDataError(`HTTP ${response.status}: ${response.statusText}`, 'HTTP_ERROR', response.status, errorData);
          }

          // Handle error with comprehensive logging
          await this.errorHandler.handleApiError(error, errorContext);
          
          throw error;
        }
        
        // Parse response
        const data = await response.json() as NewsDataResponse;
        
        // Handle API-level errors
        if (data.status === 'error') {
          const errorContext = {
            requestId,
            endpoint: endpoint as any,
            agentName,
            parameters: params,
            url: url.replace(/apikey=[^&]+/, 'apikey=***'),
            httpStatus: response.status,
            apiErrorCode: data.code,
            retryAttempt: attempt,
            maxRetries: this.config.retryAttempts || 3,
            fallbackUsed: false,
            performanceInfo: {
              responseTime: duration,
              requestStartTime: startTime,
            },
            additionalContext: {
              responseData: data,
            },
          };

          const error = new NewsDataError(data.message || 'API error', data.code, response.status, data);
          await this.errorHandler.handleApiError(error, errorContext);
          throw error;
        }
        
        // Log successful request
        this.newsDataLogger.logNewsRequest({
          timestamp: Date.now(),
          requestId,
          endpoint: endpoint as any || 'unknown',
          agentName,
          parameters: params,
          success: true,
          responseTime: duration,
          itemCount: data.results?.length || 0,
          cached: false,
          stale: false,
          freshness: 0,
          quotaUsed: 1, // Assume 1 credit per request
        });

        // Track agent usage
        if (agentName) {
          this.usageTracker.trackRequest(agentName, endpoint as any || 'latest', params, {
            success: true,
            responseTime: duration,
            itemCount: data.results?.length || 0,
            quotaUsed: 1,
            cached: false,
            stale: false,
          });
        }
        
        // Also log to legacy observability logger if available
        this.observabilityLogger?.logDataFetch({
          timestamp: Date.now(),
          source: 'news',
          provider: 'newsdata.io',
          success: true,
          cached: false,
          stale: false,
          freshness: 0,
          itemCount: data.results?.length || 0,
          duration,
        });
        
        console.log(`[NewsDataClient] Request successful: ${data.results?.length || 0} articles in ${duration}ms`);
        return data;
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on validation errors or auth errors
        if (error instanceof NewsDataValidationError || 
            (error instanceof NewsDataError && error.statusCode === 401)) {
          break;
        }
        
        // Don't retry on rate limit errors (should be handled by rate limiter)
        if (error instanceof NewsDataRateLimitError) {
          break;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < (this.config.retryAttempts || 3)) {
          const delay = (this.config.retryDelay || 1000) * Math.pow(2, attempt - 1);
          console.log(`[NewsDataClient] Request failed, retrying in ${delay}ms:`, (error as Error).message);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Log failed request
    const duration = Date.now() - startTime;
    this.newsDataLogger.logNewsRequest({
      timestamp: Date.now(),
      requestId,
      endpoint: endpoint as any || 'unknown',
      agentName,
      parameters: params,
      success: false,
      responseTime: duration,
      itemCount: 0,
      cached: false,
      stale: false,
      freshness: 0,
      error: (lastError as Error)?.message || 'Unknown error',
      errorCode: lastError instanceof NewsDataError ? lastError.code : 'UNKNOWN_ERROR',
      quotaUsed: 0,
    });

    // Track agent usage for failed request
    if (agentName) {
      this.usageTracker.trackRequest(agentName, endpoint as any || 'latest', params, {
        success: false,
        responseTime: duration,
        itemCount: 0,
        quotaUsed: 0,
        cached: false,
        stale: false,
        error: (lastError as Error)?.message || 'Unknown error',
      });
    }
    
    // Also log to legacy observability logger if available
    this.observabilityLogger?.logDataFetch({
      timestamp: Date.now(),
      source: 'news',
      provider: 'newsdata.io',
      success: false,
      cached: false,
      stale: false,
      freshness: 0,
      itemCount: 0,
      error: (lastError as Error)?.message || 'Unknown error',
      duration,
    });
    
    throw lastError || new NewsDataError('Request failed after all retry attempts');
  }

  /**
   * Update URL with a specific API key
   * @param url - Original URL string
   * @param apiKey - API key to inject
   * @returns Updated URL string with new API key
   */
  private updateUrlApiKey(url: string, apiKey: string): string {
    const urlObj = new URL(url);
    urlObj.searchParams.set('apikey', apiKey);
    return urlObj.toString();
  }

  /**
   * Check if response indicates a rate limit error (vs quota exceeded)
   * @param response - HTTP response object
   * @returns true if this is a rate limit error (temporary), false otherwise
   */
  private isRateLimitError(response: Response): boolean {
    // Only 429 status codes can be rate limits
    if (response.status !== 429) {
      return false;
    }
    
    // All 429 responses are treated as rate limits by default
    // The distinction between rate limit (temporary) and quota exceeded (daily limit)
    // would require parsing the response body, but since the body may already be consumed,
    // we treat all 429s as rate limits to trigger rotation
    return true;
  }

  /**
   * Extract retry-after value from response header
   * @param response - HTTP response object
   * @returns Retry-after duration in seconds, defaults to 900 (15 minutes) if not present
   */
  private extractRetryAfter(response: Response): number {
    const retryAfter = response.headers.get('retry-after');
    
    if (retryAfter) {
      // Try parsing as integer (seconds)
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds;
      }
      
      // Try parsing as HTTP date format
      try {
        const retryDate = new Date(retryAfter);
        if (!isNaN(retryDate.getTime())) {
          const now = new Date();
          const diffSeconds = Math.max(0, Math.floor((retryDate.getTime() - now.getTime()) / 1000));
          return diffSeconds;
        }
      } catch {
        // Ignore parsing errors
      }
    }
    
    // Default to 15 minutes (900 seconds) if header missing or unparseable
    return 900;
  }

  /**
   * Rotate to next available API key when rate limit is detected
   * @param retryAfterSeconds - How long current key should be marked unavailable
   * @param requestContext - Optional request context for logging
   * @returns Next available API key, or null if all keys exhausted
   */
  private rotateApiKey(retryAfterSeconds: number, requestContext?: {
    endpoint?: string;
    agentName?: string;
    params?: Record<string, any>;
  }): string | null {
    const currentKey = this.apiKeys[this.currentKeyIndex];
    const currentKeyId = this.getKeyId(currentKey);
    
    // Mark current key as rate-limited
    const expiryTime = new Date(Date.now() + retryAfterSeconds * 1000);
    const state = this.keyStates.get(currentKeyId)!;
    state.isRateLimited = true;
    state.rateLimitExpiry = expiryTime;
    
    // Log rate limit detection with context (only if multiple keys configured)
    if (this.apiKeys.length > 1) {
      const contextInfo = requestContext ? {
        endpoint: requestContext.endpoint,
        agentName: requestContext.agentName,
        parameters: requestContext.params,
      } : {};
      
      console.warn(
        `[NewsDataClient] Rate limit detected for key ${currentKeyId}, ` +
        `marked unavailable until ${expiryTime.toISOString()}`,
        contextInfo
      );
      
      // Log to observability system
      this.newsDataLogger.logKeyRotation({
        timestamp: Date.now(),
        eventType: 'rate_limit_detected',
        keyId: currentKeyId,
        expiryTime: expiryTime.toISOString(),
        retryAfterSeconds,
        ...contextInfo,
      });
    }
    
    // Find next available key
    const availableKeys = this.getAvailableKeys();
    
    if (availableKeys.length === 0) {
      // All keys exhausted
      const earliestExpiry = Array.from(this.keyStates.values())
        .filter(s => s.rateLimitExpiry)
        .map(s => s.rateLimitExpiry!)
        .sort((a, b) => a.getTime() - b.getTime())[0];
      
      const contextInfo = requestContext ? {
        endpoint: requestContext.endpoint,
        agentName: requestContext.agentName,
        parameters: requestContext.params,
      } : {};
      
      console.error(
        `[NewsDataClient] All API keys exhausted. Next available: ${earliestExpiry.toISOString()}`,
        contextInfo
      );
      
      // Log to observability system
      this.newsDataLogger.logKeyRotation({
        timestamp: Date.now(),
        eventType: 'all_keys_exhausted',
        earliestExpiry: earliestExpiry.toISOString(),
        totalKeys: this.apiKeys.length,
        ...contextInfo,
      });
      
      return null;
    }
    
    // Select least recently used key
    const nextKeyId = availableKeys[0];
    const nextKey = this.keyStates.get(nextKeyId)!.key;
    
    // Update index
    this.currentKeyIndex = this.apiKeys.indexOf(nextKey);
    
    // Log rotation (only if multiple keys)
    if (this.apiKeys.length > 1) {
      const contextInfo = requestContext ? {
        endpoint: requestContext.endpoint,
        agentName: requestContext.agentName,
        parameters: requestContext.params,
      } : {};
      
      console.info(
        `[NewsDataClient] Rotated API key: ${currentKeyId} -> ${nextKeyId}`,
        contextInfo
      );
      
      // Log to observability system
      this.newsDataLogger.logKeyRotation({
        timestamp: Date.now(),
        eventType: 'key_rotated',
        oldKeyId: currentKeyId,
        newKeyId: nextKeyId,
        reason: 'rate_limit',
        ...contextInfo,
      });
    }
    
    return nextKey;
  }

  /**
   * Get list of available key IDs, sorted by least recently used
   * Auto-expires rate-limited keys whose expiry time has passed
   * @returns Array of available key IDs
   */
  private getAvailableKeys(): string[] {
    const now = new Date();
    const available: string[] = [];
    
    for (const [keyId, state] of this.keyStates.entries()) {
      // Auto-expire if time has passed
      if (state.isRateLimited && state.rateLimitExpiry) {
        if (now >= state.rateLimitExpiry) {
          state.isRateLimited = false;
          state.rateLimitExpiry = null;
          
          // Log key availability (only if multiple keys configured)
          if (this.apiKeys.length > 1) {
            console.info(`[NewsDataClient] Key ${keyId} rate limit expired, now available`);
            
            // Log to observability system
            this.newsDataLogger.logKeyRotation({
              timestamp: Date.now(),
              eventType: 'key_available',
              keyId,
              message: 'Rate limit expired, key now available',
            });
          }
        }
      }
      
      if (!state.isRateLimited) {
        available.push(keyId);
      }
    }
    
    // Sort by last used (null sorts first, then oldest first)
    available.sort((a, b) => {
      const aTime = this.keyStates.get(a)!.lastUsed?.getTime() ?? 0;
      const bTime = this.keyStates.get(b)!.lastUsed?.getTime() ?? 0;
      return aTime - bTime;
    });
    
    return available;
  }

  /**
   * Fetch latest news
   */
  async fetchLatestNews(params: LatestNewsParams = {}, agentName?: string): Promise<NewsDataResponse> {
    this.validateApiKey();
    this.validateParams(params, 'latest');
    
    const url = this.buildUrl('latest', params);
    return await this.makeRequest(url, 'latest', agentName);
  }

  /**
   * Fetch crypto news
   */
  async fetchCryptoNews(params: CryptoNewsParams = {}, agentName?: string): Promise<NewsDataResponse> {
    this.validateApiKey();
    this.validateParams(params, 'crypto');
    
    const url = this.buildUrl('crypto', params);
    return await this.makeRequest(url, 'crypto', agentName);
  }

  /**
   * Fetch market news
   */
  async fetchMarketNews(params: MarketNewsParams = {}, agentName?: string): Promise<NewsDataResponse> {
    this.validateApiKey();
    this.validateParams(params, 'market');
    
    const url = this.buildUrl('market', params);
    return await this.makeRequest(url, 'market', agentName);
  }

  /**
   * Fetch archive news
   */
  async fetchArchiveNews(params: ArchiveNewsParams, agentName?: string): Promise<NewsDataResponse> {
    this.validateApiKey();
    this.validateParams(params, 'archive');
    
    const url = this.buildUrl('archive', params);
    return await this.makeRequest(url, 'archive', agentName);
  }

  /**
   * Fetch news sources
   */
  async fetchNewsSources(params: { language?: string | string[] } = {}, agentName?: string): Promise<NewsDataResponse> {
    this.validateApiKey();
    
    const url = this.buildUrl('sources', params);
    return await this.makeRequest(url, 'sources', agentName);
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  /**
   * Search for news articles with a simple query
   */
  async searchNews(query: string, options: {
    endpoint?: 'latest' | 'crypto' | 'market' | 'archive';
    limit?: number;
    language?: string;
    country?: string;
    category?: string;
    timeframe?: string;
    from_date?: string;
    to_date?: string;
  } = {}): Promise<NewsDataArticle[]> {
    const {
      endpoint = 'latest',
      limit = 10,
      language,
      country,
      category,
      timeframe,
      from_date,
      to_date,
    } = options;

    const baseParams = {
      q: query,
      size: Math.min(limit, 50),
      language,
      country,
      category,
      timeframe,
      from_date,
      to_date,
    };

    let response: NewsDataResponse;

    switch (endpoint) {
      case 'latest':
        response = await this.fetchLatestNews(baseParams);
        break;
      case 'crypto':
        response = await this.fetchCryptoNews(baseParams);
        break;
      case 'market':
        response = await this.fetchMarketNews(baseParams);
        break;
      case 'archive':
        response = await this.fetchArchiveNews(baseParams);
        break;
      default:
        throw new NewsDataValidationError(`Invalid endpoint: ${endpoint}`);
    }

    return response.results || [];
  }

  /**
   * Get news for specific cryptocurrency
   */
  async getCryptoNews(coin: string | string[], options: {
    limit?: number;
    timeframe?: string;
    language?: string;
  } = {}): Promise<NewsDataArticle[]> {
    const { limit = 20, timeframe, language } = options;

    const response = await this.fetchCryptoNews({
      coin,
      size: Math.min(limit, 50),
      timeframe,
      language,
    });

    return response.results || [];
  }

  /**
   * Get market news for specific stock symbols
   */
  async getMarketNews(symbol: string | string[], options: {
    limit?: number;
    timeframe?: string;
    sentiment?: 'positive' | 'negative' | 'neutral';
    language?: string;
  } = {}): Promise<NewsDataArticle[]> {
    const { limit = 20, timeframe, sentiment, language } = options;

    const response = await this.fetchMarketNews({
      symbol,
      size: Math.min(limit, 50),
      timeframe,
      sentiment,
      language,
    });

    return response.results || [];
  }

  /**
   * Get news by category
   */
  async getNewsByCategory(category: string | string[], options: {
    limit?: number;
    country?: string;
    language?: string;
    timeframe?: string;
  } = {}): Promise<NewsDataArticle[]> {
    const { limit = 20, country, language, timeframe } = options;

    const response = await this.fetchLatestNews({
      category,
      size: Math.min(limit, 50),
      country,
      language,
      timeframe,
    });

    return response.results || [];
  }

  /**
   * Get breaking news (latest with high priority domains)
   */
  async getBreakingNews(options: {
    limit?: number;
    country?: string;
    language?: string;
    category?: string;
  } = {}): Promise<NewsDataArticle[]> {
    const { limit = 10, country, language, category } = options;

    const response = await this.fetchLatestNews({
      size: Math.min(limit, 50),
      country,
      language,
      category,
      prioritydomain: 'top',
      timeframe: '2', // Last 2 hours for breaking news
    });

    return response.results || [];
  }

  /**
   * Get performance metrics snapshot
   */
  async getPerformanceSnapshot() {
    if (!this.performanceMonitor) {
      throw new Error('Performance monitor not available');
    }
    return await this.performanceMonitor.getPerformanceSnapshot();
  }

  /**
   * Get performance report
   */
  async getPerformanceReport() {
    if (!this.performanceMonitor) {
      throw new Error('Performance monitor not available');
    }
    return await this.performanceMonitor.getPerformanceReport();
  }

  /**
   * Add performance alert callback
   */
  onPerformanceAlert(callback: (alert: any) => void) {
    if (!this.performanceMonitor) {
      throw new Error('Performance monitor not available');
    }
    this.performanceMonitor.onAlert(callback);
  }

  /**
   * Reset performance metrics
   */
  resetPerformanceMetrics() {
    if (!this.performanceMonitor) {
      throw new Error('Performance monitor not available');
    }
    this.performanceMonitor.reset();
  }
}

/**
 * Create a NewsData.io client instance
 */
export function createNewsDataClient(
  config: NewsDataConfig,
  observabilityLogger?: AdvancedObservabilityLogger,
  cacheManager?: NewsDataCacheManager,
  rateLimiter?: NewsDataRateLimiter,
  circuitBreaker?: NewsDataCircuitBreaker,
  fallbackManager?: NewsDataFallbackManager,
  newsDataLogger?: NewsDataObservabilityLogger,
  errorHandler?: NewsDataErrorHandler,
  usageTracker?: NewsDataAgentUsageTracker
): NewsDataClient {
  return new NewsDataClient(config, observabilityLogger, cacheManager, rateLimiter, circuitBreaker, fallbackManager, newsDataLogger, errorHandler, usageTracker);
}

/**
 * Create NewsData.io configuration from environment variables
 */
export function createNewsDataConfigFromEnv(): Partial<NewsDataConfig> {
  const apiKey = process.env.NEWSDATA_API_KEY;
  
  if (!apiKey) {
    throw new NewsDataValidationError('NEWSDATA_API_KEY environment variable is required');
  }
  
  return {
    apiKey,
    rateLimiting: {
      requestsPerWindow: parseInt(process.env.NEWSDATA_RATE_LIMIT_REQUESTS || '1800'),
      windowSizeMs: parseInt(process.env.NEWSDATA_RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      dailyQuota: parseInt(process.env.NEWSDATA_DAILY_QUOTA || '20000'),
    },
    cache: {
      enabled: process.env.NEWSDATA_CACHE_ENABLED !== 'false',
      ttl: {
        latest: parseInt(process.env.NEWSDATA_CACHE_TTL_LATEST || '900'),
        crypto: parseInt(process.env.NEWSDATA_CACHE_TTL_CRYPTO || '600'),
        market: parseInt(process.env.NEWSDATA_CACHE_TTL_MARKET || '600'),
        archive: parseInt(process.env.NEWSDATA_CACHE_TTL_ARCHIVE || '3600'),
      },
    },
    circuitBreaker: {
      enabled: process.env.NEWSDATA_CIRCUIT_BREAKER_ENABLED !== 'false',
      failureThreshold: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_THRESHOLD || '5'),
      resetTimeoutMs: parseInt(process.env.NEWSDATA_CIRCUIT_BREAKER_TIMEOUT || '60000'),
    },
  };
}