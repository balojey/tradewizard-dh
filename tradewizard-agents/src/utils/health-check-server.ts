/**
 * Health Check Server
 *
 * Provides HTTP endpoints for monitoring the Automated Market Monitor service.
 * Exposes health status, service metrics, and manual trigger capabilities.
 */

import http from 'node:http';
import type { MonitorService } from './monitor-service.js';

/**
 * Health check server configuration
 */
export interface HealthCheckServerConfig {
  port: number;
  enableManualTriggers?: boolean;
}

/**
 * Health check server interface
 */
export interface HealthCheckServer {
  /**
   * Start the health check server
   */
  start(): Promise<void>;

  /**
   * Stop the health check server
   */
  stop(): Promise<void>;

  /**
   * Check if server is running
   */
  isRunning(): boolean;

  /**
   * Get server port
   */
  getPort(): number;
}

/**
 * Health check server implementation
 */
export class HealthCheckServerImpl implements HealthCheckServer {
  private server: http.Server | null = null;
  private running: boolean = false;

  constructor(
    private monitor: MonitorService,
    private config: HealthCheckServerConfig
  ) {}

  /**
   * Start the health check server
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('[HealthCheckServer] Already running');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        this.server = http.createServer((req, res) => {
          this.handleRequest(req, res);
        });

        this.server.on('error', (error) => {
          console.error('[HealthCheckServer] Server error:', error);
          reject(error);
        });

        this.server.listen(this.config.port, () => {
          this.running = true;
          console.log(`[HealthCheckServer] Server started on port ${this.config.port}`);
          resolve();
        });
      } catch (error) {
        console.error('[HealthCheckServer] Failed to start server:', error);
        reject(error);
      }
    });
  }

  /**
   * Stop the health check server
   */
  async stop(): Promise<void> {
    if (!this.running || !this.server) {
      console.warn('[HealthCheckServer] Not running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close((error) => {
        if (error) {
          console.error('[HealthCheckServer] Error stopping server:', error);
          reject(error);
        } else {
          this.running = false;
          this.server = null;
          console.log('[HealthCheckServer] Server stopped');
          resolve();
        }
      });
    });
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get server port
   */
  getPort(): number {
    return this.config.port;
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url || '/';
    const method = req.method || 'GET';

    try {
      // Health check endpoint
      if (url === '/health' && method === 'GET') {
        this.handleHealthCheck(req, res);
        return;
      }

      // Manual trigger endpoint (if enabled)
      if (url === '/trigger' && method === 'POST' && this.config.enableManualTriggers) {
        this.handleManualTrigger(req, res);
        return;
      }

      // 404 Not Found
      this.sendResponse(res, 404, { error: 'Not Found' });
    } catch (error) {
      console.error('[HealthCheckServer] Request handling error:', error);
      this.sendResponse(res, 500, {
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle health check request
   */
  private handleHealthCheck(_req: http.IncomingMessage, res: http.ServerResponse): void {
    try {
      const health = this.monitor.getHealth();

      // Determine HTTP status code based on health status
      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

      this.sendResponse(res, statusCode, health);
    } catch (error) {
      console.error('[HealthCheckServer] Health check failed:', error);
      this.sendResponse(res, 503, {
        status: 'unhealthy',
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle manual trigger request
   */
  private handleManualTrigger(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        // Parse request body
        const data = JSON.parse(body || '{}');
        const conditionId = data.conditionId;

        if (!conditionId || typeof conditionId !== 'string') {
          this.sendResponse(res, 400, {
            error: 'Bad Request',
            message: 'Missing or invalid conditionId in request body',
          });
          return;
        }

        // Trigger analysis
        console.log(`[HealthCheckServer] Manual trigger requested for market: ${conditionId}`);
        const recommendation = await this.monitor.analyzeMarket(conditionId);

        this.sendResponse(res, 200, {
          success: true,
          conditionId,
          recommendation,
        });
      } catch (error) {
        console.error('[HealthCheckServer] Manual trigger failed:', error);
        this.sendResponse(res, 500, {
          error: 'Analysis Failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    req.on('error', (error) => {
      console.error('[HealthCheckServer] Request error:', error);
      this.sendResponse(res, 500, {
        error: 'Request Error',
        message: error.message,
      });
    });
  }

  /**
   * Send JSON response
   */
  private sendResponse(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(JSON.stringify(data, null, 2));
  }
}

/**
 * Create a health check server instance
 */
export function createHealthCheckServer(
  monitor: MonitorService,
  config: HealthCheckServerConfig
): HealthCheckServer {
  return new HealthCheckServerImpl(monitor, config);
}

/**
 * Create health check server from environment variables
 */
export function createHealthCheckServerFromEnv(monitor: MonitorService): HealthCheckServer {
  const config: HealthCheckServerConfig = {
    port: parseInt(process.env.HEALTH_CHECK_PORT || '3000', 10),
    enableManualTriggers: process.env.ENABLE_MANUAL_TRIGGERS === 'true',
  };

  return createHealthCheckServer(monitor, config);
}
