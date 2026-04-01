#!/usr/bin/env tsx
/**
 * 24-Hour Continuous Operation Test
 *
 * This script runs the Automated Market Monitor for 24 hours and collects
 * performance metrics throughout the test period.
 *
 * Usage:
 *   npm run test:24h
 *   or
 *   tsx scripts/run-24h-test.ts [duration-in-hours]
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { config } from '../src/config/index.js';
import { createSupabaseClientManager } from '../src/database/supabase-client.js';
import { createDatabasePersistence } from '../src/database/persistence.js';
import { createQuotaManager } from '../src/utils/api-quota-manager.js';
import { createMarketDiscoveryEngine } from '../src/utils/market-discovery.js';
import { createPolymarketClient } from '../src/utils/polymarket-client.js';
import { createMonitorService } from '../src/utils/monitor-service.js';
import { createPerformanceMonitor } from '../src/utils/performance-monitor.js';

// ============================================================================
// Configuration
// ============================================================================

const TEST_DURATION_HOURS = parseInt(process.argv[2] || '24', 10);
const TEST_DURATION_MS = TEST_DURATION_HOURS * 60 * 60 * 1000;
const SNAPSHOT_INTERVAL_MS = 60 * 1000; // 1 minute
const ANALYSIS_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

console.log('='.repeat(80));
console.log('24-HOUR CONTINUOUS OPERATION TEST');
console.log('='.repeat(80));
console.log(`Test Duration: ${TEST_DURATION_HOURS} hours`);
console.log(`Snapshot Interval: ${SNAPSHOT_INTERVAL_MS / 1000} seconds`);
console.log(`Analysis Interval: ${ANALYSIS_INTERVAL_MS / 1000 / 60} minutes`);
console.log('='.repeat(80));
console.log();

// ============================================================================
// Global State
// ============================================================================

let isShuttingDown = false;
let monitor: ReturnType<typeof createMonitorService> | null = null;
let perfMonitor: ReturnType<typeof createPerformanceMonitor> | null = null;

// ============================================================================
// Main Test Function
// ============================================================================

async function runTest(): Promise<void> {
  console.log('[Test] Initializing components...');

  try {
    // Create performance monitor
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = `./performance-reports/24h-test-${timestamp}.json`;
    perfMonitor = createPerformanceMonitor(reportPath);
    perfMonitor.start(SNAPSHOT_INTERVAL_MS);

    // Create monitor components
    const supabaseManager = createSupabaseClientManager();
    await supabaseManager.connect();

    const database = createDatabasePersistence(supabaseManager);
    const quotaManager = createQuotaManager();
    const polymarketClient = createPolymarketClient(config.polymarket);
    const discovery = createMarketDiscoveryEngine(config.polymarket);

    monitor = createMonitorService(
      config,
      supabaseManager,
      database,
      quotaManager,
      discovery,
      polymarketClient
    );

    // Initialize monitor
    await monitor.initialize();

    console.log('[Test] Starting monitor service...');

    // Override analysis interval for testing
    process.env.ANALYSIS_INTERVAL_HOURS = String(ANALYSIS_INTERVAL_MS / 1000 / 60 / 60);

    // Start monitor
    await monitor.start();

    console.log('[Test] Monitor started successfully');
    console.log(`[Test] Test will run for ${TEST_DURATION_HOURS} hours`);
    console.log('[Test] Press Ctrl+C to stop early');
    console.log();

    // Wait for test duration
    await new Promise((resolve) => setTimeout(resolve, TEST_DURATION_MS));

    console.log('[Test] Test duration completed, stopping monitor...');
  } catch (error) {
    console.error('[Test] Test failed:', error);
    throw error;
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    console.log('[Test] Shutdown already in progress...');
    return;
  }

  isShuttingDown = true;

  console.log();
  console.log('='.repeat(80));
  console.log(`[Test] Received ${signal}, stopping test...`);
  console.log('='.repeat(80));

  try {
    // Stop monitor
    if (monitor) {
      console.log('[Test] Stopping monitor service...');
      await monitor.stop();
    }

    // Stop performance monitoring and generate report
    if (perfMonitor) {
      console.log('[Test] Generating performance report...');
      perfMonitor.stop();
    }

    console.log('[Test] Test completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[Test] Error during shutdown:', error);
    process.exit(1);
  }
}

// ============================================================================
// Error Handlers
// ============================================================================

function handleUncaughtException(error: Error): void {
  console.error('[Test] Uncaught Exception:', error);
  console.error('Stack trace:', error.stack);

  gracefulShutdown('UNCAUGHT_EXCEPTION').catch((shutdownError) => {
    console.error('[Test] Failed to shutdown gracefully:', shutdownError);
    process.exit(1);
  });
}

function handleUnhandledRejection(reason: unknown, promise: Promise<unknown>): void {
  console.error('[Test] Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);

  gracefulShutdown('UNHANDLED_REJECTION').catch((shutdownError) => {
    console.error('[Test] Failed to shutdown gracefully:', shutdownError);
    process.exit(1);
  });
}

// ============================================================================
// Process Event Handlers
// ============================================================================

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

// ============================================================================
// Run Test
// ============================================================================

runTest().catch((error) => {
  console.error('[Test] Fatal error:', error);
  process.exit(1);
});
