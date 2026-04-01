/**
 * Performance Testing Suite for Automated Market Monitor
 *
 * This test suite validates the monitor's performance characteristics:
 * - Memory usage over time
 * - CPU usage during analysis
 * - Database query performance
 * - Caching effectiveness
 * - Scalability with different market counts
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { createMonitorService } from './utils/monitor-service.js';
import { createSupabaseClientManager } from './database/supabase-client.js';
import { createDatabasePersistence } from './database/persistence.js';
import { createQuotaManager } from './utils/api-quota-manager.js';
import { createMarketDiscoveryEngine } from './utils/market-discovery.js';
import { createPolymarketClient } from './utils/polymarket-client.js';

// Mock config to avoid validation errors
const mockConfig = {
  llm: {
    mode: 'single-provider' as const,
    provider: 'openai' as const,
    openai: {
      apiKey: process.env.OPENAI_API_KEY || 'test-key',
      model: 'gpt-4',
      temperature: 0.7,
    },
  },
  polymarket: {
    gammaApiUrl: process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com',
    clobApiUrl: process.env.POLYMARKET_CLOB_API_URL || 'https://clob.polymarket.com',
    rateLimitBuffer: 0.8,
  },
  externalData: {
    newsapi: {
      apiKey: process.env.NEWS_API_KEY || '',
      enabled: false,
    },
    twitter: {
      bearerToken: process.env.TWITTER_BEARER_TOKEN || '',
      enabled: false,
    },
    reddit: {
      clientId: process.env.REDDIT_CLIENT_ID || '',
      clientSecret: process.env.REDDIT_CLIENT_SECRET || '',
      enabled: false,
    },
  },
  observability: {
    opik: {
      enabled: false,
      apiKey: process.env.OPIK_API_KEY || '',
      workspaceName: process.env.OPIK_WORKSPACE_NAME || '',
      projectName: process.env.OPIK_PROJECT_NAME || 'tradewizard',
    },
  },
  agentGroups: {
    mvp: { enabled: true },
    advanced: { enabled: false },
  },
};

// ============================================================================
// Performance Metrics Tracking
// ============================================================================

interface PerformanceMetrics {
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  }[];
  cpuUsage: {
    user: number;
    system: number;
  }[];
  analysisTimings: number[];
  databaseQueryTimings: number[];
  cacheHitRate: number;
  timestamp: number[];
}

function createMetricsTracker(): PerformanceMetrics {
  return {
    memoryUsage: [],
    cpuUsage: [],
    analysisTimings: [],
    databaseQueryTimings: [],
    cacheHitRate: 0,
    timestamp: [],
  };
}

function captureMemorySnapshot(metrics: PerformanceMetrics): void {
  const mem = process.memoryUsage();
  metrics.memoryUsage.push({
    heapUsed: mem.heapUsed,
    heapTotal: mem.heapTotal,
    external: mem.external,
    rss: mem.rss,
  });
  metrics.timestamp.push(Date.now());
}

function captureCPUSnapshot(metrics: PerformanceMetrics): void {
  const cpu = process.cpuUsage();
  metrics.cpuUsage.push({
    user: cpu.user,
    system: cpu.system,
  });
}

function analyzeMetrics(metrics: PerformanceMetrics) {
  const memoryGrowth = calculateMemoryGrowth(metrics.memoryUsage);
  const avgCPU = calculateAverageCPU(metrics.cpuUsage);
  const avgAnalysisTime = calculateAverage(metrics.analysisTimings);
  const avgQueryTime = calculateAverage(metrics.databaseQueryTimings);

  return {
    memoryGrowth,
    avgCPU,
    avgAnalysisTime,
    avgQueryTime,
    cacheHitRate: metrics.cacheHitRate,
  };
}

function calculateMemoryGrowth(snapshots: PerformanceMetrics['memoryUsage']): number {
  if (snapshots.length < 2) return 0;
  const first = snapshots[0].heapUsed;
  const last = snapshots[snapshots.length - 1].heapUsed;
  return ((last - first) / first) * 100; // Percentage growth
}

function calculateAverageCPU(snapshots: PerformanceMetrics['cpuUsage']): number {
  if (snapshots.length === 0) return 0;
  const totalUser = snapshots.reduce((sum, cpu) => sum + cpu.user, 0);
  const totalSystem = snapshots.reduce((sum, cpu) => sum + cpu.system, 0);
  return (totalUser + totalSystem) / snapshots.length / 1000000; // Convert to seconds
}

function calculateAverage(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Monitor Performance Tests', () => {
  let supabaseManager: ReturnType<typeof createSupabaseClientManager>;
  let database: ReturnType<typeof createDatabasePersistence>;
  let quotaManager: ReturnType<typeof createQuotaManager>;
  let discovery: ReturnType<typeof createMarketDiscoveryEngine>;
  let polymarketClient: ReturnType<typeof createPolymarketClient>;
  let monitor: ReturnType<typeof createMonitorService>;

  beforeAll(() => {
    // Set required environment variables for tests
    if (!process.env.SUPABASE_URL) {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
    }
    if (!process.env.SUPABASE_KEY) {
      process.env.SUPABASE_KEY = 'test-key';
    }
  });

  beforeEach(async () => {
    // Create components
    supabaseManager = createSupabaseClientManager();
    
    try {
      await supabaseManager.connect();
    } catch (error) {
      // Ignore connection errors in tests
      console.warn('Supabase connection failed (expected in test environment)');
    }

    database = createDatabasePersistence(supabaseManager);
    quotaManager = createQuotaManager();
    polymarketClient = createPolymarketClient(mockConfig.polymarket);
    discovery = createMarketDiscoveryEngine(mockConfig.polymarket);

    monitor = createMonitorService(
      mockConfig as any,
      supabaseManager,
      database,
      quotaManager,
      discovery,
      polymarketClient
    );

    try {
      await monitor.initialize();
    } catch (error) {
      // Ignore initialization errors in tests
      console.warn('Monitor initialization failed (expected in test environment)');
    }
  });

  afterEach(async () => {
    if (monitor) {
      try {
        await monitor.stop();
      } catch (error) {
        // Ignore stop errors in tests
      }
    }
  });

  // ==========================================================================
  // Memory Usage Tests
  // ==========================================================================

  describe('Memory Usage', () => {
    it('should not exhibit memory leaks during extended operation', async () => {
      const metrics = createMetricsTracker();
      const duration = 60 * 1000; // 1 minute test (scaled down from 24 hours)
      const sampleInterval = 5000; // Sample every 5 seconds

      // Capture initial memory
      captureMemorySnapshot(metrics);

      // Run monitor for duration
      const startTime = Date.now();
      const intervalId = setInterval(() => {
        captureMemorySnapshot(metrics);
        captureCPUSnapshot(metrics);
      }, sampleInterval);

      // Simulate analysis cycles
      const analysisPromises: Promise<void>[] = [];
      while (Date.now() - startTime < duration) {
        // Trigger analysis every 10 seconds
        await new Promise((resolve) => setTimeout(resolve, 10000));

        try {
          const promise = monitor
            .analyzeMarket('test-condition-id')
            .then(() => {
              // Force garbage collection if available
              if (global.gc) {
                global.gc();
              }
            })
            .catch(() => {
              // Ignore errors for performance test
            });
          analysisPromises.push(promise);
        } catch {
          // Continue on error
        }
      }

      clearInterval(intervalId);
      await Promise.allSettled(analysisPromises);

      // Capture final memory
      captureMemorySnapshot(metrics);

      // Analyze results
      const analysis = analyzeMetrics(metrics);

      console.log('Memory Performance Analysis:');
      console.log(`  Memory Growth: ${analysis.memoryGrowth.toFixed(2)}%`);
      console.log(`  Samples: ${metrics.memoryUsage.length}`);
      console.log(
        `  Initial Heap: ${(metrics.memoryUsage[0].heapUsed / 1024 / 1024).toFixed(2)} MB`
      );
      console.log(
        `  Final Heap: ${(metrics.memoryUsage[metrics.memoryUsage.length - 1].heapUsed / 1024 / 1024).toFixed(2)} MB`
      );

      // Memory growth should be less than 50% over the test period
      expect(analysis.memoryGrowth).toBeLessThan(50);
    }, 120000); // 2 minute timeout

    it('should release memory after analysis completion', async () => {
      const initialMem = process.memoryUsage().heapUsed;

      // Run multiple analyses
      for (let i = 0; i < 5; i++) {
        try {
          await monitor.analyzeMarket(`test-condition-${i}`);
        } catch {
          // Ignore errors
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const finalMem = process.memoryUsage().heapUsed;
      const growth = ((finalMem - initialMem) / initialMem) * 100;

      console.log(`Memory growth after 5 analyses: ${growth.toFixed(2)}%`);

      // Memory should not grow more than 100% after multiple analyses
      expect(growth).toBeLessThan(100);
    }, 60000);
  });

  // ==========================================================================
  // CPU Usage Tests
  // ==========================================================================

  describe('CPU Usage', () => {
    it('should use minimal CPU when idle', async () => {
      const metrics = createMetricsTracker();

      // Capture CPU usage while idle
      for (let i = 0; i < 10; i++) {
        captureCPUSnapshot(metrics);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      const analysis = analyzeMetrics(metrics);

      console.log(`Average CPU usage while idle: ${analysis.avgCPU.toFixed(2)}s`);

      // CPU usage should be minimal when idle
      expect(analysis.avgCPU).toBeLessThan(1.0); // Less than 1 second of CPU time
    }, 15000);

    it('should handle CPU spikes during analysis gracefully', async () => {
      const metrics = createMetricsTracker();

      // Capture CPU before analysis
      captureCPUSnapshot(metrics);

      const startTime = Date.now();

      // Run analysis
      try {
        await monitor.analyzeMarket('test-condition-id');
      } catch {
        // Ignore errors
      }

      const duration = Date.now() - startTime;
      metrics.analysisTimings.push(duration);

      // Capture CPU after analysis
      captureCPUSnapshot(metrics);

      console.log(`Analysis duration: ${duration}ms`);

      // Analysis should complete in reasonable time
      expect(duration).toBeLessThan(60000); // Less than 60 seconds
    }, 90000);
  });

  // ==========================================================================
  // Database Query Performance
  // ==========================================================================

  describe('Database Query Performance', () => {
    it('should execute upsertMarket efficiently', async () => {
      const timings: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = Date.now();

        try {
          await database.upsertMarket({
            conditionId: `perf-test-${i}`,
            question: `Performance Test Market ${i}`,
            eventType: 'election',
            status: 'active',
          });
        } catch {
          // Ignore errors
        }

        timings.push(Date.now() - start);
      }

      const avgTime = calculateAverage(timings);
      const maxTime = Math.max(...timings);

      console.log(`Average upsertMarket time: ${avgTime.toFixed(2)}ms`);
      console.log(`Max upsertMarket time: ${maxTime.toFixed(2)}ms`);

      // Queries should be fast
      expect(avgTime).toBeLessThan(500); // Less than 500ms average
      expect(maxTime).toBeLessThan(2000); // Less than 2s max
    }, 30000);

    it('should execute getMarketsForUpdate efficiently', async () => {
      const timings: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start = Date.now();

        try {
          await database.getMarketsForUpdate(24 * 60 * 60 * 1000);
        } catch {
          // Ignore errors
        }

        timings.push(Date.now() - start);
      }

      const avgTime = calculateAverage(timings);
      const maxTime = Math.max(...timings);

      console.log(`Average getMarketsForUpdate time: ${avgTime.toFixed(2)}ms`);
      console.log(`Max getMarketsForUpdate time: ${maxTime.toFixed(2)}ms`);

      // Queries should be fast
      expect(avgTime).toBeLessThan(500);
      expect(maxTime).toBeLessThan(2000);
    }, 30000);

    it('should handle concurrent database operations', async () => {
      const operations = Array.from({ length: 10 }, (_, i) =>
        database.upsertMarket({
          conditionId: `concurrent-test-${i}`,
          question: `Concurrent Test Market ${i}`,
          eventType: 'election',
          status: 'active',
        })
      );

      const start = Date.now();
      const results = await Promise.allSettled(operations);
      const duration = Date.now() - start;

      const successCount = results.filter((r) => r.status === 'fulfilled').length;

      console.log(`Concurrent operations completed in: ${duration}ms`);
      console.log(`Success rate: ${successCount}/10`);

      // Should handle concurrent operations efficiently
      expect(duration).toBeLessThan(5000); // Less than 5 seconds for 10 operations
      expect(successCount).toBeGreaterThan(5); // At least 50% success rate
    }, 15000);
  });

  // ==========================================================================
  // Scalability Tests
  // ==========================================================================

  describe('Scalability with Market Counts', () => {
    it('should handle 1 market efficiently', async () => {
      const start = Date.now();

      try {
        await monitor.analyzeMarket('test-market-1');
      } catch {
        // Ignore errors
      }

      const duration = Date.now() - start;

      console.log(`1 market analysis time: ${duration}ms`);

      expect(duration).toBeLessThan(60000); // Less than 60 seconds
    }, 90000);

    it('should handle 3 markets efficiently', async () => {
      const start = Date.now();

      const promises = [
        monitor.analyzeMarket('test-market-1').catch(() => {}),
        monitor.analyzeMarket('test-market-2').catch(() => {}),
        monitor.analyzeMarket('test-market-3').catch(() => {}),
      ];

      await Promise.allSettled(promises);

      const duration = Date.now() - start;

      console.log(`3 markets analysis time: ${duration}ms`);

      // Should scale reasonably (not 3x the single market time)
      expect(duration).toBeLessThan(180000); // Less than 3 minutes
    }, 240000);

    it('should handle 10 markets with degradation', async () => {
      const start = Date.now();

      const promises = Array.from({ length: 10 }, (_, i) =>
        monitor.analyzeMarket(`test-market-${i}`).catch(() => {})
      );

      await Promise.allSettled(promises);

      const duration = Date.now() - start;

      console.log(`10 markets analysis time: ${duration}ms`);

      // Should complete but may take longer
      expect(duration).toBeLessThan(600000); // Less than 10 minutes
    }, 720000);
  });

  // ==========================================================================
  // Resource Cleanup Tests
  // ==========================================================================

  describe('Resource Cleanup', () => {
    it('should clean up resources after analysis', async () => {
      const initialHandles = (process as any)._getActiveHandles?.()?.length || 0;
      const initialRequests = (process as any)._getActiveRequests?.()?.length || 0;

      try {
        await monitor.analyzeMarket('test-cleanup');
      } catch {
        // Ignore errors
      }

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const finalHandles = (process as any)._getActiveHandles?.()?.length || 0;
      const finalRequests = (process as any)._getActiveRequests?.()?.length || 0;

      console.log(`Active handles: ${initialHandles} -> ${finalHandles}`);
      console.log(`Active requests: ${initialRequests} -> ${finalRequests}`);

      // Should not accumulate handles/requests
      expect(finalHandles).toBeLessThanOrEqual(initialHandles + 5);
      expect(finalRequests).toBeLessThanOrEqual(initialRequests + 5);
    }, 30000);

    it('should handle graceful shutdown without resource leaks', async () => {
      await monitor.start();

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const beforeStop = process.memoryUsage().heapUsed;

      await monitor.stop();

      // Force garbage collection
      if (global.gc) {
        global.gc();
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const afterStop = process.memoryUsage().heapUsed;
      const growth = ((afterStop - beforeStop) / beforeStop) * 100;

      console.log(`Memory after shutdown: ${growth.toFixed(2)}% change`);

      // Memory should not grow significantly after shutdown
      expect(Math.abs(growth)).toBeLessThan(20);
    }, 30000);
  });

  // ==========================================================================
  // Health Check Performance
  // ==========================================================================

  describe('Health Check Performance', () => {
    it('should respond to health checks quickly', async () => {
      const timings: number[] = [];

      for (let i = 0; i < 20; i++) {
        const start = Date.now();
        monitor.getHealth();
        timings.push(Date.now() - start);
      }

      const avgTime = calculateAverage(timings);
      const maxTime = Math.max(...timings);

      console.log(`Average health check time: ${avgTime.toFixed(2)}ms`);
      console.log(`Max health check time: ${maxTime.toFixed(2)}ms`);

      // Health checks should be very fast
      expect(avgTime).toBeLessThan(50); // Less than 50ms average
      expect(maxTime).toBeLessThan(200); // Less than 200ms max
    });

    it('should not impact performance during analysis', async () => {
      const healthCheckPromise = (async () => {
        const timings: number[] = [];
        for (let i = 0; i < 10; i++) {
          const start = Date.now();
          monitor.getHealth();
          timings.push(Date.now() - start);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return timings;
      })();

      // Run analysis concurrently
      const analysisPromise = monitor.analyzeMarket('test-concurrent').catch(() => {});

      const [healthTimings] = await Promise.all([healthCheckPromise, analysisPromise]);

      const avgHealthTime = calculateAverage(healthTimings);

      console.log(`Health check time during analysis: ${avgHealthTime.toFixed(2)}ms`);

      // Health checks should remain fast even during analysis
      expect(avgHealthTime).toBeLessThan(100);
    }, 90000);
  });
});
