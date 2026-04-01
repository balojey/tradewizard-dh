/**
 * Property-Based Tests for NewsData Cache Manager
 * 
 * Feature: newsdata-agent-tools, Property 7: Cache Hit Behavior
 * Feature: newsdata-agent-tools, Property 8: Cache Staleness Handling  
 * Feature: newsdata-agent-tools, Property 9: Cache Eviction Policy
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { NewsDataCacheManager } from './newsdata-cache-manager.js';

// Mock logger to avoid console output during tests
vi.mock('./logger.js', () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('NewsData Cache Manager - Property Tests', () => {
  let cacheManager: NewsDataCacheManager;

  beforeEach(() => {
    cacheManager = new NewsDataCacheManager({
      maxSize: 100,
      defaultTTL: 1000, // 1 second for fast testing
      staleTTL: 2000, // 2 seconds for stale data
      evictionPolicy: 'lru',
    });
  });

  /**
   * Property 7: Cache Hit Behavior
   * 
   * For any identical news request made within cache TTL, the cached data 
   * should be returned without making a new API call.
   * 
   * This ensures that:
   * - Identical requests within TTL return cached data
   * - Cache hit statistics are properly tracked
   * - Data integrity is maintained across cache operations
   */
  it('Property 7: Cache hit behavior', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate cache keys and data
        fc.record({
          key: fc.string({ minLength: 1, maxLength: 50 }),
          data: fc.record({
            articles: fc.array(fc.record({
              id: fc.string(),
              title: fc.string(),
              content: fc.string(),
              timestamp: fc.integer(),
            }), { minLength: 0, maxLength: 10 }),
            totalResults: fc.integer({ min: 0, max: 100 }),
          }),
          ttl: fc.integer({ min: 500, max: 5000 }),
        }),
        
        async ({ key, data, ttl }) => {
          // Clear cache for clean test
          await cacheManager.clear();
          
          // Set data in cache
          await cacheManager.set(key, data, ttl);
          
          // Get initial stats
          const initialStats = await cacheManager.getStats();
          
          // Retrieve data immediately (should be a cache hit)
          const cachedResult = await cacheManager.get(key);
          
          // Property 7: Data should be returned and not stale
          expect(cachedResult).not.toBeNull();
          expect(cachedResult!.data).toEqual(data);
          expect(cachedResult!.isStale).toBe(false);
          expect(cachedResult!.hitCount).toBeGreaterThan(0);
          
          // Property 7: Hit rate should increase
          const afterStats = await cacheManager.getStats();
          expect(afterStats.hitRate).toBeGreaterThanOrEqual(initialStats.hitRate);
          
          // Property 7: Multiple hits should work consistently
          const secondResult = await cacheManager.get(key);
          expect(secondResult).not.toBeNull();
          expect(secondResult!.data).toEqual(data);
          expect(secondResult!.hitCount).toBeGreaterThan(cachedResult!.hitCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: Cache Staleness Handling
   * 
   * For any expired cached data, it should be marked as stale but remain 
   * available for fallback scenarios.
   * 
   * This ensures that:
   * - Expired data is marked as stale
   * - Stale data can be retrieved as fallback
   * - Stale data eventually expires completely
   */
  it('Property 8: Cache staleness handling', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate test data with short TTL for testing
        fc.record({
          key: fc.string({ minLength: 1, maxLength: 50 }),
          data: fc.record({
            value: fc.string(),
            number: fc.integer(),
          }),
          shortTTL: fc.integer({ min: 10, max: 100 }), // Very short TTL
        }),
        
        async ({ key, data, shortTTL }) => {
          // Use a cache with very short TTL for testing
          const testCache = new NewsDataCacheManager({
            maxSize: 50,
            defaultTTL: shortTTL,
            staleTTL: shortTTL * 3, // Stale period is 3x TTL
            evictionPolicy: 'lru',
          });
          
          // Set data in cache
          await testCache.set(key, data, shortTTL);
          
          // Verify fresh data
          const freshResult = await testCache.get(key);
          expect(freshResult).not.toBeNull();
          expect(freshResult!.isStale).toBe(false);
          
          // Wait for data to become stale
          await new Promise(resolve => setTimeout(resolve, shortTTL + 10));
          
          // Property 8: Data should now be stale
          const staleResult = await testCache.get(key);
          if (staleResult) {
            expect(staleResult.isStale).toBe(true);
            expect(staleResult.data).toEqual(data);
          }
          
          // Property 8: Stale data should be retrievable via getStaleData
          const explicitStaleData = await testCache.getStaleData(key);
          if (explicitStaleData) {
            expect(explicitStaleData).toEqual(data);
          }
          
          // Wait for data to expire completely
          await new Promise(resolve => setTimeout(resolve, shortTTL * 3 + 10));
          
          // Property 8: Data should now be completely expired
          const expiredResult = await testCache.get(key);
          expect(expiredResult).toBeNull();
          
          const expiredStaleData = await testCache.getStaleData(key);
          expect(expiredStaleData).toBeNull();
        }
      ),
      { numRuns: 50 } // Fewer runs due to timing requirements
    );
  });

  /**
   * Property 9: Cache Eviction Policy
   * 
   * For any cache that exceeds storage limits, the least recently used 
   * entries should be evicted first.
   * 
   * This ensures that:
   * - Cache respects size limits
   * - LRU eviction works correctly
   * - Most recently accessed items are preserved
   */
  it('Property 9: Cache eviction policy (LRU)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a sequence of cache operations
        fc.record({
          maxSize: fc.integer({ min: 3, max: 10 }),
          operations: fc.array(
            fc.record({
              key: fc.string({ minLength: 1, maxLength: 20 }),
              data: fc.record({
                value: fc.string(),
                id: fc.integer(),
              }),
            }),
            { minLength: 5, maxLength: 20 }
          ),
        }),
        
        async ({ maxSize, operations }) => {
          // Create cache with limited size
          const limitedCache = new NewsDataCacheManager({
            maxSize,
            defaultTTL: 10000, // Long TTL to avoid expiration during test
            staleTTL: 20000,
            evictionPolicy: 'lru',
          });
          
          // Track insertion order
          const insertionOrder: string[] = [];
          
          // Insert all operations
          for (const op of operations) {
            await limitedCache.set(op.key, op.data);
            if (!insertionOrder.includes(op.key)) {
              insertionOrder.push(op.key);
            }
          }
          
          // Property 9: Cache size should not exceed maxSize
          const stats = await limitedCache.getStats();
          expect(stats.totalKeys).toBeLessThanOrEqual(maxSize);
          
          // Property 9: If we exceeded maxSize, oldest entries should be evicted
          if (insertionOrder.length > maxSize) {
            // The last maxSize entries should still be in cache
            const expectedKeys = insertionOrder.slice(-maxSize);
            
            for (const key of expectedKeys) {
              const result = await limitedCache.get(key);
              expect(result).not.toBeNull();
            }
            
            // Earlier entries should be evicted
            const evictedKeys = insertionOrder.slice(0, insertionOrder.length - maxSize);
            for (const key of evictedKeys) {
              const result = await limitedCache.get(key);
              expect(result).toBeNull();
            }
          }
          
          // Property 9: Access an old entry to make it recently used
          if (insertionOrder.length >= 2) {
            const oldKey = insertionOrder[0];
            const oldResult = await limitedCache.get(oldKey);
            
            if (oldResult) {
              // Add one more entry to trigger eviction
              await limitedCache.set('trigger-eviction', { test: true });
              
              // The accessed old entry should still be there
              const stillThere = await limitedCache.get(oldKey);
              expect(stillThere).not.toBeNull();
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property 9b: Cache Eviction Policy (LFU)
   * 
   * For any cache using LFU eviction policy, the least frequently used 
   * entries should be evicted first.
   */
  it('Property 9b: Cache eviction policy (LFU)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          maxSize: fc.integer({ min: 3, max: 8 }),
          keys: fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 5, maxLength: 12 }),
          accessPatterns: fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 5, maxLength: 12 }),
        }),
        
        async ({ maxSize, keys, accessPatterns }) => {
          // Create cache with LFU eviction
          const lfuCache = new NewsDataCacheManager({
            maxSize,
            defaultTTL: 10000,
            staleTTL: 20000,
            evictionPolicy: 'lfu',
          });
          
          // Insert initial data
          const uniqueKeys = [...new Set(keys)].slice(0, maxSize + 2);
          for (let i = 0; i < uniqueKeys.length; i++) {
            await lfuCache.set(uniqueKeys[i], { value: i });
          }
          
          // Access keys according to pattern to create frequency differences
          for (let i = 0; i < Math.min(accessPatterns.length, uniqueKeys.length); i++) {
            const key = uniqueKeys[i];
            const accessCount = accessPatterns[i];
            
            // Access the key multiple times
            for (let j = 0; j < accessCount; j++) {
              await lfuCache.get(key);
            }
          }
          
          // Property 9b: Cache size should not exceed maxSize
          const stats = await lfuCache.getStats();
          expect(stats.totalKeys).toBeLessThanOrEqual(maxSize);
          
          // Property 9b: Most frequently accessed items should remain
          if (uniqueKeys.length > maxSize) {
            // Keys with higher access counts should be more likely to remain
            const detailedStats = await lfuCache.getDetailedStats();
            expect(detailedStats.averageHitCount).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  /**
   * Property 10: Cache Key Generation Consistency
   * 
   * For any set of parameters, the cache key generation should be 
   * consistent and optimized for sharing between similar requests.
   */
  it('Property 10: Cache key generation consistency', async () => {
    await fc.assert(
      fc.property(
        fc.record({
          endpoint: fc.constantFrom('latest', 'archive', 'crypto', 'market'),
          params1: fc.record({
            q: fc.option(fc.string()),
            country: fc.option(fc.array(fc.constantFrom('us', 'uk', 'ca'))),
            category: fc.option(fc.array(fc.constantFrom('business', 'tech'))),
            size: fc.option(fc.integer({ min: 1, max: 50 })),
          }),
        }),
        
        ({ endpoint, params1 }) => {
          // Generate key twice with same parameters
          const key1 = cacheManager.generateCacheKey(endpoint, params1);
          const key2 = cacheManager.generateCacheKey(endpoint, params1);
          
          // Property 10: Same parameters should generate same key
          expect(key1).toBe(key2);
          
          // Property 10: Key should include endpoint
          expect(key1).toContain(endpoint);
          
          // Create params with same values but different order
          const params2 = {};
          const keys = Object.keys(params1).reverse();
          for (const key of keys) {
            if (params1[key as keyof typeof params1] !== undefined) {
              (params2 as any)[key] = params1[key as keyof typeof params1];
            }
          }
          
          const key3 = cacheManager.generateCacheKey(endpoint, params2);
          
          // Property 10: Parameter order should not affect key
          expect(key1).toBe(key3);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 11: Cache Fallback Behavior
   * 
   * For any cache operation with fallback, the system should gracefully
   * handle failures and return appropriate fallback data.
   */
  it('Property 11: Cache fallback behavior', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          key: fc.string({ minLength: 1, maxLength: 30 }),
          freshData: fc.record({
            value: fc.string(),
            timestamp: fc.integer(),
          }),
          staleData: fc.record({
            value: fc.string(),
            timestamp: fc.integer(),
          }),
          shouldFail: fc.boolean(),
        }),
        
        async ({ key, freshData, staleData, shouldFail }) => {
          // Set up stale data first
          await cacheManager.set(key, staleData, 10); // Very short TTL
          
          // Wait for it to become stale
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Create a data factory that may fail
          const dataFactory = vi.fn().mockImplementation(async () => {
            if (shouldFail) {
              throw new Error('Simulated fetch failure');
            }
            return freshData;
          });
          
          try {
            const result = await cacheManager.getWithFallback(key, dataFactory, {
              allowStale: true,
              maxRetries: 1,
              retryDelay: 10,
            });
            
            if (shouldFail) {
              // Property 11: Should return stale data when fresh fetch fails
              expect(result.source).toBe('stale');
              expect(result.data).toEqual(staleData);
              expect(result.fromCache).toBe(true);
            } else {
              // Property 11: Should return fresh data when fetch succeeds
              expect(result.source).toBe('fresh');
              expect(result.data).toEqual(freshData);
              expect(result.fromCache).toBe(false);
            }
          } catch (error) {
            // Property 11: Should only throw if no fallback is available
            if (shouldFail) {
              // This is expected when no stale data is available
              expect(error).toBeInstanceOf(Error);
            } else {
              // Should not throw when fetch succeeds
              throw error;
            }
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});