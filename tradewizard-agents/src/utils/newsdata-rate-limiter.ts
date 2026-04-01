/**
 * NewsData.io Rate Limiter
 * 
 * Implements token bucket algorithm with configurable capacity and refill rate
 * for managing API quota across multiple endpoints and concurrent requests.
 * 
 * Features:
 * - Token bucket algorithm for smooth rate limiting
 * - Multiple buckets for different endpoints (latest, archive, crypto, market)
 * - Daily quota tracking and reset logic
 * - Concurrent request coordination
 * - Exponential backoff retry logic
 */

import type { AdvancedObservabilityLogger } from './audit-logger.js';

// ============================================================================
// Configuration Types
// ============================================================================

export interface TokenBucketConfig {
  capacity: number; // Maximum tokens in bucket
  refillRate: number; // Tokens added per second
  dailyQuota: number; // Daily API credit limit
  resetHour?: number; // Hour of day to reset (0-23, default: 0 for midnight UTC)
}

export interface RateLimiterConfig {
  buckets: {
    latest: TokenBucketConfig;
    archive: TokenBucketConfig;
    crypto: TokenBucketConfig;
    market: TokenBucketConfig;
  };
  
  // Global settings
  defaultRetryDelay: number; // Base delay for exponential backoff (ms)
  maxRetryAttempts: number; // Maximum retry attempts
  jitterFactor: number; // Jitter factor for backoff (0-1)
  
  // Coordination settings
  coordinationEnabled: boolean; // Enable multi-agent coordination
  coordinationWindow: number; // Time window for coordination (ms)
  
  // Batching settings
  batchingEnabled: boolean; // Enable intelligent request batching
  batchSize: number; // Maximum requests per batch
  batchWindow: number; // Time window to collect requests for batching (ms)
  
  // Priority queue settings
  priorityQueueEnabled: boolean; // Enable priority-based request queuing
  maxQueueSize: number; // Maximum queued requests per bucket
  priorityLevels: number; // Number of priority levels (1-10)
  
  // Advanced token bucket settings
  adaptiveRefill: boolean; // Enable adaptive refill rate based on usage patterns
  burstMultiplier: number; // Multiplier for burst capacity during low usage
  throttleThreshold: number; // Quota percentage to start throttling (0-1)
}

export interface RequestPriority {
  level: number; // 1 (highest) to 10 (lowest)
  agentId?: string; // Requesting agent identifier
  requestType?: string; // Type of request for prioritization
  timestamp: number; // When request was queued
}

export interface BatchedRequest<T> {
  id: string;
  bucket: string;
  tokens: number;
  priority: RequestPriority;
  executor: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export interface QueueStats {
  bucket: string;
  queueSize: number;
  averageWaitTime: number;
  priorityDistribution: Record<number, number>;
  batchesProcessed: number;
  averageBatchSize: number;
}

export interface RateLimitStatus {
  bucket: string;
  tokensAvailable: number;
  capacity: number;
  refillRate: number;
  dailyUsage: number;
  dailyQuota: number;
  quotaPercentage: number;
  nextRefillTime: number;
  nextResetTime: number;
  isThrottled: boolean;
}

export interface RequestResult {
  allowed: boolean;
  tokensConsumed: number;
  retryAfter?: number; // Milliseconds to wait before retry
  reason?: string;
}

// ============================================================================
// Token Bucket Implementation
// ============================================================================

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private dailyUsage: number;
  private lastReset: number;
  private usageHistory: number[] = []; // Track usage over time for adaptive refill
  private adaptiveRefillRate: number;
  private burstCapacity: number;
  
  constructor(private config: TokenBucketConfig, private adaptiveRefill: boolean = false, private burstMultiplier: number = 1.5) {
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
    this.dailyUsage = 0;
    this.lastReset = this.getResetTime();
    this.adaptiveRefillRate = config.refillRate;
    this.burstCapacity = Math.floor(config.capacity * burstMultiplier);
  }
  
  /**
   * Get the next reset time based on configured hour
   */
  private getResetTime(): number {
    const now = new Date();
    const resetHour = this.config.resetHour || 0;
    
    const resetTime = new Date(now);
    resetTime.setUTCHours(resetHour, 0, 0, 0);
    
    // If reset time has passed today, set for tomorrow
    if (resetTime.getTime() <= now.getTime()) {
      resetTime.setUTCDate(resetTime.getUTCDate() + 1);
    }
    
    return resetTime.getTime();
  }
  
  /**
   * Update adaptive refill rate based on usage patterns
   */
  private updateAdaptiveRefillRate(): void {
    if (!this.adaptiveRefill || this.usageHistory.length < 10) {
      return;
    }

    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    // Filter usage to last hour
    this.usageHistory = this.usageHistory.filter(timestamp => timestamp > oneHourAgo);
    
    const recentUsage = this.usageHistory.length;
    const expectedUsage = this.config.refillRate * 3600; // Expected usage per hour
    
    // Adjust refill rate based on usage patterns
    if (recentUsage < expectedUsage * 0.5) {
      // Low usage - increase burst capacity, maintain refill rate
      this.burstCapacity = Math.floor(this.config.capacity * this.burstMultiplier);
    } else if (recentUsage > expectedUsage * 0.8) {
      // High usage - optimize for steady flow
      this.adaptiveRefillRate = Math.min(this.config.refillRate * 1.2, this.config.refillRate * 2);
      this.burstCapacity = this.config.capacity;
    } else {
      // Normal usage - use default settings
      this.adaptiveRefillRate = this.config.refillRate;
      this.burstCapacity = this.config.capacity;
    }
  }

  /**
   * Refill tokens based on elapsed time with adaptive rate
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // Convert to seconds
    
    if (elapsed > 0) {
      this.updateAdaptiveRefillRate();
      
      const tokensToAdd = elapsed * this.adaptiveRefillRate;
      const maxCapacity = Math.max(this.config.capacity, this.burstCapacity);
      this.tokens = Math.min(maxCapacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }
  
  /**
   * Check if daily quota needs reset
   */
  private checkDailyReset(): void {
    const now = Date.now();
    
    if (now >= this.lastReset) {
      this.dailyUsage = 0;
      this.lastReset = this.getResetTime();
    }
  }
  
  /**
   * Try to consume tokens from the bucket with usage tracking
   */
  tryConsume(tokens: number = 1): RequestResult {
    this.refill();
    this.checkDailyReset();
    
    // Check daily quota first
    if (this.dailyUsage + tokens > this.config.dailyQuota) {
      const timeUntilReset = this.lastReset - Date.now();
      return {
        allowed: false,
        tokensConsumed: 0,
        retryAfter: timeUntilReset,
        reason: 'Daily quota exceeded',
      };
    }
    
    // Check token availability
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      this.dailyUsage += tokens;
      
      // Track usage for adaptive refill
      if (this.adaptiveRefill) {
        this.usageHistory.push(Date.now());
        // Keep only last 1000 entries to prevent memory bloat
        if (this.usageHistory.length > 1000) {
          this.usageHistory = this.usageHistory.slice(-1000);
        }
      }
      
      return {
        allowed: true,
        tokensConsumed: tokens,
      };
    }
    
    // Calculate time until enough tokens are available
    const tokensNeeded = tokens - this.tokens;
    const timeToWait = (tokensNeeded / this.adaptiveRefillRate) * 1000; // Convert to ms
    
    return {
      allowed: false,
      tokensConsumed: 0,
      retryAfter: Math.ceil(timeToWait),
      reason: 'Insufficient tokens',
    };
  }
  
  /**
   * Get current bucket status
   */
  getStatus(): {
    tokensAvailable: number;
    capacity: number;
    refillRate: number;
    dailyUsage: number;
    dailyQuota: number;
    quotaPercentage: number;
    nextRefillTime: number;
    nextResetTime: number;
  } {
    this.refill();
    this.checkDailyReset();
    
    const quotaPercentage = (this.dailyUsage / this.config.dailyQuota) * 100;
    const nextRefillTime = this.tokens < this.config.capacity 
      ? Date.now() + (1000 / this.config.refillRate)
      : 0;
    
    return {
      tokensAvailable: Math.floor(this.tokens),
      capacity: this.config.capacity,
      refillRate: this.config.refillRate,
      dailyUsage: this.dailyUsage,
      dailyQuota: this.config.dailyQuota,
      quotaPercentage,
      nextRefillTime,
      nextResetTime: this.lastReset,
    };
  }
  
  /**
   * Reset bucket to full capacity (for testing)
   */
  reset(): void {
    this.tokens = this.config.capacity;
    this.lastRefill = Date.now();
  }
  
  /**
   * Reset daily usage counter
   */
  resetDailyUsage(): void {
    this.dailyUsage = 0;
    // Set lastReset to the next reset time to prevent automatic reset
    this.lastReset = this.getResetTime();
  }
}

// ============================================================================
// Rate Limiter Implementation
// ============================================================================

export class NewsDataRateLimiter {
  private buckets: Map<string, TokenBucket> = new Map();
  private coordinationQueue: Map<string, number[]> = new Map(); // Track request timestamps per bucket
  private observabilityLogger?: AdvancedObservabilityLogger;
  
  // Priority queue and batching
  private requestQueues: Map<string, BatchedRequest<any>[][]> = new Map(); // [bucket][priority][]
  private batchTimers: Map<string, NodeJS.Timeout> = new Map();
  private queueStats: Map<string, QueueStats> = new Map();
  private requestIdCounter = 0;
  
  constructor(
    private config: RateLimiterConfig,
    observabilityLogger?: AdvancedObservabilityLogger
  ) {
    this.observabilityLogger = observabilityLogger;
    
    // Initialize buckets with adaptive settings
    Object.entries(config.buckets).forEach(([name, bucketConfig]) => {
      this.buckets.set(name, new TokenBucket(
        bucketConfig, 
        config.adaptiveRefill || false,
        config.burstMultiplier || 1.5
      ));
      this.coordinationQueue.set(name, []);
      
      // Initialize priority queues
      if (config.priorityQueueEnabled) {
        const priorityQueues: BatchedRequest<any>[][] = [];
        for (let i = 0; i < (config.priorityLevels || 10); i++) {
          priorityQueues.push([]);
        }
        this.requestQueues.set(name, priorityQueues);
        
        // Initialize queue stats
        this.queueStats.set(name, {
          bucket: name,
          queueSize: 0,
          averageWaitTime: 0,
          priorityDistribution: {},
          batchesProcessed: 0,
          averageBatchSize: 0,
        });
      }
    });
    
    // Start coordination cleanup interval
    if (config.coordinationEnabled) {
      this.startCoordinationCleanup();
    }
    
    // Start batch processing
    if (config.batchingEnabled) {
      this.startBatchProcessing();
    }
    
    console.log('[NewsDataRateLimiter] Initialized with enhanced coordination and batching');
  }
  
  /**
   * Start batch processing for all buckets
   */
  private startBatchProcessing(): void {
    for (const bucket of this.buckets.keys()) {
      this.scheduleBatchProcessing(bucket);
    }
  }

  /**
   * Schedule batch processing for a specific bucket
   */
  private scheduleBatchProcessing(bucket: string): void {
    const timer = setTimeout(() => {
      this.processBatch(bucket);
      this.scheduleBatchProcessing(bucket); // Reschedule
    }, this.config.batchWindow);
    
    this.batchTimers.set(bucket, timer);
  }

  /**
   * Process batched requests for a bucket
   */
  private async processBatch(bucket: string): Promise<void> {
    if (!this.config.priorityQueueEnabled) {
      return;
    }

    const priorityQueues = this.requestQueues.get(bucket);
    if (!priorityQueues) {
      return;
    }

    const stats = this.queueStats.get(bucket)!;
    let processedCount = 0;
    // const batchStartTime = Date.now();

    // Process requests by priority (highest first)
    for (let priority = 0; priority < priorityQueues.length; priority++) {
      const queue = priorityQueues[priority];
      
      if (queue.length === 0) {
        continue;
      }

      // Determine batch size based on available tokens and configuration
      const availableTokens = this.getTokens(bucket);
      const maxBatchSize = Math.min(
        this.config.batchSize,
        availableTokens,
        queue.length
      );

      if (maxBatchSize === 0) {
        break; // No tokens available
      }

      // Extract batch
      const batch = queue.splice(0, maxBatchSize);
      
      // Process batch concurrently
      const batchPromises = batch.map(async (request) => {
        const startTime = Date.now();
        
        try {
          // Try to consume tokens
          const result = await this.tryConsume(bucket, request.tokens);
          
          if (result.allowed) {
            // Execute the request
            const response = await request.executor();
            request.resolve(response);
            
            // Update wait time stats
            const waitTime = startTime - request.priority.timestamp;
            this.updateWaitTimeStats(bucket, waitTime);
            
            processedCount++;
          } else {
            // Re-queue the request if rate limited
            queue.unshift(request);
          }
        } catch (error) {
          request.reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      await Promise.allSettled(batchPromises);

      // Update queue size
      stats.queueSize = priorityQueues.reduce((total, q) => total + q.length, 0);

      // Stop if we've processed enough for this cycle
      if (processedCount >= this.config.batchSize) {
        break;
      }
    }

    // Update batch processing stats
    if (processedCount > 0) {
      stats.batchesProcessed++;
      const currentAvg = stats.averageBatchSize;
      stats.averageBatchSize = (currentAvg * (stats.batchesProcessed - 1) + processedCount) / stats.batchesProcessed;
    }
  }

  /**
   * Update wait time statistics
   */
  private updateWaitTimeStats(bucket: string, waitTime: number): void {
    const stats = this.queueStats.get(bucket);
    if (!stats) return;

    // Simple moving average
    const alpha = 0.1; // Smoothing factor
    stats.averageWaitTime = stats.averageWaitTime * (1 - alpha) + waitTime * alpha;
  }

  /**
   * Add request to priority queue
   */
  private queueRequest<T>(
    bucket: string,
    tokens: number,
    priority: RequestPriority,
    executor: () => Promise<T>
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: BatchedRequest<T> = {
        id: `req_${++this.requestIdCounter}`,
        bucket,
        tokens,
        priority,
        executor,
        resolve,
        reject,
      };

      const priorityQueues = this.requestQueues.get(bucket);
      if (!priorityQueues) {
        reject(new Error(`No priority queue for bucket: ${bucket}`));
        return;
      }

      // Add to appropriate priority queue (priority.level - 1 for 0-based indexing)
      const queueIndex = Math.max(0, Math.min(priority.level - 1, priorityQueues.length - 1));
      priorityQueues[queueIndex].push(request);

      // Update stats
      const stats = this.queueStats.get(bucket)!;
      stats.queueSize++;
      stats.priorityDistribution[priority.level] = (stats.priorityDistribution[priority.level] || 0) + 1;

      // Check if queue is full
      if (stats.queueSize > this.config.maxQueueSize) {
        // Remove lowest priority request
        for (let i = priorityQueues.length - 1; i >= 0; i--) {
          if (priorityQueues[i].length > 0) {
            const removed = priorityQueues[i].pop()!;
            removed.reject(new Error('Queue full, request dropped'));
            stats.queueSize--;
            break;
          }
        }
      }
    });
  }
  private startCoordinationCleanup(): void {
    setInterval(() => {
      const cutoff = Date.now() - this.config.coordinationWindow;
      
      this.coordinationQueue.forEach((timestamps, bucket) => {
        const filtered = timestamps.filter(ts => ts > cutoff);
        this.coordinationQueue.set(bucket, filtered);
      });
    }, this.config.coordinationWindow / 2); // Clean up twice per window
  }
  
  /**
   * Check coordination queue for concurrent requests
   */
  private checkCoordination(bucket: string): boolean {
    if (!this.config.coordinationEnabled) {
      return true;
    }
    
    const now = Date.now();
    const cutoff = now - this.config.coordinationWindow;
    const timestamps = this.coordinationQueue.get(bucket) || [];
    
    // Filter recent requests
    const recentRequests = timestamps.filter(ts => ts > cutoff);
    
    // Update queue
    this.coordinationQueue.set(bucket, recentRequests);
    
    // Check if too many concurrent requests
    const maxConcurrent = Math.max(1, Math.floor(this.config.buckets[bucket as keyof typeof this.config.buckets]?.capacity / 10));
    
    if (recentRequests.length >= maxConcurrent) {
      return false;
    }
    
    // Add current request to queue
    recentRequests.push(now);
    this.coordinationQueue.set(bucket, recentRequests);
    
    return true;
  }
  
  /**
   * Try to consume tokens from specified bucket
   */
  async tryConsume(bucket: string, tokens: number = 1): Promise<RequestResult> {
    const tokenBucket = this.buckets.get(bucket);
    
    if (!tokenBucket) {
      throw new Error(`Unknown bucket: ${bucket}`);
    }
    
    // Check coordination first
    if (!this.checkCoordination(bucket)) {
      return {
        allowed: false,
        tokensConsumed: 0,
        retryAfter: Math.random() * 1000 + 500, // Random delay 500-1500ms
        reason: 'Too many concurrent requests',
      };
    }
    
    const result = tokenBucket.tryConsume(tokens);
    
    // Log rate limiting events
    if (!result.allowed) {
      this.observabilityLogger?.logDataFetch({
        timestamp: Date.now(),
        source: 'news',
        provider: 'newsdata.io',
        success: false,
        cached: false,
        stale: false,
        freshness: 0,
        itemCount: 0,
        error: `Rate limited on bucket ${bucket}: ${result.reason}`,
        duration: result.retryAfter || 0,
      });
      
      console.log(`[NewsDataRateLimiter] Rate limited on bucket ${bucket}: ${result.reason}`);
    }
    
    return result;
  }
  
  /**
   * Get current token count for bucket
   */
  getTokens(bucket: string): number {
    const tokenBucket = this.buckets.get(bucket);
    
    if (!tokenBucket) {
      throw new Error(`Unknown bucket: ${bucket}`);
    }
    
    return tokenBucket.getStatus().tokensAvailable;
  }
  
  /**
   * Check if request would be allowed without consuming tokens
   */
  canMakeRequest(bucket: string, tokens: number = 1): boolean {
    const tokenBucket = this.buckets.get(bucket);
    
    if (!tokenBucket) {
      return false;
    }
    
    const status = tokenBucket.getStatus();
    
    // Check daily quota
    if (status.dailyUsage + tokens > status.dailyQuota) {
      return false;
    }
    
    // Check token availability
    return status.tokensAvailable >= tokens;
  }
  
  /**
   * Get time until next token available
   */
  getTimeUntilToken(bucket: string): number {
    const tokenBucket = this.buckets.get(bucket);
    
    if (!tokenBucket) {
      return 0;
    }
    
    const status = tokenBucket.getStatus();
    
    if (status.tokensAvailable > 0) {
      return 0;
    }
    
    // Calculate time for next token
    return Math.ceil(1000 / status.refillRate);
  }
  
  /**
   * Reset bucket to full capacity
   */
  resetBucket(bucket: string): void {
    const tokenBucket = this.buckets.get(bucket);
    
    if (!tokenBucket) {
      throw new Error(`Unknown bucket: ${bucket}`);
    }
    
    tokenBucket.reset();
    
    // Also reset coordination queue for this bucket
    this.coordinationQueue.set(bucket, []);
    
    console.log(`[NewsDataRateLimiter] Reset bucket: ${bucket}`);
  }
  
  /**
   * Reset daily usage for bucket
   */
  resetDailyUsage(bucket: string): void {
    const tokenBucket = this.buckets.get(bucket);
    
    if (!tokenBucket) {
      throw new Error(`Unknown bucket: ${bucket}`);
    }
    
    tokenBucket.resetDailyUsage();
    
    // Also reset coordination queue for this bucket
    this.coordinationQueue.set(bucket, []);
    
    console.log(`[NewsDataRateLimiter] Reset daily usage for bucket: ${bucket}`);
  }
  
  /**
   * Reset all buckets
   */
  resetAllBuckets(): void {
    this.buckets.forEach((bucket) => {
      bucket.reset();
    });
    
    console.log('[NewsDataRateLimiter] Reset all buckets');
  }
  
  /**
   * Reset daily usage for all buckets
   */
  resetAllDailyUsage(): void {
    this.buckets.forEach((bucket) => {
      bucket.resetDailyUsage();
    });
    
    console.log('[NewsDataRateLimiter] Reset daily usage for all buckets');
  }
  
  /**
   * Get status for specific bucket
   */
  getBucketStatus(bucket: string): RateLimitStatus {
    const tokenBucket = this.buckets.get(bucket);
    
    if (!tokenBucket) {
      throw new Error(`Unknown bucket: ${bucket}`);
    }
    
    const status = tokenBucket.getStatus();
    
    return {
      bucket,
      tokensAvailable: status.tokensAvailable,
      capacity: status.capacity,
      refillRate: status.refillRate,
      dailyUsage: status.dailyUsage,
      dailyQuota: status.dailyQuota,
      quotaPercentage: status.quotaPercentage,
      nextRefillTime: status.nextRefillTime,
      nextResetTime: status.nextResetTime,
      isThrottled: status.quotaPercentage > 80, // Throttle when over 80% quota
    };
  }
  
  /**
   * Get status for all buckets
   */
  getAllBucketStatus(): RateLimitStatus[] {
    return Array.from(this.buckets.keys()).map(bucket => this.getBucketStatus(bucket));
  }
  
  /**
   * Implement exponential backoff with jitter
   */
  calculateBackoffDelay(attempt: number, baseDelay?: number): number {
    const delay = baseDelay || this.config.defaultRetryDelay;
    const exponentialDelay = delay * Math.pow(2, attempt - 1);
    
    // Add jitter to prevent thundering herd
    const jitter = exponentialDelay * this.config.jitterFactor * Math.random();
    
    return Math.floor(exponentialDelay + jitter);
  }
  
  /**
   * Execute function with enhanced rate limiting, batching, and priority queue
   */
  async executeWithRateLimit<T>(
    bucket: string,
    fn: () => Promise<T>,
    options: {
      tokens?: number;
      maxRetries?: number;
      priority?: RequestPriority;
      agentId?: string;
      requestType?: string;
      onRetry?: (attempt: number, delay: number, reason: string) => void;
    } = {}
  ): Promise<T> {
    const {
      tokens = 1,
      maxRetries = this.config.maxRetryAttempts,
      priority,
      // agentId,
      // requestType,
      onRetry,
    } = options;

    // Use priority queue if enabled and priority is specified
    if (this.config.priorityQueueEnabled && priority) {
      return this.queueRequest(bucket, tokens, priority, fn);
    }

    // Fallback to direct execution with rate limiting
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        // Check if we should throttle based on quota usage
        const bucketStatus = this.getBucketStatus(bucket);
        if (bucketStatus.quotaPercentage / 100 > this.config.throttleThreshold) {
          // Apply intelligent throttling
          const throttleDelay = this.calculateThrottleDelay(bucketStatus);
          if (throttleDelay > 0) {
            onRetry?.(attempt, throttleDelay, 'Quota throttling');
            await new Promise(resolve => setTimeout(resolve, throttleDelay));
          }
        }

        // Try to consume tokens
        const result = await this.tryConsume(bucket, tokens);
        
        if (result.allowed) {
          // Execute function
          return await fn();
        }
        
        // Rate limited - calculate retry delay
        if (attempt <= maxRetries) {
          const retryDelay = result.retryAfter || this.calculateBackoffDelay(attempt);
          
          onRetry?.(attempt, retryDelay, result.reason || 'Rate limited');
          
          console.log(`[NewsDataRateLimiter] Rate limited, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`);
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          throw new Error(`Rate limit exceeded after ${maxRetries} retries: ${result.reason}`);
        }
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Don't retry on non-rate-limit errors
        if (attempt <= maxRetries && this.isRetryableError(lastError)) {
          const retryDelay = this.calculateBackoffDelay(attempt);
          
          onRetry?.(attempt, retryDelay, lastError.message);
          
          console.log(`[NewsDataRateLimiter] Error occurred, retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries}):`, lastError.message);
          
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          throw lastError;
        }
      }
    }
    
    throw lastError || new Error('Maximum retry attempts exceeded');
  }

  /**
   * Calculate throttle delay based on quota usage
   */
  private calculateThrottleDelay(bucketStatus: RateLimitStatus): number {
    const quotaUsage = bucketStatus.quotaPercentage / 100;
    
    if (quotaUsage < this.config.throttleThreshold) {
      return 0;
    }

    // Progressive throttling based on quota usage
    const throttleIntensity = (quotaUsage - this.config.throttleThreshold) / (1 - this.config.throttleThreshold);
    const maxThrottleDelay = 5000; // 5 seconds max
    
    return Math.floor(throttleIntensity * maxThrottleDelay);
  }

  /**
   * Execute multiple requests with intelligent batching
   */
  async executeBatch<T>(
    bucket: string,
    requests: Array<{
      fn: () => Promise<T>;
      tokens?: number;
      priority?: RequestPriority;
      agentId?: string;
    }>
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    if (!this.config.batchingEnabled) {
      // Execute sequentially if batching is disabled
      const results: Array<{ success: boolean; result?: T; error?: Error }> = [];
      
      for (const request of requests) {
        try {
          const result = await this.executeWithRateLimit(bucket, request.fn, {
            tokens: request.tokens,
            priority: request.priority,
            agentId: request.agentId,
          });
          results.push({ success: true, result });
        } catch (error) {
          results.push({ success: false, error: error as Error });
        }
      }
      
      return results;
    }

    // Use priority queue for batched execution
    const promises = requests.map(async (request) => {
      try {
        const result = await this.executeWithRateLimit(bucket, request.fn, {
          tokens: request.tokens,
          priority: request.priority || { level: 5, timestamp: Date.now() },
          agentId: request.agentId,
        });
        return { success: true, result };
      } catch (error) {
        return { success: false, error: error as Error };
      }
    });

    return Promise.all(promises);
  }

  /**
   * Get queue statistics for a bucket
   */
  getQueueStats(bucket: string): QueueStats | null {
    return this.queueStats.get(bucket) || null;
  }

  /**
   * Get queue statistics for all buckets
   */
  getAllQueueStats(): QueueStats[] {
    return Array.from(this.queueStats.values());
  }

  /**
   * Clear queue for a bucket
   */
  clearQueue(bucket: string): void {
    const priorityQueues = this.requestQueues.get(bucket);
    if (priorityQueues) {
      priorityQueues.forEach(queue => {
        queue.forEach(request => {
          request.reject(new Error('Queue cleared'));
        });
        queue.length = 0;
      });
      
      const stats = this.queueStats.get(bucket);
      if (stats) {
        stats.queueSize = 0;
        stats.priorityDistribution = {};
      }
    }
  }
  
  /**
   * Check if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    // Retry on network errors, timeouts, and server errors
    const retryablePatterns = [
      /network/i,
      /timeout/i,
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /500/,
      /502/,
      /503/,
      /504/,
    ];
    
    return retryablePatterns.some(pattern => pattern.test(error.message));
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_RATE_LIMITER_CONFIG: RateLimiterConfig = {
  buckets: {
    latest: {
      capacity: 30, // 30 requests burst
      refillRate: 2, // 2 requests per second (7200/hour)
      dailyQuota: 5000, // 5000 requests per day
      resetHour: 0, // Reset at midnight UTC
    },
    archive: {
      capacity: 10, // 10 requests burst
      refillRate: 0.5, // 0.5 requests per second (1800/hour)
      dailyQuota: 1000, // 1000 requests per day
      resetHour: 0,
    },
    crypto: {
      capacity: 20, // 20 requests burst
      refillRate: 1, // 1 request per second (3600/hour)
      dailyQuota: 3000, // 3000 requests per day
      resetHour: 0,
    },
    market: {
      capacity: 20, // 20 requests burst
      refillRate: 1, // 1 request per second (3600/hour)
      dailyQuota: 3000, // 3000 requests per day
      resetHour: 0,
    },
  },
  
  defaultRetryDelay: 1000, // 1 second base delay
  maxRetryAttempts: 3,
  jitterFactor: 0.1, // 10% jitter
  
  coordinationEnabled: true,
  coordinationWindow: 5000, // 5 second window
  
  // Enhanced settings
  batchingEnabled: true,
  batchSize: 5, // Process up to 5 requests per batch
  batchWindow: 1000, // 1 second batch collection window
  
  priorityQueueEnabled: true,
  maxQueueSize: 100, // Maximum 100 queued requests per bucket
  priorityLevels: 10, // 10 priority levels (1-10)
  
  adaptiveRefill: true,
  burstMultiplier: 1.5, // 50% burst capacity increase during low usage
  throttleThreshold: 0.8, // Start throttling at 80% quota usage
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData rate limiter instance
 */
export function createNewsDataRateLimiter(
  config?: Partial<RateLimiterConfig>,
  observabilityLogger?: AdvancedObservabilityLogger
): NewsDataRateLimiter {
  const mergedConfig: RateLimiterConfig = {
    ...DEFAULT_RATE_LIMITER_CONFIG,
    ...config,
    buckets: {
      ...DEFAULT_RATE_LIMITER_CONFIG.buckets,
      ...config?.buckets,
    },
  };
  
  return new NewsDataRateLimiter(mergedConfig, observabilityLogger);
}

/**
 * Create rate limiter configuration from environment variables
 */
export function createRateLimiterConfigFromEnv(): Partial<RateLimiterConfig> {
  return {
    buckets: {
      latest: {
        capacity: parseInt(process.env.NEWSDATA_RATE_LIMIT_LATEST_CAPACITY || '30'),
        refillRate: parseFloat(process.env.NEWSDATA_RATE_LIMIT_LATEST_REFILL || '2'),
        dailyQuota: parseInt(process.env.NEWSDATA_RATE_LIMIT_LATEST_QUOTA || '5000'),
        resetHour: parseInt(process.env.NEWSDATA_RATE_LIMIT_RESET_HOUR || '0'),
      },
      archive: {
        capacity: parseInt(process.env.NEWSDATA_RATE_LIMIT_ARCHIVE_CAPACITY || '10'),
        refillRate: parseFloat(process.env.NEWSDATA_RATE_LIMIT_ARCHIVE_REFILL || '0.5'),
        dailyQuota: parseInt(process.env.NEWSDATA_RATE_LIMIT_ARCHIVE_QUOTA || '1000'),
        resetHour: parseInt(process.env.NEWSDATA_RATE_LIMIT_RESET_HOUR || '0'),
      },
      crypto: {
        capacity: parseInt(process.env.NEWSDATA_RATE_LIMIT_CRYPTO_CAPACITY || '20'),
        refillRate: parseFloat(process.env.NEWSDATA_RATE_LIMIT_CRYPTO_REFILL || '1'),
        dailyQuota: parseInt(process.env.NEWSDATA_RATE_LIMIT_CRYPTO_QUOTA || '3000'),
        resetHour: parseInt(process.env.NEWSDATA_RATE_LIMIT_RESET_HOUR || '0'),
      },
      market: {
        capacity: parseInt(process.env.NEWSDATA_RATE_LIMIT_MARKET_CAPACITY || '20'),
        refillRate: parseFloat(process.env.NEWSDATA_RATE_LIMIT_MARKET_REFILL || '1'),
        dailyQuota: parseInt(process.env.NEWSDATA_RATE_LIMIT_MARKET_QUOTA || '3000'),
        resetHour: parseInt(process.env.NEWSDATA_RATE_LIMIT_RESET_HOUR || '0'),
      },
    },
    
    defaultRetryDelay: parseInt(process.env.NEWSDATA_RETRY_DELAY || '1000'),
    maxRetryAttempts: parseInt(process.env.NEWSDATA_MAX_RETRIES || '3'),
    jitterFactor: parseFloat(process.env.NEWSDATA_JITTER_FACTOR || '0.1'),
    
    coordinationEnabled: process.env.NEWSDATA_COORDINATION_ENABLED !== 'false',
    coordinationWindow: parseInt(process.env.NEWSDATA_COORDINATION_WINDOW || '5000'),
  };
}