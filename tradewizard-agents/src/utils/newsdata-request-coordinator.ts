/**
 * NewsData Request Coordinator
 * 
 * Coordinates requests across multiple agents to prevent quota exhaustion
 * and implements intelligent throttling with cache fallback mechanisms.
 * 
 * Features:
 * - Request throttling when quota limits approached
 * - Coordination logic for concurrent requests from multiple agents
 * - Fallback to cached data when quota exhausted
 * - Priority-based request queuing
 * - Intelligent request batching
 */

import type { NewsDataRateLimiter, RateLimitStatus } from './newsdata-rate-limiter.js';
import type { NewsDataCacheManager } from './newsdata-cache-manager.js';
import type { AdvancedObservabilityLogger } from './audit-logger.js';

// ============================================================================
// Configuration Types
// ============================================================================

export interface RequestCoordinatorConfig {
  // Throttling thresholds
  throttleThresholds: {
    warning: number; // Percentage of quota to start warning (default: 70%)
    throttle: number; // Percentage of quota to start throttling (default: 80%)
    emergency: number; // Percentage of quota to enter emergency mode (default: 90%)
  };
  
  // Request prioritization
  priorityLevels: {
    high: string[]; // High priority endpoints
    medium: string[]; // Medium priority endpoints
    low: string[]; // Low priority endpoints
  };
  
  // Batching configuration
  batching: {
    enabled: boolean;
    maxBatchSize: number;
    batchWindow: number; // Time window to collect requests (ms)
    maxWaitTime: number; // Maximum time to wait for batch (ms)
  };
  
  // Fallback configuration
  fallback: {
    enableCacheFallback: boolean;
    maxStaleAge: number; // Maximum age of stale data to use (ms)
    fallbackOnThrottle: boolean; // Use cache when throttled
    fallbackOnQuotaExhausted: boolean; // Use cache when quota exhausted
  };
  
  // Coordination settings
  coordination: {
    maxConcurrentRequests: number; // Per endpoint
    requestTimeout: number; // Request timeout (ms)
    coordinationWindow: number; // Time window for coordination (ms)
  };
}

export interface RequestContext {
  id: string;
  endpoint: string;
  params: Record<string, any>;
  priority: 'high' | 'medium' | 'low';
  timestamp: number;
  agentId?: string;
  retryCount: number;
  maxRetries: number;
}

export interface RequestResult<T = any> {
  success: boolean;
  data?: T;
  cached: boolean;
  stale: boolean;
  throttled: boolean;
  quotaExhausted: boolean;
  error?: string;
  retryAfter?: number;
  requestId: string;
}

export interface CoordinationMetrics {
  activeRequests: number;
  queuedRequests: number;
  throttledRequests: number;
  cacheHits: number;
  quotaUsage: Record<string, number>;
  averageResponseTime: number;
}

// ============================================================================
// Request Queue Implementation
// ============================================================================

class PriorityRequestQueue {
  private queues: {
    high: RequestContext[];
    medium: RequestContext[];
    low: RequestContext[];
  } = {
    high: [],
    medium: [],
    low: [],
  };
  
  private activeRequests = new Map<string, RequestContext>();
  
  enqueue(request: RequestContext): void {
    this.queues[request.priority].push(request);
  }
  
  dequeue(): RequestContext | null {
    // Process high priority first, then medium, then low
    for (const priority of ['high', 'medium', 'low'] as const) {
      const queue = this.queues[priority];
      if (queue.length > 0) {
        const request = queue.shift()!;
        this.activeRequests.set(request.id, request);
        return request;
      }
    }
    
    return null;
  }
  
  complete(requestId: string): void {
    this.activeRequests.delete(requestId);
  }
  
  getQueueSize(): number {
    return this.queues.high.length + this.queues.medium.length + this.queues.low.length;
  }
  
  getActiveCount(): number {
    return this.activeRequests.size;
  }
  
  getQueuesByPriority(): { high: number; medium: number; low: number } {
    return {
      high: this.queues.high.length,
      medium: this.queues.medium.length,
      low: this.queues.low.length,
    };
  }
  
  clear(): void {
    this.queues.high = [];
    this.queues.medium = [];
    this.queues.low = [];
    this.activeRequests.clear();
  }
}

// ============================================================================
// Request Batch Manager
// ============================================================================

class RequestBatchManager {
  private batches = new Map<string, {
    requests: RequestContext[];
    timer: NodeJS.Timeout;
    resolve: (results: RequestResult[]) => void;
  }>();
  
  constructor(private config: RequestCoordinatorConfig['batching']) {}
  
  addToBatch(request: RequestContext): Promise<RequestResult> {
    if (!this.config.enabled) {
      // If batching disabled, return immediately
      return Promise.resolve({
        success: false,
        cached: false,
        stale: false,
        throttled: false,
        quotaExhausted: false,
        error: 'Batching disabled',
        requestId: request.id,
      });
    }
    
    const batchKey = this.getBatchKey(request);
    
    return new Promise((resolve) => {
      let batch = this.batches.get(batchKey);
      
      if (!batch) {
        // Create new batch
        batch = {
          requests: [],
          timer: setTimeout(() => {
            this.executeBatch(batchKey);
          }, this.config.batchWindow),
          resolve: (results: RequestResult[]) => {
            // Find result for this request
            const result = results.find(r => r.requestId === request.id);
            resolve(result || {
              success: false,
              cached: false,
              stale: false,
              throttled: false,
              quotaExhausted: false,
              error: 'Request not found in batch results',
              requestId: request.id,
            });
          },
        };
        
        this.batches.set(batchKey, batch);
      }
      
      batch.requests.push(request);
      
      // Execute batch if it reaches max size
      if (batch.requests.length >= this.config.maxBatchSize) {
        clearTimeout(batch.timer);
        this.executeBatch(batchKey);
      }
    });
  }
  
  private getBatchKey(request: RequestContext): string {
    // Group requests by endpoint and similar parameters
    const keyParams = {
      endpoint: request.endpoint,
      // Include key parameters that affect batching
      language: request.params.language,
      country: request.params.country,
      category: request.params.category,
    };
    
    return JSON.stringify(keyParams);
  }
  
  private async executeBatch(batchKey: string): Promise<void> {
    const batch = this.batches.get(batchKey);
    if (!batch) return;
    
    this.batches.delete(batchKey);
    
    // For now, execute requests individually
    // In a real implementation, this would optimize the requests
    const results: RequestResult[] = batch.requests.map(request => ({
      success: false,
      cached: false,
      stale: false,
      throttled: false,
      quotaExhausted: false,
      error: 'Batch execution not implemented',
      requestId: request.id,
    }));
    
    batch.resolve(results);
  }
}

// ============================================================================
// Request Coordinator Implementation
// ============================================================================

export class NewsDataRequestCoordinator {
  private requestQueue = new PriorityRequestQueue();
  private batchManager: RequestBatchManager;
  private processingInterval: NodeJS.Timeout | null = null;
  private metrics: CoordinationMetrics = {
    activeRequests: 0,
    queuedRequests: 0,
    throttledRequests: 0,
    cacheHits: 0,
    quotaUsage: {},
    averageResponseTime: 0,
  };
  
  private responseTimeHistory: number[] = [];
  private readonly maxHistorySize = 100;
  
  constructor(
    private rateLimiter: NewsDataRateLimiter,
    private cacheManager: NewsDataCacheManager,
    private config: RequestCoordinatorConfig,
    private observabilityLogger?: AdvancedObservabilityLogger
  ) {
    this.batchManager = new RequestBatchManager(config.batching);
    this.startProcessing();
    
    console.log('[NewsDataRequestCoordinator] Initialized with config:', {
      throttleThresholds: config.throttleThresholds,
      coordination: config.coordination,
      batching: config.batching.enabled,
    });
  }
  
  /**
   * Start processing queued requests
   */
  private startProcessing(): void {
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 100); // Process every 100ms
  }
  
  /**
   * Stop processing and cleanup
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    this.requestQueue.clear();
  }
  
  /**
   * Submit a request for coordination
   */
  async submitRequest<T = any>(
    endpoint: string,
    params: Record<string, any>,
    options: {
      priority?: 'high' | 'medium' | 'low';
      agentId?: string;
      maxRetries?: number;
      enableBatching?: boolean;
      enableCacheFallback?: boolean;
    } = {}
  ): Promise<RequestResult<T>> {
    const {
      priority = this.determinePriority(endpoint),
      agentId,
      maxRetries = 3,
      enableBatching = this.config.batching.enabled,
      enableCacheFallback = this.config.fallback.enableCacheFallback,
    } = options;
    
    const requestId = this.generateRequestId();
    const request: RequestContext = {
      id: requestId,
      endpoint,
      params,
      priority,
      timestamp: Date.now(),
      agentId,
      retryCount: 0,
      maxRetries,
    };
    
    // Check if we should use cache fallback immediately
    if (enableCacheFallback && this.shouldUseCacheFallback(endpoint)) {
      const cachedResult = await this.tryGetCachedData<T>(endpoint, params);
      if (cachedResult) {
        this.metrics.cacheHits++;
        return cachedResult;
      }
    }
    
    // Check if we should batch this request
    if (enableBatching && this.shouldBatchRequest(request)) {
      return await this.batchManager.addToBatch(request);
    }
    
    // Add to queue for processing
    return new Promise((resolve) => {
      (request as any).resolve = resolve;
      this.requestQueue.enqueue(request);
      this.metrics.queuedRequests++;
    });
  }
  
  /**
   * Process the request queue
   */
  private async processQueue(): Promise<void> {
    const maxConcurrent = this.config.coordination.maxConcurrentRequests;
    const activeCount = this.requestQueue.getActiveCount();
    
    if (activeCount >= maxConcurrent) {
      return; // Too many active requests
    }
    
    const request = this.requestQueue.dequeue();
    if (!request) {
      return; // No requests to process
    }
    
    this.metrics.queuedRequests--;
    this.metrics.activeRequests++;
    
    try {
      const result = await this.executeRequest(request);
      this.completeRequest(request, result);
    } catch (error) {
      const errorResult: RequestResult = {
        success: false,
        cached: false,
        stale: false,
        throttled: false,
        quotaExhausted: false,
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
      };
      
      this.completeRequest(request, errorResult);
    }
  }
  
  /**
   * Execute a single request
   */
  private async executeRequest(request: RequestContext): Promise<RequestResult> {
    const startTime = Date.now();
    
    try {
      // Check rate limits
      const bucketStatus = this.rateLimiter.getBucketStatus(request.endpoint);
      
      // Check if we should throttle
      if (this.shouldThrottle(bucketStatus)) {
        this.metrics.throttledRequests++;
        
        // Try cache fallback if throttled
        if (this.config.fallback.fallbackOnThrottle) {
          const cachedResult = await this.tryGetCachedData(request.endpoint, request.params);
          if (cachedResult) {
            cachedResult.throttled = true;
            return cachedResult;
          }
        }
        
        return {
          success: false,
          cached: false,
          stale: false,
          throttled: true,
          quotaExhausted: false,
          error: 'Request throttled due to quota limits',
          retryAfter: this.calculateThrottleDelay(bucketStatus),
          requestId: request.id,
        };
      }
      
      // Try to consume tokens
      const rateLimitResult = await this.rateLimiter.tryConsume(request.endpoint, 1);
      
      if (!rateLimitResult.allowed) {
        // Check if quota exhausted
        if (rateLimitResult.reason === 'Daily quota exceeded') {
          // Try cache fallback for quota exhaustion
          if (this.config.fallback.fallbackOnQuotaExhausted) {
            const cachedResult = await this.tryGetCachedData(request.endpoint, request.params);
            if (cachedResult) {
              cachedResult.quotaExhausted = true;
              return cachedResult;
            }
          }
          
          return {
            success: false,
            cached: false,
            stale: false,
            throttled: false,
            quotaExhausted: true,
            error: 'Daily quota exhausted',
            retryAfter: rateLimitResult.retryAfter,
            requestId: request.id,
          };
        }
        
        // Rate limited - retry later
        return {
          success: false,
          cached: false,
          stale: false,
          throttled: false,
          quotaExhausted: false,
          error: rateLimitResult.reason || 'Rate limited',
          retryAfter: rateLimitResult.retryAfter,
          requestId: request.id,
        };
      }
      
      // Execute the actual request (this would be implemented by the caller)
      // For now, return a mock success result
      const responseTime = Date.now() - startTime;
      this.updateResponseTimeMetrics(responseTime);
      
      return {
        success: true,
        data: { mock: 'data' }, // This would be real data
        cached: false,
        stale: false,
        throttled: false,
        quotaExhausted: false,
        requestId: request.id,
      };
      
    } catch (error) {
      return {
        success: false,
        cached: false,
        stale: false,
        throttled: false,
        quotaExhausted: false,
        error: error instanceof Error ? error.message : String(error),
        requestId: request.id,
      };
    }
  }
  
  /**
   * Complete a request and notify the caller
   */
  private completeRequest(request: RequestContext, result: RequestResult): void {
    this.requestQueue.complete(request.id);
    this.metrics.activeRequests--;
    
    // Update quota usage metrics
    this.updateQuotaMetrics(request.endpoint);
    
    // Log the request completion
    this.observabilityLogger?.logDataFetch({
      timestamp: Date.now(),
      source: 'news',
      provider: 'newsdata.io',
      success: result.success,
      cached: result.cached,
      stale: result.stale,
      freshness: result.cached ? 0 : Date.now() - request.timestamp,
      itemCount: result.success ? 1 : 0,
      error: result.error,
      duration: Date.now() - request.timestamp,
    });
    
    // Resolve the promise
    const resolve = (request as any).resolve;
    if (resolve) {
      resolve(result);
    }
  }
  
  /**
   * Determine request priority based on endpoint
   */
  private determinePriority(endpoint: string): 'high' | 'medium' | 'low' {
    if (this.config.priorityLevels.high.includes(endpoint)) {
      return 'high';
    } else if (this.config.priorityLevels.medium.includes(endpoint)) {
      return 'medium';
    } else {
      return 'low';
    }
  }
  
  /**
   * Check if request should be throttled
   */
  private shouldThrottle(bucketStatus: RateLimitStatus): boolean {
    return bucketStatus.quotaPercentage >= this.config.throttleThresholds.throttle;
  }
  
  /**
   * Check if should use cache fallback
   */
  private shouldUseCacheFallback(endpoint: string): boolean {
    const bucketStatus = this.rateLimiter.getBucketStatus(endpoint);
    return bucketStatus.quotaPercentage >= this.config.throttleThresholds.emergency;
  }
  
  /**
   * Check if request should be batched
   */
  private shouldBatchRequest(request: RequestContext): boolean {
    // Don't batch high priority requests
    if (request.priority === 'high') {
      return false;
    }
    
    // Don't batch if endpoint doesn't support batching
    const batchableEndpoints = ['latest', 'crypto', 'market'];
    return batchableEndpoints.includes(request.endpoint);
  }
  
  /**
   * Try to get cached data as fallback
   */
  private async tryGetCachedData<T>(endpoint: string, params: Record<string, any>): Promise<RequestResult<T> | null> {
    try {
      const cacheKey = this.generateCacheKey(endpoint, params);
      const cachedData = await this.cacheManager.get<T>(cacheKey);
      
      if (cachedData) {
        const age = Date.now() - cachedData.timestamp;
        const isStale = age > (cachedData.ttl * 1000);
        
        // Check if data is too stale
        if (isStale && age > this.config.fallback.maxStaleAge) {
          return null;
        }
        
        return {
          success: true,
          data: cachedData.data,
          cached: true,
          stale: isStale,
          throttled: false,
          quotaExhausted: false,
          requestId: this.generateRequestId(),
        };
      }
    } catch (error) {
      console.warn('[NewsDataRequestCoordinator] Cache fallback failed:', error);
    }
    
    return null;
  }
  
  /**
   * Calculate throttle delay based on quota usage
   */
  private calculateThrottleDelay(bucketStatus: RateLimitStatus): number {
    const quotaPercentage = bucketStatus.quotaPercentage;
    
    if (quotaPercentage >= this.config.throttleThresholds.emergency) {
      return 60000; // 1 minute delay for emergency
    } else if (quotaPercentage >= this.config.throttleThresholds.throttle) {
      return 30000; // 30 second delay for throttle
    } else {
      return 10000; // 10 second delay for warning
    }
  }
  
  /**
   * Update response time metrics
   */
  private updateResponseTimeMetrics(responseTime: number): void {
    this.responseTimeHistory.push(responseTime);
    
    if (this.responseTimeHistory.length > this.maxHistorySize) {
      this.responseTimeHistory.shift();
    }
    
    const sum = this.responseTimeHistory.reduce((a, b) => a + b, 0);
    this.metrics.averageResponseTime = sum / this.responseTimeHistory.length;
  }
  
  /**
   * Update quota usage metrics
   */
  private updateQuotaMetrics(endpoint: string): void {
    const bucketStatus = this.rateLimiter.getBucketStatus(endpoint);
    this.metrics.quotaUsage[endpoint] = bucketStatus.quotaPercentage;
  }
  
  /**
   * Generate cache key for request
   */
  private generateCacheKey(endpoint: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        result[key] = params[key];
        return result;
      }, {} as Record<string, any>);
    
    const paramString = new URLSearchParams(sortedParams).toString();
    return `newsdata:${endpoint}:${paramString}`;
  }
  
  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Get current coordination metrics
   */
  getMetrics(): CoordinationMetrics {
    return {
      ...this.metrics,
      activeRequests: this.requestQueue.getActiveCount(),
      queuedRequests: this.requestQueue.getQueueSize(),
    };
  }
  
  /**
   * Get detailed queue status
   */
  getQueueStatus(): {
    total: number;
    active: number;
    byPriority: { high: number; medium: number; low: number };
  } {
    return {
      total: this.requestQueue.getQueueSize(),
      active: this.requestQueue.getActiveCount(),
      byPriority: this.requestQueue.getQueuesByPriority(),
    };
  }
  
  /**
   * Get rate limit status for all buckets
   */
  getRateLimitStatus(): RateLimitStatus[] {
    return this.rateLimiter.getAllBucketStatus();
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_REQUEST_COORDINATOR_CONFIG: RequestCoordinatorConfig = {
  throttleThresholds: {
    warning: 70,
    throttle: 80,
    emergency: 90,
  },
  
  priorityLevels: {
    high: ['latest'], // Latest news is high priority
    medium: ['crypto', 'market'], // Crypto and market news are medium priority
    low: ['archive'], // Archive news is low priority
  },
  
  batching: {
    enabled: true,
    maxBatchSize: 5,
    batchWindow: 2000, // 2 seconds
    maxWaitTime: 5000, // 5 seconds
  },
  
  fallback: {
    enableCacheFallback: true,
    maxStaleAge: 3600000, // 1 hour
    fallbackOnThrottle: true,
    fallbackOnQuotaExhausted: true,
  },
  
  coordination: {
    maxConcurrentRequests: 10,
    requestTimeout: 30000, // 30 seconds
    coordinationWindow: 5000, // 5 seconds
  },
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData request coordinator instance
 */
export function createNewsDataRequestCoordinator(
  rateLimiter: NewsDataRateLimiter,
  cacheManager: NewsDataCacheManager,
  config?: Partial<RequestCoordinatorConfig>,
  observabilityLogger?: AdvancedObservabilityLogger
): NewsDataRequestCoordinator {
  const mergedConfig: RequestCoordinatorConfig = {
    ...DEFAULT_REQUEST_COORDINATOR_CONFIG,
    ...config,
    throttleThresholds: {
      ...DEFAULT_REQUEST_COORDINATOR_CONFIG.throttleThresholds,
      ...config?.throttleThresholds,
    },
    priorityLevels: {
      ...DEFAULT_REQUEST_COORDINATOR_CONFIG.priorityLevels,
      ...config?.priorityLevels,
    },
    batching: {
      ...DEFAULT_REQUEST_COORDINATOR_CONFIG.batching,
      ...config?.batching,
    },
    fallback: {
      ...DEFAULT_REQUEST_COORDINATOR_CONFIG.fallback,
      ...config?.fallback,
    },
    coordination: {
      ...DEFAULT_REQUEST_COORDINATOR_CONFIG.coordination,
      ...config?.coordination,
    },
  };
  
  return new NewsDataRequestCoordinator(
    rateLimiter,
    cacheManager,
    mergedConfig,
    observabilityLogger
  );
}