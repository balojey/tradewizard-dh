/**
 * Property-based tests for Health Check Server
 *
 * Feature: automated-market-monitor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import http from 'node:http';
import { createHealthCheckServer, type HealthCheckServer } from './health-check-server.js';
import type { MonitorService, HealthStatus } from './monitor-service.js';

describe('HealthCheckServer Property Tests', () => {
  let server: HealthCheckServer;
  let mockMonitor: MonitorService;
  let basePort: number;

  beforeEach(() => {
    // Use a random base port to avoid conflicts
    basePort = 4000 + Math.floor(Math.random() * 1000);

    // Create mock monitor
    mockMonitor = {
      initialize: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getHealth: vi.fn(),
      analyzeMarket: vi.fn(),
    } as any;
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  /**
   * Property 9: Health check accuracy
   *
   * For any health check request, the returned status should accurately reflect
   * the current state of all system components (database, scheduler, quota).
   *
   * Validates: Requirements 7.5, 7.6
   *
   * Feature: automated-market-monitor, Property 9: Health check accuracy
   */
  it('Property 9: health check should accurately reflect system state', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random system state
        fc.record({
          databaseConnected: fc.boolean(),
          schedulerRunning: fc.boolean(),
          schedulerExecuting: fc.boolean(),
          uptime: fc.integer({ min: 0, max: 86400 }), // 0 to 24 hours in seconds
          lastAnalysisTime: fc.option(
            fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
            { nil: null }
          ),
          nextScheduledRun: fc.option(
            fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
            { nil: null }
          ),
          quotaUsage: fc.record({
            newsapi: fc.record({
              used: fc.integer({ min: 0, max: 100 }),
              limit: fc.constant(100),
            }),
            twitter: fc.record({
              used: fc.integer({ min: 0, max: 500 }),
              limit: fc.constant(500),
            }),
            reddit: fc.record({
              used: fc.integer({ min: 0, max: 60 }),
              limit: fc.constant(60),
            }),
            recommendedMarkets: fc.integer({ min: 1, max: 3 }),
          }),
        }),
        async (systemState) => {
          // Calculate expected health status based on system state
          const expectedStatus = calculateExpectedHealthStatus(systemState);

          // Mock getHealth to return the system state
          const mockHealthStatus: HealthStatus = {
            status: expectedStatus,
            timestamp: new Date().toISOString(),
            uptime: systemState.uptime,
            lastAnalysis: systemState.lastAnalysisTime?.toISOString() || null,
            nextScheduledRun: systemState.nextScheduledRun?.toISOString() || null,
            database: {
              connected: systemState.databaseConnected,
              lastCheck: new Date().toISOString(),
            },
            scheduler: {
              running: systemState.schedulerRunning,
              executing: systemState.schedulerExecuting,
            },
            quota: systemState.quotaUsage,
          };

          vi.mocked(mockMonitor.getHealth).mockReturnValue(mockHealthStatus);

          // Create and start server with unique port
          const port = basePort + Math.floor(Math.random() * 100);
          server = createHealthCheckServer(mockMonitor, {
            port,
            enableManualTriggers: false,
          });

          await server.start();

          try {
            // Make health check request
            const response = await makeHealthCheckRequest(port);

            // Verify response matches expected state
            expect(response.body.status).toBe(expectedStatus);
            expect(response.body.database.connected).toBe(systemState.databaseConnected);
            expect(response.body.scheduler.running).toBe(systemState.schedulerRunning);
            expect(response.body.scheduler.executing).toBe(systemState.schedulerExecuting);
            expect(response.body.uptime).toBe(systemState.uptime);

            // Verify quota information is accurate
            expect(response.body.quota.newsapi.used).toBe(systemState.quotaUsage.newsapi.used);
            expect(response.body.quota.newsapi.limit).toBe(systemState.quotaUsage.newsapi.limit);
            expect(response.body.quota.twitter.used).toBe(systemState.quotaUsage.twitter.used);
            expect(response.body.quota.twitter.limit).toBe(systemState.quotaUsage.twitter.limit);
            expect(response.body.quota.reddit.used).toBe(systemState.quotaUsage.reddit.used);
            expect(response.body.quota.reddit.limit).toBe(systemState.quotaUsage.reddit.limit);
            expect(response.body.quota.recommendedMarkets).toBe(
              systemState.quotaUsage.recommendedMarkets
            );

            // Verify HTTP status code matches health status
            const expectedStatusCode = expectedStatus === 'unhealthy' ? 503 : 200;
            expect(response.statusCode).toBe(expectedStatusCode);

            // Verify timestamp fields are present
            expect(response.body.timestamp).toBeDefined();
            expect(response.body.database.lastCheck).toBeDefined();

            // Verify optional fields are handled correctly
            if (systemState.lastAnalysisTime) {
              expect(response.body.lastAnalysis).toBeDefined();
            } else {
              expect(response.body.lastAnalysis).toBeNull();
            }

            if (systemState.nextScheduledRun) {
              expect(response.body.nextScheduledRun).toBeDefined();
            } else {
              expect(response.body.nextScheduledRun).toBeNull();
            }
          } finally {
            await server.stop();
          }
        }
      ),
      { numRuns: 100, timeout: 10000 }
    );
  }, 30000);

  /**
   * Property: Health check consistency
   *
   * For any sequence of health check requests, the returned status should
   * remain consistent with the underlying system state.
   */
  it('Property: health check should be consistent across multiple requests', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          databaseConnected: fc.boolean(),
          schedulerRunning: fc.boolean(),
          uptime: fc.integer({ min: 0, max: 1000 }),
          requestCount: fc.integer({ min: 2, max: 5 }),
        }),
        async (testCase) => {
          const expectedStatus = calculateExpectedHealthStatus(testCase);

          const mockHealthStatus: HealthStatus = {
            status: expectedStatus,
            timestamp: new Date().toISOString(),
            uptime: testCase.uptime,
            lastAnalysis: null,
            nextScheduledRun: null,
            database: {
              connected: testCase.databaseConnected,
              lastCheck: new Date().toISOString(),
            },
            scheduler: {
              running: testCase.schedulerRunning,
              executing: false,
            },
            quota: {
              newsapi: { used: 10, limit: 100 },
              twitter: { used: 20, limit: 500 },
              reddit: { used: 5, limit: 60 },
              recommendedMarkets: 3,
            },
          };

          vi.mocked(mockMonitor.getHealth).mockReturnValue(mockHealthStatus);

          const port = basePort + Math.floor(Math.random() * 100);
          server = createHealthCheckServer(mockMonitor, {
            port,
            enableManualTriggers: false,
          });

          await server.start();

          try {
            // Make multiple health check requests
            const responses = await Promise.all(
              Array.from({ length: testCase.requestCount }, () => makeHealthCheckRequest(port))
            );

            // All responses should have the same status
            const statuses = responses.map((r) => r.body.status);
            const allSame = statuses.every((s) => s === expectedStatus);
            expect(allSame).toBe(true);

            // All responses should have the same database connection state
            const dbStates = responses.map((r) => r.body.database.connected);
            const allDbSame = dbStates.every((s) => s === testCase.databaseConnected);
            expect(allDbSame).toBe(true);

            // All responses should have the same scheduler state
            const schedulerStates = responses.map((r) => r.body.scheduler.running);
            const allSchedulerSame = schedulerStates.every((s) => s === testCase.schedulerRunning);
            expect(allSchedulerSame).toBe(true);
          } finally {
            await server.stop();
          }
        }
      ),
      { numRuns: 50, timeout: 10000 }
    );
  }, 20000);
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate expected health status based on system state
 */
function calculateExpectedHealthStatus(systemState: {
  databaseConnected: boolean;
  schedulerRunning: boolean;
}): 'healthy' | 'degraded' | 'unhealthy' {
  if (!systemState.databaseConnected) {
    return 'unhealthy';
  }

  if (!systemState.schedulerRunning) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Make health check request
 */
function makeHealthCheckRequest(
  port: number
): Promise<{ statusCode: number; body: HealthStatus }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port,
      path: '/health',
      method: 'GET',
    };

    const req = http.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsedBody = JSON.parse(data);
          resolve({
            statusCode: res.statusCode || 500,
            body: parsedBody,
          });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.end();
  });
}
