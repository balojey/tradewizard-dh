/**
 * NewsData Cache Manager
 *
 * Enhanced caching system for NewsData.io API responses with intelligent TTL,
 * stale data handling, LRU eviction policy, compression, and cache warming.
 *
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.6
 */

import { getLogger } from './logger.js';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ============================================================================
// Types and Interfaces
// ============================================================================

export interface CachedData<T> {
  data: T;
  timestamp: number;
  ttl: number;
  isStale: boolean;
  hitCount: number;
}

export interface CacheStats {
  totalKeys: number;
  hitRate: number;
  missRate: number;
  memoryUsage: number;
  staleKeys: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  staleTTL: number; // How long to keep stale data
  evictionPolicy: 'lru' | 'lfu' | 'ttl';
  compressionThreshold: number; // Compress entries larger than this (bytes)
  enableCompression: boolean;
  warmingEnabled: boolean;
  warmingBatchSize: number;
  keyOptimization: boolean;
}

interface CacheEntry<T> {
  data: T | Buffer; // Can be compressed data
  timestamp: number;
  ttl: number;
  hitCount: number;
  lastAccessed: number;
  compressed: boolean;
  originalSize?: number;
  compressedSize?: number;
}

interface CacheWarmingSpec<T> {
  key: string;
  dataFactory: () => Promise<T>;
  ttl?: number;
  priority: number;
  dependencies?: string[]; // Keys this entry depends on
}

interface CacheKeyPattern {
  endpoint: string;
  commonParams: string[];
  variableParams: string[];
  keyTemplate: string;
}

// ============================================================================
// NewsData Cache Manager
// ============================================================================

export class NewsDataCacheManager {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private accessOrder: string[] = []; // For LRU tracking
  private hits: number = 0;
  private misses: number = 0;
  private config: CacheConfig;
  private logger;
  private warmingQueue: Map<string, CacheWarmingSpec<any>> = new Map();
  private keyPatterns: Map<string, CacheKeyPattern> = new Map();
  private compressionStats = {
    totalCompressed: 0,
    totalOriginalSize: 0,
    totalCompressedSize: 0,
    compressionRatio: 0,
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: config.maxSize || 1000,
      defaultTTL: config.defaultTTL || 15 * 60 * 1000, // 15 minutes
      staleTTL: config.staleTTL || 60 * 60 * 1000, // 1 hour for stale data
      evictionPolicy: config.evictionPolicy || 'lru',
      compressionThreshold: config.compressionThreshold || 10 * 1024, // 10KB
      enableCompression: config.enableCompression ?? true,
      warmingEnabled: config.warmingEnabled ?? true,
      warmingBatchSize: config.warmingBatchSize || 10,
      keyOptimization: config.keyOptimization ?? true,
    };
    this.logger = getLogger();
    this.initializeKeyPatterns();
  }

  /**
   * Initialize key patterns for optimization
   */
  private initializeKeyPatterns(): void {
    // Define common patterns for NewsData endpoints
    this.keyPatterns.set('latest', {
      endpoint: 'latest',
      commonParams: ['language', 'country', 'category'],
      variableParams: ['q', 'qInTitle', 'timeframe', 'size'],
      keyTemplate: 'newsdata:latest:{language}:{country}:{category}:{hash}',
    });

    this.keyPatterns.set('archive', {
      endpoint: 'archive',
      commonParams: ['language', 'country', 'category'],
      variableParams: ['q', 'qInTitle', 'from_date', 'to_date', 'size'],
      keyTemplate: 'newsdata:archive:{language}:{country}:{category}:{hash}',
    });

    this.keyPatterns.set('crypto', {
      endpoint: 'crypto',
      commonParams: ['language', 'coin'],
      variableParams: ['q', 'qInTitle', 'timeframe', 'size'],
      keyTemplate: 'newsdata:crypto:{language}:{coin}:{hash}',
    });

    this.keyPatterns.set('market', {
      endpoint: 'market',
      commonParams: ['language', 'country', 'symbol'],
      variableParams: ['q', 'qInTitle', 'organization', 'timeframe', 'size'],
      keyTemplate: 'newsdata:market:{language}:{country}:{symbol}:{hash}',
    });
  }

  /**
   * Compress data if it exceeds threshold
   */
  private async compressData<T>(data: T): Promise<{ data: T | Buffer; compressed: boolean; originalSize: number; compressedSize?: number }> {
    if (!this.config.enableCompression) {
      return { data, compressed: false, originalSize: 0 };
    }

    const serialized = JSON.stringify(data);
    const originalSize = Buffer.byteLength(serialized, 'utf8');

    if (originalSize < this.config.compressionThreshold) {
      return { data, compressed: false, originalSize };
    }

    try {
      const compressed = await gzipAsync(serialized);
      const compressedSize = compressed.length;

      // Only use compression if it actually saves space
      if (compressedSize < originalSize * 0.8) {
        this.compressionStats.totalCompressed++;
        this.compressionStats.totalOriginalSize += originalSize;
        this.compressionStats.totalCompressedSize += compressedSize;
        this.compressionStats.compressionRatio = 
          this.compressionStats.totalCompressedSize / this.compressionStats.totalOriginalSize;

        return { data: compressed, compressed: true, originalSize, compressedSize };
      }
    } catch (error) {
      this.logger.warn(`Compression failed: ${error}`);
    }

    return { data, compressed: false, originalSize };
  }

  /**
   * Decompress data if needed
   */
  private async decompressData<T>(entry: CacheEntry<T>): Promise<T> {
    if (!entry.compressed || !(entry.data instanceof Buffer)) {
      return entry.data as T;
    }

    try {
      const decompressed = await gunzipAsync(entry.data);
      return JSON.parse(decompressed.toString('utf8'));
    } catch (error) {
      this.logger.error(`Decompression failed: ${error}`);
      throw new Error('Failed to decompress cached data');
    }
  }
  /**
   * Get cached data with stale handling
   */
  async get<T>(key: string): Promise<CachedData<T> | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;
    const isExpired = age > entry.ttl;
    const isStale = isExpired && age <= (entry.ttl + this.config.staleTTL);

    // Update access tracking for LRU
    this.updateAccessOrder(key);
    entry.lastAccessed = now;
    entry.hitCount++;

    if (isExpired && !isStale) {
      // Data is too old, remove it
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.misses++;
      return null;
    }

    this.hits++;
    
    // Decompress data if needed
    const data = await this.decompressData(entry);

    return {
      data,
      timestamp: entry.timestamp,
      ttl: entry.ttl,
      isStale: isStale,
      hitCount: entry.hitCount,
    };
  }

  /**
   * Set cached data with TTL and compression
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    // Evict entries if cache is full
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      await this.evictEntries(1);
    }

    const now = Date.now();
    const { data: processedData, compressed, originalSize, compressedSize } = await this.compressData(data);

    const entry: CacheEntry<T> = {
      data: processedData,
      timestamp: now,
      ttl: ttl || this.config.defaultTTL,
      hitCount: 0,
      lastAccessed: now,
      compressed,
      originalSize,
      compressedSize,
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);

    this.logger.debug(`Cache set: ${key} (TTL: ${entry.ttl}ms, Compressed: ${compressed}, Size: ${compressedSize || originalSize} bytes)`);
  }

  /**
   * Check if key exists and is not expired
   */
  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    const now = Date.now();
    const age = now - entry.timestamp;
    const isExpired = age > entry.ttl;
    const isStale = isExpired && age <= (entry.ttl + this.config.staleTTL);

    if (isExpired && !isStale) {
      // Data is too old, remove it
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }

    return true;
  }

  /**
   * Delete cached data
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
    this.removeFromAccessOrder(key);
    this.logger.debug(`Cache delete: ${key}`);
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder = [];
    this.hits = 0;
    this.misses = 0;
    this.logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const now = Date.now();
    let staleKeys = 0;
    let memoryUsage = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      const isExpired = age > entry.ttl;
      const isStale = isExpired && age <= (entry.ttl + this.config.staleTTL);

      if (isStale) {
        staleKeys++;
      }

      // Rough memory usage calculation
      memoryUsage += JSON.stringify(entry.data).length + key.length;
    }

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;
    const missRate = total > 0 ? this.misses / total : 0;

    return {
      totalKeys: this.cache.size,
      hitRate,
      missRate,
      memoryUsage,
      staleKeys,
    };
  }

  /**
   * Get detailed cache statistics including LRU information
   */
  async getDetailedStats(): Promise<CacheStats & { 
    evictionPolicy: string;
    maxSize: number;
    averageHitCount: number;
    oldestEntryAge: number;
    newestEntryAge: number;
  }> {
    const baseStats = await this.getStats();
    const now = Date.now();
    
    let totalHitCount = 0;
    let oldestAge = 0;
    let newestAge = Infinity;

    for (const entry of this.cache.values()) {
      totalHitCount += entry.hitCount;
      const age = now - entry.timestamp;
      oldestAge = Math.max(oldestAge, age);
      newestAge = Math.min(newestAge, age);
    }

    const averageHitCount = this.cache.size > 0 ? totalHitCount / this.cache.size : 0;

    return {
      ...baseStats,
      evictionPolicy: this.config.evictionPolicy,
      maxSize: this.config.maxSize,
      averageHitCount,
      oldestEntryAge: oldestAge,
      newestEntryAge: newestAge === Infinity ? 0 : newestAge,
    };
  }

  /**
   * Get memory usage breakdown with compression statistics
   */
  async getMemoryBreakdown(): Promise<{
    totalMemory: number;
    averageEntrySize: number;
    largestEntrySize: number;
    smallestEntrySize: number;
    keyMemory: number;
    dataMemory: number;
    compressionStats: {
      totalCompressed: number;
      totalOriginalSize: number;
      totalCompressedSize: number;
      compressionRatio: number;
      spaceSaved: number;
    };
  }> {
    let totalMemory = 0;
    let keyMemory = 0;
    let dataMemory = 0;
    let largestEntrySize = 0;
    let smallestEntrySize = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      const keySize = key.length * 2; // Rough UTF-16 size
      let dataSize: number;
      
      if (entry.compressed && entry.compressedSize) {
        dataSize = entry.compressedSize;
      } else if (entry.originalSize) {
        dataSize = entry.originalSize;
      } else {
        // Fallback calculation
        dataSize = entry.data instanceof Buffer 
          ? entry.data.length 
          : JSON.stringify(entry.data).length * 2;
      }
      
      const entrySize = keySize + dataSize;

      keyMemory += keySize;
      dataMemory += dataSize;
      totalMemory += entrySize;
      
      largestEntrySize = Math.max(largestEntrySize, entrySize);
      smallestEntrySize = Math.min(smallestEntrySize, entrySize);
    }

    const averageEntrySize = this.cache.size > 0 ? totalMemory / this.cache.size : 0;
    const spaceSaved = this.compressionStats.totalOriginalSize - this.compressionStats.totalCompressedSize;

    return {
      totalMemory,
      averageEntrySize,
      largestEntrySize,
      smallestEntrySize: smallestEntrySize === Infinity ? 0 : smallestEntrySize,
      keyMemory,
      dataMemory,
      compressionStats: {
        ...this.compressionStats,
        spaceSaved,
      },
    };
  }

  /**
   * Get stale data as fallback
   */
  async getStaleData<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    const now = Date.now();
    const age = now - entry.timestamp;
    const isStale = age > entry.ttl && age <= (entry.ttl + this.config.staleTTL);

    if (isStale) {
      this.logger.warn(`Returning stale data for key: ${key} (age: ${age}ms)`);
      return await this.decompressData(entry);
    }

    return null;
  }

  /**
   * Generate optimized cache key for sharing between similar requests
   */
  generateCacheKey(endpoint: string, params: Record<string, any>): string {
    if (!this.config.keyOptimization) {
      return this.generateBasicCacheKey(endpoint, params);
    }

    const pattern = this.keyPatterns.get(endpoint);
    if (!pattern) {
      return this.generateBasicCacheKey(endpoint, params);
    }

    // Extract common parameters for the template
    const commonValues: Record<string, string> = {};
    for (const param of pattern.commonParams) {
      const value = params[param];
      if (Array.isArray(value)) {
        commonValues[param] = value.sort().join(',');
      } else if (value !== undefined && value !== null) {
        commonValues[param] = String(value);
      } else {
        commonValues[param] = 'any';
      }
    }

    // Create hash for variable parameters
    const variableParams: Record<string, any> = {};
    for (const param of pattern.variableParams) {
      if (params[param] !== undefined && params[param] !== null) {
        variableParams[param] = params[param];
      }
    }

    const variableHash = this.hashObject(variableParams);

    // Build key from template
    let key = pattern.keyTemplate;
    for (const [param, value] of Object.entries(commonValues)) {
      key = key.replace(`{${param}}`, value);
    }
    key = key.replace('{hash}', variableHash);

    return key;
  }

  /**
   * Generate basic cache key (fallback method)
   */
  private generateBasicCacheKey(endpoint: string, params: Record<string, any>): string {
    // Sort parameters for consistent key generation
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((result, key) => {
        const value = params[key];
        // Normalize arrays and handle special cases
        if (Array.isArray(value)) {
          result[key] = value.sort().join(',');
        } else if (value !== undefined && value !== null) {
          result[key] = String(value);
        }
        return result;
      }, {} as Record<string, string>);

    const paramString = new URLSearchParams(sortedParams).toString();
    return `newsdata:${endpoint}:${paramString}`;
  }

  /**
   * Create hash for object (simple hash function)
   */
  private hashObject(obj: Record<string, any>): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get data with comprehensive fallback strategy
   */
  async getWithFallback<T>(
    key: string,
    dataFactory: () => Promise<T>,
    options: {
      ttl?: number;
      allowStale?: boolean;
      maxRetries?: number;
      retryDelay?: number;
    } = {}
  ): Promise<{ data: T; source: 'cache' | 'stale' | 'fresh'; fromCache: boolean }> {
    const { ttl, allowStale = true, maxRetries = 3, retryDelay = 1000 } = options;

    // Try to get fresh cached data first
    const cached = await this.get<T>(key);
    if (cached && !cached.isStale) {
      return { data: cached.data, source: 'cache', fromCache: true };
    }

    // Try to fetch fresh data
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const freshData = await dataFactory();
        await this.set(key, freshData, ttl);
        return { data: freshData, source: 'fresh', fromCache: false };
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`Failed to fetch fresh data (attempt ${attempt}/${maxRetries}): ${error}`);
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
        }
      }
    }

    // If fresh data failed and we allow stale data, try to get it
    if (allowStale) {
      const staleData = await this.getStaleData<T>(key);
      if (staleData) {
        this.logger.warn(`Returning stale data as fallback for key: ${key}`);
        return { data: staleData, source: 'stale', fromCache: true };
      }
    }

    // No fallback available, throw the last error
    throw lastError || new Error('No data available and fallback failed');
  }

  /**
   * Add cache warming specification
   */
  addWarmingSpec<T>(spec: CacheWarmingSpec<T>): void {
    if (!this.config.warmingEnabled) {
      return;
    }

    this.warmingQueue.set(spec.key, spec);
    this.logger.debug(`Added cache warming spec for key: ${spec.key} (priority: ${spec.priority})`);
  }

  /**
   * Execute cache warming for queued specifications
   */
  async executeWarmingQueue(): Promise<{ successful: number; failed: number; errors: Error[] }> {
    if (!this.config.warmingEnabled || this.warmingQueue.size === 0) {
      return { successful: 0, failed: 0, errors: [] };
    }

    // Sort by priority and resolve dependencies
    const sortedSpecs = this.resolveDependencies(Array.from(this.warmingQueue.values()));
    
    let successful = 0;
    let failed = 0;
    const errors: Error[] = [];

    // Process in batches
    for (let i = 0; i < sortedSpecs.length; i += this.config.warmingBatchSize) {
      const batch = sortedSpecs.slice(i, i + this.config.warmingBatchSize);
      
      const batchPromises = batch.map(async (spec) => {
        try {
          // Check if already cached and fresh
          const existing = await this.get(spec.key);
          if (existing && !existing.isStale) {
            return { success: true, key: spec.key };
          }

          // Warm the cache
          const data = await spec.dataFactory();
          await this.set(spec.key, data, spec.ttl);
          return { success: true, key: spec.key };
        } catch (error) {
          return { success: false, key: spec.key, error: error as Error };
        }
      });

      const batchResults = await Promise.allSettled(batchPromises);
      
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            successful++;
            this.logger.debug(`Cache warmed: ${result.value.key}`);
          } else {
            failed++;
            const error = result.value.error || new Error('Unknown warming error');
            errors.push(error);
            this.logger.warn(`Failed to warm cache: ${result.value.key} - ${error.message}`);
          }
        } else {
          failed++;
          errors.push(result.reason);
        }
      }

      // Small delay between batches to avoid overwhelming the system
      if (i + this.config.warmingBatchSize < sortedSpecs.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Clear the warming queue
    this.warmingQueue.clear();

    this.logger.info(`Cache warming completed: ${successful} successful, ${failed} failed`);
    return { successful, failed, errors };
  }

  /**
   * Resolve dependencies and sort warming specifications
   */
  private resolveDependencies(specs: CacheWarmingSpec<any>[]): CacheWarmingSpec<any>[] {
    const resolved: CacheWarmingSpec<any>[] = [];
    const remaining = new Map(specs.map(spec => [spec.key, spec]));
    const processing = new Set<string>();

    const resolve = (key: string): void => {
      if (processing.has(key)) {
        // Circular dependency, skip
        return;
      }

      const spec = remaining.get(key);
      if (!spec) {
        return;
      }

      processing.add(key);

      // Resolve dependencies first
      if (spec.dependencies) {
        for (const dep of spec.dependencies) {
          resolve(dep);
        }
      }

      // Add to resolved list
      resolved.push(spec);
      remaining.delete(key);
      processing.delete(key);
    };

    // Resolve all specs
    for (const spec of specs) {
      resolve(spec.key);
    }

    // Add any remaining specs (those with unresolvable dependencies)
    resolved.push(...remaining.values());

    // Sort by priority within dependency groups
    return resolved.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Smart cache warming based on usage patterns
   */
  async smartWarmCache(
    patterns: Array<{
      endpoint: string;
      baseParams: Record<string, any>;
      variations: Array<Record<string, any>>;
      priority?: number;
    }>
  ): Promise<{ successful: number; failed: number }> {
    for (const pattern of patterns) {
      for (const variation of pattern.variations) {
        const params = { ...pattern.baseParams, ...variation };
        const key = this.generateCacheKey(pattern.endpoint, params);
        
        // Check if this key is frequently accessed
        const existing = this.cache.get(key);
        const shouldWarm = !existing || 
          existing.hitCount > 2 || 
          (existing.hitCount > 0 && Date.now() - existing.timestamp > existing.ttl * 0.8);

        if (shouldWarm) {
          this.addWarmingSpec({
            key,
            dataFactory: async () => {
              // This would be replaced with actual API call in real usage
              throw new Error('Data factory not implemented for smart warming');
            },
            priority: pattern.priority || 1,
          });
        }
      }
    }

    const result = await this.executeWarmingQueue();
    return { successful: result.successful, failed: result.failed };
  }
  async preloadCache<T>(
    preloadSpecs: Array<{
      key: string;
      dataFactory: () => Promise<T>;
      ttl?: number;
      priority?: number;
    }>
  ): Promise<{ successful: number; failed: number; errors: Error[] }> {
    // Sort by priority (higher priority first)
    const sortedSpecs = preloadSpecs.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    
    let successful = 0;
    let failed = 0;
    const errors: Error[] = [];

    for (const spec of sortedSpecs) {
      try {
        // Check if already cached and fresh
        const existing = await this.get<T>(spec.key);
        if (existing && !existing.isStale) {
          successful++;
          continue;
        }

        // Preload the data
        const data = await spec.dataFactory();
        await this.set(spec.key, data, spec.ttl);
        successful++;
        this.logger.debug(`Preloaded cache key: ${spec.key}`);
      } catch (error) {
        failed++;
        errors.push(error as Error);
        this.logger.warn(`Failed to preload cache key ${spec.key}: ${error}`);
      }
    }

    this.logger.info(`Cache preload completed: ${successful} successful, ${failed} failed`);
    return { successful, failed, errors };
  }

  /**
   * Batch get multiple keys with fallback
   */
  async batchGet<T>(
    keys: string[],
    dataFactory?: (key: string) => Promise<T>,
    options: { allowStale?: boolean; ttl?: number } = {}
  ): Promise<Map<string, { data: T; source: 'cache' | 'stale' | 'fresh' } | null>> {
    const results = new Map<string, { data: T; source: 'cache' | 'stale' | 'fresh' } | null>();
    
    for (const key of keys) {
      try {
        if (dataFactory) {
          const result = await this.getWithFallback(key, () => dataFactory(key), options);
          results.set(key, result);
        } else {
          const cached = await this.get<T>(key);
          if (cached) {
            results.set(key, { 
              data: cached.data, 
              source: cached.isStale ? 'stale' : 'cache' 
            });
          } else {
            results.set(key, null);
          }
        }
      } catch (error) {
        this.logger.warn(`Failed to get data for key ${key}: ${error}`);
        results.set(key, null);
      }
    }

    return results;
  }

  /**
   * Refresh cache entry if stale
   */
  async refreshIfStale<T>(
    key: string,
    dataFactory: () => Promise<T>,
    ttl?: number
  ): Promise<{ refreshed: boolean; data: T }> {
    const cached = await this.get<T>(key);
    
    if (!cached || cached.isStale) {
      try {
        const freshData = await dataFactory();
        await this.set(key, freshData, ttl);
        return { refreshed: true, data: freshData };
      } catch (error) {
        // If refresh fails but we have stale data, return it
        if (cached?.isStale) {
          this.logger.warn(`Refresh failed, returning stale data for key: ${key}`);
          return { refreshed: false, data: cached.data };
        }
        throw error;
      }
    }

    return { refreshed: false, data: cached.data };
  }

  /**
   * Evict expired entries
   */
  async evictExpired(): Promise<number> {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      const age = now - entry.timestamp;
      const isExpired = age > entry.ttl;
      const isStale = isExpired && age <= (entry.ttl + this.config.staleTTL);

      if (isExpired && !isStale) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.logger.debug(`Evicted ${evicted} expired entries`);
    }

    return evicted;
  }

  /**
   * Log cache performance statistics
   */
  async logCachePerformance(): Promise<void> {
    const stats = await this.getDetailedStats();
    const memory = await this.getMemoryBreakdown();

    this.logger.info({
      hitRate: `${(stats.hitRate * 100).toFixed(2)}%`,
      missRate: `${(stats.missRate * 100).toFixed(2)}%`,
      totalKeys: stats.totalKeys,
      staleKeys: stats.staleKeys,
      maxSize: stats.maxSize,
      evictionPolicy: stats.evictionPolicy,
      memoryUsage: `${(memory.totalMemory / 1024 / 1024).toFixed(2)} MB`,
      averageEntrySize: `${(memory.averageEntrySize / 1024).toFixed(2)} KB`,
      averageHitCount: stats.averageHitCount.toFixed(2),
      oldestEntryAge: `${(stats.oldestEntryAge / 1000 / 60).toFixed(2)} min`,
    }, 'NewsData Cache Performance');
  }

  /**
   * Monitor cache health and trigger maintenance if needed
   */
  async monitorCacheHealth(): Promise<{
    needsEviction: boolean;
    needsCleanup: boolean;
    memoryPressure: boolean;
    recommendations: string[];
  }> {
    const stats = await this.getDetailedStats();
    const memory = await this.getMemoryBreakdown();
    const recommendations: string[] = [];

    const needsEviction = stats.totalKeys >= stats.maxSize * 0.9;
    const needsCleanup = stats.staleKeys > stats.totalKeys * 0.2;
    const memoryPressure = memory.totalMemory > 50 * 1024 * 1024; // 50MB threshold

    if (needsEviction) {
      recommendations.push('Cache is near capacity, consider increasing maxSize or reducing TTL');
    }

    if (needsCleanup) {
      recommendations.push('High number of stale entries, run evictExpired()');
    }

    if (memoryPressure) {
      recommendations.push('High memory usage, consider reducing cache size or entry sizes');
    }

    if (stats.hitRate < 0.5) {
      recommendations.push('Low hit rate, consider adjusting TTL or cache key strategy');
    }

    return {
      needsEviction,
      needsCleanup,
      memoryPressure,
      recommendations,
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    // Remove key from current position
    this.removeFromAccessOrder(key);
    // Add to end (most recently used)
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Evict entries based on configured policy
   */
  private async evictEntries(count: number): Promise<void> {
    switch (this.config.evictionPolicy) {
      case 'lru':
        await this.evictLRU(count);
        break;
      case 'lfu':
        await this.evictLFU(count);
        break;
      case 'ttl':
        await this.evictByTTL(count);
        break;
    }
  }

  /**
   * Evict least recently used entries
   */
  private async evictLRU(count: number): Promise<void> {
    const toEvict = this.accessOrder.slice(0, count);
    
    for (const key of toEvict) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }

    if (toEvict.length > 0) {
      this.logger.debug(`Evicted ${toEvict.length} LRU entries`);
    }
  }

  /**
   * Evict least frequently used entries
   */
  private async evictLFU(count: number): Promise<void> {
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.hitCount - b.hitCount)
      .slice(0, count);

    for (const [key] of entries) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }

    if (entries.length > 0) {
      this.logger.debug(`Evicted ${entries.length} LFU entries`);
    }
  }

  /**
   * Evict entries with shortest remaining TTL
   */
  private async evictByTTL(count: number): Promise<void> {
    const now = Date.now();
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({
        key,
        remainingTTL: entry.ttl - (now - entry.timestamp),
      }))
      .sort((a, b) => a.remainingTTL - b.remainingTTL)
      .slice(0, count);

    for (const { key } of entries) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }

    if (entries.length > 0) {
      this.logger.debug(`Evicted ${entries.length} entries by TTL`);
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a NewsData cache manager instance with default configuration
 */
export function createNewsDataCacheManager(config?: Partial<CacheConfig>): NewsDataCacheManager {
  return new NewsDataCacheManager(config);
}

/**
 * Create cache manager with NewsData-specific TTL settings and optimizations
 */
export function createNewsDataCacheWithTTLs(): NewsDataCacheManager {
  return new NewsDataCacheManager({
    maxSize: 2000,
    defaultTTL: 15 * 60 * 1000, // 15 minutes for latest news
    staleTTL: 60 * 60 * 1000, // 1 hour for stale data
    evictionPolicy: 'lru',
    compressionThreshold: 5 * 1024, // 5KB threshold for news articles
    enableCompression: true,
    warmingEnabled: true,
    warmingBatchSize: 5,
    keyOptimization: true,
  });
}

/**
 * Create high-performance cache manager for production use
 */
export function createHighPerformanceNewsDataCache(): NewsDataCacheManager {
  return new NewsDataCacheManager({
    maxSize: 5000,
    defaultTTL: 10 * 60 * 1000, // 10 minutes for faster refresh
    staleTTL: 2 * 60 * 60 * 1000, // 2 hours for stale data
    evictionPolicy: 'lru',
    compressionThreshold: 2 * 1024, // 2KB threshold for aggressive compression
    enableCompression: true,
    warmingEnabled: true,
    warmingBatchSize: 10,
    keyOptimization: true,
  });
}