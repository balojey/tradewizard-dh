/**
 * Unit tests for Scheduler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CronScheduler, createScheduler, type AnalysisCycleFunction } from './scheduler.js';

describe('CronScheduler', () => {
  let scheduler: CronScheduler;
  let mockAnalysisCycle: AnalysisCycleFunction;
  let callCount: number;

  beforeEach(() => {
    callCount = 0;
    mockAnalysisCycle = vi.fn(async () => {
      callCount++;
      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    scheduler = new CronScheduler(mockAnalysisCycle);
  });

  describe('scheduler start and stop', () => {
    it('should start scheduler and run immediately', async () => {
      scheduler.start(1000);

      // Wait for initial execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockAnalysisCycle).toHaveBeenCalledTimes(1);
      expect(scheduler.isRunning()).toBe(true);

      await scheduler.stop();
    });

    it('should stop scheduler gracefully', async () => {
      scheduler.start(1000);

      // Wait for initial execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      await scheduler.stop();

      expect(scheduler.isRunning()).toBe(false);
      expect(scheduler.getNextRun()).toBeNull();
    });

    it('should not start if already running', async () => {
      scheduler.start(1000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      const initialCallCount = callCount;

      // Try to start again
      scheduler.start(1000);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not have triggered another immediate execution
      expect(callCount).toBe(initialCallCount);

      await scheduler.stop();
    });

    it('should wait for current cycle to complete before stopping', async () => {
      let isExecuting = false;
      let executionCompleted = false;

      const longRunningCycle = vi.fn(async () => {
        isExecuting = true;
        await new Promise((resolve) => setTimeout(resolve, 100));
        executionCompleted = true;
        isExecuting = false;
      });

      const longScheduler = new CronScheduler(longRunningCycle);
      longScheduler.start(5000);

      // Wait for execution to start
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(isExecuting).toBe(true);

      // Start stopping
      const stopPromise = longScheduler.stop();

      // Should still be executing
      expect(isExecuting).toBe(true);

      // Wait for stop to complete
      await stopPromise;

      // Execution should have completed
      expect(executionCompleted).toBe(true);
      expect(isExecuting).toBe(false);
    });
  });

  describe('interval timing', () => {
    it('should execute at configured interval', async () => {
      const interval = 200; // 200ms for faster testing
      scheduler.start(interval);

      // Wait for initial execution
      await new Promise((resolve) => setTimeout(resolve, 50));
      const initialCount = callCount;
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Wait for second execution
      await new Promise((resolve) => setTimeout(resolve, interval + 100));
      expect(callCount).toBeGreaterThanOrEqual(initialCount + 1);

      // Wait for third execution
      await new Promise((resolve) => setTimeout(resolve, interval + 100));
      expect(callCount).toBeGreaterThanOrEqual(initialCount + 2);

      await scheduler.stop();
    });

    it('should update next run time after each execution', async () => {
      const interval = 1000;
      scheduler.start(interval);

      // Wait for initial execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      const nextRun = scheduler.getNextRun();
      expect(nextRun).not.toBeNull();

      if (nextRun) {
        const expectedTime = Date.now() + interval;
        const timeDiff = Math.abs(nextRun.getTime() - expectedTime);
        // Allow 100ms tolerance
        expect(timeDiff).toBeLessThan(100);
      }

      await scheduler.stop();
    });

    it('should use default interval of 24 hours when not specified', async () => {
      scheduler.start();

      await new Promise((resolve) => setTimeout(resolve, 50));

      const nextRun = scheduler.getNextRun();
      expect(nextRun).not.toBeNull();

      if (nextRun) {
        const expectedTime = Date.now() + 24 * 60 * 60 * 1000;
        const timeDiff = Math.abs(nextRun.getTime() - expectedTime);
        // Allow 1 second tolerance
        expect(timeDiff).toBeLessThan(1000);
      }

      await scheduler.stop();
    });
  });

  describe('manual trigger', () => {
    it('should execute analysis cycle when manually triggered', async () => {
      // Don't start scheduler, just trigger manually
      await scheduler.triggerNow();

      expect(mockAnalysisCycle).toHaveBeenCalledTimes(1);
    });

    it('should allow manual trigger while scheduler is running', async () => {
      scheduler.start(5000); // Long interval

      // Wait for initial execution
      await new Promise((resolve) => setTimeout(resolve, 50));
      const initialCount = callCount;
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Manual trigger
      await scheduler.triggerNow();
      expect(callCount).toBe(initialCount + 1);

      await scheduler.stop();
    });

    it('should complete manual trigger before returning', async () => {
      let completed = false;
      const asyncCycle = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        completed = true;
      });

      const asyncScheduler = new CronScheduler(asyncCycle);

      await asyncScheduler.triggerNow();

      expect(completed).toBe(true);
    });
  });

  describe('concurrent execution prevention', () => {
    it('should not start new cycle if one is already running', async () => {
      let executionCount = 0;
      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      const trackingCycle = vi.fn(async () => {
        concurrentExecutions++;
        maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);
        executionCount++;

        await new Promise((resolve) => setTimeout(resolve, 100));

        concurrentExecutions--;
      });

      const trackingScheduler = new CronScheduler(trackingCycle);
      trackingScheduler.start(50); // Short interval to trigger overlap

      // Wait for multiple intervals
      await new Promise((resolve) => setTimeout(resolve, 300));

      await trackingScheduler.stop();

      // Should have prevented concurrent execution
      expect(maxConcurrent).toBe(1);
      // Should have executed at least once
      expect(executionCount).toBeGreaterThanOrEqual(1);
    });

    it('should skip execution if already executing', async () => {
      let isExecuting = false;
      let skippedCount = 0;

      const longCycle = vi.fn(async () => {
        if (isExecuting) {
          skippedCount++;
          return;
        }
        isExecuting = true;
        await new Promise((resolve) => setTimeout(resolve, 150));
        isExecuting = false;
      });

      const longScheduler = new CronScheduler(longCycle);
      longScheduler.start(50); // Very short interval

      // Wait for multiple intervals
      await new Promise((resolve) => setTimeout(resolve, 300));

      await longScheduler.stop();

      // Should have skipped some executions
      expect(longScheduler.isExecutingCycle()).toBe(false);
    });

    it('should prevent concurrent manual triggers', async () => {
      let concurrentExecutions = 0;
      let maxConcurrent = 0;

      const trackingCycle = vi.fn(async () => {
        concurrentExecutions++;
        maxConcurrent = Math.max(maxConcurrent, concurrentExecutions);

        await new Promise((resolve) => setTimeout(resolve, 100));

        concurrentExecutions--;
      });

      const trackingScheduler = new CronScheduler(trackingCycle);

      // Trigger multiple times concurrently
      const triggers = [
        trackingScheduler.triggerNow(),
        trackingScheduler.triggerNow(),
        trackingScheduler.triggerNow(),
      ];

      await Promise.all(triggers);

      // Should have prevented concurrent execution
      expect(maxConcurrent).toBe(1);
    });
  });

  describe('graceful shutdown', () => {
    it('should complete current execution before stopping', async () => {
      let executionStarted = false;
      let executionCompleted = false;

      const gracefulCycle = vi.fn(async () => {
        executionStarted = true;
        await new Promise((resolve) => setTimeout(resolve, 100));
        executionCompleted = true;
      });

      const gracefulScheduler = new CronScheduler(gracefulCycle);
      gracefulScheduler.start(5000);

      // Wait for execution to start
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(executionStarted).toBe(true);
      expect(executionCompleted).toBe(false);

      // Stop scheduler
      await gracefulScheduler.stop();

      // Execution should have completed
      expect(executionCompleted).toBe(true);
    });

    it('should not execute new cycles after stop is called', async () => {
      scheduler.start(100);

      // Wait for initial execution
      await new Promise((resolve) => setTimeout(resolve, 50));
      const countBeforeStop = callCount;
      expect(countBeforeStop).toBeGreaterThanOrEqual(1);

      // Stop scheduler
      await scheduler.stop();

      // Wait for what would have been the next interval
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should not have executed again
      expect(callCount).toBe(countBeforeStop);
    });

    it('should handle errors during shutdown gracefully', async () => {
      const errorCycle = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        throw new Error('Test error');
      });

      const errorScheduler = new CronScheduler(errorCycle);
      errorScheduler.start(5000);

      // Wait for execution to start
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should stop without throwing
      await expect(errorScheduler.stop()).resolves.not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should continue running after analysis cycle error', async () => {
      let errorThrown = false;
      const errorCycle = vi.fn(async () => {
        if (!errorThrown) {
          errorThrown = true;
          throw new Error('Test error');
        }
        // Second call succeeds
      });

      const errorScheduler = new CronScheduler(errorCycle);
      errorScheduler.start(100);

      // Wait for initial execution (will error)
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Wait for second execution (should succeed)
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(errorCycle).toHaveBeenCalledTimes(2);
      expect(errorScheduler.isRunning()).toBe(true);

      await errorScheduler.stop();
    });

    it('should log error and continue', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const errorCycle = vi.fn(async () => {
        throw new Error('Test error');
      });

      const errorScheduler = new CronScheduler(errorCycle);
      errorScheduler.start(100);

      // Wait for execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(errorScheduler.isRunning()).toBe(true);

      await errorScheduler.stop();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('createScheduler factory', () => {
    it('should create a scheduler instance', () => {
      const factoryScheduler = createScheduler(mockAnalysisCycle);
      expect(factoryScheduler).toBeInstanceOf(CronScheduler);
    });

    it('should create a functional scheduler', async () => {
      const factoryScheduler = createScheduler(mockAnalysisCycle);
      factoryScheduler.start(1000);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockAnalysisCycle).toHaveBeenCalled();
      expect(factoryScheduler.isRunning()).toBe(true);

      await factoryScheduler.stop();
    });
  });
});
