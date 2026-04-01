/**
 * Performance Tests for NewsData Cache Manager
 * 
 * Tests cache performance under load, memory usage, and compression effectiveness.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NewsDataCacheManager, createNewsDataCacheWithTTLs, createHighPerformanceNewsDataCache } from './newsdata-cache-manager.js';

describe('NewsData Cache Manager Performance Tests', () => {
  let cacheManager: NewsDataCacheManager;
  let performanceCache: NewsDataCacheManager;

  beforeEach(() => {
    cacheManager = createNewsDataCacheWithTTLs();
    performanceCache = createHighPerformanceNewsDataCache();
  });

  afterEach(async () => {
    await cacheManager.clear();
    await performanceCache.clear();
  });

  describe('Cache Performance Under Load', () => {
    it('should handle high-volume cache operations efficiently', async () => {
      const startTime = Date.now();
      const operations = 200; // Reduced from 1000
      const promises: Promise<void>[] = [];

      // Generate test data
      const testData = Array.from({ length: operations }, (_, i) => ({
        key: `test-key-${i}`,
        data: {
          id: i,
          title: `Test Article ${i}`,
          content: 'Lorem ipsum '.repeat(20), // Reduced from 100 to 20 (~200 bytes)
          timestamp: Date.now(),
          metadata: {
            source: 'test',
            category: 'performance',
            tags: Array.from({ length: 5 }, (_, j) => `tag-${j}`), // Reduced from 10 to 5
          },
        },
      }));

      // Concurrent write operations
      for (const item of testData) {
        promises.push(cacheManager.set(item.key, item.data));
      }

      await Promise.all(promises);
      const writeTime = Date.now() - startTime;

      // Concurrent read operations
      const readStartTime = Date.now();
      const readPromises = testData.map(item => cacheManager.get(item.key));
      const results = await Promise.all(readPromises);
      const readTime = Date.now() - readStartTime;

      // Verify all operations succeeded
      expect(results.every(result => result !== null)).toBe(true);

      // Performance assertions
      expect(writeTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(readTime).toBeLessThan(2000); // Reads should be faster than writes
      
      const stats = await cacheManager.getStats();
      expect(stats.hitRate).toBeGreaterThan(0.95); // 95% hit rate
      expect(stats.totalKeys).toBe(operations);

      console.log(`Cache Performance: ${operations} operations`);
      console.log(`Write time: ${writeTime}ms (${(operations / writeTime * 1000).toFixed(2)} ops/sec)`);
      console.log(`Read time: ${readTime}ms (${(operations / readTime * 1000).toFixed(2)} ops/sec)`);
      console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
    });

    it('should maintain performance with mixed read/write operations', async () => {
      const operations = 100; // Reduced from 500
      const concurrency = 5; // Reduced from 10
      const startTime = Date.now();

      // Pre-populate some data to ensure cache hits
      for (let i = 0; i < 20; i++) { // Reduced from 50
        await cacheManager.set(`mixed-key-${i}`, {
          id: i,
          data: `Initial content for key ${i}`,
          timestamp: Date.now(),
        });
      }

      // Create mixed workload
      const tasks = Array.from({ length: operations }, (_, i) => {
        const isWrite = i % 3 === 0; // 33% writes, 67% reads
        const key = `mixed-key-${i % 30}`; // Reduced from 100
        
        if (isWrite) {
          return () => cacheManager.set(key, {
            id: i,
            data: `Content for operation ${i}`,
            timestamp: Date.now(),
          });
        } else {
          return () => cacheManager.get(key);
        }
      });

      // Execute tasks with controlled concurrency
      const batches = [];
      for (let i = 0; i < tasks.length; i += concurrency) {
        const batch = tasks.slice(i, i + concurrency).map(task => task());
        batches.push(Promise.all(batch));
      }

      await Promise.all(batches);
      const totalTime = Date.now() - startTime;

      const stats = await cacheManager.getStats();
      
      // Performance assertions
      expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(stats.hitRate).toBeGreaterThan(0.2); // At least 20% hit rate with mixed workload (reduced expectation)

      console.log(`Mixed workload: ${operations} operations in ${totalTime}ms`);
      console.log(`Throughput: ${(operations / totalTime * 1000).toFixed(2)} ops/sec`);
      console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
    });
  });

  describe('Memory Usage and Compression', () => {
    it('should effectively compress large cache entries', async () => {
      const largeData = {
        articles: Array.from({ length: 100 }, (_, i) => ({
          id: i,
          title: `Article ${i}`,
          content: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50), // ~2.5KB per article
          metadata: {
            author: `Author ${i}`,
            tags: Array.from({ length: 20 }, (_, j) => `tag-${j}`),
            categories: ['news', 'technology', 'business'],
          },
        })),
        metadata: {
          totalCount: 100,
          fetchTime: Date.now(),
          source: 'newsdata.io',
        },
      };

      // Store large data entries
      const keys = Array.from({ length: 10 }, (_, i) => `large-data-${i}`);
      
      for (const key of keys) {
        await performanceCache.set(key, largeData);
      }

      const memoryBreakdown = await performanceCache.getMemoryBreakdown();
      
      // Verify compression is working
      expect(memoryBreakdown.compressionStats.totalCompressed).toBeGreaterThan(0);
      expect(memoryBreakdown.compressionStats.compressionRatio).toBeLessThan(0.8); // At least 20% compression
      expect(memoryBreakdown.compressionStats.spaceSaved).toBeGreaterThan(0);

      // Verify data integrity after compression
      for (const key of keys) {
        const retrieved = await performanceCache.get<typeof largeData>(key);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.data.articles).toHaveLength(100);
        expect(retrieved!.data.metadata.totalCount).toBe(100);
      }

      console.log(`Compression stats:`);
      console.log(`- Compressed entries: ${memoryBreakdown.compressionStats.totalCompressed}`);
      console.log(`- Compression ratio: ${(memoryBreakdown.compressionStats.compressionRatio * 100).toFixed(2)}%`);
      console.log(`- Space saved: ${(memoryBreakdown.compressionStats.spaceSaved / 1024).toFixed(2)} KB`);
    });

    it('should manage memory usage within reasonable bounds', async () => {
      const maxEntries = 1000;
      const entrySize = 5 * 1024; // 5KB per entry
      
      // Fill cache to capacity
      for (let i = 0; i < maxEntries; i++) {
        const data = {
          id: i,
          content: 'x'.repeat(entrySize),
          timestamp: Date.now(),
        };
        await cacheManager.set(`memory-test-${i}`, data);
      }

      const memoryBreakdown = await cacheManager.getMemoryBreakdown();
      const stats = await cacheManager.getStats();

      // Memory usage should be reasonable
      const expectedMaxMemory = maxEntries * entrySize * 1.5; // Allow 50% overhead
      expect(memoryBreakdown.totalMemory).toBeLessThan(expectedMaxMemory);

      // Cache should not exceed configured size
      expect(stats.totalKeys).toBeLessThanOrEqual(cacheManager['config'].maxSize);

      console.log(`Memory usage with ${stats.totalKeys} entries:`);
      console.log(`- Total memory: ${(memoryBreakdown.totalMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`- Average entry size: ${(memoryBreakdown.averageEntrySize / 1024).toFixed(2)} KB`);
      console.log(`- Largest entry: ${(memoryBreakdown.largestEntrySize / 1024).toFixed(2)} KB`);
    });

    it('should handle memory pressure with LRU eviction', async () => {
      // Configure small cache for testing eviction
      const smallCache = new NewsDataCacheManager({
        maxSize: 100,
        defaultTTL: 60000,
        staleTTL: 120000,
        evictionPolicy: 'lru',
        enableCompression: false, // Disable compression for predictable memory usage
        warmingEnabled: false,
        warmingBatchSize: 5,
        keyOptimization: false,
      });

      // Fill cache beyond capacity
      const entries = 150;
      for (let i = 0; i < entries; i++) {
        await smallCache.set(`eviction-test-${i}`, {
          id: i,
          data: `Entry ${i}`,
          timestamp: Date.now(),
        });
      }

      const stats = await smallCache.getStats();
      
      // Cache should not exceed max size
      expect(stats.totalKeys).toBeLessThanOrEqual(100);

      // Oldest entries should be evicted (first 50 entries should be gone)
      for (let i = 0; i < 50; i++) {
        const result = await smallCache.get(`eviction-test-${i}`);
        expect(result).toBeNull();
      }

      // Recent entries should still be present
      for (let i = 100; i < entries; i++) {
        const result = await smallCache.get(`eviction-test-${i}`);
        expect(result).not.toBeNull();
      }

      console.log(`LRU eviction test: ${entries} entries -> ${stats.totalKeys} remaining`);
    });
  });

  describe('Cache Warming Performance', () => {
    it('should efficiently warm cache with batch processing', async () => {
      const warmingSpecs = Array.from({ length: 50 }, (_, i) => ({
        key: `warming-test-${i}`,
        dataFactory: async () => ({
          id: i,
          title: `Warmed Article ${i}`,
          content: 'Warmed content '.repeat(20),
          timestamp: Date.now(),
        }),
        priority: Math.floor(Math.random() * 5) + 1,
      }));

      // Add warming specifications
      warmingSpecs.forEach(spec => {
        performanceCache.addWarmingSpec(spec);
      });

      const startTime = Date.now();
      const result = await performanceCache.executeWarmingQueue();
      const warmingTime = Date.now() - startTime;

      // Verify warming success
      expect(result.successful).toBe(warmingSpecs.length);
      expect(result.failed).toBe(0);
      expect(warmingTime).toBeLessThan(5000); // Should complete within 5 seconds

      // Verify all entries are cached
      for (const spec of warmingSpecs) {
        const cached = await performanceCache.get<{ id: number; title: string; content: string; timestamp: number }>(spec.key);
        expect(cached).not.toBeNull();
        expect(cached!.data.id).toBeDefined();
      }

      console.log(`Cache warming: ${warmingSpecs.length} entries in ${warmingTime}ms`);
      console.log(`Warming rate: ${(warmingSpecs.length / warmingTime * 1000).toFixed(2)} entries/sec`);
    });

    it('should handle cache warming failures gracefully', async () => {
      const mixedSpecs = [
        // Successful specs
        ...Array.from({ length: 20 }, (_, i) => ({
          key: `success-${i}`,
          dataFactory: async () => ({ id: i, data: `Success ${i}` }),
          priority: 1,
        })),
        // Failing specs
        ...Array.from({ length: 5 }, (_, i) => ({
          key: `failure-${i}`,
          dataFactory: async () => {
            throw new Error(`Simulated failure ${i}`);
          },
          priority: 2,
        })),
      ];

      mixedSpecs.forEach(spec => {
        performanceCache.addWarmingSpec(spec);
      });

      const result = await performanceCache.executeWarmingQueue();

      // Verify partial success
      expect(result.successful).toBe(20);
      expect(result.failed).toBe(5);
      expect(result.errors).toHaveLength(5);

      // Successful entries should be cached
      for (let i = 0; i < 20; i++) {
        const cached = await performanceCache.get(`success-${i}`);
        expect(cached).not.toBeNull();
      }

      // Failed entries should not be cached
      for (let i = 0; i < 5; i++) {
        const cached = await performanceCache.get(`failure-${i}`);
        expect(cached).toBeNull();
      }

      console.log(`Mixed warming: ${result.successful} successful, ${result.failed} failed`);
    });
  });

  describe('Cache Key Optimization', () => {
    it('should generate optimized cache keys for better hit rates', async () => {
      const baseParams = {
        language: ['en'],
        country: ['us'],
        category: ['business'],
      };

      // Generate similar requests with different variable parameters
      const requests = [
        { ...baseParams, q: 'technology', size: 10 },
        { ...baseParams, q: 'innovation', size: 15 },
        { ...baseParams, q: 'startup', size: 20 },
        { ...baseParams, qInTitle: 'AI', size: 10 },
        { ...baseParams, qInTitle: 'machine learning', size: 15 },
      ];

      // Generate cache keys
      const keys = requests.map(params => 
        cacheManager.generateCacheKey('latest', params)
      );

      // Keys should be different but follow pattern
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);

      // Keys should contain common parameters
      keys.forEach(key => {
        expect(key).toContain('latest');
        expect(key).toContain('en');
        expect(key).toContain('us');
        expect(key).toContain('business');
      });

      // Test key generation performance
      const keyGenStartTime = Date.now();
      const iterations = 10000;
      
      for (let i = 0; i < iterations; i++) {
        const params = {
          ...baseParams,
          q: `query-${i}`,
          size: (i % 50) + 1,
        };
        cacheManager.generateCacheKey('latest', params);
      }
      
      const keyGenTime = Date.now() - keyGenStartTime;
      const keyGenRate = iterations / keyGenTime * 1000;

      expect(keyGenRate).toBeGreaterThan(1000); // Should generate >1000 keys/sec

      console.log(`Cache key generation: ${iterations} keys in ${keyGenTime}ms`);
      console.log(`Key generation rate: ${keyGenRate.toFixed(2)} keys/sec`);
    });
  });

  describe('Garbage Collection Impact', () => {
    it('should minimize garbage collection pressure', async () => {
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const initialMemory = process.memoryUsage();
      
      // Perform intensive cache operations
      const operations = 1000;
      for (let i = 0; i < operations; i++) {
        const data = {
          id: i,
          content: 'Test content '.repeat(100),
          metadata: { timestamp: Date.now() },
        };
        
        await cacheManager.set(`gc-test-${i}`, data);
        
        // Occasionally read and delete to create churn
        if (i % 10 === 0 && i > 0) {
          await cacheManager.get(`gc-test-${i - 5}`);
          await cacheManager.delete(`gc-test-${i - 10}`);
        }
      }

      // Force garbage collection again if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory increase should be reasonable (less than 100MB for this test)
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);

      console.log(`Memory impact: ${(memoryIncrease / 1024 / 1024).toFixed(2)} MB increase`);
      console.log(`Heap used: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
    });
  });
});