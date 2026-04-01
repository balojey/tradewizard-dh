/**
 * Health Check Workflow Service Status Tests
 *
 * Verifies that the health check endpoint includes workflow service status
 * as specified in Requirements 4.5 and 9.6
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createHealthCheckServer } from './health-check-server.js';
import type { MonitorService, HealthStatus } from './monitor-service.js';
import http from 'node:http';

describe('Health Check - Workflow Service Status', () => {
  let server: ReturnType<typeof createHealthCheckServer>;
  let mockMonitor: MonitorService;
  const testPort = 3456;

  beforeEach(() => {
    // Create mock monitor service
    mockMonitor = {
      initialize: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      analyzeMarket: vi.fn(),
      getHealth: vi.fn(),
    } as any;
  });

  afterEach(async () => {
    if (server?.isRunning()) {
      await server.stop();
    }
  });

  /**
   * Helper to make HTTP request to health endpoint
   */
  async function getHealthStatus(): Promise<HealthStatus> {
    // Add small delay to ensure server is ready
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return new Promise((resolve, reject) => {
      const req = http.get(`http://localhost:${testPort}/health`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      });
      
      req.on('error', reject);
      req.setTimeout(1000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  it('should include workflowService section when workflow URL is configured', async () => {
    // Mock health status with workflow service enabled
    const mockHealth: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 100,
      lastAnalysis: new Date().toISOString(),
      nextScheduledRun: new Date().toISOString(),
      database: {
        connected: true,
        lastCheck: new Date().toISOString(),
      },
      scheduler: {
        running: true,
        executing: false,
      },
      workflowService: {
        enabled: true,
        url: 'https://workflow.example.com/analyze',
        lastSuccess: new Date().toISOString(),
        consecutiveFailures: 0,
      },
      quota: {
        newsapi: { used: 10, limit: 100 },
        twitter: { used: 5, limit: 50 },
        reddit: { used: 3, limit: 30 },
        recommendedMarkets: 3,
      },
    };

    vi.mocked(mockMonitor.getHealth).mockReturnValue(mockHealth);

    // Start server
    server = createHealthCheckServer(mockMonitor, { port: testPort });
    await server.start();

    // Get health status
    const health = await getHealthStatus();

    // Verify workflowService section exists
    expect(health.workflowService).toBeDefined();
    expect(health.workflowService.enabled).toBe(true);
    expect(health.workflowService.url).toBe('https://workflow.example.com/analyze');
    expect(health.workflowService.lastSuccess).toBeTruthy();
    expect(health.workflowService.consecutiveFailures).toBe(0);
  });

  it('should include workflowService section when workflow URL is not configured', async () => {
    // Mock health status with workflow service disabled
    const mockHealth: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 100,
      lastAnalysis: new Date().toISOString(),
      nextScheduledRun: new Date().toISOString(),
      database: {
        connected: true,
        lastCheck: new Date().toISOString(),
      },
      scheduler: {
        running: true,
        executing: false,
      },
      workflowService: {
        enabled: false,
        url: null,
        lastSuccess: null,
        consecutiveFailures: 0,
      },
      quota: {
        newsapi: { used: 10, limit: 100 },
        twitter: { used: 5, limit: 50 },
        reddit: { used: 3, limit: 30 },
        recommendedMarkets: 3,
      },
    };

    vi.mocked(mockMonitor.getHealth).mockReturnValue(mockHealth);

    // Start server
    server = createHealthCheckServer(mockMonitor, { port: testPort });
    await server.start();

    // Get health status
    const health = await getHealthStatus();

    // Verify workflowService section exists with disabled state
    expect(health.workflowService).toBeDefined();
    expect(health.workflowService.enabled).toBe(false);
    expect(health.workflowService.url).toBeNull();
    expect(health.workflowService.lastSuccess).toBeNull();
    expect(health.workflowService.consecutiveFailures).toBe(0);
  });

  it('should track consecutive failures in workflowService status', async () => {
    // Mock health status with workflow service failures
    const mockHealth: HealthStatus = {
      status: 'degraded',
      timestamp: new Date().toISOString(),
      uptime: 100,
      lastAnalysis: new Date().toISOString(),
      nextScheduledRun: new Date().toISOString(),
      database: {
        connected: true,
        lastCheck: new Date().toISOString(),
      },
      scheduler: {
        running: true,
        executing: false,
      },
      workflowService: {
        enabled: true,
        url: 'https://workflow.example.com/analyze',
        lastSuccess: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        consecutiveFailures: 3,
      },
      quota: {
        newsapi: { used: 10, limit: 100 },
        twitter: { used: 5, limit: 50 },
        reddit: { used: 3, limit: 30 },
        recommendedMarkets: 3,
      },
    };

    vi.mocked(mockMonitor.getHealth).mockReturnValue(mockHealth);

    // Start server
    server = createHealthCheckServer(mockMonitor, { port: testPort });
    await server.start();

    // Get health status
    const health = await getHealthStatus();

    // Verify consecutive failures are tracked
    expect(health.workflowService.consecutiveFailures).toBe(3);
    expect(health.workflowService.lastSuccess).toBeTruthy();
    expect(health.status).toBe('degraded');
  });

  it('should include all required workflowService fields', async () => {
    const mockHealth: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: 100,
      lastAnalysis: null,
      nextScheduledRun: null,
      database: {
        connected: true,
        lastCheck: new Date().toISOString(),
      },
      scheduler: {
        running: false,
        executing: false,
      },
      workflowService: {
        enabled: true,
        url: 'https://workflow.example.com/analyze',
        lastSuccess: new Date().toISOString(),
        consecutiveFailures: 0,
      },
      quota: {
        newsapi: { used: 0, limit: 100 },
        twitter: { used: 0, limit: 50 },
        reddit: { used: 0, limit: 30 },
        recommendedMarkets: 3,
      },
    };

    vi.mocked(mockMonitor.getHealth).mockReturnValue(mockHealth);

    server = createHealthCheckServer(mockMonitor, { port: testPort });
    await server.start();

    const health = await getHealthStatus();

    // Verify all required fields are present
    expect(health.workflowService).toHaveProperty('enabled');
    expect(health.workflowService).toHaveProperty('url');
    expect(health.workflowService).toHaveProperty('lastSuccess');
    expect(health.workflowService).toHaveProperty('consecutiveFailures');

    // Verify field types
    expect(typeof health.workflowService.enabled).toBe('boolean');
    expect(typeof health.workflowService.consecutiveFailures).toBe('number');
    expect(health.workflowService.url === null || typeof health.workflowService.url === 'string').toBe(true);
    expect(health.workflowService.lastSuccess === null || typeof health.workflowService.lastSuccess === 'string').toBe(true);
  });
});
