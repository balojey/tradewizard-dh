#!/usr/bin/env node
/**
 * Automated Market Monitor Entry Point
 *
 * This is the main entry point for the Automated Market Monitor service.
 * It initializes all components, starts the monitor, and handles graceful shutdown.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { config as loadEnv } from 'dotenv';
import { config } from './config/index.js';
import { createSupabaseClientManager } from './database/supabase-client.js';
import { createDatabasePersistence } from './database/persistence.js';
import { createQuotaManager } from './utils/api-quota-manager.js';
import { createMarketDiscoveryEngine } from './utils/market-discovery.js';
import { createPolymarketClient } from './utils/polymarket-client.js';
import { createMonitorService } from './utils/monitor-service.js';
import { OpikCallbackHandler } from 'opik-langchain';
import { createHealthCheckServer } from './utils/health-check-server.js';
import { validateMonitorEnvOrExit } from './utils/env-validator.js';

// Load .env file
loadEnv();

// ============================================================================
// Global State
// ============================================================================

let isShuttingDown = false;
let monitorService: ReturnType<typeof createMonitorService> | null = null;
let healthCheckServer: ReturnType<typeof createHealthCheckServer> | null = null;

// ============================================================================
// Main Entry Point
// ============================================================================

async function main(): Promise<void> {
  console.log('='.repeat(80));
  console.log('Automated Market Monitor');
  console.log('='.repeat(80));
  console.log();

  // Validate environment variables before starting
  validateMonitorEnvOrExit();

  try {
    // Initialize all components
    console.log('[Monitor] Initializing components...');

    // 1. Create Supabase client manager
    const supabaseManager = createSupabaseClientManager();
    await supabaseManager.connect();

    // 2. Create database persistence layer
    const database = createDatabasePersistence(supabaseManager);

    // 3. Create API quota manager
    const quotaManager = createQuotaManager();

    // 4. Create Polymarket client
    const polymarketClient = createPolymarketClient(config.polymarket);

    // 5. Create shared Opik handler for unified tracing
    const opikHandler = new OpikCallbackHandler({
      projectName: config.opik.projectName,
    });

    // 6. Create market discovery engine with Opik handler
    const discovery = createMarketDiscoveryEngine(config.polymarket, opikHandler);

    // 7. Create monitor service
    monitorService = createMonitorService(
      config,
      supabaseManager,
      database,
      quotaManager,
      discovery,
      polymarketClient,
      opikHandler
    );

    // 8. Initialize monitor service
    await monitorService.initialize();

    // 9. Create health check server
    const healthCheckPort = parseInt(process.env.HEALTH_CHECK_PORT || '3000', 10);
    const enableManualTriggers = process.env.ENABLE_MANUAL_TRIGGERS !== 'false';

    healthCheckServer = createHealthCheckServer(monitorService, {
      port: healthCheckPort,
      enableManualTriggers,
    });

    // 9. Start health check server
    await healthCheckServer.start();

    // 10. Start monitor service
    await monitorService.start();

    console.log();
    console.log('='.repeat(80));
    console.log('Monitor started successfully');
    console.log(`Health check endpoint: http://localhost:${healthCheckPort}/health`);
    if (enableManualTriggers) {
      console.log(`Manual trigger endpoint: http://localhost:${healthCheckPort}/trigger`);
    }
    console.log('='.repeat(80));
    console.log();
  } catch (error) {
    console.error('[Monitor] Initialization failed:', error);
    process.exit(1);
  }
}

// ============================================================================
// Graceful Shutdown Handler
// ============================================================================

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log('[Monitor] Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;

  console.log();
  console.log('='.repeat(80));
  console.log(`[Monitor] Received ${signal}, initiating graceful shutdown...`);
  console.log('='.repeat(80));

  try {
    // Stop health check server first
    if (healthCheckServer) {
      console.log('[Monitor] Stopping health check server...');
      await healthCheckServer.stop();
    }

    // Stop monitor service (waits for current cycle to complete)
    if (monitorService) {
      console.log('[Monitor] Stopping monitor service...');
      await monitorService.stop();
    }

    console.log('[Monitor] Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[Monitor] Error during shutdown:', error);
    process.exit(1);
  }
}

// ============================================================================
// Error Handlers
// ============================================================================

/**
 * Handle uncaught exceptions
 */
function handleUncaughtException(error: Error): void {
  console.error('[Monitor] Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);

  // Attempt graceful shutdown
  gracefulShutdown('UNCAUGHT_EXCEPTION')
    .catch((shutdownError) => {
      console.error('[Monitor] Failed to shutdown gracefully:', shutdownError);
      process.exit(1);
    });
}

/**
 * Handle unhandled promise rejections
 */
function handleUnhandledRejection(reason: unknown, promise: Promise<unknown>): void {
  console.error('[Monitor] Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);

  // Attempt graceful shutdown
  gracefulShutdown('UNHANDLED_REJECTION')
    .catch((shutdownError) => {
      console.error('[Monitor] Failed to shutdown gracefully:', shutdownError);
      process.exit(1);
    });
}

// ============================================================================
// Process Event Handlers
// ============================================================================

// Graceful shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handlers
process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

// Process exit handler
process.on('exit', (code) => {
  console.log(`[Monitor] Process exiting with code: ${code}`);
});

// ============================================================================
// Start the Monitor
// ============================================================================

main().catch((error) => {
  console.error('[Monitor] Fatal error:', error);
  process.exit(1);
});
