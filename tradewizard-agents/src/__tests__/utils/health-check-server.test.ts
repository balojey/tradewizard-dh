/**
 * Unit tests for Health Check Server
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import http from 'node:http';
import {
  createHealthCheckServer,
  createHealthCheckServerFromEnv,
  type HealthCheckServer,
  type HealthCheckServerConfig,
} from './health-check-server.js';
import type { MonitorService, HealthStatus } from './monitor-service.js';

describe('HealthCheckServer', () => {
  let server: HealthCheckServer;
  let mockMonitor: MonitorService;
  let config: HealthCheckServerConfig;

  beforeEach(() => {
    // Create mock monitor
    mockMonitor = {
      initialize: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getHealth: vi.fn().mockReturnValue({
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
          running: true,
          executing: false,
        },
        quota: {
          newsapi: { used: 10, limit: 100 },
          twitter: { used: 20, limit: 500 },
          reddit: { used: 5, limit: 60 },
          recommendedMarkets: 3,
        },
      } as HealthStatus),
      analyzeMarket: vi.fn().mockResolvedValue({
        marketId: 'test-market',
        action: 'LONG_YES',
        entryZone: [0.45, 0.50],
        targetZone: [0.60, 0.65],
        expectedValue: 15.5,
        winProbability: 0.65,
        liquidityRisk: 'low',
        explanation: {
          summary: 'Test summary',
          coreThesis: 'Test thesis',
          keyCatalysts: ['Catalyst 1'],
          failureScenarios: ['Risk 1'],
        },
        metadata: {
          consensusProbability: 0.65,
          marketProbability: 0.50,
          edge: 0.15,
          confidenceBand: [0.60, 0.70],
        },
      }),
    } as any;

    // Use a random port to avoid conflicts
    config = {
      port: 3000 + Math.floor(Math.random() * 1000),
      enableManualTriggers: true,
    };

    server = createHealthCheckServer(mockMonitor, config);
  });

  afterEach(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  describe('server lifecycle', () => {
    it('should start the server successfully', async () => {
      await server.start();
      expect(server.isRunning()).toBe(true);
    });

    it('should stop the server successfully', async () => {
      await server.start();
      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should not start if already running', async () => {
      await server.start();
      await server.start(); // Second start should be ignored
      expect(server.isRunning()).toBe(true);
    });

    it('should return the configured port', () => {
      expect(server.getPort()).toBe(config.port);
    });
  });

  describe('health endpoint', () => {
    it('should return health status with 200 when healthy', async () => {
      await server.start();

      const response = await makeRequest(config.port, '/health', 'GET');

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('scheduler');
      expect(response.body).toHaveProperty('quota');
    });

    it('should return health status with 200 when degraded', async () => {
      // Mock degraded health
      vi.mocked(mockMonitor.getHealth).mockReturnValue({
        status: 'degraded',
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
        quota: {
          newsapi: { used: 10, limit: 100 },
          twitter: { used: 20, limit: 500 },
          reddit: { used: 5, limit: 60 },
          recommendedMarkets: 3,
        },
      } as HealthStatus);

      await server.start();

      const response = await makeRequest(config.port, '/health', 'GET');

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('status', 'degraded');
    });

    it('should return 503 when unhealthy (database disconnected)', async () => {
      // Mock unhealthy health
      vi.mocked(mockMonitor.getHealth).mockReturnValue({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: 100,
        lastAnalysis: null,
        nextScheduledRun: null,
        database: {
          connected: false,
          lastCheck: new Date().toISOString(),
        },
        scheduler: {
          running: true,
          executing: false,
        },
        quota: {
          newsapi: { used: 10, limit: 100 },
          twitter: { used: 20, limit: 500 },
          reddit: { used: 5, limit: 60 },
          recommendedMarkets: 3,
        },
      } as HealthStatus);

      await server.start();

      const response = await makeRequest(config.port, '/health', 'GET');

      expect(response.statusCode).toBe(503);
      expect(response.body).toHaveProperty('status', 'unhealthy');
      expect(response.body.database.connected).toBe(false);
    });

    it('should handle health check errors gracefully', async () => {
      // Mock getHealth to throw error
      vi.mocked(mockMonitor.getHealth).mockImplementation(() => {
        throw new Error('Health check failed');
      });

      await server.start();

      const response = await makeRequest(config.port, '/health', 'GET');

      expect(response.statusCode).toBe(503);
      expect(response.body).toHaveProperty('status', 'unhealthy');
      expect(response.body).toHaveProperty('error', 'Health check failed');
    });
  });

  describe('manual trigger endpoint', () => {
    it('should trigger analysis for a market', async () => {
      await server.start();

      const response = await makeRequest(config.port, '/trigger', 'POST', {
        conditionId: 'test-condition-123',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('conditionId', 'test-condition-123');
      expect(response.body).toHaveProperty('recommendation');
      expect(mockMonitor.analyzeMarket).toHaveBeenCalledWith('test-condition-123');
    });

    it('should return 400 when conditionId is missing', async () => {
      await server.start();

      const response = await makeRequest(config.port, '/trigger', 'POST', {});

      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad Request');
      expect(response.body.message).toContain('conditionId');
    });

    it('should return 400 when conditionId is invalid', async () => {
      await server.start();

      const response = await makeRequest(config.port, '/trigger', 'POST', {
        conditionId: 123, // Should be string
      });

      expect(response.statusCode).toBe(400);
      expect(response.body).toHaveProperty('error', 'Bad Request');
    });

    it('should return 500 when analysis fails', async () => {
      vi.mocked(mockMonitor.analyzeMarket).mockRejectedValue(new Error('Analysis failed'));

      await server.start();

      const response = await makeRequest(config.port, '/trigger', 'POST', {
        conditionId: 'test-condition-123',
      });

      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty('error', 'Analysis Failed');
      expect(response.body.message).toContain('Analysis failed');
    });

    it('should return 404 when manual triggers are disabled', async () => {
      // Create server with manual triggers disabled
      const serverWithoutTriggers = createHealthCheckServer(mockMonitor, {
        port: config.port + 1,
        enableManualTriggers: false,
      });

      await serverWithoutTriggers.start();

      const response = await makeRequest(config.port + 1, '/trigger', 'POST', {
        conditionId: 'test-condition-123',
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');

      await serverWithoutTriggers.stop();
    });
  });

  describe('error handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      await server.start();

      const response = await makeRequest(config.port, '/unknown', 'GET');

      expect(response.statusCode).toBe(404);
      expect(response.body).toHaveProperty('error', 'Not Found');
    });

    it('should handle malformed JSON in POST requests', async () => {
      await server.start();

      const response = await makeRawRequest(config.port, '/trigger', 'POST', 'invalid json');

      expect(response.statusCode).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('createHealthCheckServerFromEnv', () => {
    it('should create server from environment variables', () => {
      process.env.HEALTH_CHECK_PORT = '4000';
      process.env.ENABLE_MANUAL_TRIGGERS = 'true';

      const envServer = createHealthCheckServerFromEnv(mockMonitor);

      expect(envServer.getPort()).toBe(4000);

      // Clean up
      delete process.env.HEALTH_CHECK_PORT;
      delete process.env.ENABLE_MANUAL_TRIGGERS;
    });

    it('should use default port when not specified', () => {
      delete process.env.HEALTH_CHECK_PORT;

      const envServer = createHealthCheckServerFromEnv(mockMonitor);

      expect(envServer.getPort()).toBe(3000);
    });
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Make HTTP request to the server
 */
function makeRequest(
  port: number,
  path: string,
  method: string,
  body?: any
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
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

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Make raw HTTP request to the server
 */
function makeRawRequest(
  port: number,
  path: string,
  method: string,
  body: string
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
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
          // If parsing fails, return raw data
          resolve({
            statusCode: res.statusCode || 500,
            body: { raw: data },
          });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(body);
    req.end();
  });
}
