# Agent Memory System Configuration

## Overview

The Agent Memory System transforms TradeWizard's multi-agent analysis from an **open-loop system** (where agents have no awareness of their previous outputs) into a **closed-loop system** (where agents can access, reference, and build upon their historical analysis for the same market).

This enables agents to provide more thoughtful, consistent, and evolving analysis as market conditions change over time.

## Table of Contents

- [How It Works](#how-it-works)
- [Configuration](#configuration)
- [Usage Examples](#usage-examples)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Performance Considerations](#performance-considerations)
- [API Reference](#api-reference)

## How It Works

### Workflow Integration

The memory system integrates seamlessly into the existing LangGraph workflow:

```
Market Ingestion
      ↓
Memory Context Retrieval ← Query historical signals from database
      ↓
Agent Execution (with memory context in prompts)
      ↓
Signal Storage → Store new signals for future reference
      ↓
Evolution Tracking → Log significant changes
```

### Memory Context Flow

1. **Before Analysis**: Memory retrieval node queries the `agent_signals` table for each agent's previous 3-5 signals for the same market
2. **Context Formatting**: Historical signals are formatted as structured text with timestamps, probabilities, confidence, and key drivers
3. **Prompt Injection**: Memory context is injected into each agent's system prompt with instructions for usage
4. **Agent Analysis**: Agents review their previous analysis and explain changes or continuity in reasoning
5. **Signal Storage**: New signals are stored in the database (existing behavior, unchanged)
6. **Evolution Tracking**: System compares new signals to historical signals and logs significant changes

### What Agents See

When an agent has historical signals, their prompt includes:

```
## Your Previous Analysis

Previous Analysis History (3 signals):

Analysis from Jan 15, 2025 14:30 UTC:
  Direction: YES
  Fair Probability: 65.0%
  Confidence: 75.0%
  Key Drivers:
    • Strong polling momentum in key swing states
    • Historical precedent favors this outcome
    • Market sentiment shifting based on recent news

Analysis from Jan 10, 2025 09:15 UTC:
  Direction: YES
  Fair Probability: 62.0%
  Confidence: 70.0%
  Key Drivers:
    • Polling data shows consistent lead
    • Economic indicators support this outcome

Analysis from Jan 5, 2025 16:45 UTC:
  Direction: NEUTRAL
  Fair Probability: 52.0%
  Confidence: 60.0%
  Key Drivers:
    • Market is highly uncertain
    • Conflicting signals from different data sources

## Instructions for Using Memory Context

When you have previous analysis available:
1. Review your previous analysis before generating new analysis
2. Identify what has changed since your last analysis
3. If your view has changed significantly, explain the reasoning
4. If your view remains consistent, acknowledge continuity
5. Reference specific changes from previous analysis when relevant
```

## Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# Enable/disable the memory system (default: false)
MEMORY_SYSTEM_ENABLED=true

# Maximum historical signals per agent (default: 3, max: 5)
MEMORY_MAX_SIGNALS_PER_AGENT=3

# Query timeout in milliseconds (default: 5000)
MEMORY_QUERY_TIMEOUT_MS=5000

# Retry attempts for rate limits (default: 3)
MEMORY_RETRY_ATTEMPTS=3
```

### Feature Flag

The memory system is controlled by a feature flag for gradual rollout:

```typescript
// config/index.ts
export interface EngineConfig {
  memorySystem: {
    enabled: boolean;              // Feature flag
    maxSignalsPerAgent: number;    // Default: 3
    queryTimeoutMs: number;        // Default: 5000
    retryAttempts: number;         // Default: 3
  };
}
```

### Rollout Strategy

1. **Phase 1**: Deploy with `MEMORY_SYSTEM_ENABLED=false`, monitor for regressions
2. **Phase 2**: Enable for 10% of markets, monitor performance and error rates
3. **Phase 3**: Enable for 50% of markets, validate memory context quality
4. **Phase 4**: Enable for 100% of markets, full production rollout

## Usage Examples

### Basic Usage

The memory system works automatically once enabled. No code changes required:

```bash
# Enable in .env
MEMORY_SYSTEM_ENABLED=true

# Run analysis as usual
npm run cli -- analyze 0x1234567890abcdef
```

### Programmatic Usage

```typescript
import { analyzeMarket } from './src/workflow';

// Memory system is automatically integrated
const result = await analyzeMarket('0x1234567890abcdef');

// Check if agents had historical context
console.log('Audit log:', result.auditLog);
// Look for 'memory_retrieval' stage in audit log
```

### Checking Memory Context

```typescript
import { createMemoryRetrievalService } from './src/database/memory-retrieval';
import { createSupabaseClientManager } from './src/database';

const manager = createSupabaseClientManager();
await manager.connect();

const memoryService = createMemoryRetrievalService(manager);

// Get memory for a specific agent
const memory = await memoryService.getAgentMemory(
  'Market Microstructure Agent',
  '0x1234567890abcdef',
  3
);

console.log('Has history:', memory.hasHistory);
console.log('Signal count:', memory.historicalSignals.length);
console.log('Signals:', memory.historicalSignals);
```

### Formatting Memory Context

```typescript
import { formatMemoryContext } from './src/utils/memory-formatter';

const formatted = formatMemoryContext(memory, {
  maxLength: 1000,
  dateFormat: 'human',
  includeMetadata: false
});

console.log('Formatted text:', formatted.text);
console.log('Signal count:', formatted.signalCount);
console.log('Truncated:', formatted.truncated);
```

## Error Handling

### Graceful Degradation

The memory system is designed to **never fail the workflow**. All errors result in graceful degradation:

- **Database connection failure** → Empty memory context, agents continue normally
- **Query timeout** → Abort after 5 seconds, agents continue without memory
- **Data corruption** → Skip invalid signals, use remaining valid signals
- **Rate limits** → Retry with exponential backoff (up to 3 attempts), then continue without memory

### Error Categories

| Error Type | Behavior | Retry Logic | Fallback |
|------------|----------|-------------|----------|
| Connection failure | Log error | 1 retry after 1s | Empty context |
| Query timeout | Abort query | No retry | Empty context |
| Rate limit | Exponential backoff | 3 retries | Empty context |
| Data validation | Skip invalid signals | No retry | Use valid signals |

### Error Logging

All errors are logged in the audit trail:

```typescript
{
  stage: 'memory_retrieval',
  timestamp: 1705334400000,
  data: {
    success: false,
    error: 'Connection timeout',
    errorType: 'connection',
    agentName: 'Market Microstructure Agent',
    marketId: '0x1234567890abcdef',
    duration: 5000
  }
}
```

### Monitoring Errors

Check audit logs for memory retrieval failures:

```typescript
const result = await analyzeMarket('0x1234567890abcdef');

const memoryLog = result.auditLog.find(
  entry => entry.stage === 'memory_retrieval'
);

if (!memoryLog.data.success) {
  console.error('Memory retrieval failed:', memoryLog.data.error);
}
```

## Troubleshooting

### Memory retrieval always returns empty context

**Symptoms:**
- Agents never receive historical signals
- `hasHistory` is always `false`
- No signals in memory context

**Possible Causes:**
1. Feature flag is disabled
2. No historical signals exist in database
3. Database connection issues
4. Query timeout too short

**Solutions:**

```bash
# 1. Check feature flag
echo $MEMORY_SYSTEM_ENABLED  # Should be "true"

# 2. Check database for signals
# In Supabase dashboard or psql:
SELECT COUNT(*) FROM agent_signals 
WHERE market_id = 'your-market-id';

# 3. Test database connection
npm run cli -- checkpoint <conditionId> --debug

# 4. Increase timeout if needed
MEMORY_QUERY_TIMEOUT_MS=10000
```

### Memory retrieval is slow

**Symptoms:**
- Analysis takes significantly longer
- Memory retrieval duration > 100ms in audit log

**Possible Causes:**
1. Missing database indexes
2. Large number of historical signals
3. Network latency to database

**Solutions:**

```sql
-- Verify indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'agent_signals';

-- Should see:
-- idx_agent_signals_market_id
-- idx_agent_signals_agent_name

-- If missing, create them:
CREATE INDEX IF NOT EXISTS idx_agent_signals_market_id 
ON agent_signals(market_id);

CREATE INDEX IF NOT EXISTS idx_agent_signals_agent_name 
ON agent_signals(agent_name);
```

### Agents not referencing previous analysis

**Symptoms:**
- Memory context is populated
- Agents don't mention previous analysis in output
- No continuity in reasoning

**Possible Causes:**
1. Agent prompts not properly enhanced
2. Memory context truncated
3. LLM ignoring memory context

**Solutions:**

```typescript
// 1. Check memory context is in prompt
// Enable debug logging
LOG_LEVEL=debug npm run cli -- analyze <conditionId>

// 2. Check for truncation
const formatted = formatMemoryContext(memory);
console.log('Truncated:', formatted.truncated);

// 3. Increase max length if truncated
// In memory-formatter.ts, increase maxLength:
formatMemoryContext(memory, { maxLength: 2000 });
```

### Evolution events not being logged

**Symptoms:**
- No evolution events in audit log
- Changes in agent analysis not tracked

**Possible Causes:**
1. Evolution tracker not integrated
2. Thresholds too high
3. No historical signals to compare against

**Solutions:**

```typescript
// Check evolution tracker configuration
// In workflow.ts, verify evolution tracker is called

// Adjust thresholds if needed (in evolution-tracker.ts):
const PROBABILITY_SHIFT_THRESHOLD = 0.10;  // 10%
const CONFIDENCE_CHANGE_THRESHOLD = 0.20;  // 20%
const REASONING_OVERLAP_THRESHOLD = 0.50;  // 50%
```

### Database connection errors

**Symptoms:**
- "Connection failed" errors in logs
- Memory retrieval always fails
- Supabase client errors

**Solutions:**

```bash
# 1. Verify Supabase credentials
echo $SUPABASE_URL
echo $SUPABASE_KEY

# 2. Test connection
npm run cli -- checkpoint <conditionId>

# 3. Check Supabase project status
# Visit Supabase dashboard

# 4. Verify network connectivity
curl $SUPABASE_URL/rest/v1/

# 5. Check for rate limits
# Review Supabase dashboard for quota usage
```

## Performance Considerations

### Query Performance

**Target**: Memory retrieval should add < 100ms to workflow execution time

**Actual Performance**:
- Database query: 20-50ms (with indexes)
- Data transformation: 5-10ms
- Formatting: 5-10ms
- State population: < 5ms
- **Total**: 35-75ms ✅

### Memory Overhead

**State Size Impact**:
- Average: ~2-5 KB per agent (3 signals × ~500 bytes each)
- Maximum: ~12.5 KB per agent (5 signals × ~2.5 KB each)
- Total for 4 agents: ~10-50 KB (negligible)

### Database Load

**Query Volume**:
- 4 agents × 1 query = 4 additional queries per analysis
- With 100 analyses/hour: 400 queries/hour
- **Impact**: Negligible for Supabase

**Storage Growth**:
- 4 signals per analysis × 100 analyses/day = 400 rows/day
- 146,000 rows/year
- **Impact**: Manageable for PostgreSQL

### Optimization Tips

1. **Use indexes**: Ensure `idx_agent_signals_market_id` and `idx_agent_signals_agent_name` exist
2. **Limit signals**: Keep `MEMORY_MAX_SIGNALS_PER_AGENT` at 3-5 (default: 3)
3. **Set timeout**: Use reasonable timeout (default: 5000ms)
4. **Parallel retrieval**: Memory is fetched for all agents in parallel (automatic)
5. **Data retention**: Consider archiving signals older than 90-180 days

## API Reference

### MemoryRetrievalService

```typescript
interface MemoryRetrievalService {
  /**
   * Retrieve historical signals for a specific agent-market combination
   */
  getAgentMemory(
    agentName: string,
    marketId: string,
    limit?: number
  ): Promise<AgentMemoryContext>;

  /**
   * Retrieve memory context for all agents for a specific market
   */
  getAllAgentMemories(
    marketId: string,
    agentNames: string[],
    limit?: number
  ): Promise<Map<string, AgentMemoryContext>>;
}
```

### Memory Context Types

```typescript
interface HistoricalSignal {
  agentName: string;
  marketId: string;
  timestamp: Date;
  direction: 'YES' | 'NO' | 'NEUTRAL';
  fairProbability: number;
  confidence: number;
  keyDrivers: string[];
  metadata: Record<string, unknown>;
}

interface AgentMemoryContext {
  agentName: string;
  marketId: string;
  historicalSignals: HistoricalSignal[];
  hasHistory: boolean;
}
```

### Memory Formatter

```typescript
interface MemoryFormatOptions {
  maxLength?: number;           // Default: 1000
  includeMetadata?: boolean;    // Default: false
  dateFormat?: 'iso' | 'relative' | 'human';  // Default: 'human'
}

interface FormattedMemoryContext {
  text: string;
  signalCount: number;
  truncated: boolean;
}

function formatMemoryContext(
  memory: AgentMemoryContext,
  options?: MemoryFormatOptions
): FormattedMemoryContext;
```

### Evolution Tracker

```typescript
type EvolutionEventType =
  | 'direction_change'
  | 'probability_shift'
  | 'confidence_change'
  | 'reasoning_evolution';

interface EvolutionEvent {
  type: EvolutionEventType;
  agentName: string;
  marketId: string;
  timestamp: number;
  previousValue: unknown;
  currentValue: unknown;
  magnitude: number;
  description: string;
}

interface EvolutionTracker {
  trackEvolution(
    newSignal: AgentSignal,
    historicalSignals: HistoricalSignal[]
  ): EvolutionEvent[];
}
```

## Benefits

### For Agents

- ✅ **Consistency**: Agents maintain consistent reasoning across time periods
- ✅ **Explainability**: Agents can explain changes in their analysis
- ✅ **Context**: Agents understand how market conditions have evolved
- ✅ **Quality**: Analysis improves through continuity and reflection

### For Users

- ✅ **Trust**: More consistent recommendations build user trust
- ✅ **Transparency**: Clear explanations of reasoning changes
- ✅ **Insights**: Better understanding of market evolution
- ✅ **Value**: Higher quality analysis leads to better trading decisions

### For System

- ✅ **Observability**: Track how agent analysis evolves over time
- ✅ **Debugging**: Easier to identify agent reasoning issues
- ✅ **Metrics**: Measure agent consistency and quality
- ✅ **Learning**: Foundation for future agent learning capabilities

## Backward Compatibility

The memory system is **fully backward compatible**:

- ✅ Works with existing `agent_signals` table schema (no migration required)
- ✅ Existing agent implementations continue to work unchanged
- ✅ All historical signals are immediately usable
- ✅ Can be disabled via feature flag without code changes
- ✅ Graceful degradation ensures workflow never fails

## Future Enhancements

Potential future improvements:

1. **Configurable memory window**: Last 7 days vs. last 3 signals
2. **Memory summarization**: Compress long histories into summaries
3. **Cross-agent memory**: Agents referencing other agents' historical signals
4. **Agent learning**: Agents improving over time based on accuracy
5. **Memory-based confidence**: Adjust confidence based on historical accuracy
6. **Semantic search**: Find similar historical market conditions

## Related Documentation

- [Database Module README](./README.md) - Supabase integration
- [Design Document](../../.kiro/specs/agent-memory-system/design.md) - System architecture
- [Requirements Document](../../.kiro/specs/agent-memory-system/requirements.md) - Functional requirements
- [Tasks Document](../../.kiro/specs/agent-memory-system/tasks.md) - Implementation plan

## Support

For issues or questions:

1. Check [Troubleshooting](#troubleshooting) section
2. Review audit logs for error details
3. Enable debug logging: `LOG_LEVEL=debug`
4. Check Supabase dashboard for database issues
5. Review [Design Document](../../.kiro/specs/agent-memory-system/design.md) for architecture details
