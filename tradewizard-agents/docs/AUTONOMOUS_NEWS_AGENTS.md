# Autonomous NewsData Agents

## Overview

The Autonomous NewsData Agents feature transforms three existing TradeWizard agents from passive news consumers into active, tool-using agents capable of autonomously fetching and researching news data. This enhancement applies the proven autonomous polling agent pattern to:

1. **Breaking News Agent** - Analyzes breaking news for immediate market impact
2. **Media Sentiment Agent** - Analyzes media sentiment from news articles  
3. **Market Microstructure Agent** - Uses market news for microstructure analysis

**Key Innovation**: By giving these agents direct access to NewsData API through LangChain tools, they can intelligently decide what news queries to make based on market context, construct targeted searches, and synthesize information from multiple news sources - rather than being limited to pre-fetched data.

## Architecture

### ReAct Pattern

Each autonomous agent uses LangChain's **ReAct (Reasoning + Acting)** pattern:

1. **Reason**: Analyze the market and decide what data is needed
2. **Act**: Invoke tools to fetch that data
3. **Observe**: Review tool results
4. **Repeat**: Continue until sufficient information is gathered
5. **Synthesize**: Generate final news analysis

### Tool Infrastructure

The agents have access to four specialized news tools:

- **fetchLatestNews**: Get the latest news from the past 48 hours
- **fetchArchiveNews**: Get historical news with date range filtering
- **fetchCryptoNews**: Get cryptocurrency-related news
- **fetchMarketNews**: Get financial market and company news

Each tool includes:
- Input validation with Zod schemas
- Result caching within analysis session
- Comprehensive audit logging
- Graceful error handling

### Integration with Workflow

```
market_ingestion → keyword_extraction → dynamic_agent_selection
                                              ↓
                                    [parallel execution]
                                              ↓
                    ┌─────────────────────────┼─────────────────────────┐
                    ↓                         ↓                         ↓
        autonomous_breaking_news_agent  probability_baseline_agent  risk_assessment_agent
                    ↓                         ↓                         ↓
        autonomous_media_sentiment_agent event_impact_agent      autonomous_polling_agent
                    ↓                         ↓                         ↓
        autonomous_market_microstructure_agent                          
                    ↓                         ↓                         ↓
                    └─────────────────────────┼─────────────────────────┘
                                              ↓
                                    agent_signal_fusion
```

## Configuration

### Environment Variables

Each agent can be configured independently via environment variables:

#### Breaking News Agent
```bash
BREAKING_NEWS_AGENT_AUTONOMOUS=true          # Enable autonomous mode
BREAKING_NEWS_AGENT_MAX_TOOL_CALLS=5         # Max tools per analysis
BREAKING_NEWS_AGENT_TIMEOUT=45000            # Timeout in milliseconds
BREAKING_NEWS_AGENT_CACHE_ENABLED=true       # Enable result caching
BREAKING_NEWS_AGENT_FALLBACK_TO_BASIC=true   # Fallback on error
```

#### Media Sentiment Agent
```bash
MEDIA_SENTIMENT_AGENT_AUTONOMOUS=true
MEDIA_SENTIMENT_AGENT_MAX_TOOL_CALLS=5
MEDIA_SENTIMENT_AGENT_TIMEOUT=45000
MEDIA_SENTIMENT_AGENT_CACHE_ENABLED=true
MEDIA_SENTIMENT_AGENT_FALLBACK_TO_BASIC=true
```

#### Market Microstructure Agent
```bash
MARKET_MICROSTRUCTURE_AGENT_AUTONOMOUS=true
MARKET_MICROSTRUCTURE_AGENT_MAX_TOOL_CALLS=5
MARKET_MICROSTRUCTURE_AGENT_TIMEOUT=45000
MARKET_MICROSTRUCTURE_AGENT_CACHE_ENABLED=true
MARKET_MICROSTRUCTURE_AGENT_FALLBACK_TO_BASIC=true
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `autonomous` | `false` | Enable autonomous mode with tool-calling capabilities |
| `maxToolCalls` | `5` | Maximum number of tool calls per analysis |
| `timeout` | `45000` | Timeout for agent execution in milliseconds |
| `cacheEnabled` | `true` | Enable tool result caching within session |
| `fallbackToBasic` | `true` | Fallback to basic agent on error |

### Gradual Rollout Strategy

The feature is designed for gradual rollout:

1. **Start with autonomous=false** for backward compatibility
2. **Enable for specific market types** first (e.g., high-volume markets)
3. **Monitor tool usage and performance** via audit logs
4. **Gradually increase maxToolCalls** as confidence grows
5. **Always keep fallbackToBasic=true** in production for reliability

## Usage Examples

### Breaking News Agent

The Breaking News Agent prioritizes recent news with short timeframes:

**Typical Tool Usage**:
```typescript
// 1. Check for breaking news in the last hour
fetchLatestNews({ 
  queryInTitle: "election results", 
  timeframe: "1h" 
})

// 2. Broaden search if sparse results
fetchLatestNews({ 
  query: "election", 
  timeframe: "6h" 
})

// 3. Calculate breaking news velocity
// Articles per hour = total articles / timeframe hours
```

**Analysis Focus**:
- Time-sensitive events that could move markets immediately
- Breaking news velocity and intensity
- Source credibility and confirmation across multiple outlets
- Recency and freshness of information

### Media Sentiment Agent

The Media Sentiment Agent makes multiple queries with different sentiment filters:

**Typical Tool Usage**:
```typescript
// 1. Get positive sentiment articles
fetchLatestNews({ 
  query: "candidate name", 
  sentiment: "positive",
  timeframe: "24h"
})

// 2. Get negative sentiment articles
fetchLatestNews({ 
  query: "candidate name", 
  sentiment: "negative",
  timeframe: "24h"
})

// 3. Compare with historical sentiment
fetchArchiveNews({
  fromDate: "2024-01-01",
  toDate: "2024-01-31",
  query: "candidate name"
})
```

**Analysis Focus**:
- Overall media tone and narrative framing
- Sentiment distribution across sources
- Sentiment shifts over time
- Source bias and credibility
- Narrative consistency vs polarization

### Market Microstructure Agent

The Market Microstructure Agent focuses on market-specific news:

**Typical Tool Usage**:
```typescript
// 1. Get company-specific news
fetchMarketNews({ 
  symbols: ["AAPL"], 
  timeframe: "24h" 
})

// 2. Get broader market context
fetchMarketNews({ 
  query: "Federal Reserve", 
  countries: ["us"],
  timeframe: "48h"
})

// 3. Identify liquidity catalysts
fetchLatestNews({
  queryInTitle: "earnings announcement",
  timeframe: "6h"
})
```

**Analysis Focus**:
- News catalysts affecting market liquidity
- Information flow and market efficiency
- Trading pattern changes from news events
- Liquidity provision and market depth
- Price discovery and information incorporation

## Performance Characteristics

### Latency

- **Target**: 95% of requests complete within 45 seconds
- **Typical**: 20-35 seconds with 3-5 tool calls
- **Timeout**: 45 seconds (configurable)

### Tool Usage

- **Average**: 3-4 tool calls per analysis
- **Maximum**: 5 tool calls (configurable)
- **Cache Hit Rate**: 20-40% on repeated markets

### API Quota

Each tool call consumes NewsData API quota:
- **fetchLatestNews**: 1 credit per call
- **fetchArchiveNews**: 1-10 credits depending on date range
- **fetchCryptoNews**: 1 credit per call
- **fetchMarketNews**: 1 credit per call

**Optimization Strategies**:
- Tool result caching reduces redundant calls
- Agents learn to prioritize high-value queries
- maxToolCalls limit prevents runaway usage

## Monitoring and Debugging

### Audit Logs

Every tool call is logged with comprehensive details:

```typescript
{
  toolName: "fetchLatestNews",
  timestamp: 1234567890,
  params: { query: "election", timeframe: "24h" },
  result: [...], // Array of articles
  duration: 1234, // Milliseconds
  cacheHit: false,
  articleCount: 15
}
```

### Tool Usage Summary

Each agent execution includes a tool usage summary:

```typescript
{
  toolsCalled: 4,
  totalToolTime: 3456,
  llmTime: 8765,
  totalDuration: 12221,
  cacheHits: 1,
  cacheMisses: 3,
  cacheHitRate: "0.25",
  toolBreakdown: {
    fetchLatestNews: 3,
    fetchArchiveNews: 1
  },
  totalArticles: 42,
  errors: 0
}
```

### Common Issues

#### Issue: Agent Timeout

**Symptoms**: Agent execution exceeds 45 seconds

**Causes**:
- Too many tool calls (>5)
- Slow NewsData API responses
- Large date ranges in fetchArchiveNews

**Solutions**:
- Reduce maxToolCalls
- Increase timeout
- Use shorter timeframes
- Enable caching

#### Issue: Tool Failures

**Symptoms**: Tools return errors instead of articles

**Causes**:
- Invalid API key
- Rate limit exceeded
- Invalid query parameters
- Network issues

**Solutions**:
- Verify NEWSDATA_API_KEY is set
- Check rate limit status
- Review tool parameters in audit log
- Enable fallbackToBasic for resilience

#### Issue: Low Confidence Signals

**Symptoms**: Agent returns low confidence (<0.5)

**Causes**:
- Sparse news results (<5 articles)
- Tool failures during execution
- Conflicting information across sources

**Solutions**:
- Agents automatically adjust confidence based on data quality
- Review riskFactors in agent signal for details
- Consider broadening search parameters

## Error Handling

### Graceful Degradation

The autonomous agents implement comprehensive error handling:

1. **Tool Validation Errors**: Return structured error without crashing
2. **API Errors**: Log error and continue with partial data
3. **Timeout**: Return partial results with reduced confidence
4. **Critical Failures**: Fall back to basic agent (if enabled)

### Confidence Adjustment

When tool failures occur, confidence is automatically adjusted:

```typescript
// Reduce confidence by 10% for each failed tool, up to 50% reduction
const confidenceReduction = Math.min(0.5, toolFailureCount * 0.1);
signal.confidence = Math.max(0.1, signal.confidence * (1 - confidenceReduction));
```

### Risk Factor Reporting

Tool failures are included in riskFactors:

```typescript
riskFactors: [
  "2 of 5 tool calls failed (40% failure rate)",
  "Analysis may be incomplete due to tool failures",
  "Confidence adjusted downward to reflect data limitations",
  "fetchLatestNews failed: Rate limit exceeded"
]
```

## Testing

### Unit Tests

Located in `src/tools/newsdata-tools.test.ts` and `src/nodes/autonomous-news-agents.test.ts`:

- Tool input validation
- Tool execution with valid/invalid parameters
- Error handling and structured errors
- Cache hit/miss behavior
- Agent signal schema validation

### Property-Based Tests

Located in `src/tools/newsdata-tools.property.test.ts`:

- Tool input validation across random inputs (100+ iterations)
- Article schema consistency
- Article count limits (max 50)
- Date range validation
- Cache behavior across sessions

### Integration Tests

Located in `src/nodes/autonomous-news-agents.integration.test.ts`:

- End-to-end agent execution with real LLMs
- Tool calling workflow
- Workflow integration
- Fallback behavior

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test newsdata-tools.test.ts

# Run property-based tests
npm test newsdata-tools.property.test.ts

# Run with coverage
npm test -- --coverage
```

## Migration from Basic Agents

### Backward Compatibility

The autonomous agents are fully backward compatible:

- **Same input**: Accept Market Briefing Document (MBD)
- **Same output**: Produce AgentSignal with same schema
- **Same workflow integration**: Drop-in replacement for basic agents
- **Feature flag**: Controlled by `autonomous` configuration

### Migration Steps

1. **Verify NewsData API key** is configured:
   ```bash
   export NEWSDATA_API_KEY=your_api_key_here
   ```

2. **Enable autonomous mode** for one agent:
   ```bash
   export BREAKING_NEWS_AGENT_AUTONOMOUS=true
   ```

3. **Test with sample markets**:
   ```bash
   npm run cli -- analyze <conditionId>
   ```

4. **Monitor audit logs** for tool usage and errors

5. **Gradually enable** other agents:
   ```bash
   export MEDIA_SENTIMENT_AGENT_AUTONOMOUS=true
   export MARKET_MICROSTRUCTURE_AGENT_AUTONOMOUS=true
   ```

6. **Adjust configuration** based on performance:
   - Increase maxToolCalls if agents need more data
   - Increase timeout if agents frequently timeout
   - Disable caching if stale data is a concern

## Best Practices

### Configuration

- **Start conservative**: Use default configuration (autonomous=false)
- **Enable gradually**: One agent at a time, monitor performance
- **Keep fallback enabled**: Always set fallbackToBasic=true in production
- **Monitor quota**: Track NewsData API usage to avoid overages

### Tool Usage

- **Prioritize targeted queries**: Use queryInTitle for precision
- **Limit tool calls**: Keep maxToolCalls at 5 or below
- **Use caching**: Enable cacheEnabled to reduce redundant calls
- **Handle errors gracefully**: Agents continue with partial data on tool failures

### Monitoring

- **Review audit logs**: Check tool usage patterns and errors
- **Track performance**: Monitor execution time and timeout rate
- **Analyze confidence**: Low confidence may indicate data quality issues
- **Monitor API quota**: Ensure NewsData usage stays within limits

## Future Enhancements

### Planned Features

- **Parallel tool execution**: Execute independent tools simultaneously
- **Smart query refinement**: Agents learn from sparse results and adjust queries
- **Source prioritization**: Weight articles by source credibility
- **Multi-language support**: Analyze news in multiple languages
- **Real-time news streaming**: Subscribe to breaking news events

### Performance Optimizations

- **Query optimization**: Agents learn to construct more effective queries
- **Adaptive timeouts**: Adjust timeout based on market complexity
- **Predictive caching**: Pre-fetch likely queries before agent execution
- **Tool prioritization**: Rank tools by expected value and execute best first

## References

- [NewsData.io API Documentation](https://newsdata.io/documentation)
- [LangChain Tools Documentation](https://js.langchain.com/docs/modules/agents/tools/)
- [ReAct Pattern Paper](https://arxiv.org/abs/2210.03629)
- [TradeWizard Architecture](./TradeWizard.md)
- [Autonomous Polling Agent](./AUTONOMOUS_POLLING_AGENT.md)
