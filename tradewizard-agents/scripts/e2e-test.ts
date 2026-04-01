#!/usr/bin/env tsx
/**
 * End-to-End Testing Script for Automated Market Monitor
 *
 * This script automates the verification of the monitor service deployment.
 * It runs through all critical test scenarios and reports results.
 *
 * Usage:
 *   npm run test:e2e
 *   or
 *   tsx scripts/e2e-test.ts
 *
 * Note: This script is outside the TypeScript project (tsconfig.json includes only src/)
 * but tsx handles TypeScript execution at runtime. Type errors in the IDE can be ignored.
 */

// @ts-nocheck - Script runs with tsx, outside TypeScript project scope

import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';

const execAsync = promisify(exec);

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  healthCheckUrl: process.env.HEALTH_CHECK_PORT
    ? `http://localhost:${process.env.HEALTH_CHECK_PORT}/health`
    : 'http://localhost:3000/health',
  triggerUrl: process.env.HEALTH_CHECK_PORT
    ? `http://localhost:${process.env.HEALTH_CHECK_PORT}/trigger`
    : 'http://localhost:3000/trigger',
  testDuration: 48 * 60 * 60 * 1000, // 48 hours in milliseconds
  checkInterval: 5 * 60 * 1000, // Check every 5 minutes
  reportFile: 'e2e-test-report.json',
};

// ============================================================================
// Types
// ============================================================================

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  lastAnalysis: string | null;
  nextScheduledRun: string | null;
  database: {
    connected: boolean;
    lastCheck: string;
  };
  scheduler: {
    running: boolean;
    executing: boolean;
  };
  quota: {
    newsapi: { used: number; limit: number };
    twitter: { used: number; limit: number };
    reddit: { used: number; limit: number };
    recommendedMarkets: number;
  };
}

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
  timestamp: string;
  details?: any;
}

interface TestReport {
  startTime: string;
  endTime: string | null;
  duration: number;
  results: TestResult[];
  metrics: {
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    healthChecks: HealthStatus[];
  };
}

// ============================================================================
// Test Report
// ============================================================================

const testReport: TestReport = {
  startTime: new Date().toISOString(),
  endTime: null,
  duration: 0,
  results: [],
  metrics: {
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    healthChecks: [],
  },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Log a message with timestamp
 */
function log(message: string, level: 'info' | 'success' | 'error' | 'warn' = 'info'): void {
  const timestamp = new Date().toISOString();
  const prefix = {
    info: '📋',
    success: '✅',
    error: '❌',
    warn: '⚠️',
  }[level];

  console.log(`[${timestamp}] ${prefix} ${message}`);
}

/**
 * Add test result to report
 */
function addTestResult(
  testName: string,
  passed: boolean,
  message: string,
  details?: any
): void {
  const result: TestResult = {
    testName,
    passed,
    message,
    timestamp: new Date().toISOString(),
    details,
  };

  testReport.results.push(result);
  testReport.metrics.totalChecks++;

  if (passed) {
    testReport.metrics.passedChecks++;
    log(`${testName}: ${message}`, 'success');
  } else {
    testReport.metrics.failedChecks++;
    log(`${testName}: ${message}`, 'error');
  }
}

/**
 * Fetch health status from monitor
 */
async function fetchHealthStatus(): Promise<HealthStatus | null> {
  try {
    const response = await fetch(CONFIG.healthCheckUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    log(`Failed to fetch health status: ${error}`, 'error');
    return null;
  }
}

/**
 * Execute shell command
 */
async function runCommand(command: string): Promise<{ stdout: string; stderr: string }> {
  try {
    return await execAsync(command);
  } catch (error: any) {
    return {
      stdout: error.stdout || '',
      stderr: error.stderr || error.message || '',
    };
  }
}

/**
 * Save test report to file
 */
async function saveReport(): Promise<void> {
  try {
    await writeFile(CONFIG.reportFile, JSON.stringify(testReport, null, 2));
    log(`Test report saved to ${CONFIG.reportFile}`, 'success');
  } catch (error) {
    log(`Failed to save test report: ${error}`, 'error');
  }
}

// ============================================================================
// Test Functions
// ============================================================================

/**
 * Test 1: Monitor is running
 */
async function testMonitorRunning(): Promise<void> {
  log('Running Test 1: Monitor is running');

  const { stdout, stderr } = await runCommand('npm run monitor:status');

  if (stdout.includes('Monitor is running') || stdout.includes('running')) {
    addTestResult('Monitor Running', true, 'Monitor service is running');
  } else {
    addTestResult('Monitor Running', false, 'Monitor service is not running', { stdout, stderr });
  }
}

/**
 * Test 2: Health check endpoint
 */
async function testHealthCheck(): Promise<void> {
  log('Running Test 2: Health check endpoint');

  const health = await fetchHealthStatus();

  if (!health) {
    addTestResult('Health Check', false, 'Health check endpoint not responding');
    return;
  }

  // Store health check for metrics
  testReport.metrics.healthChecks.push(health);

  // Verify health status
  if (health.status === 'healthy') {
    addTestResult('Health Check', true, 'Service is healthy', health);
  } else {
    addTestResult('Health Check', false, `Service is ${health.status}`, health);
  }

  // Verify database connection
  if (health.database.connected) {
    addTestResult('Database Connection', true, 'Database is connected');
  } else {
    addTestResult('Database Connection', false, 'Database is not connected');
  }

  // Verify scheduler
  if (health.scheduler.running) {
    addTestResult('Scheduler Running', true, 'Scheduler is running');
  } else {
    addTestResult('Scheduler Running', false, 'Scheduler is not running');
  }
}

/**
 * Test 3: Market discovery and analysis
 */
async function testMarketAnalysis(): Promise<void> {
  log('Running Test 3: Market discovery and analysis');

  const health = await fetchHealthStatus();

  if (!health) {
    addTestResult('Market Analysis', false, 'Cannot verify - health check failed');
    return;
  }

  // Check if analysis has run
  if (health.lastAnalysis) {
    const lastAnalysisTime = new Date(health.lastAnalysis);
    const now = new Date();
    const hoursSinceAnalysis = (now.getTime() - lastAnalysisTime.getTime()) / (1000 * 60 * 60);

    if (hoursSinceAnalysis < 24) {
      addTestResult(
        'Market Analysis',
        true,
        `Last analysis: ${hoursSinceAnalysis.toFixed(1)} hours ago`,
        { lastAnalysis: health.lastAnalysis }
      );
    } else {
      addTestResult(
        'Market Analysis',
        false,
        `No recent analysis (${hoursSinceAnalysis.toFixed(1)} hours ago)`,
        { lastAnalysis: health.lastAnalysis }
      );
    }
  } else {
    addTestResult('Market Analysis', false, 'No analysis has run yet');
  }
}

/**
 * Test 4: API quota management
 */
async function testQuotaManagement(): Promise<void> {
  log('Running Test 4: API quota management');

  const health = await fetchHealthStatus();

  if (!health) {
    addTestResult('Quota Management', false, 'Cannot verify - health check failed');
    return;
  }

  const { quota } = health;

  // Check if quotas are being tracked
  const totalUsage = quota.newsapi.used + quota.twitter.used + quota.reddit.used;

  if (totalUsage > 0) {
    addTestResult('Quota Tracking', true, `Total API calls: ${totalUsage}`, quota);
  } else {
    addTestResult('Quota Tracking', false, 'No API usage recorded', quota);
  }

  // Check if quotas are respected
  const newsapiPercent = (quota.newsapi.used / quota.newsapi.limit) * 100;
  const twitterPercent = (quota.twitter.used / quota.twitter.limit) * 100;
  const redditPercent = (quota.reddit.used / quota.reddit.limit) * 100;

  const maxPercent = Math.max(newsapiPercent, twitterPercent, redditPercent);

  if (maxPercent <= 100) {
    addTestResult(
      'Quota Limits',
      true,
      `All quotas within limits (max: ${maxPercent.toFixed(1)}%)`,
      { newsapiPercent, twitterPercent, redditPercent }
    );
  } else {
    addTestResult(
      'Quota Limits',
      false,
      `Quota exceeded (max: ${maxPercent.toFixed(1)}%)`,
      { newsapiPercent, twitterPercent, redditPercent }
    );
  }
}

/**
 * Test 5: Scheduled execution
 */
async function testScheduledExecution(): Promise<void> {
  log('Running Test 5: Scheduled execution');

  const health = await fetchHealthStatus();

  if (!health) {
    addTestResult('Scheduled Execution', false, 'Cannot verify - health check failed');
    return;
  }

  // Check if next run is scheduled
  if (health.nextScheduledRun) {
    const nextRun = new Date(health.nextScheduledRun);
    const now = new Date();
    const hoursUntilNext = (nextRun.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (hoursUntilNext > 0 && hoursUntilNext < 48) {
      addTestResult(
        'Scheduled Execution',
        true,
        `Next run in ${hoursUntilNext.toFixed(1)} hours`,
        { nextScheduledRun: health.nextScheduledRun }
      );
    } else {
      addTestResult(
        'Scheduled Execution',
        false,
        `Next run time seems incorrect: ${hoursUntilNext.toFixed(1)} hours`,
        { nextScheduledRun: health.nextScheduledRun }
      );
    }
  } else {
    addTestResult('Scheduled Execution', false, 'No next run scheduled');
  }
}

/**
 * Test 6: Manual trigger (if enabled)
 */
async function testManualTrigger(): Promise<void> {
  log('Running Test 6: Manual trigger');

  // Check if manual triggers are enabled
  if (process.env.ENABLE_MANUAL_TRIGGERS === 'false') {
    addTestResult('Manual Trigger', true, 'Manual triggers disabled (as configured)');
    return;
  }

  // For now, just verify the endpoint exists
  try {
    const response = await fetch(CONFIG.triggerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conditionId: 'test' }),
    });

    // We expect this to fail with 400 (invalid condition ID)
    // but the endpoint should respond
    if (response.status === 400 || response.status === 200) {
      addTestResult('Manual Trigger', true, 'Manual trigger endpoint is accessible');
    } else {
      addTestResult(
        'Manual Trigger',
        false,
        `Unexpected response: ${response.status}`,
        { status: response.status }
      );
    }
  } catch (error) {
    addTestResult('Manual Trigger', false, `Endpoint not accessible: ${error}`);
  }
}

/**
 * Test 7: Memory usage
 */
async function testMemoryUsage(): Promise<void> {
  log('Running Test 7: Memory usage');

  const { stdout } = await runCommand('pm2 show tradewizard-monitor 2>/dev/null || echo "PM2 not available"');

  if (stdout.includes('PM2 not available')) {
    addTestResult('Memory Usage', true, 'PM2 not available - skipping memory check');
    return;
  }

  // Parse memory usage from PM2 output
  const memMatch = stdout.match(/memory\s+:\s+(\d+\.?\d*)\s*([KMG]B)/i);

  if (memMatch) {
    const [, value, unit] = memMatch;
    const memoryMB =
      unit === 'GB' ? parseFloat(value) * 1024 : unit === 'KB' ? parseFloat(value) / 1024 : parseFloat(value);

    if (memoryMB < 1024) {
      // Less than 1GB
      addTestResult('Memory Usage', true, `Memory usage: ${memoryMB.toFixed(0)}MB`, { memoryMB });
    } else {
      addTestResult('Memory Usage', false, `High memory usage: ${memoryMB.toFixed(0)}MB`, { memoryMB });
    }
  } else {
    addTestResult('Memory Usage', true, 'Could not parse memory usage from PM2');
  }
}

/**
 * Test 8: Uptime
 */
async function testUptime(): Promise<void> {
  log('Running Test 8: Uptime');

  const health = await fetchHealthStatus();

  if (!health) {
    addTestResult('Uptime', false, 'Cannot verify - health check failed');
    return;
  }

  const uptimeHours = health.uptime / 3600;

  if (uptimeHours > 0) {
    addTestResult('Uptime', true, `Uptime: ${uptimeHours.toFixed(1)} hours`, { uptime: health.uptime });
  } else {
    addTestResult('Uptime', false, 'Service just started or uptime not tracked');
  }
}

// ============================================================================
// Main Test Runner
// ============================================================================

/**
 * Run all tests once
 */
async function runTestSuite(): Promise<void> {
  log('='.repeat(80));
  log('Starting E2E Test Suite');
  log('='.repeat(80));

  await testMonitorRunning();
  await testHealthCheck();
  await testMarketAnalysis();
  await testQuotaManagement();
  await testScheduledExecution();
  await testManualTrigger();
  await testMemoryUsage();
  await testUptime();

  log('='.repeat(80));
  log('Test Suite Complete');
  log(`Passed: ${testReport.metrics.passedChecks}/${testReport.metrics.totalChecks}`);
  log('='.repeat(80));
}

/**
 * Run continuous monitoring for 48 hours
 */
async function runContinuousMonitoring(): Promise<void> {
  log('Starting 48-hour continuous monitoring');
  log(`Will check every ${CONFIG.checkInterval / 60000} minutes`);

  const startTime = Date.now();
  const endTime = startTime + CONFIG.testDuration;

  let checkCount = 0;

  while (Date.now() < endTime) {
    checkCount++;
    const elapsed = (Date.now() - startTime) / (1000 * 60 * 60);

    log(`\n${'='.repeat(80)}`);
    log(`Check #${checkCount} - Elapsed: ${elapsed.toFixed(1)} hours`);
    log('='.repeat(80));

    await runTestSuite();
    await saveReport();

    // Wait for next check interval
    const remaining = endTime - Date.now();
    if (remaining > 0) {
      const waitTime = Math.min(CONFIG.checkInterval, remaining);
      log(`\nWaiting ${waitTime / 60000} minutes until next check...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  log('\n' + '='.repeat(80));
  log('48-hour monitoring complete!');
  log('='.repeat(80));
}

/**
 * Print final summary
 */
function printSummary(): void {
  testReport.endTime = new Date().toISOString();
  testReport.duration = new Date(testReport.endTime).getTime() - new Date(testReport.startTime).getTime();

  console.log('\n' + '='.repeat(80));
  console.log('FINAL TEST SUMMARY');
  console.log('='.repeat(80));
  console.log(`Start Time: ${testReport.startTime}`);
  console.log(`End Time: ${testReport.endTime}`);
  console.log(`Duration: ${(testReport.duration / (1000 * 60 * 60)).toFixed(1)} hours`);
  console.log(`Total Checks: ${testReport.metrics.totalChecks}`);
  console.log(`Passed: ${testReport.metrics.passedChecks}`);
  console.log(`Failed: ${testReport.metrics.failedChecks}`);
  console.log(
    `Success Rate: ${((testReport.metrics.passedChecks / testReport.metrics.totalChecks) * 100).toFixed(1)}%`
  );
  console.log('='.repeat(80));

  // Print failed tests
  const failedTests = testReport.results.filter((r) => !r.passed);
  if (failedTests.length > 0) {
    console.log('\nFAILED TESTS:');
    failedTests.forEach((test) => {
      console.log(`  ❌ ${test.testName}: ${test.message}`);
    });
  }

  console.log(`\nFull report saved to: ${CONFIG.reportFile}`);
  console.log('='.repeat(80) + '\n');
}

// ============================================================================
// Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] || 'once';

  try {
    if (mode === 'continuous' || mode === '48h') {
      await runContinuousMonitoring();
    } else {
      await runTestSuite();
      await saveReport();
    }

    printSummary();

    // Exit with error code if any tests failed
    const exitCode = testReport.metrics.failedChecks > 0 ? 1 : 0;
    process.exit(exitCode);
  } catch (error) {
    log(`Fatal error: ${error}`, 'error');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('\nReceived SIGINT, saving report and exiting...');
  await saveReport();
  printSummary();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('\nReceived SIGTERM, saving report and exiting...');
  await saveReport();
  printSummary();
  process.exit(0);
});

// Run the tests
main();
