/**
 * Database Query Optimizer
 *
 * Provides utilities for optimizing database queries and analyzing query performance.
 *
 * Requirements: 12.3, 12.4
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface QueryPerformanceMetrics {
  query: string;
  duration: number;
  rowCount: number;
  timestamp: number;
}

export interface QueryOptimizationReport {
  slowQueries: QueryPerformanceMetrics[];
  avgQueryTime: number;
  totalQueries: number;
  recommendations: string[];
}

// ============================================================================
// Query Performance Tracker
// ============================================================================

export class QueryPerformanceTracker {
  private metrics: QueryPerformanceMetrics[] = [];
  private slowQueryThreshold: number;

  constructor(slowQueryThresholdMs: number = 1000) {
    this.slowQueryThreshold = slowQueryThresholdMs;
  }

  /**
   * Track a query execution
   */
  trackQuery(query: string, duration: number, rowCount: number): void {
    this.metrics.push({
      query,
      duration,
      rowCount,
      timestamp: Date.now(),
    });
  }

  /**
   * Get slow queries
   */
  getSlowQueries(): QueryPerformanceMetrics[] {
    return this.metrics.filter((m) => m.duration > this.slowQueryThreshold);
  }

  /**
   * Generate optimization report
   */
  generateReport(): QueryOptimizationReport {
    const slowQueries = this.getSlowQueries();
    const avgQueryTime =
      this.metrics.length > 0
        ? this.metrics.reduce((sum, m) => sum + m.duration, 0) / this.metrics.length
        : 0;

    const recommendations = this.generateRecommendations(slowQueries);

    return {
      slowQueries,
      avgQueryTime,
      totalQueries: this.metrics.length,
      recommendations,
    };
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Generate optimization recommendations
   */
  private generateRecommendations(slowQueries: QueryPerformanceMetrics[]): string[] {
    const recommendations: string[] = [];

    if (slowQueries.length > 0) {
      recommendations.push(
        `Found ${slowQueries.length} slow queries (>${this.slowQueryThreshold}ms)`
      );

      // Analyze query patterns
      const queryTypes = new Map<string, number>();
      slowQueries.forEach((q) => {
        const type = this.extractQueryType(q.query);
        queryTypes.set(type, (queryTypes.get(type) || 0) + 1);
      });

      queryTypes.forEach((count, type) => {
        recommendations.push(`Consider optimizing ${type} queries (${count} slow queries)`);
      });

      // Check for missing indexes
      if (slowQueries.some((q) => q.query.includes('WHERE') && q.rowCount > 100)) {
        recommendations.push('Consider adding indexes on frequently filtered columns');
      }

      // Check for large result sets
      if (slowQueries.some((q) => q.rowCount > 1000)) {
        recommendations.push('Consider adding pagination for large result sets');
      }
    }

    return recommendations;
  }

  /**
   * Extract query type from query string
   */
  private extractQueryType(query: string): string {
    if (query.includes('SELECT')) return 'SELECT';
    if (query.includes('INSERT')) return 'INSERT';
    if (query.includes('UPDATE')) return 'UPDATE';
    if (query.includes('DELETE')) return 'DELETE';
    return 'UNKNOWN';
  }
}

// ============================================================================
// Query Optimizer
// ============================================================================

export class QueryOptimizer {
  private tracker: QueryPerformanceTracker;

  constructor(slowQueryThresholdMs: number = 1000) {
    this.tracker = new QueryPerformanceTracker(slowQueryThresholdMs);
  }

  /**
   * Wrap a query with performance tracking
   */
  async trackQuery<T>(
    queryName: string,
    queryFn: () => Promise<T>,
    rowCountFn?: (result: T) => number
  ): Promise<T> {
    const start = Date.now();

    try {
      const result = await queryFn();
      const duration = Date.now() - start;
      const rowCount = rowCountFn ? rowCountFn(result) : 0;

      this.tracker.trackQuery(queryName, duration, rowCount);

      if (duration > 1000) {
        console.warn(`[QueryOptimizer] Slow query detected: ${queryName} (${duration}ms)`);
      }

      return result;
    } catch (error) {
      const duration = Date.now() - start;
      this.tracker.trackQuery(queryName, duration, 0);
      throw error;
    }
  }

  /**
   * Get performance report
   */
  getReport(): QueryOptimizationReport {
    return this.tracker.generateReport();
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.tracker.clear();
  }

  /**
   * Log performance report
   */
  logReport(): void {
    const report = this.getReport();

    console.log('\n' + '='.repeat(80));
    console.log('DATABASE QUERY PERFORMANCE REPORT');
    console.log('='.repeat(80));
    console.log(`Total Queries: ${report.totalQueries}`);
    console.log(`Average Query Time: ${report.avgQueryTime.toFixed(2)}ms`);
    console.log(`Slow Queries: ${report.slowQueries.length}`);
    console.log();

    if (report.slowQueries.length > 0) {
      console.log('Slow Queries:');
      report.slowQueries.forEach((q, i) => {
        console.log(`  ${i + 1}. ${q.query}`);
        console.log(`     Duration: ${q.duration}ms, Rows: ${q.rowCount}`);
      });
      console.log();
    }

    if (report.recommendations.length > 0) {
      console.log('Recommendations:');
      report.recommendations.forEach((rec, i) => {
        console.log(`  ${i + 1}. ${rec}`);
      });
    }

    console.log('='.repeat(80));
  }
}

// ============================================================================
// Index Recommendations
// ============================================================================

export interface IndexRecommendation {
  table: string;
  columns: string[];
  reason: string;
  estimatedImpact: 'high' | 'medium' | 'low';
}

/**
 * Analyze query patterns and recommend indexes
 */
export function analyzeIndexNeeds(
  slowQueries: QueryPerformanceMetrics[]
): IndexRecommendation[] {
  const recommendations: IndexRecommendation[] = [];

  // Analyze markets table queries
  const marketQueries = slowQueries.filter((q) => q.query.includes('markets'));
  if (marketQueries.length > 0) {
    // Check for status filtering
    if (marketQueries.some((q) => q.query.includes('status'))) {
      recommendations.push({
        table: 'markets',
        columns: ['status'],
        reason: 'Frequent filtering by status',
        estimatedImpact: 'high',
      });
    }

    // Check for last_analyzed_at filtering
    if (marketQueries.some((q) => q.query.includes('last_analyzed_at'))) {
      recommendations.push({
        table: 'markets',
        columns: ['last_analyzed_at'],
        reason: 'Frequent filtering by last_analyzed_at',
        estimatedImpact: 'high',
      });
    }

    // Check for trending_score sorting
    if (marketQueries.some((q) => q.query.includes('trending_score'))) {
      recommendations.push({
        table: 'markets',
        columns: ['trending_score'],
        reason: 'Frequent sorting by trending_score',
        estimatedImpact: 'medium',
      });
    }
  }

  // Analyze recommendations table queries
  const recommendationQueries = slowQueries.filter((q) => q.query.includes('recommendations'));
  if (recommendationQueries.length > 0) {
    if (recommendationQueries.some((q) => q.query.includes('market_id'))) {
      recommendations.push({
        table: 'recommendations',
        columns: ['market_id', 'created_at'],
        reason: 'Frequent lookups by market_id with sorting',
        estimatedImpact: 'high',
      });
    }
  }

  return recommendations;
}

/**
 * Generate SQL for creating recommended indexes
 */
export function generateIndexSQL(recommendations: IndexRecommendation[]): string[] {
  return recommendations.map((rec) => {
    const indexName = `idx_${rec.table}_${rec.columns.join('_')}`;
    const columns = rec.columns.join(', ');
    return `CREATE INDEX IF NOT EXISTS ${indexName} ON ${rec.table}(${columns});`;
  });
}

/**
 * Create a query optimizer instance
 */
export function createQueryOptimizer(slowQueryThresholdMs?: number): QueryOptimizer {
  return new QueryOptimizer(slowQueryThresholdMs);
}
