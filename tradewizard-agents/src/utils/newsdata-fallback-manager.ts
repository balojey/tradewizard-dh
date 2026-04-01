/**
 * NewsData.io Fallback Manager
 * 
 * Manages fallback mechanisms for circuit breaker scenarios, including
 * cached data retrieval, stale data handling, and gradual service re-enabling.
 * 
 * Features:
 * - Cached data fallback when circuit is open
 * - Stale data retrieval with configurable staleness tolerance
 * - Gradual service re-enabling during recovery
 * - Fallback priority management
 * - Health monitoring and recovery tracking
 * 
 * Requirements: 6.3, 6.4
 */

import type { NewsDataCacheManager } from './newsdata-cache-manager.js';
import type { NewsDataCircuitBreaker, CircuitBreakerState } from './newsdata-circuit-breaker.js';
import type { NewsDataResponse, NewsDataArticle } from './newsdata-client.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';
import { getLogger } from './logger.js';

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface FallbackConfig {
  enableCachedFallback: boolean;
  enableStaleFallback: boolean;
  maxStalenessMs: number; // Maximum age for stale data
  fallbackPriority: FallbackStrategy[];
  gracefulDegradation: {
    enabled: boolean;
    minArticleCount: number; // Minimum articles to return
    maxStalenessForGraceful: number; // Max staleness for graceful degradation
  };
  recovery: {
    enableGradualRecovery: boolean;
    recoverySteps: number; // Number of steps for gradual recovery
    stepDurationMs: number; // Duration of each recovery step
    successRateThreshold: number; // Success rate needed to proceed to next step
  };
}

export enum FallbackStrategy {
  FRESH_CACHE = 'fresh_cache',
  STALE_CACHE = 'stale_cache',
  PARTIAL_RESULTS = 'partial_results',
  EMPTY_RESULTS = 'empty_results',
  ERROR = 'error'
}

export interface FallbackResult<T> {
  success: boolean;
  data?: T;
  strategy: FallbackStrategy;
  staleness?: number; // Age of data in milliseconds
  articleCount?: number;
  error?: Error;
  metadata: {
    cacheHit: boolean;
    dataAge: number;
    fallbackReason: string;
    recoveryStep?: number;
  };
}

export interface RecoveryState {
  enabled: boolean;
  currentStep: number;
  totalSteps: number;
  stepStartTime: number;
  stepSuccesses: number;
  stepAttempts: number;
  overallSuccessRate: number;
}

// ============================================================================
// Fallback Manager Implementation
// ============================================================================

export class NewsDataFallbackManager {
  private recoveryState: RecoveryState = {
    enabled: false,
    currentStep: 0,
    totalSteps: 0,
    stepStartTime: 0,
    stepSuccesses: 0,
    stepAttempts: 0,
    overallSuccessRate: 0,
  };
  
  private logger;
  
  constructor(
    private config: FallbackConfig,
    private cacheManager: NewsDataCacheManager,
    private circuitBreaker: NewsDataCircuitBreaker,
    private observabilityLogger?: AdvancedObservabilityLogger
  ) {
    this.logger = getLogger();
    
    this.logger.info('[NewsDataFallbackManager] Initialized with config:', {
      enableCachedFallback: config.enableCachedFallback,
      enableStaleFallback: config.enableStaleFallback,
      maxStalenessMs: config.maxStalenessMs,
      fallbackPriority: config.fallbackPriority,
      gracefulDegradation: config.gracefulDegradation,
      recovery: config.recovery,
    });
  }
  
  /**
   * Execute fallback strategy based on circuit breaker state and configuration
   */
  async executeFallback(
    cacheKey: string,
    originalError?: Error
  ): Promise<FallbackResult<NewsDataResponse>> {
    const startTime = Date.now();
    const circuitState = this.circuitBreaker.getState();
    
    this.logger.debug(`[NewsDataFallbackManager] Executing fallback for key: ${cacheKey}, circuit state: ${circuitState}`);
    
    // Try each fallback strategy in priority order
    for (const strategy of this.config.fallbackPriority) {
      try {
        const result = await this.tryFallbackStrategy(strategy, cacheKey, originalError);
        
        if (result.success) {
          // Log successful fallback
          this.observabilityLogger?.logDataFetch({
            timestamp: Date.now(),
            source: 'news',
            provider: 'newsdata.io',
            success: true,
            cached: result.metadata.cacheHit,
            stale: result.staleness ? result.staleness > 0 : false,
            freshness: result.metadata.dataAge,
            itemCount: result.articleCount || 0,
            duration: Date.now() - startTime,
          });
          
          this.logger.info(`[NewsDataFallbackManager] Fallback successful using strategy: ${strategy}`);
          return result;
        }
        
      } catch (error) {
        this.logger.warn(`[NewsDataFallbackManager] Fallback strategy ${strategy} failed:`, error);
        continue;
      }
    }
    
    // All fallback strategies failed
    const errorResult: FallbackResult<NewsDataResponse> = {
      success: false,
      strategy: FallbackStrategy.ERROR,
      error: originalError || new Error('All fallback strategies failed'),
      metadata: {
        cacheHit: false,
        dataAge: 0,
        fallbackReason: 'All strategies exhausted',
      },
    };
    
    this.observabilityLogger?.logDataFetch({
      timestamp: Date.now(),
      source: 'news',
      provider: 'newsdata.io',
      success: false,
      cached: false,
      stale: false,
      freshness: 0,
      itemCount: 0,
      error: errorResult.error?.message || 'Fallback failed',
      duration: Date.now() - startTime,
    });
    
    return errorResult;
  }
  
  /**
   * Try a specific fallback strategy
   */
  private async tryFallbackStrategy(
    strategy: FallbackStrategy,
    cacheKey: string,
    originalError?: Error
  ): Promise<FallbackResult<NewsDataResponse>> {
    const now = Date.now();
    
    switch (strategy) {
      case FallbackStrategy.FRESH_CACHE:
        return await this.tryFreshCache(cacheKey);
        
      case FallbackStrategy.STALE_CACHE:
        return await this.tryStaleCache(cacheKey);
        
      case FallbackStrategy.PARTIAL_RESULTS:
        return await this.tryPartialResults(cacheKey);
        
      case FallbackStrategy.EMPTY_RESULTS:
        return this.returnEmptyResults();
        
      case FallbackStrategy.ERROR:
        throw originalError || new Error('Fallback strategy is to return error');
        
      default:
        throw new Error(`Unknown fallback strategy: ${strategy}`);
    }
  }
  
  /**
   * Try to get fresh cached data
   */
  private async tryFreshCache(cacheKey: string): Promise<FallbackResult<NewsDataResponse>> {
    if (!this.config.enableCachedFallback) {
      throw new Error('Cached fallback is disabled');
    }
    
    const cached = await this.cacheManager.get<NewsDataResponse>(cacheKey);
    
    if (!cached || cached.isStale) {
      throw new Error('No fresh cached data available');
    }
    
    return {
      success: true,
      data: cached.data,
      strategy: FallbackStrategy.FRESH_CACHE,
      staleness: 0,
      articleCount: cached.data.results?.length || 0,
      metadata: {
        cacheHit: true,
        dataAge: Date.now() - cached.timestamp,
        fallbackReason: 'Fresh cache hit',
      },
    };
  }
  
  /**
   * Try to get stale cached data
   */
  private async tryStaleCache(cacheKey: string): Promise<FallbackResult<NewsDataResponse>> {
    if (!this.config.enableStaleFallback) {
      throw new Error('Stale fallback is disabled');
    }
    
    const cached = await this.cacheManager.get<NewsDataResponse>(cacheKey);
    
    if (!cached) {
      throw new Error('No cached data available');
    }
    
    const staleness = Date.now() - (cached.timestamp + cached.ttl);
    
    if (staleness > this.config.maxStalenessMs) {
      throw new Error(`Data too stale: ${staleness}ms > ${this.config.maxStalenessMs}ms`);
    }
    
    return {
      success: true,
      data: cached.data,
      strategy: FallbackStrategy.STALE_CACHE,
      staleness,
      articleCount: cached.data.results?.length || 0,
      metadata: {
        cacheHit: true,
        dataAge: Date.now() - cached.timestamp,
        fallbackReason: 'Stale cache hit',
      },
    };
  }
  
  /**
   * Try to return partial results from multiple cache keys
   */
  private async tryPartialResults(cacheKey: string): Promise<FallbackResult<NewsDataResponse>> {
    if (!this.config.gracefulDegradation.enabled) {
      throw new Error('Graceful degradation is disabled');
    }
    
    // Try to find related cache keys (same endpoint, different parameters)
    const relatedKeys = await this.findRelatedCacheKeys(cacheKey);
    const articles: NewsDataArticle[] = [];
    let oldestDataAge = 0;
    let cacheHit = false;
    
    for (const key of relatedKeys) {
      try {
        const cached = await this.cacheManager.get<NewsDataResponse>(key);
        
        if (cached && cached.data.results) {
          const dataAge = Date.now() - cached.timestamp;
          const staleness = cached.isStale ? dataAge - cached.ttl : 0;
          
          // Check if data is acceptable for graceful degradation
          if (staleness <= this.config.gracefulDegradation.maxStalenessForGraceful) {
            articles.push(...cached.data.results);
            oldestDataAge = Math.max(oldestDataAge, dataAge);
            cacheHit = true;
          }
        }
      } catch (error) {
        // Continue with other keys
        continue;
      }
    }
    
    // Check if we have enough articles
    if (articles.length < this.config.gracefulDegradation.minArticleCount) {
      throw new Error(`Insufficient articles for partial results: ${articles.length} < ${this.config.gracefulDegradation.minArticleCount}`);
    }
    
    // Remove duplicates and limit results
    const uniqueArticles = this.deduplicateArticles(articles);
    
    const response: NewsDataResponse = {
      status: 'success',
      totalResults: uniqueArticles.length,
      results: uniqueArticles,
    };
    
    return {
      success: true,
      data: response,
      strategy: FallbackStrategy.PARTIAL_RESULTS,
      staleness: oldestDataAge,
      articleCount: uniqueArticles.length,
      metadata: {
        cacheHit,
        dataAge: oldestDataAge,
        fallbackReason: 'Partial results from multiple cache entries',
      },
    };
  }
  
  /**
   * Return empty results as last resort
   */
  private returnEmptyResults(): FallbackResult<NewsDataResponse> {
    const response: NewsDataResponse = {
      status: 'success',
      totalResults: 0,
      results: [],
    };
    
    return {
      success: true,
      data: response,
      strategy: FallbackStrategy.EMPTY_RESULTS,
      articleCount: 0,
      metadata: {
        cacheHit: false,
        dataAge: 0,
        fallbackReason: 'Empty results fallback',
      },
    };
  }
  
  /**
   * Find related cache keys for partial results
   */
  private async findRelatedCacheKeys(cacheKey: string): Promise<string[]> {
    // Extract endpoint from cache key
    const parts = cacheKey.split(':');
    if (parts.length < 2) {
      return [];
    }
    
    const endpoint = parts[1]; // newsdata:latest:params or newsdata:crypto:params
    
    // For now, return the original key - in a real implementation,
    // we would query the cache for keys with the same endpoint
    return [cacheKey];
  }
  
  /**
   * Remove duplicate articles based on article_id
   */
  private deduplicateArticles(articles: NewsDataArticle[]): NewsDataArticle[] {
    const seen = new Set<string>();
    const unique: NewsDataArticle[] = [];
    
    for (const article of articles) {
      if (!seen.has(article.article_id)) {
        seen.add(article.article_id);
        unique.push(article);
      }
    }
    
    return unique;
  }
  
  /**
   * Start gradual recovery process
   */
  startGradualRecovery(): void {
    if (!this.config.recovery.enableGradualRecovery) {
      this.logger.warn('[NewsDataFallbackManager] Gradual recovery is disabled');
      return;
    }
    
    this.recoveryState = {
      enabled: true,
      currentStep: 1,
      totalSteps: this.config.recovery.recoverySteps,
      stepStartTime: Date.now(),
      stepSuccesses: 0,
      stepAttempts: 0,
      overallSuccessRate: 0,
    };
    
    this.logger.info('[NewsDataFallbackManager] Started gradual recovery process');
  }
  
  /**
   * Stop gradual recovery process
   */
  stopGradualRecovery(): void {
    this.recoveryState.enabled = false;
    
    this.logger.info('[NewsDataFallbackManager] Stopped gradual recovery process');
  }
  
  /**
   * Record recovery attempt result
   */
  recordRecoveryAttempt(success: boolean): void {
    if (!this.recoveryState.enabled) {
      return;
    }
    
    this.recoveryState.stepAttempts++;
    
    if (success) {
      this.recoveryState.stepSuccesses++;
    }
    
    // Calculate success rate for current step
    const stepSuccessRate = this.recoveryState.stepSuccesses / this.recoveryState.stepAttempts;
    
    // Check if step duration has passed
    const stepDuration = Date.now() - this.recoveryState.stepStartTime;
    
    if (stepDuration >= this.config.recovery.stepDurationMs) {
      this.evaluateRecoveryStep(stepSuccessRate);
    }
  }
  
  /**
   * Evaluate current recovery step and potentially advance
   */
  private evaluateRecoveryStep(stepSuccessRate: number): void {
    const { successRateThreshold } = this.config.recovery;
    
    if (stepSuccessRate >= successRateThreshold) {
      // Step successful, advance to next step
      if (this.recoveryState.currentStep < this.recoveryState.totalSteps) {
        this.recoveryState.currentStep++;
        this.recoveryState.stepStartTime = Date.now();
        this.recoveryState.stepSuccesses = 0;
        this.recoveryState.stepAttempts = 0;
        
        this.logger.info(`[NewsDataFallbackManager] Advanced to recovery step ${this.recoveryState.currentStep}/${this.recoveryState.totalSteps}`);
      } else {
        // Recovery complete
        this.stopGradualRecovery();
        this.logger.info('[NewsDataFallbackManager] Gradual recovery completed successfully');
      }
    } else {
      // Step failed, restart from step 1
      this.recoveryState.currentStep = 1;
      this.recoveryState.stepStartTime = Date.now();
      this.recoveryState.stepSuccesses = 0;
      this.recoveryState.stepAttempts = 0;
      
      this.logger.warn(`[NewsDataFallbackManager] Recovery step failed (${(stepSuccessRate * 100).toFixed(1)}% < ${(successRateThreshold * 100).toFixed(1)}%), restarting from step 1`);
    }
  }
  
  /**
   * Check if service should be allowed based on recovery state
   */
  shouldAllowServiceCall(): boolean {
    if (!this.recoveryState.enabled) {
      return true; // No recovery in progress, allow all calls
    }
    
    // During recovery, allow calls based on current step
    // Step 1: 10% of calls, Step 2: 20%, etc.
    const allowancePercentage = (this.recoveryState.currentStep / this.recoveryState.totalSteps) * 100;
    const randomPercentage = Math.random() * 100;
    
    return randomPercentage <= allowancePercentage;
  }
  
  /**
   * Get current recovery state
   */
  getRecoveryState(): RecoveryState {
    return { ...this.recoveryState };
  }
  
  /**
   * Get fallback statistics
   */
  getFallbackStats(): {
    totalFallbacks: number;
    fallbacksByStrategy: Record<FallbackStrategy, number>;
    averageFallbackLatency: number;
    recoveryState: RecoveryState;
  } {
    // This would be implemented with proper metrics collection
    // For now, return basic structure
    return {
      totalFallbacks: 0,
      fallbacksByStrategy: {
        [FallbackStrategy.FRESH_CACHE]: 0,
        [FallbackStrategy.STALE_CACHE]: 0,
        [FallbackStrategy.PARTIAL_RESULTS]: 0,
        [FallbackStrategy.EMPTY_RESULTS]: 0,
        [FallbackStrategy.ERROR]: 0,
      },
      averageFallbackLatency: 0,
      recoveryState: this.recoveryState,
    };
  }
  
  /**
   * Update fallback configuration
   */
  updateConfig(updates: Partial<FallbackConfig>): void {
    this.config = { ...this.config, ...updates };
    
    this.logger.info('[NewsDataFallbackManager] Configuration updated:', updates);
  }
  
  /**
   * Get current configuration
   */
  getConfig(): FallbackConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enableCachedFallback: true,
  enableStaleFallback: true,
  maxStalenessMs: 60 * 60 * 1000, // 1 hour
  fallbackPriority: [
    FallbackStrategy.FRESH_CACHE,
    FallbackStrategy.STALE_CACHE,
    FallbackStrategy.PARTIAL_RESULTS,
    FallbackStrategy.EMPTY_RESULTS,
  ],
  gracefulDegradation: {
    enabled: true,
    minArticleCount: 5,
    maxStalenessForGraceful: 30 * 60 * 1000, // 30 minutes
  },
  recovery: {
    enableGradualRecovery: true,
    recoverySteps: 5,
    stepDurationMs: 2 * 60 * 1000, // 2 minutes per step
    successRateThreshold: 0.8, // 80% success rate
  },
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData fallback manager instance
 */
export function createNewsDataFallbackManager(
  config: Partial<FallbackConfig>,
  cacheManager: NewsDataCacheManager,
  circuitBreaker: NewsDataCircuitBreaker,
  observabilityLogger?: AdvancedObservabilityLogger
): NewsDataFallbackManager {
  const mergedConfig: FallbackConfig = {
    ...DEFAULT_FALLBACK_CONFIG,
    ...config,
    gracefulDegradation: {
      ...DEFAULT_FALLBACK_CONFIG.gracefulDegradation,
      ...config.gracefulDegradation,
    },
    recovery: {
      ...DEFAULT_FALLBACK_CONFIG.recovery,
      ...config.recovery,
    },
  };
  
  return new NewsDataFallbackManager(mergedConfig, cacheManager, circuitBreaker, observabilityLogger);
}

/**
 * Create fallback configuration from environment variables
 */
export function createFallbackConfigFromEnv(): Partial<FallbackConfig> {
  return {
    enableCachedFallback: process.env.NEWSDATA_FALLBACK_CACHE_ENABLED !== 'false',
    enableStaleFallback: process.env.NEWSDATA_FALLBACK_STALE_ENABLED !== 'false',
    maxStalenessMs: parseInt(process.env.NEWSDATA_FALLBACK_MAX_STALENESS || '3600000'), // 1 hour
    gracefulDegradation: {
      enabled: process.env.NEWSDATA_GRACEFUL_DEGRADATION_ENABLED !== 'false',
      minArticleCount: parseInt(process.env.NEWSDATA_GRACEFUL_MIN_ARTICLES || '5'),
      maxStalenessForGraceful: parseInt(process.env.NEWSDATA_GRACEFUL_MAX_STALENESS || '1800000'), // 30 minutes
    },
    recovery: {
      enableGradualRecovery: process.env.NEWSDATA_GRADUAL_RECOVERY_ENABLED !== 'false',
      recoverySteps: parseInt(process.env.NEWSDATA_RECOVERY_STEPS || '5'),
      stepDurationMs: parseInt(process.env.NEWSDATA_RECOVERY_STEP_DURATION || '120000'), // 2 minutes
      successRateThreshold: parseFloat(process.env.NEWSDATA_RECOVERY_SUCCESS_THRESHOLD || '0.8'),
    },
  };
}