/**
 * Performance Monitoring Utility
 *
 * Provides real-time performance monitoring for the Automated Market Monitor.
 * Tracks memory usage, CPU usage, and operation timings over extended periods.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface PerformanceSnapshot {
  timestamp: number;
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  uptime: number;
}

export interface OperationTiming {
  operation: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface PerformanceReport {
  startTime: number;
  endTime: number;
  duration: number;
  snapshots: PerformanceSnapshot[];
  operations: OperationTiming[];
  summary: {
    memoryGrowth: number;
    avgMemoryUsed: number;
    maxMemoryUsed: number;
    avgCPU: number;
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    avgOperationTime: number;
    maxOperationTime: number;
  };
}

// ============================================================================
// Performance Monitor Class
// ============================================================================

export class PerformanceMonitor {
  private snapshots: PerformanceSnapshot[] = [];
  private operations: OperationTiming[] = [];
  private startTime: number;
  private snapshotInterval: NodeJS.Timeout | null = null;
  private outputPath: string;

  constructor(outputPath: string = './performance-report.json') {
    this.startTime = Date.now();
    this.outputPath = outputPath;
  }

  /**
   * Start monitoring with periodic snapshots
   */
  start(intervalMs: number = 60000): void {
    console.log('[PerformanceMonitor] Starting performance monitoring...');
    console.log(`[PerformanceMonitor] Snapshot interval: ${intervalMs}ms`);

    // Capture initial snapshot
    this.captureSnapshot();

    // Schedule periodic snapshots
    this.snapshotInterval = setInterval(() => {
      this.captureSnapshot();
      this.logCurrentStatus();
    }, intervalMs);
  }

  /**
   * Stop monitoring and generate report
   */
  stop(): PerformanceReport {
    console.log('[PerformanceMonitor] Stopping performance monitoring...');

    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }

    // Capture final snapshot
    this.captureSnapshot();

    // Generate report
    const report = this.generateReport();

    // Save report to file
    this.saveReport(report);

    // Log summary
    this.logSummary(report);

    return report;
  }

  /**
   * Record an operation timing
   */
  recordOperation(
    operation: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    this.operations.push({
      operation,
      duration,
      timestamp: Date.now(),
      success,
      error,
    });
  }

  /**
   * Get current performance metrics
   */
  getCurrentMetrics(): {
    memoryUsed: number;
    memoryGrowth: number;
    uptime: number;
    operationCount: number;
  } {
    const current = this.captureSnapshot();
    const initial = this.snapshots[0];

    const memoryGrowth = initial
      ? ((current.memory.heapUsed - initial.memory.heapUsed) / initial.memory.heapUsed) * 100
      : 0;

    return {
      memoryUsed: current.memory.heapUsed,
      memoryGrowth,
      uptime: current.uptime,
      operationCount: this.operations.length,
    };
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Capture a performance snapshot
   */
  private captureSnapshot(): PerformanceSnapshot {
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();

    const snapshot: PerformanceSnapshot = {
      timestamp: Date.now(),
      memory: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        rss: mem.rss,
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
      },
      uptime: process.uptime(),
    };

    this.snapshots.push(snapshot);
    return snapshot;
  }

  /**
   * Generate performance report
   */
  private generateReport(): PerformanceReport {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    const summary = this.calculateSummary();

    return {
      startTime: this.startTime,
      endTime,
      duration,
      snapshots: this.snapshots,
      operations: this.operations,
      summary,
    };
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary() {
    // Memory statistics
    const memoryValues = this.snapshots.map((s) => s.memory.heapUsed);
    const avgMemoryUsed = this.average(memoryValues);
    const maxMemoryUsed = Math.max(...memoryValues);

    const memoryGrowth =
      this.snapshots.length > 1
        ? ((this.snapshots[this.snapshots.length - 1].memory.heapUsed -
            this.snapshots[0].memory.heapUsed) /
            this.snapshots[0].memory.heapUsed) *
          100
        : 0;

    // CPU statistics
    const cpuValues = this.snapshots.map((s) => s.cpu.user + s.cpu.system);
    const avgCPU = this.average(cpuValues) / 1000000; // Convert to seconds

    // Operation statistics
    const totalOperations = this.operations.length;
    const successfulOperations = this.operations.filter((op) => op.success).length;
    const failedOperations = totalOperations - successfulOperations;

    const operationDurations = this.operations.map((op) => op.duration);
    const avgOperationTime = this.average(operationDurations);
    const maxOperationTime = operationDurations.length > 0 ? Math.max(...operationDurations) : 0;

    return {
      memoryGrowth,
      avgMemoryUsed,
      maxMemoryUsed,
      avgCPU,
      totalOperations,
      successfulOperations,
      failedOperations,
      avgOperationTime,
      maxOperationTime,
    };
  }

  /**
   * Calculate average of array
   */
  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  /**
   * Save report to file
   */
  private saveReport(report: PerformanceReport): void {
    try {
      const dir = path.dirname(this.outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.outputPath, JSON.stringify(report, null, 2));
      console.log(`[PerformanceMonitor] Report saved to: ${this.outputPath}`);
    } catch (error) {
      console.error('[PerformanceMonitor] Failed to save report:', error);
    }
  }

  /**
   * Log current status
   */
  private logCurrentStatus(): void {
    const metrics = this.getCurrentMetrics();

    console.log('[PerformanceMonitor] Current Status:');
    console.log(`  Memory Used: ${(metrics.memoryUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Memory Growth: ${metrics.memoryGrowth.toFixed(2)}%`);
    console.log(`  Uptime: ${(metrics.uptime / 60).toFixed(2)} minutes`);
    console.log(`  Operations: ${metrics.operationCount}`);
  }

  /**
   * Log summary
   */
  private logSummary(report: PerformanceReport): void {
    console.log('\n' + '='.repeat(80));
    console.log('PERFORMANCE MONITORING SUMMARY');
    console.log('='.repeat(80));
    console.log(`Duration: ${(report.duration / 1000 / 60).toFixed(2)} minutes`);
    console.log(`Snapshots: ${report.snapshots.length}`);
    console.log();
    console.log('Memory:');
    console.log(`  Growth: ${report.summary.memoryGrowth.toFixed(2)}%`);
    console.log(`  Average: ${(report.summary.avgMemoryUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Maximum: ${(report.summary.maxMemoryUsed / 1024 / 1024).toFixed(2)} MB`);
    console.log();
    console.log('CPU:');
    console.log(`  Average: ${report.summary.avgCPU.toFixed(2)}s`);
    console.log();
    console.log('Operations:');
    console.log(`  Total: ${report.summary.totalOperations}`);
    console.log(`  Successful: ${report.summary.successfulOperations}`);
    console.log(`  Failed: ${report.summary.failedOperations}`);
    console.log(
      `  Success Rate: ${((report.summary.successfulOperations / report.summary.totalOperations) * 100).toFixed(2)}%`
    );
    console.log(`  Average Time: ${report.summary.avgOperationTime.toFixed(2)}ms`);
    console.log(`  Maximum Time: ${report.summary.maxOperationTime.toFixed(2)}ms`);
    console.log('='.repeat(80));
  }
}

/**
 * Create a performance monitor instance
 */
export function createPerformanceMonitor(outputPath?: string): PerformanceMonitor {
  return new PerformanceMonitor(outputPath);
}
