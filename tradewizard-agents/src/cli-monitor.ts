#!/usr/bin/env node
/**
 * CLI for Monitor Management
 *
 * Provides command-line interface for managing the Automated Market Monitor service.
 * Supports starting, stopping, checking status, triggering analysis, and health checks.
 *
 * Requirements: 13.1, 13.2, 13.3
 */

import { config } from 'dotenv';
import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as http from 'node:http';

// Load .env file
config();

const execAsync = promisify(exec);

// ============================================================================
// Constants
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PID_FILE = path.join(PROJECT_ROOT, '.monitor.pid');
const HEALTH_CHECK_PORT = parseInt(process.env.HEALTH_CHECK_PORT || '3000', 10);
const HEALTH_CHECK_URL = `http://localhost:${HEALTH_CHECK_PORT}`;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if PM2 is available
 */
async function isPM2Available(): Promise<boolean> {
  try {
    await execAsync('pm2 --version');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if monitor is running via PM2
 */
async function isRunningViaPM2(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('pm2 jlist');
    const processes = JSON.parse(stdout);
    return processes.some((p: any) => p.name === 'tradewizard-monitor' && p.pm2_env?.status === 'online');
  } catch {
    return false;
  }
}

/**
 * Check if monitor is running via PID file
 */
async function isRunningViaPID(): Promise<boolean> {
  try {
    const pidStr = await fs.readFile(PID_FILE, 'utf-8');
    const pid = parseInt(pidStr.trim(), 10);
    
    if (isNaN(pid)) {
      return false;
    }
    
    // Check if process is running
    try {
      process.kill(pid, 0); // Signal 0 checks if process exists
      return true;
    } catch {
      // Process doesn't exist, clean up PID file
      await fs.unlink(PID_FILE).catch(() => {});
      return false;
    }
  } catch {
    return false;
  }
}

/**
 * Check if monitor is running
 */
async function isMonitorRunning(): Promise<{ running: boolean; method: 'pm2' | 'pid' | 'none' }> {
  if (await isRunningViaPM2()) {
    return { running: true, method: 'pm2' };
  }
  
  if (await isRunningViaPID()) {
    return { running: true, method: 'pid' };
  }
  
  return { running: false, method: 'none' };
}

/**
 * Make HTTP request
 */
async function httpRequest(url: string, options: { method?: string; body?: any } = {}): Promise<any> {
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : undefined;
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res: any) => {
        let data = '';
        
        res.on('data', (chunk: any) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            resolve({ statusCode: res.statusCode, data: parsed });
          } catch {
            resolve({ statusCode: res.statusCode, data });
          }
        });
      }
    );
    
    req.on('error', (error: Error) => {
      reject(error);
    });
    
    if (body) {
      req.write(body);
    }
    
    req.end();
  });
}

// ============================================================================
// Command Implementations
// ============================================================================

/**
 * Start the monitor
 */
async function startMonitor(): Promise<void> {
  console.log('Starting Automated Market Monitor...');
  console.log();
  
  // Validate environment variables first
  const { validateMonitorEnv, printValidationResult } = await import('./utils/env-validator.js');
  const validationResult = validateMonitorEnv();
  printValidationResult(validationResult);
  
  if (!validationResult.valid) {
    console.error('✗ Cannot start monitor: environment validation failed');
    console.error('  Please fix the errors above and try again');
    process.exit(1);
  }
  
  // Check if already running
  const status = await isMonitorRunning();
  if (status.running) {
    console.log(`✓ Monitor is already running (via ${status.method})`);
    return;
  }
  
  // Check if PM2 is available
  const hasPM2 = await isPM2Available();
  
  if (hasPM2) {
    // Start via PM2
    console.log('Starting monitor via PM2...');
    try {
      await execAsync('pm2 start ecosystem.config.cjs');
      console.log('✓ Monitor started successfully via PM2');
      console.log('  Use "pm2 logs tradewizard-monitor" to view logs');
      console.log('  Use "pm2 monit" to monitor the process');
    } catch (error) {
      console.error('✗ Failed to start monitor via PM2:', error);
      process.exit(1);
    }
  } else {
    // Start as background process
    console.log('Starting monitor as background process...');
    console.log('  (Install PM2 for better process management: npm install -g pm2)');
    
    // Check if we're in development mode (NODE_ENV=development or tsx available)
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined;
    
    let command: string;
    let args: string[];
    let scriptPath: string;
    
    if (isDevelopment) {
      // Use tsx for development
      command = 'npx';
      args = ['tsx', 'src/monitor.ts'];
      scriptPath = path.join(PROJECT_ROOT, 'src', 'monitor.ts');
      console.log('  Using tsx for development mode');
    } else {
      // Use compiled version for production
      command = 'node';
      scriptPath = path.join(PROJECT_ROOT, 'dist', 'monitor.js');
      args = [scriptPath];
      
      // Check if built
      try {
        await fs.access(scriptPath);
      } catch {
        console.error('✗ Monitor script not found. Run "npm run build" first.');
        process.exit(1);
      }
    }
    
    // Spawn detached process
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      cwd: PROJECT_ROOT,
    });
    
    // Save PID
    await fs.writeFile(PID_FILE, child.pid!.toString());
    
    // Detach from parent
    child.unref();
    
    console.log(`✓ Monitor started successfully (PID: ${child.pid})`);
    console.log(`  Health check: ${HEALTH_CHECK_URL}/health`);
    
    // Wait a moment and verify it started
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    try {
      const { data } = await httpRequest(`${HEALTH_CHECK_URL}/health`);
      console.log(`✓ Monitor is healthy: ${data.status}`);
    } catch {
      console.warn('⚠ Could not verify monitor health (it may still be starting)');
    }
  }
}

/**
 * Stop the monitor
 */
async function stopMonitor(): Promise<void> {
  console.log('Stopping Automated Market Monitor...');
  
  const status = await isMonitorRunning();
  
  if (!status.running) {
    console.log('✓ Monitor is not running');
    return;
  }
  
  if (status.method === 'pm2') {
    // Stop via PM2
    console.log('Stopping monitor via PM2...');
    try {
      await execAsync('pm2 stop tradewizard-monitor');
      console.log('✓ Monitor stopped successfully');
    } catch (error) {
      console.error('✗ Failed to stop monitor via PM2:', error);
      process.exit(1);
    }
  } else {
    // Stop via PID file
    console.log('Stopping monitor via signal...');
    try {
      const pidStr = await fs.readFile(PID_FILE, 'utf-8');
      const pid = parseInt(pidStr.trim(), 10);
      
      // Send SIGTERM for graceful shutdown
      process.kill(pid, 'SIGTERM');
      
      // Wait for process to exit
      let attempts = 0;
      while (attempts < 30) {
        try {
          process.kill(pid, 0);
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
        } catch {
          // Process exited
          break;
        }
      }
      
      // Clean up PID file
      await fs.unlink(PID_FILE).catch(() => {});
      
      if (attempts >= 30) {
        console.warn('⚠ Monitor did not stop gracefully, sending SIGKILL...');
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // Already dead
        }
      }
      
      console.log('✓ Monitor stopped successfully');
    } catch (error) {
      console.error('✗ Failed to stop monitor:', error);
      process.exit(1);
    }
  }
}

/**
 * Get monitor status
 */
async function getStatus(): Promise<void> {
  console.log('Checking Automated Market Monitor status...');
  console.log();
  
  const status = await isMonitorRunning();
  
  if (!status.running) {
    console.log('Status: ✗ Not running');
    process.exit(1);
  }
  
  console.log(`Status: ✓ Running (via ${status.method})`);
  console.log();
  
  // Get health information
  try {
    const { data } = await httpRequest(`${HEALTH_CHECK_URL}/health`);
    
    console.log('Health Information:');
    console.log(`  Status: ${data.status}`);
    console.log(`  Uptime: ${Math.floor(data.uptime / 60)} minutes`);
    console.log(`  Database: ${data.database ? '✓ Connected' : '✗ Disconnected'}`);
    console.log(`  Scheduler: ${data.scheduler ? '✓ Running' : '✗ Stopped'}`);
    
    if (data.lastAnalysis) {
      const lastAnalysis = new Date(data.lastAnalysis);
      const minutesAgo = Math.floor((Date.now() - lastAnalysis.getTime()) / 60000);
      console.log(`  Last Analysis: ${minutesAgo} minutes ago`);
    } else {
      console.log('  Last Analysis: Never');
    }
    
    if (data.nextScheduledRun) {
      const nextRun = new Date(data.nextScheduledRun);
      const minutesUntil = Math.floor((nextRun.getTime() - Date.now()) / 60000);
      console.log(`  Next Run: in ${minutesUntil} minutes`);
    }
    
    if (data.quotaStatus) {
      console.log();
      console.log('API Quota Status:');
      for (const [source, usage] of Object.entries(data.quotaStatus)) {
        const quota = usage as any;
        const percentage = ((quota.used / quota.limit) * 100).toFixed(1);
        console.log(`  ${source}: ${quota.used}/${quota.limit} (${percentage}%)`);
      }
    }
  } catch (error) {
    console.error('✗ Could not fetch health information:', error);
    console.log('  (Monitor may be starting up or health endpoint is not accessible)');
  }
}

/**
 * Get health check
 */
async function getHealth(): Promise<void> {
  try {
    const { statusCode, data } = await httpRequest(`${HEALTH_CHECK_URL}/health`);
    
    console.log(JSON.stringify(data, null, 2));
    
    if (statusCode !== 200) {
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Health check failed:', error);
    console.error('  Is the monitor running?');
    process.exit(1);
  }
}

/**
 * Trigger manual analysis
 */
async function triggerAnalysis(conditionId: string): Promise<void> {
  if (!conditionId) {
    console.error('✗ Error: conditionId is required');
    console.log('  Usage: npm run monitor:trigger <conditionId>');
    process.exit(1);
  }
  
  console.log(`Triggering analysis for market: ${conditionId}`);
  console.log('This may take several minutes...');
  console.log();
  
  try {
    const { statusCode, data } = await httpRequest(`${HEALTH_CHECK_URL}/trigger`, {
      method: 'POST',
      body: { conditionId },
    });
    
    if (statusCode === 200) {
      console.log('✓ Analysis completed successfully');
      console.log();
      console.log('Recommendation:');
      console.log(`  Direction: ${data.recommendation.direction}`);
      console.log(`  Confidence: ${data.recommendation.confidence}`);
      console.log(`  Fair Probability: ${(data.recommendation.fairProbability * 100).toFixed(1)}%`);
      console.log(`  Market Edge: ${(data.recommendation.marketEdge * 100).toFixed(2)}%`);
      console.log();
      console.log(`  Entry Zone: ${(data.recommendation.entryZone.min * 100).toFixed(1)}% - ${(data.recommendation.entryZone.max * 100).toFixed(1)}%`);
      console.log(`  Target Zone: ${(data.recommendation.targetZone.min * 100).toFixed(1)}% - ${(data.recommendation.targetZone.max * 100).toFixed(1)}%`);
    } else {
      console.error('✗ Analysis failed:', data.error || data.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('✗ Failed to trigger analysis:', error);
    console.error('  Is the monitor running?');
    console.error('  Are manual triggers enabled? (ENABLE_MANUAL_TRIGGERS=true)');
    process.exit(1);
  }
}

// ============================================================================
// Main CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'start':
      await startMonitor();
      break;
      
    case 'stop':
      await stopMonitor();
      break;
      
    case 'status':
      await getStatus();
      break;
      
    case 'health':
      await getHealth();
      break;
      
    case 'trigger':
      await triggerAnalysis(args[1]);
      break;
      
    default:
      console.log('Automated Market Monitor CLI');
      console.log();
      console.log('Usage:');
      console.log('  npm run monitor:start              Start the monitor');
      console.log('  npm run monitor:stop               Stop the monitor');
      console.log('  npm run monitor:status             Check monitor status');
      console.log('  npm run monitor:health             Get health check JSON');
      console.log('  npm run monitor:trigger <id>       Trigger analysis for a market');
      console.log();
      console.log('Examples:');
      console.log('  npm run monitor:start');
      console.log('  npm run monitor:status');
      console.log('  npm run monitor:trigger 0x1234567890abcdef');
      console.log();
      process.exit(command ? 1 : 0);
  }
}

// Run CLI
main().catch((error) => {
  console.error('✗ Fatal error:', error);
  process.exit(1);
});
