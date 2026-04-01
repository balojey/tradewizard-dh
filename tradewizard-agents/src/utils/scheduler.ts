/**
 * Scheduler
 *
 * Manages timing of market discovery and analysis cycles.
 * Provides cron-based scheduling with configurable intervals,
 * manual triggers, and graceful shutdown support.
 */

/**
 * Scheduler interface
 */
export interface Scheduler {
  /**
   * Start the scheduler
   * @param interval - Analysis interval in milliseconds (default: 24 hours)
   */
  start(interval: number): void;

  /**
   * Stop the scheduler gracefully
   */
  stop(): Promise<void>;

  /**
   * Manually trigger an analysis cycle
   */
  triggerNow(): Promise<void>;

  /**
   * Get next scheduled run time
   */
  getNextRun(): Date | null;

  /**
   * Check if scheduler is currently running
   */
  isRunning(): boolean;
}

/**
 * Analysis cycle function type
 */
export type AnalysisCycleFunction = () => Promise<void>;

/**
 * Cron Scheduler implementation
 */
export class CronScheduler implements Scheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isExecuting: boolean = false;
  private nextRunTime: Date | null = null;
  private intervalMs: number = 0;
  private running: boolean = false;

  constructor(private analysisCycle: AnalysisCycleFunction) {}

  /**
   * Start the scheduler
   */
  start(interval: number = 24 * 60 * 60 * 1000): void {
    if (this.running) {
      console.warn('[Scheduler] Already running, ignoring start request');
      return;
    }

    this.running = true;
    this.intervalMs = interval;

    console.log(`[Scheduler] Starting with interval: ${interval}ms (${interval / 1000 / 60 / 60}h)`);

    // Run immediately on start
    this.runAnalysisCycle();

    // Schedule recurring runs
    this.intervalId = setInterval(() => {
      this.runAnalysisCycle();
    }, interval);

    // Calculate next run time
    this.nextRunTime = new Date(Date.now() + interval);
  }

  /**
   * Stop the scheduler gracefully
   */
  async stop(): Promise<void> {
    console.log('[Scheduler] Stopping scheduler...');
    this.running = false;

    // Clear interval
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Wait for current cycle to complete
    while (this.isExecuting) {
      console.log('[Scheduler] Waiting for current analysis cycle to complete...');
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.nextRunTime = null;
    console.log('[Scheduler] Scheduler stopped');
  }

  /**
   * Manually trigger an analysis cycle
   */
  async triggerNow(): Promise<void> {
    console.log('[Scheduler] Manual trigger requested');
    await this.runAnalysisCycle();
  }

  /**
   * Get next scheduled run time
   */
  getNextRun(): Date | null {
    return this.nextRunTime;
  }

  /**
   * Check if scheduler is currently running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check if analysis cycle is currently executing
   */
  isExecutingCycle(): boolean {
    return this.isExecuting;
  }

  /**
   * Run analysis cycle with concurrent execution prevention
   */
  private async runAnalysisCycle(): Promise<void> {
    // Prevent concurrent execution
    if (this.isExecuting) {
      console.warn('[Scheduler] Analysis cycle already running, skipping');
      return;
    }

    this.isExecuting = true;
    const startTime = Date.now();

    try {
      console.log('[Scheduler] Starting analysis cycle');
      await this.analysisCycle();
      const duration = Date.now() - startTime;
      console.log(`[Scheduler] Analysis cycle completed in ${duration}ms`);
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[Scheduler] Analysis cycle failed after ${duration}ms:`, error);
    } finally {
      this.isExecuting = false;

      // Update next run time
      if (this.running && this.intervalMs > 0) {
        this.nextRunTime = new Date(Date.now() + this.intervalMs);
      }
    }
  }
}

/**
 * Create a scheduler instance
 * @param analysisCycle - Function to execute on each cycle
 * @returns Configured Scheduler instance
 */
export function createScheduler(analysisCycle: AnalysisCycleFunction): Scheduler {
  return new CronScheduler(analysisCycle);
}
