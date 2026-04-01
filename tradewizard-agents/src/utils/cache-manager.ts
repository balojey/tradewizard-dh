/**
 * Cache Manager
 *
 * Provides caching functionality to minimize redundant API calls and database queries.
 *
 * Requirements: 12.2, 12.4
 */

// ============================================================================
// Types
// ============================================================================

export interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

// ============================================================================
// Cache Manager Class
// ============================================================================

export class CacheManager<T = any> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private hits: number = 0;
  private misses: number = 0;
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 1000, defaultTTLMs: number = 5 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLMs;
  }

  /**
   * Get value from cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.hits++;
    return entry.value;
  }

  /**
   * Set value in cache
   */
  set(key: string, value: T, ttl?: number): void {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
    });
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate,
    };
  }

  /**
   * Get or set value with factory function
   */
  async getOrSet(key: string, factory: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.get(key);

    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    this.set(key, value, ttl);
    return value;
  }

  /**
   * Evict expired entries
   */
  evictExpired(): number {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }

    return evicted;
  }

  /**
   * Evict oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Log cache statistics
   */
  logStats(): void {
    const stats = this.getStats();

    console.log('[CacheManager] Statistics:');
    console.log(`  Hits: ${stats.hits}`);
    console.log(`  Misses: ${stats.misses}`);
    console.log(`  Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
    console.log(`  Size: ${stats.size}/${this.maxSize}`);
  }
}

// ============================================================================
// Multi-Level Cache
// ============================================================================

export class MultiLevelCache<T = any> {
  private l1Cache: CacheManager<T>; // Fast, small cache
  private l2Cache: CacheManager<T>; // Slower, larger cache

  constructor(
    l1MaxSize: number = 100,
    l1TTL: number = 1 * 60 * 1000, // 1 minute
    l2MaxSize: number = 1000,
    l2TTL: number = 15 * 60 * 1000 // 15 minutes
  ) {
    this.l1Cache = new CacheManager<T>(l1MaxSize, l1TTL);
    this.l2Cache = new CacheManager<T>(l2MaxSize, l2TTL);
  }

  /**
   * Get value from cache (checks L1 then L2)
   */
  get(key: string): T | null {
    // Check L1 first
    const l1Value = this.l1Cache.get(key);
    if (l1Value !== null) {
      return l1Value;
    }

    // Check L2
    const l2Value = this.l2Cache.get(key);
    if (l2Value !== null) {
      // Promote to L1
      this.l1Cache.set(key, l2Value);
      return l2Value;
    }

    return null;
  }

  /**
   * Set value in cache (sets in both L1 and L2)
   */
  set(key: string, value: T): void {
    this.l1Cache.set(key, value);
    this.l2Cache.set(key, value);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.l1Cache.clear();
    this.l2Cache.clear();
  }

  /**
   * Get combined statistics
   */
  getStats(): { l1: CacheStats; l2: CacheStats } {
    return {
      l1: this.l1Cache.getStats(),
      l2: this.l2Cache.getStats(),
    };
  }

  /**
   * Log statistics
   */
  logStats(): void {
    const stats = this.getStats();

    console.log('[MultiLevelCache] Statistics:');
    console.log('  L1 Cache:');
    console.log(`    Hits: ${stats.l1.hits}`);
    console.log(`    Misses: ${stats.l1.misses}`);
    console.log(`    Hit Rate: ${(stats.l1.hitRate * 100).toFixed(2)}%`);
    console.log(`    Size: ${stats.l1.size}`);
    console.log('  L2 Cache:');
    console.log(`    Hits: ${stats.l2.hits}`);
    console.log(`    Misses: ${stats.l2.misses}`);
    console.log(`    Hit Rate: ${(stats.l2.hitRate * 100).toFixed(2)}%`);
    console.log(`    Size: ${stats.l2.size}`);
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a cache manager instance
 */
export function createCacheManager<T = any>(
  maxSize?: number,
  defaultTTLMs?: number
): CacheManager<T> {
  return new CacheManager<T>(maxSize, defaultTTLMs);
}

/**
 * Create a multi-level cache instance
 */
export function createMultiLevelCache<T = any>(
  l1MaxSize?: number,
  l1TTL?: number,
  l2MaxSize?: number,
  l2TTL?: number
): MultiLevelCache<T> {
  return new MultiLevelCache<T>(l1MaxSize, l1TTL, l2MaxSize, l2TTL);
}
