# Advanced Agent League

## Overview

The Advanced Agent League expands TradeWizard's Market Intelligence Engine from 3 MVP agents to a comprehensive ecosystem of 13+ specialized agents that analyze prediction markets from every relevant angle. This transforms the system from a basic intelligence layer into a full "digital trading firm" with analysts, forecasters, strategists, and risk managers all contributing unique perspectives.

## Core Principles

The Advanced Agent League is designed around four core principles:

1. **Specialization Over Generalization** - Each agent focuses on a specific analytical domain (events, sentiment, polling, price action, risk philosophy) to provide deep expertise
2. **Modular Extensibility** - New agents can be added without modifying the core engine, using the same LangGraph node pattern
3. **Intelligent Signal Fusion** - Agent signals are weighted dynamically based on market context, data availability, and agent performance
4. **Cost-Aware Activation** - Agents are selectively activated based on market type to optimize LLM and API costs

## Architecture

The Advanced Agent League integrates seamlessly into the existing LangGraph workflow by adding new parallel agent nodes. The core architecture remains unchanged—we simply expand the agent execution layer.

### Workflow Overview

```
Market Ingestion
    ↓
Dynamic Agent Selection
    ↓
┌─────────────────────────────────────┐
│ Parallel Agent Execution            │
│ - MVP Agents (always active)        │
│ - Event Intelligence Agents         │
│ - Polling & Statistical Agents      │
│ - Sentiment & Narrative Agents      │
│ - Price Action Agents               │
│ - Event Scenario Agents             │
└─────────────────────────────────────┘
    ↓
Agent Signal Fusion
    ↓
Thesis Construction
    ↓
Cross-Examination
    ↓
Consensus Engine
    ↓
Risk Philosophy Agents
    ↓
Recommendation Generation
```

## Agent Groups

The Advanced Agent League consists of 6 agent groups, each with specialized agents:


### 1. Event Intelligence Agents

**Purpose**: Monitor and interpret real-world events that impact market outcomes

**Agents**:
- **Breaking News Agent**: Monitors political, legal, and policy news; flags market-moving events
- **Event Impact Agent**: Models how events reprice markets based on historical patterns

**When Activated**: Court markets, policy markets, geopolitical markets

**Key Capabilities**:
- Real-time news monitoring
- Regime-change event detection
- Historical analog identification
- Scenario tree generation

### 2. Polling & Statistical Agents

**Purpose**: Analyze polling data and historical patterns for probability-driven decisions

**Agents**:
- **Polling Intelligence Agent**: Aggregates polls with bias adjustments and momentum detection
- **Historical Pattern Agent**: Identifies analogous past events and pattern overlays

**When Activated**: Election markets, referendum markets

**Key Capabilities**:
- Pollster bias adjustment
- Momentum shift detection
- Historical pattern matching
- Statistical modeling

### 3. Sentiment & Narrative Agents

**Purpose**: Track media sentiment and social discourse to understand narrative evolution

**Agents**:
- **Media Sentiment Agent**: Analyzes news coverage tone and framing
- **Social Sentiment Agent**: Monitors social media and crowd psychology
- **Narrative Velocity Agent**: Measures narrative spread rates

**When Activated**: Election markets, policy markets, high-visibility events

**Key Capabilities**:
- Sentiment trend analysis
- Viral narrative detection
- Crowd psychology assessment
- Narrative velocity measurement


### 4. Price Action & Timing Agents

**Purpose**: Analyze market price movements for optimal entry and exit timing

**Agents**:
- **Momentum Agent**: Identifies breakouts and order-flow momentum
- **Mean Reversion Agent**: Identifies overextensions and fade opportunities

**When Activated**: Markets with sufficient trading history (volume24h > 1000)

**Key Capabilities**:
- Momentum indicator analysis
- Breakout pattern detection
- Overextension identification
- Timing window calculation

### 5. Event Scenario Agents

**Purpose**: Model future catalysts and tail risks

**Agents**:
- **Catalyst Agent**: Tracks upcoming events and models pre/post-event strategies
- **Shock & Tail-Risk Agent**: Identifies underpriced surprise scenarios

**When Activated**: All markets (always active)

**Key Capabilities**:
- Catalyst identification
- Event timeline modeling
- Tail-risk scenario analysis
- Asymmetric payoff identification

### 6. Risk Philosophy Agents

**Purpose**: Provide multiple risk management perspectives

**Agents**:
- **Aggressive Agent**: Advocates for high-conviction, concentrated exposure
- **Conservative Agent**: Advocates for capital preservation and hedging
- **Neutral Agent**: Advocates for market-neutral approaches

**When Activated**: After consensus probability is established (always active)

**Key Capabilities**:
- Position sizing recommendations
- Kelly criterion calculation
- Hedging strategy identification
- Spread trade opportunities


## Dynamic Agent Selection

The system intelligently selects which agents to activate based on market characteristics:

### Selection Rules

| Market Type | Activated Agents |
|------------|------------------|
| **Election** | MVP + Polling Intelligence + Media Sentiment + Social Sentiment + Narrative Velocity |
| **Court** | MVP + Breaking News + Event Impact + Historical Pattern |
| **Policy** | MVP + Breaking News + Event Impact + Media Sentiment + Catalyst |
| **Geopolitical** | MVP + Breaking News + Event Impact + Media Sentiment + Catalyst |
| **Economic** | MVP + Breaking News + Event Impact + Historical Pattern |
| **Unknown** | MVP + All available agents |

### Additional Conditions

- **Price Action Agents**: Only activated if `volume24h > 1000` and historical price data exists
- **Risk Philosophy Agents**: Always activated after consensus is established
- **Event Scenario Agents**: Always activated

### Cost Optimization

Agents are skipped if:
- Required external data is unavailable
- Cost threshold would be exceeded
- Configuration disables the agent group
- Market characteristics don't match agent specialization

## Agent Signal Fusion

After all agents complete their analysis, their signals are fused into a unified market view.

### Fusion Process

1. **Signal Collection**: Gather all agent signals
2. **Dynamic Weighting**: Assign weights based on agent type, market context, and data quality
3. **Conflict Detection**: Identify divergent signals
4. **Alignment Calculation**: Measure agreement across agents
5. **Confidence Calculation**: Compute overall fusion confidence

### Weighting Strategy

**Base Weights by Agent Type**:
- MVP agents: 1.0x
- Event Intelligence: 1.2x (for event-driven markets)
- Polling agents: 1.5x (for election markets)
- Sentiment agents: 0.8x (sentiment is noisy)
- Price Action: 1.0x (liquid markets), 0.5x (illiquid)
- Event Scenario: 1.0x

**Context Adjustments**:
- +20% if agent has high confidence
- -30% if data is stale
- +15% if agent's historical accuracy is high
- -20% if agent signal is an outlier


### Conflict Resolution

When agents disagree significantly (probability estimates differ by >0.20):
- Flag the conflict in the audit log
- Widen confidence bands
- Surface disagreement in final recommendation
- Include both perspectives in explanation

### Alignment Bonus

When multiple independent agents agree:
- Increase overall confidence by up to 20%
- Cross-agent-type alignment is stronger than within-type
- Alignment across data sources increases confidence more

## External Data Integration

The Advanced Agent League integrates with external data sources to provide agents with real-time information.

### Supported Data Sources

**News APIs**:
- NewsAPI
- Perplexity
- Custom news aggregators

**Polling APIs**:
- FiveThirtyEight
- RealClearPolitics
- Polymarket polling data

**Social Media APIs**:
- Twitter/X
- Reddit
- Custom social aggregators

### Caching Strategy

To minimize API costs and improve performance:

| Data Type | Cache TTL | Rationale |
|-----------|-----------|-----------|
| News | 15 minutes | News changes frequently |
| Polling | 1 hour | Polls update slowly |
| Social | 5 minutes | Social moves fast |

### Rate Limiting

- Token bucket algorithm per data source
- Prioritize critical sources when approaching limits
- Fall back to cached data when rate limited
- Log rate limit warnings for operator visibility

### Graceful Degradation

When external data is unavailable:
1. Attempt to use cached data (even if stale)
2. Flag data as stale in agent signals
3. Skip dependent agents if no cached data
4. Continue analysis with remaining agents
5. Log data source failures


## Configuration

The Advanced Agent League is highly configurable to support different use cases and budgets.

### Configuration Structure

```typescript
{
  advancedAgents: {
    eventIntelligence: { enabled: boolean, breakingNews: boolean, eventImpact: boolean },
    pollingStatistical: { enabled: boolean, pollingIntelligence: boolean, historicalPattern: boolean },
    sentimentNarrative: { enabled: boolean, mediaSentiment: boolean, socialSentiment: boolean, narrativeVelocity: boolean },
    priceAction: { enabled: boolean, momentum: boolean, meanReversion: boolean, minVolumeThreshold: number },
    eventScenario: { enabled: boolean, catalyst: boolean, tailRisk: boolean },
    riskPhilosophy: { enabled: boolean, aggressive: boolean, conservative: boolean, neutral: boolean }
  },
  externalData: {
    news: { provider: string, apiKey: string, cacheTTL: number, maxArticles: number },
    polling: { provider: string, apiKey: string, cacheTTL: number },
    social: { providers: string[], apiKeys: object, cacheTTL: number, maxMentions: number }
  },
  signalFusion: {
    baseWeights: object,
    contextAdjustments: boolean,
    conflictThreshold: number,
    alignmentBonus: number
  },
  costOptimization: {
    maxCostPerAnalysis: number,
    skipLowImpactAgents: boolean,
    batchLLMRequests: boolean
  },
  performanceTracking: {
    enabled: boolean,
    evaluateOnResolution: boolean,
    minSampleSize: number
  }
}
```

### Budget-Conscious Configuration

For cost-effective analysis with essential advanced agents:

```typescript
{
  advancedAgents: {
    eventIntelligence: { enabled: true, breakingNews: true, eventImpact: false },
    pollingStatistical: { enabled: true, pollingIntelligence: true, historicalPattern: false },
    sentimentNarrative: { enabled: false },
    priceAction: { enabled: false },
    eventScenario: { enabled: true, catalyst: true, tailRisk: false },
    riskPhilosophy: { enabled: true, aggressive: true, conservative: true, neutral: false }
  },
  costOptimization: {
    maxCostPerAnalysis: 0.50,
    skipLowImpactAgents: true,
    batchLLMRequests: true
  }
}
```

**Estimated Cost**: $0.30-0.50 per analysis
**Agents Active**: 6-8 agents (MVP + selective advanced)
**Best For**: High-volume analysis, budget constraints


### Premium Configuration

For comprehensive analysis with all agents:

```typescript
{
  advancedAgents: {
    eventIntelligence: { enabled: true, breakingNews: true, eventImpact: true },
    pollingStatistical: { enabled: true, pollingIntelligence: true, historicalPattern: true },
    sentimentNarrative: { enabled: true, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
    priceAction: { enabled: true, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
    eventScenario: { enabled: true, catalyst: true, tailRisk: true },
    riskPhilosophy: { enabled: true, aggressive: true, conservative: true, neutral: true }
  },
  costOptimization: {
    maxCostPerAnalysis: 2.00,
    skipLowImpactAgents: false,
    batchLLMRequests: true
  }
}
```

**Estimated Cost**: $1.50-2.00 per analysis
**Agents Active**: 13-16 agents (all agents)
**Best For**: High-stakes decisions, comprehensive analysis

### Balanced Configuration

For most use cases with good coverage:

```typescript
{
  advancedAgents: {
    eventIntelligence: { enabled: true, breakingNews: true, eventImpact: true },
    pollingStatistical: { enabled: true, pollingIntelligence: true, historicalPattern: false },
    sentimentNarrative: { enabled: true, mediaSentiment: true, socialSentiment: false, narrativeVelocity: false },
    priceAction: { enabled: true, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
    eventScenario: { enabled: true, catalyst: true, tailRisk: true },
    riskPhilosophy: { enabled: true, aggressive: true, conservative: true, neutral: true }
  },
  costOptimization: {
    maxCostPerAnalysis: 1.00,
    skipLowImpactAgents: true,
    batchLLMRequests: true
  }
}
```

**Estimated Cost**: $0.70-1.00 per analysis
**Agents Active**: 10-13 agents
**Best For**: Most production use cases


## Cost Optimization

The Advanced Agent League implements several strategies to minimize LLM and API costs:

### 1. Dynamic Agent Selection

- Only activate agents relevant to the market type
- Skip agents when required data is unavailable
- Disable agent groups via configuration

### 2. External Data Caching

- Cache news, polling, and social data with appropriate TTLs
- Serve cached data when fresh data unavailable
- Reduce redundant API calls

### 3. Cost Threshold Enforcement

- Estimate cost before activating agents
- Skip optional agents when approaching budget
- Prioritize MVP and high-value agents

### 4. Batch LLM Requests

- Batch multiple agent requests when possible
- Reduce API overhead
- Improve throughput

### 5. Performance-Based Weighting

- Track agent accuracy over time
- Reduce weight of underperforming agents
- Potentially skip consistently poor agents

### Cost Tracking

All LLM costs are tracked via Opik:
- Per-agent cost tracking
- Total analysis cost
- Cost trends over time
- Cost by market type

### Cost Optimization Tips

1. **Start with Budget-Conscious config** and expand as needed
2. **Monitor cost per analysis** via Opik dashboard
3. **Disable low-value agents** for your use case
4. **Use caching aggressively** for external data
5. **Set appropriate cost thresholds** based on budget
6. **Review agent performance** and disable underperformers


## Performance Tracking

The system tracks agent performance to improve signal fusion over time.

### Metrics Tracked

For each agent:
- **Total Analyses**: Number of times agent has been activated
- **Average Confidence**: Mean confidence score across analyses
- **Accuracy Score**: Accuracy based on resolved markets (0-1)
- **Average Execution Time**: Mean time to complete analysis
- **Error Rate**: Percentage of failed executions
- **Last Updated**: Timestamp of last metric update

### Accuracy Evaluation

When a market resolves:
1. Retrieve all agent signals for that market
2. Compare each agent's probability estimate to actual outcome
3. Calculate accuracy using Brier score or similar metric
4. Update agent's accuracy score (rolling average)
5. Adjust agent weights in future analyses

### Performance Dashboard

Query agent performance metrics:

```typescript
// Get performance for all agents
const performance = getAgentPerformance();

// Get top-performing agents
const topAgents = getTopPerformingAgents(5);

// Get underperforming agents
const underperformers = getUnderperformingAgents(0.5); // Below 50% accuracy
```

### Performance-Based Adjustments

Agents with high accuracy receive:
- Increased weight in signal fusion (+15%)
- Priority activation when cost-constrained
- Highlighted in recommendation explanations

Agents with low accuracy receive:
- Decreased weight in signal fusion (-20%)
- Potential skipping when cost-constrained
- Flagged for review

### Minimum Sample Size

Performance adjustments only apply after minimum sample size:
- Default: 10 resolved markets
- Configurable via `performanceTracking.minSampleSize`
- Prevents premature judgments on limited data


## CLI Usage

The CLI supports advanced agent configuration and inspection.

### Enable/Disable Agent Groups

```bash
# Enable all advanced agents
npm run cli -- analyze <market-id> --advanced-agents all

# Enable specific agent groups
npm run cli -- analyze <market-id> \
  --event-intelligence \
  --polling-statistical \
  --sentiment-narrative

# Disable specific agents
npm run cli -- analyze <market-id> \
  --no-price-action \
  --no-event-scenario

# MVP agents only (backward compatibility)
npm run cli -- analyze <market-id> --mvp-only
```

### Cost Budget

```bash
# Set maximum cost per analysis
npm run cli -- analyze <market-id> --max-cost 0.50

# Budget-conscious mode
npm run cli -- analyze <market-id> --budget-mode

# Premium mode (all agents)
npm run cli -- analyze <market-id> --premium-mode
```

### Inspection Options

```bash
# Display agent selection decisions
npm run cli -- analyze <market-id> --show-agent-selection

# Display signal fusion details
npm run cli -- analyze <market-id> --show-fusion-details

# Display risk philosophy perspectives
npm run cli -- analyze <market-id> --show-risk-philosophy

# Display all advanced agent insights
npm run cli -- analyze <market-id> --verbose
```

### Performance Queries

```bash
# Query agent performance metrics
npm run cli -- performance --all

# Query top-performing agents
npm run cli -- performance --top 5

# Query underperforming agents
npm run cli -- performance --underperforming

# Query specific agent
npm run cli -- performance --agent polling_intelligence
```

### Configuration File

Create a configuration file for reusable settings:

```bash
# Create config file
cat > config/advanced-agents.json << EOF
{
  "advancedAgents": {
    "eventIntelligence": { "enabled": true },
    "pollingStatistical": { "enabled": true },
    "sentimentNarrative": { "enabled": false }
  },
  "costOptimization": {
    "maxCostPerAnalysis": 0.75
  }
}
EOF

# Use config file
npm run cli -- analyze <market-id> --config config/advanced-agents.json
```


## Observability

The Advanced Agent League provides comprehensive observability through Opik integration.

### Traced Operations

All advanced agent operations are traced:
- Dynamic agent selection
- External data fetching
- Individual agent executions
- Signal fusion process
- Risk philosophy analysis
- Cost tracking

### Audit Trail

Complete audit trail includes:
- Agent selection decisions with rationale
- External data fetch timestamps and freshness
- Signal fusion weights and conflicts
- Cost optimization decisions
- Performance tracking updates

### Opik Dashboard

View in Opik:
- **Traces**: Full execution traces for each analysis
- **Costs**: Per-agent and total analysis costs
- **Performance**: Agent accuracy and execution times
- **Errors**: Failed agents and error details
- **Trends**: Cost and performance trends over time

### Logging

Structured logs include:
- Agent activation/deactivation
- External data availability
- Signal conflicts and alignment
- Cost threshold enforcement
- Performance metric updates

### Debugging

For troubleshooting:

1. **Check Opik traces** for full execution details
2. **Review audit logs** for decision rationale
3. **Inspect agent signals** for unexpected values
4. **Verify external data** availability and freshness
5. **Check configuration** for misconfigured agents


## Best Practices

### Configuration

1. **Start Small**: Begin with Budget-Conscious config and expand
2. **Monitor Costs**: Track cost per analysis via Opik
3. **Tune Weights**: Adjust signal fusion weights based on your use case
4. **Set Thresholds**: Configure appropriate cost and confidence thresholds
5. **Review Performance**: Regularly check agent performance metrics

### External Data

1. **Configure Caching**: Set appropriate TTLs for your use case
2. **Monitor Rate Limits**: Track API usage to avoid rate limiting
3. **Handle Failures**: Ensure graceful degradation when data unavailable
4. **Validate Data**: Verify external data quality and freshness
5. **Rotate Keys**: Regularly rotate API keys for security

### Agent Selection

1. **Market-Specific**: Enable agents relevant to market type
2. **Data-Driven**: Only activate agents when data is available
3. **Cost-Aware**: Skip low-impact agents when budget-constrained
4. **Performance-Based**: Reduce weight of underperforming agents
5. **Test Combinations**: Experiment with different agent combinations

### Signal Fusion

1. **Context Matters**: Adjust weights based on market context
2. **Surface Conflicts**: Highlight agent disagreements
3. **Alignment Bonus**: Reward cross-agent-type agreement
4. **Quality Penalty**: Penalize stale or low-quality data
5. **Confidence Bands**: Widen bands when uncertainty is high

### Performance Tracking

1. **Minimum Sample**: Wait for sufficient data before adjusting weights
2. **Regular Evaluation**: Evaluate agents on resolved markets
3. **Track Trends**: Monitor performance trends over time
4. **Identify Outliers**: Flag consistently poor performers
5. **Continuous Improvement**: Use performance data to refine system


## Troubleshooting

### Common Issues

#### Agents Not Activating

**Symptoms**: Expected agents don't appear in analysis

**Causes**:
- Agent group disabled in configuration
- Required external data unavailable
- Market type doesn't match agent specialization
- Cost threshold exceeded

**Solutions**:
1. Check configuration: `--show-agent-selection`
2. Verify external data availability
3. Review market type classification
4. Increase cost threshold if needed

#### High Costs

**Symptoms**: Analysis costs exceed budget

**Causes**:
- Too many agents enabled
- Expensive LLM models configured
- No cost optimization enabled
- High-volume analysis without caching

**Solutions**:
1. Use Budget-Conscious configuration
2. Enable cost optimization: `skipLowImpactAgents: true`
3. Set cost threshold: `maxCostPerAnalysis`
4. Review agent performance and disable underperformers
5. Increase cache TTLs

#### Signal Conflicts

**Symptoms**: Agents produce divergent probability estimates

**Causes**:
- Legitimate disagreement (uncertainty)
- Stale or low-quality data
- Agent misconfiguration
- Market ambiguity

**Solutions**:
1. Review agent signals for data quality
2. Check external data freshness
3. Widen confidence bands
4. Surface disagreement in recommendation
5. Consider NO_TRADE if conflict too extreme

#### External Data Failures

**Symptoms**: External data sources unavailable

**Causes**:
- API rate limits exceeded
- Invalid API keys
- Network connectivity issues
- Service outages

**Solutions**:
1. Check API key configuration
2. Review rate limit status
3. Verify network connectivity
4. Use cached data as fallback
5. Skip dependent agents gracefully


#### Poor Agent Performance

**Symptoms**: Agents consistently produce inaccurate signals

**Causes**:
- Insufficient training data
- Poor prompt engineering
- Low-quality external data
- Market type mismatch

**Solutions**:
1. Review agent prompts and refine
2. Verify external data quality
3. Check agent specialization vs market type
4. Reduce agent weight in fusion
5. Consider disabling agent

### Performance Issues

#### Slow Analysis

**Symptoms**: Analysis takes too long to complete

**Causes**:
- Too many agents activated
- Slow external API responses
- No request batching
- Sequential agent execution

**Solutions**:
1. Reduce number of active agents
2. Increase cache TTLs
3. Enable request batching
4. Verify parallel execution
5. Set agent timeouts

#### Memory Issues

**Symptoms**: Out of memory errors

**Causes**:
- Too many concurrent analyses
- Large external data responses
- Memory leaks
- Insufficient system resources

**Solutions**:
1. Limit concurrent analyses
2. Reduce `maxArticles` and `maxMentions`
3. Increase Node.js memory limit
4. Monitor memory usage
5. Implement request queuing

## Migration Guide

### From MVP to Advanced Agent League

The Advanced Agent League is backward compatible with the MVP engine. No breaking changes.

**Step 1: Update Configuration**

Add advanced agent configuration to your config file:

```typescript
{
  // ... existing MVP config ...
  advancedAgents: {
    // Start with budget-conscious config
    eventIntelligence: { enabled: true, breakingNews: true, eventImpact: false },
    // ... other agent groups ...
  }
}
```

**Step 2: Configure External Data Sources**

Add API keys for external data sources:

```bash
# .env
NEWS_API_KEY=your_key_here
POLLING_API_KEY=your_key_here
SOCIAL_API_KEY=your_key_here
```

**Step 3: Test with Single Market**

```bash
npm run cli -- analyze <market-id> --show-agent-selection --verbose
```

**Step 4: Monitor Costs**

Check Opik dashboard for cost per analysis.

**Step 5: Expand Gradually**

Enable additional agent groups as needed.


## Examples

### Example 1: Election Market Analysis

**Market**: "Will Candidate X win the 2026 election?"

**Activated Agents**:
- MVP Agents (Market Microstructure, Probability Baseline, Risk Assessment)
- Polling Intelligence Agent
- Media Sentiment Agent
- Social Sentiment Agent
- Narrative Velocity Agent
- Catalyst Agent
- Tail-Risk Agent
- Risk Philosophy Agents (Aggressive, Conservative, Neutral)

**Analysis Flow**:
1. Market ingestion classifies as "election" market
2. Dynamic selection activates polling and sentiment agents
3. Polling agent aggregates polls with bias adjustments
4. Sentiment agents analyze media and social discourse
5. Narrative velocity agent detects emerging narratives
6. Signal fusion weights polling heavily (1.5x)
7. Risk philosophy agents provide position sizing guidance

**Output**: Comprehensive election forecast with polling data, sentiment analysis, and risk perspectives

### Example 2: Court Ruling Market

**Market**: "Will the Supreme Court rule in favor of X?"

**Activated Agents**:
- MVP Agents
- Breaking News Agent
- Event Impact Agent
- Historical Pattern Agent
- Catalyst Agent
- Tail-Risk Agent
- Risk Philosophy Agents

**Analysis Flow**:
1. Market ingestion classifies as "court" market
2. Dynamic selection activates event intelligence agents
3. Breaking news agent monitors legal developments
4. Event impact agent identifies historical analogs
5. Historical pattern agent finds similar past rulings
6. Signal fusion weights event intelligence highly
7. Catalyst agent identifies upcoming hearing dates

**Output**: Legal analysis with historical context and event timeline

### Example 3: Budget-Constrained Analysis

**Configuration**: Budget-Conscious mode, max cost $0.50

**Activated Agents**:
- MVP Agents (always active)
- Breaking News Agent (high value)
- Polling Intelligence Agent (if election market)
- Catalyst Agent (high value)
- Risk Philosophy Agents (Aggressive, Conservative only)

**Cost Optimization**:
- Event Impact Agent skipped (lower priority)
- Sentiment agents skipped (noisy, expensive)
- Price action agents skipped (insufficient volume)
- Neutral risk agent skipped (lower priority)

**Output**: Essential analysis within budget constraints


## FAQ

### General

**Q: Is the Advanced Agent League backward compatible with the MVP engine?**

A: Yes, completely. The system works with any subset of agents, including MVP-only mode.

**Q: How much does it cost to run the Advanced Agent League?**

A: Costs vary by configuration:
- Budget-Conscious: $0.30-0.50 per analysis
- Balanced: $0.70-1.00 per analysis
- Premium: $1.50-2.00 per analysis

**Q: Can I use the Advanced Agent League without external data sources?**

A: Yes, but advanced agents that require external data will be skipped. MVP agents will still function.

### Configuration

**Q: How do I enable only specific agent groups?**

A: Configure in your config file or use CLI flags:
```bash
npm run cli -- analyze <market-id> --event-intelligence --polling-statistical
```

**Q: Can I adjust agent weights in signal fusion?**

A: Yes, configure `signalFusion.baseWeights` in your config file.

**Q: How do I set a cost budget?**

A: Configure `costOptimization.maxCostPerAnalysis` or use `--max-cost` CLI flag.

### Performance

**Q: How long does analysis take with all agents?**

A: Typically 10-20 seconds with all agents enabled (parallel execution).

**Q: How do I improve analysis speed?**

A: Enable caching, reduce active agents, set agent timeouts, enable request batching.

**Q: How accurate are the agents?**

A: Accuracy varies by agent and market type. Monitor via performance tracking dashboard.

### Troubleshooting

**Q: Why aren't my agents activating?**

A: Check configuration, external data availability, market type, and cost threshold.

**Q: How do I debug signal conflicts?**

A: Use `--show-fusion-details` flag to see agent signals and weights.

**Q: What happens if external data is unavailable?**

A: System uses cached data if available, otherwise skips dependent agents gracefully.

## Support

For issues or questions:
- Review this documentation
- Check [Troubleshooting](#troubleshooting) section
- Review Opik traces for execution details
- Consult main [README](../README.md)
- Check [LangGraph Troubleshooting](./LANGGRAPH_TROUBLESHOOTING.md)

---

**Last Updated:** January 2026
**Version:** 1.0.0

