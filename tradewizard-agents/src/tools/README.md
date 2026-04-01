# Autonomous Polling Agent

The Autonomous Polling Agent is an enhanced version of TradeWizard's polling intelligence agent that uses LangChain's tool-calling capabilities to autonomously fetch and research Polymarket data. Unlike the basic polling agent which relies on pre-fetched data, the autonomous agent can actively gather additional context, analyze historical trends, and perform cross-market analysis.

## Overview

The autonomous polling agent transforms prediction market analysis from passive data consumption into active research. The agent uses a ReAct (Reasoning + Acting) pattern to:

1. **Reason** about what data it needs based on market characteristics
2. **Act** by invoking tools to fetch that data
3. **Synthesize** information from multiple sources into comprehensive polling intelligence

This approach enables context-aware analysis that adapts to each market's unique characteristics, providing deeper insights than static analysis.

## Tool Capabilities

The agent has access to five specialized tools for gathering Polymarket data:

### 1. fetchRelatedMarkets

**Purpose**: Find other markets within the same Polymarket event for cross-market sentiment analysis.

**Use Cases**:
- Election markets with multiple candidates or outcomes
- Multi-question events (e.g., "Will X happen?" and "When will X happen?")
- Comparing sentiment across related predictions

**Input**:
```typescript
{
  conditionId: string;      // Market to find related markets for
  minVolume?: number;       // Minimum 24h volume filter (default: $100)
}
```

**Output**:
```typescript
{
  eventId: string;
  eventTitle: string;
  markets: Array<{
    conditionId: string;
    question: string;
    currentProbability: number;
    volume24h: number;
    liquidityScore: number;
  }>;
  totalMarkets: number;
}
```

**Example**: For a "2024 Presidential Election" market, this tool fetches all candidate markets to identify cross-market sentiment patterns.

### 2. fetchHistoricalPrices

**Purpose**: Retrieve historical price data to analyze sentiment trends over time.

**Use Cases**:
- Identifying momentum and trend direction
- Detecting sentiment shifts
- Comparing short-term vs long-term trends

**Input**:
```typescript
{
  conditionId: string;
  timeHorizon: '1h' | '24h' | '7d' | '30d';
}
```

**Output**:
```typescript
{
  conditionId: string;
  timeHorizon: string;
  dataPoints: Array<{
    timestamp: number;
    probability: number;
  }>;
  priceChange: number;      // Percentage change
  trend: 'uptrend' | 'downtrend' | 'sideways';
}
```

**Example**: Fetch 7-day price history to identify whether sentiment is strengthening or weakening over time.

### 3. fetchCrossMarketData

**Purpose**: Get comprehensive event-level data for all markets in an event.

**Use Cases**:
- Event-level sentiment analysis
- Identifying sentiment leaders vs followers
- Calculating aggregate market sentiment

**Input**:
```typescript
{
  eventId: string;
  maxMarkets?: number;      // Limit results (default: 20)
}
```

**Output**:
```typescript
{
  eventId: string;
  eventTitle: string;
  eventDescription: string;
  totalVolume: number;
  totalLiquidity: number;
  markets: Array<{
    conditionId: string;
    question: string;
    currentProbability: number;
    volume24h: number;
    liquidityScore: number;
    volumeRank: number;
  }>;
  aggregateSentiment: {
    averageProbability: number;
    weightedAverageProbability: number;
    sentimentDirection: 'bullish' | 'bearish' | 'neutral';
  };
}
```

**Example**: For a multi-candidate election, analyze whether the market is concentrating on a frontrunner or remains fragmented.

### 4. analyzeMarketMomentum

**Purpose**: Calculate momentum indicators from price movements across multiple time horizons.

**Use Cases**:
- Identifying strengthening or weakening sentiment
- Detecting trend acceleration or deceleration
- Assessing momentum confidence

**Input**:
```typescript
{
  conditionId: string;
}
```

**Output**:
```typescript
{
  conditionId: string;
  momentum: {
    score: number;              // -1 to +1
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: 'strong' | 'moderate' | 'weak';
    confidence: number;         // 0-1
  };
  timeHorizons: {
    '1h': { priceChange: number; velocity: number };
    '24h': { priceChange: number; velocity: number };
    '7d': { priceChange: number; velocity: number };
  };
}
```

**Example**: Detect whether a market is experiencing strong bullish momentum or if recent gains are slowing.

### 5. detectSentimentShifts

**Purpose**: Identify significant sentiment changes across different time horizons.

**Use Cases**:
- Detecting breaking news impact
- Identifying trend reversals
- Flagging unusual market movements

**Input**:
```typescript
{
  conditionId: string;
  threshold?: number;         // Minimum change to flag (default: 0.05 = 5%)
}
```

**Output**:
```typescript
{
  conditionId: string;
  shifts: Array<{
    timeHorizon: '1h' | '24h' | '7d';
    magnitude: number;
    direction: 'toward_yes' | 'toward_no';
    classification: 'minor' | 'moderate' | 'major';
    timestamp: number;
  }>;
  hasSignificantShift: boolean;
}
```

**Example**: Detect that a market moved 15% in the last hour (major shift) but only 3% over 24 hours (no shift).

## Configuration

### Environment Variables

Configure the autonomous polling agent via environment variables:

```bash
# Enable autonomous mode (default: false)
POLLING_AGENT_AUTONOMOUS=true

# Maximum tool calls per analysis (default: 5)
POLLING_AGENT_MAX_TOOL_CALLS=5

# Timeout in milliseconds (default: 45000)
POLLING_AGENT_TIMEOUT=45000

# Enable tool result caching (default: true)
POLLING_AGENT_CACHE_ENABLED=true

# Fallback to basic agent on error (default: true)
POLLING_AGENT_FALLBACK_TO_BASIC=true
```

### Configuration Object

Alternatively, configure programmatically:

```typescript
import type { EngineConfig } from './config';

const config: EngineConfig = {
  // ... other config
  pollingAgent: {
    autonomous: true,           // Enable autonomous mode
    maxToolCalls: 5,           // Limit tool calls
    timeout: 45000,            // 45 second timeout
    cacheEnabled: true,        // Cache tool results
    fallbackToBasic: true,     // Fallback on error
  },
};
```

### Configuration Options Explained

**autonomous** (default: `false`)
- When `true`: Agent uses tools to fetch data autonomously
- When `false`: Agent uses only pre-fetched data (basic mode)
- Recommendation: Start with `false`, enable after testing

**maxToolCalls** (default: `5`)
- Limits tool invocations per analysis to control latency
- Higher values allow more comprehensive analysis but increase execution time
- Recommendation: 5 for production, 3 for faster analysis

**timeout** (default: `45000` ms)
- Maximum execution time including tool calls
- Autonomous agent needs more time than basic agent (30s)
- Recommendation: 45s for production, 30s for faster turnaround

**cacheEnabled** (default: `true`)
- Caches tool results within an analysis session
- Prevents redundant API calls for the same data
- Recommendation: Always `true` unless debugging

**fallbackToBasic** (default: `true`)
- Falls back to basic polling agent if autonomous agent fails
- Ensures analysis always completes even with tool failures
- Recommendation: `true` for production reliability

## Example Agent Outputs

### Example 1: Election Market with Cross-Market Analysis

**Market**: "Will Candidate A win the 2024 election?"

**Agent Output**:
```json
{
  "agentName": "autonomous_polling",
  "timestamp": 1709856000000,
  "confidence": 0.82,
  "direction": "YES",
  "fairProbability": 0.68,
  "keyDrivers": [
    "Cross-market analysis: Candidate A leads in 8 of 10 state markets with weighted average of 67%",
    "Strong bullish momentum: +12% over 7 days with accelerating velocity",
    "High crowd wisdom score: $2.3M liquidity with tight 1.2% spread indicates informed consensus",
    "Event-level sentiment: 73% of total event volume concentrated on Candidate A markets",
    "Data gathering: Used fetchRelatedMarkets, fetchCrossMarketData, and analyzeMarketMomentum"
  ],
  "riskFactors": [
    "Recent 3% pullback in last hour may indicate profit-taking",
    "Lower liquidity in swing state markets reduces cross-market confidence",
    "7-day trend may not capture very recent polling shifts"
  ],
  "metadata": {
    "crowdWisdomScore": 0.89,
    "pollingBaseline": 0.65,
    "marketDeviation": 0.03,
    "crossMarketAlignment": 0.91,
    "relatedMarketCount": 10,
    "momentum": {
      "score": 0.74,
      "direction": "bullish",
      "strength": "strong",
      "confidence": 0.88
    },
    "toolUsage": {
      "toolsCalled": 3,
      "totalToolTime": 1247,
      "cacheHits": 0,
      "cacheMisses": 3,
      "toolBreakdown": {
        "fetchRelatedMarkets": 1,
        "fetchCrossMarketData": 1,
        "analyzeMarketMomentum": 1
      }
    }
  }
}
```

### Example 2: High-Volatility Market with Sentiment Shift

**Market**: "Will the Fed raise rates in March?"

**Agent Output**:
```json
{
  "agentName": "autonomous_polling",
  "timestamp": 1709856000000,
  "confidence": 0.71,
  "direction": "NO",
  "fairProbability": 0.32,
  "keyDrivers": [
    "Major sentiment shift detected: -18% in last 24 hours following CPI data release",
    "Momentum analysis: Strong bearish momentum (-0.82 score) with high confidence",
    "Historical trend: Consistent downtrend over 7 days from 50% to 32%",
    "Moderate liquidity ($450K) suggests informed traders reacting to macro data",
    "Data gathering: Used fetchHistoricalPrices, analyzeMarketMomentum, and detectSentimentShifts"
  ],
  "riskFactors": [
    "High volatility (18% daily move) reduces prediction stability",
    "Fed communications could reverse sentiment quickly",
    "Lower liquidity increases susceptibility to large trades"
  ],
  "metadata": {
    "crowdWisdomScore": 0.64,
    "pollingBaseline": 0.35,
    "marketDeviation": -0.03,
    "sentimentShift": {
      "magnitude": 0.18,
      "direction": "NO",
      "timeHorizon": "24h"
    },
    "momentum": {
      "score": -0.82,
      "direction": "bearish",
      "strength": "strong",
      "confidence": 0.91
    },
    "toolUsage": {
      "toolsCalled": 3,
      "totalToolTime": 982,
      "cacheHits": 1,
      "cacheMisses": 2,
      "toolBreakdown": {
        "fetchHistoricalPrices": 1,
        "analyzeMarketMomentum": 1,
        "detectSentimentShifts": 1
      }
    }
  }
}
```

### Example 3: Low-Liquidity Market with Related Markets

**Market**: "Will X happen by end of Q1?"

**Agent Output**:
```json
{
  "agentName": "autonomous_polling",
  "timestamp": 1709856000000,
  "confidence": 0.58,
  "direction": "NEUTRAL",
  "fairProbability": 0.45,
  "keyDrivers": [
    "Low liquidity ($85K) limits polling signal reliability",
    "Related markets analysis: 3 related markets show mixed sentiment (avg 48%)",
    "Minimal price movement: Sideways trend over 7 days suggests uncertainty",
    "Cross-market divergence: This market 12% lower than related markets average",
    "Data gathering: Used fetchRelatedMarkets and fetchHistoricalPrices to supplement thin data"
  ],
  "riskFactors": [
    "Very low liquidity increases manipulation risk and reduces crowd wisdom",
    "Wide spread (4.2%) indicates low market maker confidence",
    "Related markets also have low liquidity, limiting cross-market insights",
    "Sideways price action suggests market waiting for new information"
  ],
  "metadata": {
    "crowdWisdomScore": 0.42,
    "pollingBaseline": 0.50,
    "marketDeviation": -0.05,
    "crossMarketAlignment": 0.67,
    "relatedMarketCount": 3,
    "momentum": {
      "score": 0.08,
      "direction": "neutral",
      "strength": "weak",
      "confidence": 0.45
    },
    "toolUsage": {
      "toolsCalled": 2,
      "totalToolTime": 654,
      "cacheHits": 0,
      "cacheMisses": 2,
      "toolBreakdown": {
        "fetchRelatedMarkets": 1,
        "fetchHistoricalPrices": 1
      }
    }
  }
}
```

## Performance Characteristics

### Execution Time

**Typical Performance**:
- Basic polling agent: 15-20 seconds
- Autonomous agent (2-3 tools): 20-30 seconds
- Autonomous agent (4-5 tools): 30-45 seconds

**Breakdown**:
- LLM reasoning: 8-12 seconds
- Tool execution: 2-5 seconds per tool
- Result synthesis: 5-8 seconds

**Optimization Tips**:
- Reduce `maxToolCalls` for faster analysis
- Enable `cacheEnabled` to avoid redundant API calls
- Use `timeout` to enforce hard limits

### Tool Call Patterns

**Election Markets** (typically 3-4 tools):
1. fetchRelatedMarkets
2. fetchCrossMarketData
3. analyzeMarketMomentum

**High-Volatility Markets** (typically 2-3 tools):
1. fetchHistoricalPrices
2. analyzeMarketMomentum
3. detectSentimentShifts

**Low-Liquidity Markets** (typically 2 tools):
1. fetchRelatedMarkets
2. fetchHistoricalPrices

### Cache Performance

**Cache Hit Rates**:
- First analysis: 0% (cold cache)
- Subsequent analyses (same market): 40-60%
- Related markets: 20-30%

**Cache Benefits**:
- Reduces API calls by 30-50%
- Decreases execution time by 15-25%
- Lowers rate limit pressure

### Resource Usage

**API Calls**:
- Basic agent: 1-2 calls (market data only)
- Autonomous agent: 3-7 calls (market + tools)

**LLM Tokens**:
- Basic agent: ~2,000 tokens
- Autonomous agent: ~4,000-6,000 tokens (includes tool results)

**Memory**:
- Tool cache: ~1-5 MB per session
- Agent state: ~500 KB per execution

## Integration with Workflow

The autonomous polling agent integrates seamlessly into the existing TradeWizard workflow:

```
market_ingestion → keyword_extraction → dynamic_agent_selection
                                              ↓
                                    [parallel execution]
                                              ↓
                    ┌─────────────────────────┼─────────────────────────┐
                    ↓                         ↓                         ↓
        market_microstructure_agent  probability_baseline_agent  risk_assessment_agent
                    ↓                         ↓                         ↓
        breaking_news_agent          event_impact_agent          autonomous_polling_agent
                    ↓                         ↓                         ↓
                    └─────────────────────────┼─────────────────────────┘
                                              ↓
                                    agent_signal_fusion
```

**Conditional Selection**:
- When `pollingAgent.autonomous = true`: Use autonomous agent
- When `pollingAgent.autonomous = false`: Use basic polling agent
- Fallback: If autonomous agent fails and `fallbackToBasic = true`, use basic agent

## Troubleshooting

### Agent Times Out

**Symptoms**: Agent execution exceeds 45 seconds

**Solutions**:
1. Reduce `maxToolCalls` from 5 to 3
2. Increase `timeout` to 60000 (60 seconds)
3. Check Polymarket API response times
4. Enable `cacheEnabled` to speed up repeated calls

### Tool Calls Fail

**Symptoms**: Tools return errors or empty results

**Solutions**:
1. Check Polymarket API rate limits
2. Verify `conditionId` and `eventId` are valid
3. Check network connectivity
4. Review tool audit log for specific errors
5. Enable `fallbackToBasic` for graceful degradation

### Low Confidence Scores

**Symptoms**: Agent consistently returns confidence < 0.5

**Solutions**:
1. Check if market has sufficient liquidity
2. Verify related markets exist for cross-market analysis
3. Ensure historical data is available
4. Review `riskFactors` in agent output for specific issues

### High API Usage

**Symptoms**: Exceeding Polymarket rate limits

**Solutions**:
1. Enable `cacheEnabled` (should already be true)
2. Reduce `maxToolCalls` to limit tool usage
3. Implement request throttling in PolymarketClient
4. Monitor tool audit logs for redundant calls

## Best Practices

### When to Enable Autonomous Mode

**Enable for**:
- Election markets with multiple candidates
- High-volume markets with rich historical data
- Multi-market events requiring cross-market analysis
- Markets with significant recent volatility

**Disable for**:
- Simple binary markets with limited context
- Very low-liquidity markets (<$50K)
- Time-sensitive analysis requiring <30s execution
- Budget-constrained environments (higher LLM token usage)

### Tool Selection Strategy

The agent automatically selects tools based on market characteristics, but you can guide behavior through configuration:

**For comprehensive analysis** (maxToolCalls = 5):
- Agent will use 3-5 tools for deep research
- Best for high-stakes decisions
- Execution time: 35-45 seconds

**For balanced analysis** (maxToolCalls = 3):
- Agent will use 2-3 most relevant tools
- Good for most markets
- Execution time: 25-35 seconds

**For quick analysis** (maxToolCalls = 2):
- Agent will use 1-2 essential tools only
- Best for rapid screening
- Execution time: 20-30 seconds

### Monitoring and Debugging

**Key Metrics to Track**:
- `toolUsage.toolsCalled`: Number of tools invoked
- `toolUsage.totalToolTime`: Time spent in tool execution
- `toolUsage.cacheHits`: Cache effectiveness
- `confidence`: Agent confidence in analysis
- `metadata.crowdWisdomScore`: Market quality indicator

**Audit Log Analysis**:
```typescript
// Access tool audit log from agent output
const auditEntry = state.auditLog.find(
  entry => entry.stage === 'agent_autonomous_polling'
);

const toolAudit = auditEntry?.data?.toolAudit || [];

// Analyze tool performance
toolAudit.forEach(entry => {
  console.log(`Tool: ${entry.toolName}`);
  console.log(`Duration: ${entry.duration}ms`);
  console.log(`Cache hit: ${entry.cacheHit}`);
  console.log(`Success: ${!entry.error}`);
});
```

## Migration from Basic Agent

### Step 1: Test in Development

```bash
# Enable autonomous mode in development
export POLLING_AGENT_AUTONOMOUS=true
export POLLING_AGENT_FALLBACK_TO_BASIC=true

# Run analysis
npm run cli -- analyze <conditionId>
```

### Step 2: Compare Results

Run both agents side-by-side and compare:
- Confidence scores
- Fair probability estimates
- Key drivers and insights
- Execution time

### Step 3: Gradual Rollout

```typescript
// Enable for specific market types first
const config: EngineConfig = {
  pollingAgent: {
    autonomous: market.volume24h > 100000, // Only high-volume markets
    maxToolCalls: 3,                       // Conservative limit
    timeout: 45000,
    cacheEnabled: true,
    fallbackToBasic: true,                 // Safety net
  },
};
```

### Step 4: Monitor Performance

Track key metrics:
- Success rate (should be >95%)
- Average execution time (should be <45s)
- Confidence distribution (should improve)
- Tool usage patterns

### Step 5: Full Rollout

Once confident, enable for all markets:
```bash
export POLLING_AGENT_AUTONOMOUS=true
```

## Further Reading

- **Design Document**: `.kiro/specs/autonomous-polling-agent/design.md`
- **Requirements**: `.kiro/specs/autonomous-polling-agent/requirements.md`
- **Implementation Tasks**: `.kiro/specs/autonomous-polling-agent/tasks.md`
- **Tool Implementation**: `src/tools/polling-tools.ts`
- **Agent Implementation**: `src/nodes/autonomous-polling-agent.ts`
- **Configuration**: `src/config/polling-agent-config.ts`
