/**
 * Performance Tests for NewsData Performance Monitor
 * 
 * Tests the performance monitoring system's own performance and accuracy.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  NewsDataPerformanceMonitor, 
  createNewsDataPerformanceMonitor,
  DEFAULT_PERFORMANCE_THRESHOLDS 
} from './newsdata-performance-monitor.js';
import { createNewsDataCacheWithTTLs } from './newsdata-cache-manager.js';
import { createNewsDataRateLimiter } from './newsdata-rate-limiter.js';

describe('NewsData Performance Monitor Performance Tests', () => {
  let performanceMonitor: NewsDataPerformanceMonitor;
  let cacheManager: any;
  let rateLimiter: any;

  beforeEach(() => {
    cacheManager = createNewsDataCacheWithTTLs();
    rateLimiter = createNewsDataRateLimiter();
    
    performanceMonitor = createNewsDataPerformanceMonitor(
      cacheManager,
      rateLimiter,
      {
        ...DEFAULT_PERFORMANCE_THRESHOLDS,
        responseTime: {
          warning: 1000,
          critical: 3000,
        },
      },
      5000 // 5 second monitoring interval for faster testing
    );
  });

  afterEach(() => {
    performanceMonitor.stopMonitoring();
    performanceMonitor.reset();
  });

  describe('Monitoring Overhead Performance', () => {
    it('should have minimal overhead when recording metrics', async () => {
      const iterations = 10000;
      const endpoints = ['latest', 'crypto', 'market', 'archive'];
      
      // Measure baseline performance without monitoring
      const baselineStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        // Simulate the work that would be monitored
        const endpoint = endpoints[i % endpoints.length];
        const responseTime = Math.random() * 1000 + 100;
        const success = Math.random() > 0.05; // 95% success rate
        
        // Just the computation, no monitoring - use variables to avoid warnings
        Math.floor(responseTime);
        // Use endpoint and success to avoid unused variable warnings
        if (endpoint && success) {
          // Variables are used in condition
        }
      }
      const baselineTime = Date.now() - baselineStart;

      // Measure performance with monitoring
      const monitoredStart = Date.now();
      for (let i = 0; i < iterations; i++) {
        const endpoint = endpoints[i % endpoints.length];
        const responseTime = Math.random() * 1000 + 100;
        const success = Math.random() > 0.05; // 95% success rate
        const timeout = Math.random() > 0.98; // 2% timeout rate
        
        performanceMonitor.recordResponseTime(endpoint, responseTime, success, timeout);
        
        if (i % 10 === 0) {
          performanceMonitor.recordThroughput(endpoint, Math.random() * 10000 + 1000, Math.random() * 50 + 10);
        }
      }
      const monitoredTime = Date.now() - monitoredStart;

      const overhead = monitoredTime - baselineTime;
      const overheadPercentage = (overhead / baselineTime) * 100;
      
      // Monitoring overhead should be less than 50%
      expect(overheadPercentage).toBeLessThan(50);
      
      console.log(`Monitoring overhead: ${overhead}ms (${overheadPercentage.toFixed(2)}%)`);
      console.log(`Baseline: ${baselineTime}ms, Monitored: ${monitoredTime}ms`);
      console.log(`Throughput: ${(iterations / monitoredTime * 1000).toFixed(2)} recordings/sec`);
    });

    it('should efficiently generate performance snapshots', async () => {
      // Record some sample data
      const sampleData = Array.from({ length: 1000 }, (_, i) => ({
        endpoint: ['latest', 'crypto', 'market'][i % 3],
        responseTime: Math.random() * 2000 + 100,
        success: Math.random() > 0.05,
        bytes: Math.random() * 50000 + 1000,
        articles: Math.random() * 100 + 10,
      }));

      for (const data of sampleData) {
        performanceMonitor.recordResponseTime(data.endpoint, data.responseTime, data.success);
        performanceMonitor.recordThroughput(data.endpoint, data.bytes, data.articles);
      }

      // Measure snapshot generation performance
      const snapshotIterations = 100;
      const snapshotStart = Date.now();
      
      for (let i = 0; i < snapshotIterations; i++) {
        await performanceMonitor.getPerformanceSnapshot();
      }
      
      const snapshotTime = Date.now() - snapshotStart;
      const snapshotRate = snapshotIterations / snapshotTime * 1000;
      
      // Should generate at least 10 snapshots per second
      expect(snapshotRate).toBeGreaterThan(10);
      
      console.log(`Snapshot generation: ${snapshotIterations} snapshots in ${snapshotTime}ms`);
      console.log(`Snapshot rate: ${snapshotRate.toFixed(2)} snapshots/sec`);
    });

    it('should handle concurrent metric recording efficiently', async () => {
      const concurrentRecorders = 10;
      const recordingsPerRecorder = 500;
      
      const startTime = Date.now();
      
      const recorderPromises = Array.from({ length: concurrentRecorders }, async (_, recorderId) => {
        for (let i = 0; i < recordingsPerRecorder; i++) {
          const endpoint = ['latest', 'crypto', 'market', 'archive'][i % 4];
          const responseTime = Math.random() * 1500 + 50;
          const success = Math.random() > 0.03;
          
          performanceMonitor.recordResponseTime(endpoint, responseTime, success);
          
          if (i % 5 === 0) {
            performanceMonitor.recordThroughput(
              endpoint, 
              Math.random() * 20000 + 2000, 
              Math.random() * 80 + 20
            );
          }
          
          // Small delay to simulate real usage
          if (i % 50 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1));
          }
        }
        
        return recorderId; // Use recorderId to avoid warning
      });

      await Promise.all(recorderPromises);
      const totalTime = Date.now() - startTime;
      
      const totalRecordings = concurrentRecorders * recordingsPerRecorder;
      const recordingRate = totalRecordings / totalTime * 1000;
      
      // Should handle at least 1000 recordings per second with concurrency
      expect(recordingRate).toBeGreaterThan(1000);
      
      // Verify data integrity
      const snapshot = await performanceMonitor.getPerformanceSnapshot();
      expect(snapshot.responseTime.length).toBeGreaterThan(0);
      expect(snapshot.throughput.length).toBeGreaterThan(0);
      
      console.log(`Concurrent recording: ${totalRecordings} recordings in ${totalTime}ms`);
      console.log(`Recording rate: ${recordingRate.toFixed(2)} recordings/sec`);
      console.log(`Endpoints tracked: ${snapshot.responseTime.length}`);
    });
  });

  describe('Memory Usage Monitoring Accuracy', () => {
    it('should accurately track memory usage changes', async () => {
      const initialSnapshot = await performanceMonitor.getPerformanceSnapshot();
      const initialMemory = initialSnapshot.memory.rss;
      
      // Allocate some memory
      const largeArrays: number[][] = [];
      for (let i = 0; i < 100; i++) {
        largeArrays.push(new Array(10000).fill(i));
      }
      
      // Record some cache operations to increase cache memory
      for (let i = 0; i < 50; i++) {
        await cacheManager.set(`memory-test-${i}`, {
          id: i,
          data: 'x'.repeat(1000), // 1KB per entry
          timestamp: Date.now(),
        });
      }
      
      const finalSnapshot = await performanceMonitor.getPerformanceSnapshot();
      const finalMemory = finalSnapshot.memory.rss;
      
      // Memory usage should have increased
      expect(finalMemory).toBeGreaterThan(initialMemory);
      
      // Cache memory should be tracked
      expect(finalSnapshot.memory.cacheMemoryUsage).toBeGreaterThan(0);
      
      console.log(`Memory tracking accuracy:`);
      console.log(`Initial RSS: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Final RSS: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
      console.log(`Cache memory: ${(finalSnapshot.memory.cacheMemoryUsage / 1024).toFixed(2)} KB`);
      console.log(`Cache hit rate: ${finalSnapshot.memory.cacheHitRate.toFixed(2)}%`);
    });

    it('should detect memory pressure accurately', async () => {
      // Simulate memory pressure by allocating large amounts of memory
      const memoryHogs: Buffer[] = [];
      
      try {
        // Allocate memory in chunks until we reach a significant amount
        for (let i = 0; i < 100; i++) {
          memoryHogs.push(Buffer.alloc(1024 * 1024)); // 1MB chunks
        }
        
        const snapshot = await performanceMonitor.getPerformanceSnapshot();
        
        // Memory usage should be significant
        expect(snapshot.memory.rss).toBeGreaterThan(100 * 1024 * 1024); // At least 100MB
        
        console.log(`Memory pressure test:`);
        console.log(`RSS: ${(snapshot.memory.rss / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Heap used: ${(snapshot.memory.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`External: ${(snapshot.memory.external / 1024 / 1024).toFixed(2)} MB`);
        
      } finally {
        // Clean up memory
        memoryHogs.length = 0;
        if (global.gc) {
          global.gc();
        }
      }
    });
  });

  describe('Alert System Performance', () => {
    it('should efficiently process and emit alerts', async () => {
      let alertCount = 0;
      const alertTimes: number[] = [];
      
      performanceMonitor.onAlert((_alert) => {
        alertCount++;
        alertTimes.push(Date.now());
      });

      const startTime = Date.now();
      
      // Generate conditions that should trigger alerts
      for (let i = 0; i < 100; i++) {
        // Generate high response times to trigger alerts
        const responseTime = 4000 + Math.random() * 2000; // Above critical threshold
        performanceMonitor.recordResponseTime('latest', responseTime, true);
        
        // Small delay to prevent overwhelming
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      const processingTime = Date.now() - startTime;
      
      // Should have generated some alerts
      expect(alertCount).toBeGreaterThan(0);
      
      // Alert processing should be fast
      expect(processingTime).toBeLessThan(5000);
      
      console.log(`Alert system performance:`);
      console.log(`Alerts generated: ${alertCount}`);
      console.log(`Processing time: ${processingTime}ms`);
      console.log(`Alert rate: ${(alertCount / processingTime * 1000).toFixed(2)} alerts/sec`);
    });

    it('should handle alert callback errors gracefully', async () => {
      let successfulAlerts = 0;
      let failedCallbacks = 0;
      
      // Add a callback that sometimes fails
      performanceMonitor.onAlert((_alert) => {
        if (Math.random() > 0.7) {
          failedCallbacks++;
          throw new Error('Simulated callback failure');
        }
        successfulAlerts++;
      });

      // Generate alert conditions
      for (let i = 0; i < 50; i++) {
        const responseTime = 3500; // Above critical threshold
        performanceMonitor.recordResponseTime('crypto', responseTime, true);
      }

      // Wait a bit for alerts to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should have processed some alerts despite callback failures
      expect(successfulAlerts + failedCallbacks).toBeGreaterThan(0);
      
      console.log(`Alert callback resilience:`);
      console.log(`Successful alerts: ${successfulAlerts}`);
      console.log(`Failed callbacks: ${failedCallbacks}`);
    });
  });

  describe('Long-term Performance Stability', () => {
    it('should maintain performance over extended monitoring periods', async () => {
      const monitoringDuration = 10000; // 10 seconds
      const recordingInterval = 50; // Record every 50ms
      const expectedRecordings = monitoringDuration / recordingInterval;
      
      let recordingCount = 0;
      const performanceMetrics: number[] = [];
      
      const startTime = Date.now();
      
      const recordingInterval_id = setInterval(() => {
        const recordStart = Date.now();
        
        // Simulate typical monitoring workload
        const endpoint = ['latest', 'crypto', 'market'][recordingCount % 3];
        const responseTime = Math.random() * 1000 + 200;
        const success = Math.random() > 0.05;
        
        performanceMonitor.recordResponseTime(endpoint, responseTime, success);
        
        if (recordingCount % 5 === 0) {
          performanceMonitor.recordThroughput(endpoint, Math.random() * 15000 + 3000, Math.random() * 60 + 15);
        }
        
        const recordTime = Date.now() - recordStart;
        performanceMetrics.push(recordTime);
        recordingCount++;
        
      }, recordingInterval);

      // Let it run for the specified duration
      await new Promise(resolve => setTimeout(resolve, monitoringDuration));
      clearInterval(recordingInterval_id);
      
      const totalTime = Date.now() - startTime;
      
      // Calculate performance statistics
      const avgRecordingTime = performanceMetrics.reduce((sum, time) => sum + time, 0) / performanceMetrics.length;
      const maxRecordingTime = Math.max(...performanceMetrics);
      const minRecordingTime = Math.min(...performanceMetrics);
      
      // Performance should remain stable
      expect(recordingCount).toBeGreaterThan(expectedRecordings * 0.8); // At least 80% of expected recordings
      expect(avgRecordingTime).toBeLessThan(10); // Average recording time under 10ms
      expect(maxRecordingTime).toBeLessThan(50); // No single recording over 50ms
      
      // Get final snapshot to verify data integrity
      const finalSnapshot = await performanceMonitor.getPerformanceSnapshot();
      expect(finalSnapshot.responseTime.length).toBeGreaterThan(0);
      
      console.log(`Long-term stability test (${totalTime}ms):`);
      console.log(`Recordings: ${recordingCount}/${expectedRecordings} expected`);
      console.log(`Avg recording time: ${avgRecordingTime.toFixed(2)}ms`);
      console.log(`Min/Max recording time: ${minRecordingTime}ms / ${maxRecordingTime}ms`);
      console.log(`Final endpoints tracked: ${finalSnapshot.responseTime.length}`);
    });
  });

  describe('Resource Cleanup Performance', () => {
    it('should efficiently clean up old metrics data', async () => {
      // Generate a lot of historical data
      const historicalDataPoints = 5000;
      
      for (let i = 0; i < historicalDataPoints; i++) {
        const endpoint = ['latest', 'crypto', 'market', 'archive'][i % 4];
        performanceMonitor.recordResponseTime(endpoint, Math.random() * 1000 + 100, true);
        
        if (i % 10 === 0) {
          performanceMonitor.recordThroughput(endpoint, Math.random() * 10000 + 2000, Math.random() * 50 + 10);
        }
      }

      // Measure memory before reset
      const beforeReset = process.memoryUsage();
      
      // Reset metrics (cleanup)
      const resetStart = Date.now();
      performanceMonitor.reset();
      const resetTime = Date.now() - resetStart;
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      const afterReset = process.memoryUsage();
      
      // Reset should be fast
      expect(resetTime).toBeLessThan(100); // Under 100ms
      
      // Memory should be cleaned up (some reduction expected)
      const memoryReduction = beforeReset.heapUsed - afterReset.heapUsed;
      
      // Verify reset worked
      const snapshot = await performanceMonitor.getPerformanceSnapshot();
      expect(snapshot.responseTime.length).toBe(0);
      expect(snapshot.throughput.length).toBe(0);
      
      console.log(`Cleanup performance:`);
      console.log(`Reset time: ${resetTime}ms`);
      console.log(`Memory reduction: ${(memoryReduction / 1024).toFixed(2)} KB`);
      console.log(`Data points cleaned: ${historicalDataPoints}`);
    });
  });
});