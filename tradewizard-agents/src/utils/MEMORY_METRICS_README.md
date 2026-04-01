# Memory System Monitoring and Metrics

This document describes the comprehensive monitoring and metrics system for the Agent Memory System.

## Overview

The memory metrics system provides real-time monitoring and historical analysis of the memory system's performance, including:

- **Performance Metrics**: Latency tracking (p50, p95, p99) for memory retrieval operations
- **Error Rate Tracking**: Success/failure rates, timeout rates, and error categorization
- **Memory Context Size Metrics**: Signal counts and context sizes across agents
- **Evolution Event Frequency**: Tracking of direction changes, probability shifts, confidence changes, and reasoning evolution
- **Audit Trail Logging**: Complete audit log of all memory system operations

## Architecture

### MemoryMetricsCollector

The `MemoryMetricsCollector` class is the central component that collects and aggregates all metrics. It provides:

- Real-time metric collection during memory operations
- Statistical aggregation (min, max, mean, percentiles)
- Alert threshold checking
- Audit log management with filtering capabilities

### Integration Points

The metrics collector is integrated into:

1. **Memory Retrieval Service** (`memory-retrieval.ts`): Records retrieval latency, success/failure, context sizes
2. **Memory Retrieval Node** (`memory-retrieval.ts`): Increments analysis counter
3. **Evolution Tracker** (`evolution-tracker.ts`): Records evolution events
4. **Memory Formatter** (`memory-formatter.ts`): Records formatting operations

## Usage

### Accessing Metrics

```typescript
import { getMemoryMetricsCollector } from './utils/memory-metrics.js';

const metricsCollector = getMemoryMetricsCollector();

// Get retrieval performance metrics
const retrievalMetrics = metricsCollector.getRetrievalMetrics();
console.log(`P95 Latency: ${retrievalMetrics.latency.p95}ms`);
console.log(`Error Rate: ${retrievalMetrics.errorRate}%`);

// Get context size metrics
const contextMetrics = metricsCollector.getContextSizeMetrics();
console.log(`Avg Signal Count: ${contextMetrics.signalCounts.mean}`);

// Get evolution event metrics
const evolutionMetrics = metricsCollector.getEvolutionMetrics();
console.log(`Direction Changes: ${evolutionMetrics.directionChanges}`);
console.log(`Probability Shifts: ${evolutionMetrics.probabilityShifts}`);
```

### CLI Command

View metrics from the command line:

```bash
# Display metrics summary
npm run cli -- memory-metrics

# Check alert thresholds
npm run cli -- memory-metrics --check-alerts

# Display audit log
npm run cli -- memory-metrics --audit-log

# Filter audit log by operation type
npm run cli -- memory-metrics --audit-log --audit-operation retrieval

# Filter audit log by market ID
npm run cli -- memory-metrics --audit-log --audit-market <conditionId>

# Filter audit log by agent name
npm run cli -- memory-metrics --audit-log --audit-agent "Market Microstructure Agent"

# Reset metrics after viewing
npm run cli -- memory-metrics --reset
```

### Alert Thresholds

The system monitors the following thresholds:

| Metric | Warning | Critical |
|--------|---------|----------|
| Error Rate | > 2% | > 5% |
| P95 Latency | > 150ms | > 200ms |
| Timeout Rate | > 5% | > 10% |

Check alerts programmatically:

```typescript
const alertCheck = metricsCollector.checkAlertThresholds();

if (!alertCheck.healthy) {
  alertCheck.alerts.forEach(alert => {
    console.log(`[${alert.severity}] ${alert.message}`);
  });
}
```

## Metrics Reference

### MemoryRetrievalMetrics

```typescript
interface MemoryRetrievalMetrics {
  latency: {
    min: number;
    max: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  totalRetrievals: number;
  successfulRetrievals: number;
  failedRetrievals: number;
  errorRate: number; // Percentage
  timeouts: number;
  timeoutRate: number; // Percentage
}
```

### MemoryContextSizeMetrics

```typescript
interface MemoryContextSizeMetrics {
  signalCounts: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
  contextSizes: {
    min: number;
    max: number;
    mean: number;
    median: number;
  };
  agentsWithHistory: number;
  agentsWithoutHistory: number;
  historyRate: number; // Percentage
}
```

### EvolutionEventMetrics

```typescript
interface EvolutionEventMetrics {
  totalEvents: number;
  directionChanges: number;
  probabilityShifts: number;
  confidenceChanges: number;
  reasoningEvolutions: number;
  directionChangeRate: number; // Events per analysis
  probabilityShiftRate: number;
  confidenceChangeRate: number;
  reasoningEvolutionRate: number;
  averageProbabilityShiftMagnitude: number;
  averageConfidenceChangeMagnitude: number;
}
```

### MemoryAuditLogEntry

```typescript
interface MemoryAuditLogEntry {
  timestamp: number;
  operation: 'retrieval' | 'evolution_tracking' | 'context_formatting' | 'validation';
  success: boolean;
  duration: number; // milliseconds
  marketId?: string;
  agentName?: string;
  signalCount?: number;
  contextSize?: number; // bytes
  evolutionEvents?: number;
  error?: {
    type: string;
    message: string;
    context?: Record<string, unknown>;
  };
  metadata?: Record<string, unknown>;
}
```

## Audit Log Filtering

The audit log can be filtered by:

- **Operation Type**: `retrieval`, `evolution_tracking`, `context_formatting`, `validation`
- **Time Range**: Start and end timestamps
- **Market ID**: Filter by specific market
- **Agent Name**: Filter by specific agent

```typescript
// Filter by operation type
const retrievalLogs = metricsCollector.getAuditLogByOperation('retrieval');

// Filter by time range
const recentLogs = metricsCollector.getAuditLogByTimeRange(
  Date.now() - 3600000, // Last hour
  Date.now()
);

// Filter by market
const marketLogs = metricsCollector.getAuditLogByMarket('0x123...');

// Filter by agent
const agentLogs = metricsCollector.getAuditLogByAgent('Market Microstructure Agent');
```

## Performance Considerations

- Metrics collection adds minimal overhead (<1ms per operation)
- Audit log is stored in memory (consider periodic archival for long-running processes)
- Metrics can be reset periodically to prevent unbounded memory growth

## Requirements Satisfied

This monitoring system satisfies the following requirements:

- **Requirement 5.4**: Audit trail logging for all operations
- **Requirement 8.2**: Evolution event logging (direction changes)
- **Requirement 8.3**: Evolution event logging (probability shifts)
- **Requirement 8.4**: Evolution event logging (confidence changes)
- **Requirement 8.5**: Evolution event logging (reasoning evolution)
- **Requirement 9.1**: Error rate tracking and graceful degradation

## Future Enhancements

Potential future enhancements include:

- Export metrics to external monitoring systems (Prometheus, Datadog, etc.)
- Persistent storage of audit logs in database
- Real-time alerting via webhooks or email
- Metrics visualization dashboard
- Historical trend analysis
