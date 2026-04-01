/**
 * Property-based tests for Scheduler
 *
 * Feature: automated-market-monitor, Property 4: Scheduled execution reliability
 * Validates: Requirements 2.1, 2.2
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { CronScheduler, type AnalysisCycleFunction } from './scheduler.js';

describe('Scheduler Property Tests', () => {
  /**
   * Property 4: Scheduled execution reliability
   *
   * For any configured analysis interval, the system should trigger market discovery
   * within acceptable timing variance of the scheduled time.
   *
   * This property validates that the scheduler executes at the configured interval
   * with acceptable timing variance.
   */
  it('Property 4: should trigger execution within acceptable timing variance', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate intervals between 100ms and 500ms for faster testing
        fc.integer({ min: 100, max: 500 }),
        async (intervalMs) => {
          const executionTimes: number[] = [];

          const trackingCycle: AnalysisCycleFunction = vi.fn(async () => {
            executionTimes.push(Date.now());
            // Simulate minimal work (5ms)
            await new Promise((resolve) => setTimeout(resolve, 5));
          });

          const scheduler = new CronScheduler(trackingCycle);

          // Start scheduler
          scheduler.start(intervalMs);

          // Wait for at least 2 executions
          const waitTime = intervalMs * 2 + 200;
          await new Promise((resolve) => setTimeout(resolve, waitTime));

          // Stop scheduler
          await scheduler.stop();

          // Should have executed at least 2 times
          expect(executionTimes.length).toBeGreaterThanOrEqual(2);

          // Check timing between executions
          for (let i = 1; i < executionTimes.length; i++) {
            const actualInterval = executionTimes[i] - executionTimes[i - 1];
            const expectedInterval = intervalMs;

            // Calculate variance (should be within 15% + 50ms buffer)
            const allowedVariance = expectedInterval * 0.15 + 50;
            const timeDiff = Math.abs(actualInterval - expectedInterval);

            // Timing should be within acceptable variance
            expect(timeDiff).toBeLessThanOrEqual(allowedVariance);
          }
        }
      ),
      {
        numRuns: 10, // Reduced for faster execution
        timeout: 5000,
      }
    );
  }, 10000);

  /**
   * Property: Scheduler should maintain consistent intervals across multiple cycles
   *
   * For any valid interval, the scheduler should execute consistently over multiple
   * cycles without significant drift or accumulating timing errors.
   */
  it('Property: should maintain consistent intervals without drift', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate intervals between 100ms and 500ms
        fc.integer({ min: 100, max: 500 }),
        async (intervalMs) => {
          const executionTimes: number[] = [];

          const trackingCycle: AnalysisCycleFunction = vi.fn(async () => {
            executionTimes.push(Date.now());
            await new Promise((resolve) => setTimeout(resolve, 5));
          });

          const scheduler = new CronScheduler(trackingCycle);
          scheduler.start(intervalMs);

          // Wait for 3 executions
          const waitTime = intervalMs * 3 + 200;
          await new Promise((resolve) => setTimeout(resolve, waitTime));

          await scheduler.stop();

          // Should have at least 3 executions
          expect(executionTimes.length).toBeGreaterThanOrEqual(3);

          // Calculate average interval
          const intervals: number[] = [];
          for (let i = 1; i < executionTimes.length; i++) {
            intervals.push(executionTimes[i] - executionTimes[i - 1]);
          }

          const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

          // Average should be close to expected interval (within 15%)
          const variance = Math.abs(avgInterval - intervalMs);
          expect(variance).toBeLessThanOrEqual(intervalMs * 0.15);

          // Standard deviation should be low (consistent timing)
          const squaredDiffs = intervals.map((interval) => Math.pow(interval - avgInterval, 2));
          const variance_stat = squaredDiffs.reduce((a, b) => a + b, 0) / intervals.length;
          const stdDev = Math.sqrt(variance_stat);

          // Standard deviation should be less than 25% of interval
          expect(stdDev).toBeLessThanOrEqual(intervalMs * 0.25);
        }
      ),
      {
        numRuns: 10,
        timeout: 5000,
      }
    );
  }, 10000);

  /**
   * Property: Scheduler should execute at most once per interval period
   *
   * For any interval, the scheduler should not execute multiple times within
   * a single interval period (concurrent execution prevention).
   */
  it('Property: should execute at most once per interval period', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate intervals between 100ms and 500ms
        fc.integer({ min: 100, max: 500 }),
        async (intervalMs) => {
          const executionTimes: number[] = [];

          const trackingCycle: AnalysisCycleFunction = vi.fn(async () => {
            executionTimes.push(Date.now());
            // Simulate work that might take variable time
            await new Promise((resolve) => setTimeout(resolve, 5 + Math.random() * 15));
          });

          const scheduler = new CronScheduler(trackingCycle);
          scheduler.start(intervalMs);

          // Wait for multiple intervals
          const waitTime = intervalMs * 3 + 200;
          await new Promise((resolve) => setTimeout(resolve, waitTime));

          await scheduler.stop();

          // Check that no two executions happened within the same interval window
          for (let i = 1; i < executionTimes.length; i++) {
            const timeSincePrevious = executionTimes[i] - executionTimes[i - 1];

            // Should be at least 70% of interval (accounting for timing variance)
            expect(timeSincePrevious).toBeGreaterThanOrEqual(intervalMs * 0.7);
          }
        }
      ),
      {
        numRuns: 10,
        timeout: 5000,
      }
    );
  }, 10000);

  /**
   * Property: Scheduler should maintain interval regardless of execution duration
   *
   * For any interval and execution duration, the scheduler should maintain
   * the interval between execution starts (not execution completions).
   */
  it('Property: should maintain interval regardless of execution duration', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate interval and execution duration
        fc.integer({ min: 200, max: 500 }),
        fc.integer({ min: 10, max: 50 }),
        async (intervalMs, executionDurationMs) => {
          const executionStarts: number[] = [];

          const variableDurationCycle: AnalysisCycleFunction = vi.fn(async () => {
            executionStarts.push(Date.now());
            // Simulate variable execution time
            await new Promise((resolve) => setTimeout(resolve, executionDurationMs));
          });

          const scheduler = new CronScheduler(variableDurationCycle);
          scheduler.start(intervalMs);

          // Wait for multiple executions
          const waitTime = intervalMs * 3 + executionDurationMs * 3 + 200;
          await new Promise((resolve) => setTimeout(resolve, waitTime));

          await scheduler.stop();

          // Should have multiple executions
          expect(executionStarts.length).toBeGreaterThanOrEqual(2);

          // Check intervals between starts (not completions)
          for (let i = 1; i < executionStarts.length; i++) {
            const actualInterval = executionStarts[i] - executionStarts[i - 1];

            // Interval should be approximately the configured interval
            // (allowing for execution duration and timing variance)
            const allowedVariance = intervalMs * 0.2 + executionDurationMs;
            const timeDiff = Math.abs(actualInterval - intervalMs);

            expect(timeDiff).toBeLessThanOrEqual(allowedVariance);
          }
        }
      ),
      {
        numRuns: 10,
        timeout: 5000,
      }
    );
  }, 10000);
});
