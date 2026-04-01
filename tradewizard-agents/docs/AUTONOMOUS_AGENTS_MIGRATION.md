# Autonomous News and Polling Agents Migration Guide

## Overview

This guide documents the complete replacement of the old non-autonomous agents with new autonomous tool-calling agents. This is a **breaking change** with **no backward compatibility**.

## What Changed

### Complete Agent Replacement

The following agents have been completely replaced:

1. **Breaking News Agent** (`doa/agents/breaking_news.py`)
   - Old: Used pre-fetched news data from workflow state
   - New: Autonomously fetches news using LangChain tools (ReAct pattern)

2. **Media Sentiment Agent** (`doa/agents/media_sentiment.py`)
   - Old: Used pre-fetched news data from workflow state
   - New: Autonomously fetches news with sentiment filters using LangChain tools

3. **Polling Intelligence Agent** (`doa/agents/polling_intelligence.py`)
   - Old: Used pre-fetched market data from workflow state
   - New: Autonomously fetches market data using Polymarket tools

### New Capabilities

**Autonomous Tool-Calling (ReAct Pattern)**:
- Agents reason about which tools to call based on market context
- Agents act by calling tools to fetch external data
- Agents observe results and decide whether to call more tools
- Maximum 5 tool calls per agent (configurable)

**NewsData Tools**:
- `fetch_latest_news` - Fetch recent news (1h-48h timeframes)
- `fetch_archive_news` - Fetch historical news with date ranges
- `fetch_crypto_news` - Fetch cryptocurrency-specific news
- `fetch_market_news` - Fetch financial market and company news

**Polymarket Tools**:
- `fetch_related_markets` - Find related prediction markets
- `fetch_historical_prices` - Analyze price trends over time
- `fetch_cross_market_data` - Compare multiple markets
- `analyze_market_momentum` - Detect momentum patterns
- `detect_sentiment_shifts` - Identify rapid price changes

**Tool Caching**:
- Results cached within each analysis session
- Avoids redundant API calls
- Cache keys based on tool name + parameters
- Cache statistics tracked (hits, misses, hit rate)

**Comprehensive Audit Logging**:
- All tool invocations logged with parameters
- Results, errors, and duration tracked
- Cache hit/miss status recorded
- Tool usage metadata included in agent signals

## Configuration Changes

### Removed Configuration

The following environment variables have been **removed** (no longer needed):

```bash
# REMOVED - Autonomous agents are always enabled
AUTONOMOUS_AGENTS_ENABLED=true

# REMOVED - Per-agent autonomous flags
BREAKING_NEWS_AGENT_AUTONOMOUS=true
MEDIA_SENTIMENT_AGENT_AUTONOMOUS=true
POLLING_AGENT_AUTONOMOUS=true

# REMOVED - Per-agent configuration (now global)
BREAKING_NEWS_AGENT_MAX_TOOL_CALLS=5
BREAKING_NEWS_AGENT_TIMEOUT=45000
BREAKING_NEWS_AGENT_CACHE_ENABLED=true
```

### New Configuration

Add these environment variables to your `.env` file:

```bash
# NewsData API Key (REQUIRED)
NEWSDATA_API_KEY=your_newsdata_api_key_here

# Global Tool Configuration (OPTIONAL - defaults shown)
MAX_TOOL_CALLS=5              # Maximum tool calls per agent
AGENT_TIMEOUT_MS=45000        # Agent timeout in milliseconds
TOOL_CACHE_ENABLED=true       # Enable tool result caching
```

### Configuration Migration

**Before** (old configuration):
```bash
# Old per-agent configuration
BREAKING_NEWS_AGENT_AUTONOMOUS=true
BREAKING_NEWS_AGENT_MAX_TOOL_CALLS=5
BREAKING_NEWS_AGENT_TIMEOUT=45000
MEDIA_SENTIMENT_AGENT_AUTONOMOUS=true
MEDIA_SENTIMENT_AGENT_MAX_TOOL_CALLS=5
POLLING_AGENT_AUTONOMOUS=true
```

**After** (new global configuration):
```bash
# New global configuration
NEWSDATA_API_KEY=your_api_key_here
MAX_TOOL_CALLS=5
AGENT_TIMEOUT_MS=45000
TOOL_CACHE_ENABLED=true
```

## Migration Steps

### Step 1: Update Dependencies

The new autonomous agents require additional Python packages:

```bash
pip install httpx langchain-core langgraph hypothesis pytest-httpx
```

Or update from `requirements.txt`:

```bash
pip install -r requirements.txt
```

### Step 2: Update Environment Variables

1. **Remove old variables** from your `.env` file:
   - `AUTONOMOUS_AGENTS_ENABLED`
   - All per-agent `*_AUTONOMOUS` flags
   - All per-agent `*_MAX_TOOL_CALLS` settings
   - All per-agent `*_TIMEOUT` settings

2. **Add new variables** to your `.env` file:
   ```bash
   NEWSDATA_API_KEY=your_newsdata_api_key_here
   MAX_TOOL_CALLS=5
   AGENT_TIMEOUT_MS=45000
   TOOL_CACHE_ENABLED=true
   ```

3. **Get a NewsData API key**:
   - Sign up at https://newsdata.io
   - Copy your API key from the dashboard
   - Add it to your `.env` file

### Step 3: Update Code References

If you have custom code that references the old agents:

**Remove imports of old agents**:
```python
# REMOVE THESE
from doa.agents.breaking_news import breaking_news_agent
from doa.agents.media_sentiment import media_sentiment_agent
from doa.agents.polling_intelligence import polling_intelligence_agent
```

**Use new autonomous agents**:
```python
# USE THESE INSTEAD
from doa.agents.breaking_news import breaking_news_node
from doa.agents.media_sentiment import media_sentiment_node
from doa.agents.polling_intelligence import polling_intelligence_node
```

### Step 4: Update Workflow Configuration

The workflow automatically uses the new autonomous agents. No code changes needed if you're using the standard workflow.

If you have custom workflow code:

**Before**:
```python
# Old workflow with conditional logic
if config.autonomous_agents.enabled:
    workflow.add_node("breaking_news", autonomous_breaking_news_node)
else:
    workflow.add_node("breaking_news", breaking_news_node)
```

**After**:
```python
# New workflow - always autonomous
workflow.add_node("breaking_news", breaking_news_node)
```

### Step 5: Test the Migration

Run a test analysis to verify everything works:

```bash
python -m doa.cli analyze <condition_id> --debug
```

Check the output for:
- ✅ Agents execute successfully
- ✅ Tool calls appear in audit log
- ✅ Cache statistics are tracked
- ✅ Agent signals include tool usage metadata

## Breaking Changes

### No Backward Compatibility

**Important**: There is **no backward compatibility** with the old agents. This is a clean break.

- Old agent files have been deleted
- Old configuration variables are ignored
- Old workflow patterns no longer work
- No fallback to non-autonomous mode

### API Changes

**Agent Signal Metadata**:

The `AgentSignal.metadata` field now includes tool usage information:

```python
{
    "tool_usage": {
        "tools_called": 3,
        "total_tool_time": 2500,  # milliseconds
        "cache_hits": 1,
        "cache_misses": 2,
        "tool_breakdown": {
            "fetch_latest_news": 2,
            "fetch_archive_news": 1
        }
    },
    "tool_failures": {  # Optional, only if failures occurred
        "count": 1,
        "rate": 0.33,
        "failures": [
            {
                "tool_name": "fetch_crypto_news",
                "error": "Rate limit exceeded",
                "timestamp": 1234567890
            }
        ],
        "confidence_adjustment": 0.1
    }
}
```

**Audit Log Entries**:

Audit log now includes tool invocation entries:

```python
{
    "tool_name": "fetch_latest_news",
    "timestamp": 1234567890,
    "params": {"query": "election", "timeframe": "24h"},
    "result": {"articles": [...]},
    "duration": 1250,  # milliseconds
    "cache_hit": False,
    "article_count": 15
}
```

### Behavior Changes

**Tool Call Limits**:
- Agents are limited to 5 tool calls per analysis (configurable)
- Exceeding the limit results in early termination
- Partial results returned with reduced confidence

**Timeout Handling**:
- Agents timeout after 45 seconds (configurable)
- Partial results returned with timeout indication
- Confidence reduced to 0.3 on timeout

**Error Handling**:
- Tool failures don't crash the analysis
- Agents continue with available data
- Confidence reduced proportionally to failure rate
- All errors logged in audit trail

## Troubleshooting

### "NEWSDATA_API_KEY is required"

**Problem**: Missing NewsData API key.

**Solution**:
1. Sign up at https://newsdata.io
2. Copy your API key
3. Add to `.env`: `NEWSDATA_API_KEY=your_key_here`

### "No module named 'httpx'"

**Problem**: Missing dependencies.

**Solution**:
```bash
pip install httpx langchain-core langgraph
```

### "Agent timeout exceeded"

**Problem**: Agent took too long to execute.

**Solution**:
1. Increase timeout: `AGENT_TIMEOUT_MS=60000`
2. Reduce tool calls: `MAX_TOOL_CALLS=3`
3. Check network connectivity

### "Rate limit exceeded"

**Problem**: NewsData API rate limit hit.

**Solution**:
1. Wait for rate limit to reset
2. Upgrade to paid NewsData plan
3. Enable caching: `TOOL_CACHE_ENABLED=true`

### "Tool cache not working"

**Problem**: Cache not reducing API calls.

**Solution**:
1. Verify: `TOOL_CACHE_ENABLED=true`
2. Check cache statistics in audit log
3. Ensure parameters are consistent (cache keys are deterministic)

### "Old agent configuration ignored"

**Problem**: Old environment variables not working.

**Solution**:
This is expected behavior. Remove old variables and use new global configuration:
```bash
# Remove these
AUTONOMOUS_AGENTS_ENABLED=true
BREAKING_NEWS_AGENT_AUTONOMOUS=true

# Use these
NEWSDATA_API_KEY=your_key_here
MAX_TOOL_CALLS=5
```

## Performance Considerations

### API Costs

**NewsData API Pricing**:
- Free tier: 200 requests/day
- Paid tier: 10,000 requests/day ($99/month)

**Typical Usage**:
- Breaking News Agent: 2-3 tool calls per analysis
- Media Sentiment Agent: 2-3 tool calls per analysis
- Polling Intelligence Agent: 2-3 tool calls per analysis
- Total: ~7-9 API calls per market analysis

**Cost Optimization**:
- Enable caching: `TOOL_CACHE_ENABLED=true` (60-80% cache hit rate)
- Reduce tool calls: `MAX_TOOL_CALLS=3`
- Use paid tier for production

### Execution Time

**Typical Execution Times**:
- Tool execution: 1-3 seconds per tool call
- Agent reasoning: 2-5 seconds
- Total per agent: 5-15 seconds
- Total analysis: 45-60 seconds (within existing timeout)

**Performance Tips**:
- Enable caching to reduce API latency
- Use parallel agent execution (already implemented)
- Monitor tool execution times in audit log

## Support

For issues or questions:

1. Check the [Autonomous News Agents Documentation](./AUTONOMOUS_NEWS_AGENTS.md)
2. Review the [Design Document](../.kiro/specs/autonomous-news-polling-agents/design.md)
3. Check audit logs for detailed error information
4. Open an issue on GitHub

## Summary

This migration represents a complete replacement of the old agents with new autonomous tool-calling agents. The new agents provide:

✅ Higher quality analysis through autonomous data fetching
✅ Better explainability through comprehensive audit logging
✅ Improved efficiency through intelligent caching
✅ Graceful degradation on errors
✅ Simplified configuration (global instead of per-agent)

The migration requires:
- Adding NewsData API key
- Updating environment variables
- Removing old configuration
- Testing the new agents

There is **no backward compatibility** - this is a clean break from the old implementation.
