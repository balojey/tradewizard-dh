# Dynamic Agent Selection Node

## Overview

The dynamic agent selection node intelligently determines which AI agents should analyze a given market based on market characteristics, data availability, configuration, and budget constraints.

## Architecture

### Selection Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│                    Dynamic Agent Selection                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: Market Type-Based Selection                             │
│ • Election → Polling + Sentiment + Event Intelligence           │
│ • Court → Event Intelligence + Historical Patterns              │
│ • Policy → Event Intelligence + Sentiment + Catalysts           │
│ • Economic → Event Intelligence + Historical Patterns           │
│ • Geopolitical → Event Intelligence + Sentiment + Catalysts     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: Configuration Filters                                   │
│ • Remove agents from disabled groups                            │
│ • Respect enable_event_intelligence flag                        │
│ • Respect enable_polling_statistical flag                       │
│ • Respect enable_sentiment_narrative flag                       │
│ • Respect enable_price_action flag                              │
│ • Respect enable_event_scenario flag                            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: Data Availability Filters                               │
│ • Event intelligence requires news data                         │
│ • Polling agents require polling data                           │
│ • Sentiment agents require news OR social data                  │
│ • Price action requires volume > 1000                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: Cost Optimization                                       │
│ • Apply budget constraints (max_advanced_agents)                │
│ • Priority-based selection:                                     │
│   1. Event Intelligence (highest)                               │
│   2. Polling/Statistical                                        │
│   3. Sentiment/Narrative                                        │
│   4. Event Scenario                                             │
│   5. Price Action (lowest)                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Output: MVP Agents + Selected Advanced Agents                   │
└─────────────────────────────────────────────────────────────────┘
```

## Agent Categories

### MVP Agents (Always Active)
- `market_microstructure` - Analyzes order book and trading dynamics
- `probability_baseline` - Establishes baseline probability estimates
- `risk_assessment` - Evaluates risk factors and scenarios

### Event Intelligence Agents
- `breaking_news` - Monitors breaking news and immediate events
- `event_impact` - Assesses event impact on market outcomes

### Polling & Statistical Agents
- `polling_intelligence` - Analyzes polling data and trends
- `historical_pattern` - Identifies historical patterns and precedents

### Sentiment & Narrative Agents
- `media_sentiment` - Analyzes media sentiment and coverage
- `social_sentiment` - Monitors social media sentiment
- `narrative_velocity` - Tracks narrative momentum and shifts

### Price Action Agents
- `momentum` - Identifies momentum trends
- `mean_reversion` - Detects mean reversion opportunities

### Event Scenario Agents
- `catalyst` - Identifies potential catalysts
- `tail_risk` - Assesses tail risk scenarios

## Usage

### Basic Usage

```python
from nodes.dynamic_agent_selection import create_dynamic_agent_selection_node
from config import load_config

# Load configuration
config = load_config()

# Create node
node = create_dynamic_agent_selection_node(config)

# Execute
state = {
    "mbd": MarketBriefingDocument(
        question="Will Trump win 2024?",
        event_type="election",
        volume_24h=50000,
        ...
    )
}

result = await node(state)
print(f"Selected agents: {result['active_agents']}")
```

### Configuration

```python
# In .env or config
ENABLE_MVP_AGENTS=true
ENABLE_EVENT_INTELLIGENCE=true
ENABLE_POLLING_STATISTICAL=true
ENABLE_SENTIMENT_NARRATIVE=true
ENABLE_PRICE_ACTION=false
ENABLE_EVENT_SCENARIO=true
AGENT_MAX_ADVANCED_AGENTS=10
```

### Market Type Mapping

| Market Type | Selected Agent Groups |
|-------------|----------------------|
| election | Polling, Sentiment, Event Intelligence |
| court | Event Intelligence, Historical Patterns |
| policy | Event Intelligence, Sentiment, Catalysts |
| economic | Event Intelligence, Historical Patterns |
| geopolitical | Event Intelligence, Sentiment, Catalysts |
| other | All available agents |

## Output Format

```python
{
    "active_agents": [
        "market_microstructure",
        "probability_baseline",
        "risk_assessment",
        "breaking_news",
        "event_impact",
        "polling_intelligence"
    ],
    "audit_log": [{
        "stage": "dynamic_agent_selection",
        "timestamp": 1234567890,
        "status": "completed",
        "details": {
            "duration_ms": 45,
            "market_type": "election",
            "market_id": "0x123...",
            "agent_count": 6,
            "mvp_agent_count": 3,
            "advanced_agent_count": 3,
            "selection_decisions": {
                "mvp_agents": "Always active",
                "market_type": "Market type: election, suggested agents: ...",
                "configuration_filter": "After config filter: ...",
                "data_availability": "After data availability check: ...",
                "cost_optimization": "Max agents: 10, Selected: 3, Skipped: 0"
            },
            "cost_optimization": {
                "selected_agents": [...],
                "skipped_agents": [],
                "total_requested": 3,
                "total_selected": 3,
                "optimization_applied": false
            }
        }
    }]
}
```

## Testing

Run the comprehensive test suite:

```bash
python -m pytest doa/nodes/test_dynamic_agent_selection.py -v
```

Test coverage includes:
- Market type-based selection (4 tests)
- Configuration filtering (3 tests)
- Data availability filtering (3 tests)
- Cost optimization (3 tests)
- End-to-end integration (3 tests)

## Error Handling

The node implements robust error handling:

1. **Missing MBD**: Returns empty agent list with error audit entry
2. **Selection Errors**: Falls back to MVP agents only
3. **Configuration Errors**: Logs warning and continues with available agents
4. **Data Availability Errors**: Gracefully degrades to agents with available data

## Performance

- **Typical Execution**: 40-60ms
- **Memory Usage**: Minimal (< 1MB)
- **No External Calls**: All logic is local
- **Scalable**: Handles any number of agent categories

## Best Practices

1. **Always Enable MVP Agents**: These provide baseline analysis
2. **Match Market Type**: Ensure event_type is correctly set
3. **Monitor Budget**: Set max_advanced_agents based on cost constraints
4. **Check Data Availability**: Integrate with actual data source health checks
5. **Review Audit Logs**: Use selection_decisions for debugging

## Future Enhancements

- [ ] Real-time data availability integration
- [ ] ML-based agent selection optimization
- [ ] A/B testing framework for selection strategies
- [ ] Agent performance tracking and feedback loop
- [ ] Dynamic budget allocation based on market importance

## Related Files

- `dynamic_agent_selection.py` - Main implementation
- `test_dynamic_agent_selection.py` - Test suite
- `DYNAMIC_AGENT_SELECTION_IMPROVEMENTS.md` - Detailed improvements
- `COMPARISON.md` - Before/after comparison

## Support

For issues or questions:
1. Check the test suite for usage examples
2. Review audit logs for selection decisions
3. Consult COMPARISON.md for migration guidance
4. See DYNAMIC_AGENT_SELECTION_IMPROVEMENTS.md for detailed documentation
