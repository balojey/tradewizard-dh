# TradeWizard DOA - Multi-Agent Market Analysis

Python-based multi-agent system for analyzing prediction markets on Polymarket. Built with LangGraph and Digital Ocean's Gradient AI Platform, this service replicates TradeWizard's market intelligence capabilities.

## Overview

TradeWizard DOA orchestrates 13+ specialized AI agents that analyze markets from multiple perspectives: market microstructure, probability baseline, risk assessment, news analysis, polling data, sentiment, price action, and event scenarios. Agents run in parallel, debate their theses adversarially, and produce unified probability estimates with actionable trade recommendations.

### Key Features

- **Multi-Agent Intelligence**: 13 specialized agents analyzing from different perspectives
- **Parallel Execution**: All agents run concurrently for fast analysis
- **Adversarial Debate**: Bull and bear theses constructed and cross-examined
- **Consensus Engine**: Unified probability with confidence bands and disagreement metrics
- **Memory System**: Historical context from past analyses
- **Trade Recommendations**: Actionable signals with entry/target zones and risk assessment
- **Full Observability**: Opik integration for LLM tracing and cost tracking

## Quick Start

### Prerequisites

- Python 3.10+
- Digital Ocean account with Gradient AI access
- Supabase account (free tier works)
- Digital Ocean API token and Inference key

### Setup (5 minutes)

```bash
# 1. Create virtual environment
cd doa
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys (see Configuration section)

# 4. Set up database
cd ../tradewizard-agents && npx supabase login && npx supabase link && npx supabase db push

# 5. Start the agent
export DIGITALOCEAN_API_TOKEN=your_token
gradient agent run
# Service runs on http://localhost:8080
```

### Test the Agent

```bash
curl --location 'http://localhost:8080/run' \
    --header 'Content-Type: application/json' \
    --data '{"condition_id": "0x1234567890abcdef"}'
```

## Usage

### CLI Commands

```bash
# Analyze a market
python main.py analyze <condition_id>

# Query analysis history
python main.py history <condition_id>
```

### API Endpoint

**POST /run**

Request:
```json
{"condition_id": "0x1234567890abcdef"}
```

Response:
```json
{
    "status": "success",
    "condition_id": "0x1234567890abcdef",
    "market_question": "Will Biden win the 2024 election?",
    "recommendation": {
        "action": "LONG_YES",
        "entry_zone": [0.51, 0.53],
        "target_zone": [0.56, 0.58],
        "expected_value": 4.20,
        "win_probability": 0.62,
        "liquidity_risk": "low"
    },
    "consensus_probability": 0.542,
    "market_probability": 0.525,
    "edge": 0.017,
    "agent_signals": [
        {
            "agent_name": "market_microstructure",
            "direction": "YES",
            "fair_probability": 0.55,
            "confidence": 0.82
        }
    ],
    "analysis_metadata": {
        "duration_ms": 12400,
        "cost_usd": 0.23,
        "agents_executed": 13,
        "llm_calls": 47
    }
}
```

### Programmatic Usage

```python
from main import analyze_market
from config import load_config

config = load_config()
result = await analyze_market(condition_id="0x1234567890abcdef", config=config)

print(f"Action: {result.recommendation.action}")
print(f"Entry Zone: {result.recommendation.entry_zone}")
print(f"Expected Value: ${result.recommendation.expected_value}")
```

## Architecture

### Workflow

```
Market Analysis Request
    ↓
[Market Ingestion] → Fetch market data
    ↓
[Memory Retrieval] → Load historical context
    ↓
[Keyword Extraction] → Extract key terms
    ↓
[Dynamic Agent Selection] → Activate relevant agents
    ↓
[Parallel Agent Execution] → All agents analyze simultaneously
    ↓
[Agent Signal Fusion] → Aggregate signals
    ↓
[Thesis Construction] → Build bull and bear theses
    ↓
[Cross-Examination] → Adversarial testing
    ↓
[Consensus Engine] → Calculate unified probability
    ↓
[Recommendation Generation] → Create trade signal
    ↓
Trade Recommendation Output
```

### Agent Types

**MVP Agents** (always active):
- Market Microstructure, Probability Baseline, Risk Assessment

**Event Intelligence**:
- Breaking News, Event Impact

**Polling & Statistical**:
- Polling Intelligence, Historical Pattern

**Sentiment & Narrative**:
- Media Sentiment, Social Sentiment, Narrative Velocity

**Price Action**:
- Momentum, Mean Reversion

**Event Scenario**:
- Catalyst, Tail Risk

**Web Research**:
- Web Research (Serper API integration)

## Configuration

### Environment Variables

```bash
# Gradient AI (REQUIRED)
DIGITALOCEAN_INFERENCE_KEY=your_gradient_model_access_key

# LLM Configuration
LLM_MODEL_NAME=llama-3.3-70b-instruct
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2000

# Polymarket APIs
POLYMARKET_GAMMA_API_URL=https://gamma-api.polymarket.com
POLYMARKET_CLOB_API_URL=https://clob.polymarket.com

# Supabase (for persistence)
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
ENABLE_PERSISTENCE=true

# Opik Observability (OPTIONAL)
OPIK_API_KEY=your_opik_api_key
OPIK_PROJECT_NAME=doa-market-analysis
OPIK_TRACK_COSTS=true

# Agent Configuration
AGENT_TIMEOUT_MS=45000
AGENT_MAX_RETRIES=3
ENABLE_MVP_AGENTS=true
ENABLE_EVENT_INTELLIGENCE=true
ENABLE_POLLING_STATISTICAL=true
ENABLE_SENTIMENT_NARRATIVE=true
ENABLE_PRICE_ACTION=true
ENABLE_EVENT_SCENARIO=true
```

### Getting API Keys

1. **DigitalOcean API Token**: [API Settings](https://cloud.digitalocean.com/account/api/tokens)
2. **DigitalOcean Inference Key**: [GenAI Settings](https://cloud.digitalocean.com/gen-ai)
3. **Supabase**: Sign up at [supabase.com](https://supabase.com), get credentials from Settings → API
4. **Opik** (optional): Sign up at [comet.com/opik](https://www.comet.com/opik)

## Deployment

### Deploy to Gradient AI Platform

```bash
# 1. Configure agent name in .gradient/agent.yml
agent_name: tradewizard-doa-agent

# 2. Deploy
gradient agent deploy

# 3. Invoke deployed agent
curl --location 'https://agents.do-ai.run/<DEPLOYED_AGENT_ID>/main/run' \
    --header 'Content-Type: application/json' \
    --header 'Authorization: Bearer <DIGITALOCEAN_API_TOKEN>' \
    --data '{"condition_id": "0x1234567890abcdef"}'
```

### Deployment Best Practices

- Use production environment variables before deploying
- Enable persistence: `ENABLE_PERSISTENCE=true`
- Configure timeouts based on expected latency
- Enable Opik tracking for production observability
- Test locally with `gradient agent run` first

### Scaling

The deployed agent automatically scales based on request volume. For high-volume production:
- Consider MVP agents only (`ENABLE_ADVANCED_AGENTS=false`)
- Implement request queuing for rate limiting
- Cache market data to reduce API calls
- Use smaller LLM models for faster response times

## Project Structure

```
doa/
├── .gradient/agent.yml          # Deployment config
├── agents/                       # Intelligence agents
│   ├── agent_factory.py
│   ├── market_microstructure.py
│   ├── probability_baseline.py
│   ├── risk_assessment.py
│   ├── breaking_news.py
│   ├── event_impact.py
│   ├── polling_intelligence.py
│   ├── historical_pattern.py
│   ├── media_sentiment.py
│   ├── social_sentiment.py
│   ├── narrative_velocity.py
│   ├── momentum.py
│   ├── mean_reversion.py
│   ├── catalyst.py
│   └── tail_risk.py
├── nodes/                        # LangGraph workflow nodes
│   ├── market_ingestion.py
│   ├── memory_retrieval.py
│   ├── keyword_extraction.py
│   ├── dynamic_agent_selection.py
│   ├── agent_signal_fusion.py
│   ├── thesis_construction.py
│   ├── cross_examination.py
│   ├── consensus_engine.py
│   └── recommendation_generation.py
├── models/                       # Data models
│   ├── types.py
│   └── state.py
├── tools/                        # External integrations
│   └── polymarket_client.py
├── database/                     # Persistence layer
│   ├── supabase_client.py
│   ├── persistence.py
│   ├── memory_retrieval.py
│   └── migrations/001_initial_schema.sql
├── utils/                        # Utilities
│   ├── llm_factory.py
│   ├── audit_logger.py
│   └── result.py
├── main.py                       # Main workflow
├── config.py                     # Configuration
├── prompts.py                    # Agent prompts
├── requirements.txt
├── .env.example
└── README.md
```

## Data Models

### MarketBriefingDocument (Agent Input)

```python
{
    "market_id": "0x1234...",
    "condition_id": "0xabcd...",
    "event_type": "election",
    "question": "Will Biden win the 2024 election?",
    "resolution_criteria": "Resolves YES if...",
    "expiry_timestamp": 1704067200,
    "current_probability": 0.525,
    "liquidity_score": 8.5,
    "bid_ask_spread": 0.02,
    "volatility_regime": "medium",
    "volume_24h": 156000.0
}
```

### AgentSignal (Agent Output)

```python
{
    "agent_name": "market_microstructure",
    "timestamp": 1704067200,
    "confidence": 0.82,
    "direction": "YES",
    "fair_probability": 0.55,
    "key_drivers": ["Strong bid-side liquidity", "Decreasing spread"],
    "risk_factors": ["Low overall liquidity", "Recent volatility"],
    "metadata": {}
}
```

### TradeRecommendation (Final Output)

```python
{
    "market_id": "0x1234...",
    "action": "LONG_YES",
    "entry_zone": (0.51, 0.53),
    "target_zone": (0.56, 0.58),
    "expected_value": 4.20,
    "win_probability": 0.62,
    "liquidity_risk": "low",
    "explanation": {
        "summary": "Strong polling fundamentals...",
        "core_thesis": "Recent polling shows...",
        "key_catalysts": ["Upcoming debate", "Q3 data"],
        "failure_scenarios": ["Unexpected scandal", "Economic downturn"]
    },
    "metadata": {
        "consensus_probability": 0.542,
        "market_probability": 0.525,
        "edge": 0.017,
        "confidence_band": (0.518, 0.566)
    }
}
```

## Customization

### Adding Custom Agents

1. Create agent module in `agents/`:

```python
# agents/my_custom_agent.py
AGENT_NAME = "my_custom_agent"

SYSTEM_PROMPT = """You are a specialized market analyst focusing on [your domain].

Analyze the market and provide:
1. Your assessment of the outcome probability
2. Key factors driving your analysis
3. Risks and uncertainties

Market Data:
{mbd}

Memory Context:
{memory_context}

Provide your analysis as a structured AgentSignal."""
```

2. Register in `main.py`:

```python
from agents.my_custom_agent import AGENT_NAME, SYSTEM_PROMPT

my_custom_agent_node = create_agent_node(AGENT_NAME, SYSTEM_PROMPT, config)
workflow.add_node(AGENT_NAME, my_custom_agent_node)
```

### Customizing Prompts

Edit `prompts.py` to change agent behavior:

```python
MARKET_MICROSTRUCTURE_PROMPT = """You are a market microstructure analyst...

[Customize the prompt here]
"""
```

### Adjusting Consensus Logic

Modify `nodes/consensus_engine.py`:

```python
def calculate_weighted_consensus(signals):
    # Custom weighting logic
    weights = [signal.confidence ** 2 for signal in signals]
    # ... rest of calculation
```

## Testing

```bash
# Run all tests
pytest

# Unit tests only
pytest -m "not property"

# Property-based tests
pytest -m property

# Specific test file
pytest agents/test_agent_factory.py

# With coverage
pytest --cov=. --cov-report=html
```

## Observability

### Opik Integration

TradeWizard DOA integrates with [Opik](https://www.comet.com/opik) for LLM observability and cost tracking.

**Features:**
- Automatic LLM tracing for all LangChain/LangGraph calls
- Token usage and cost tracking per analysis and agent
- Performance monitoring (latency, success rates)
- Error tracking and retry patterns
- Agent performance comparison

**Setup:**

1. Sign up at [comet.com/opik](https://www.comet.com/opik)
2. Get your API key from Settings → API Keys
3. Add to `.env`: `OPIK_API_KEY=your_opik_api_key`
4. Run analysis - Opik automatically tracks all LLM calls

**View traces:**

```
https://www.comet.com/opik/{workspace}/projects/{project_name}/traces
```

**Programmatic access:**

```python
from utils.opik_integration import OpikMonitorIntegration
from config import load_config

config = load_config()
opik_monitor = OpikMonitorIntegration(config)

cycle_id = opik_monitor.start_cycle()
opik_monitor.record_analysis(
    condition_id="0x1234...",
    duration=12400.0,
    cost=0.23,
    success=True,
    agent_signals=agent_signals
)
metrics = opik_monitor.end_cycle()
print(f"Total cost: ${metrics.total_cost:.2f}")
```

**Disable Opik:**

Leave `OPIK_API_KEY` empty in `.env`. Opik fails gracefully - observability failures never block analysis.

### Audit Logging

All workflow stages are logged with structured entries:

```python
{
    "timestamp": 1704067200,
    "stage": "agent_execution",
    "agent_name": "market_microstructure",
    "status": "success",
    "duration_ms": 2340,
    "metadata": {}
}
```

Access logs in the database `analysis_history` table.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Invalid condition_id | Verify the condition ID exists on Polymarket |
| Gradient AI auth failed | Check `DIGITALOCEAN_INFERENCE_KEY` |
| Database connection error | Verify Supabase credentials and network |
| Agent timeout | Increase `AGENT_TIMEOUT_MS` or use faster LLM |
| Insufficient agent signals | Ensure at least 2 agents complete |
| No trading edge | Market is fairly priced |

## Performance Optimization

### Reduce Analysis Time

- Use smaller LLM models: `llama-3.1-8b-instruct`
- Disable advanced agents: `ENABLE_ADVANCED_AGENTS=false`
- Reduce timeout: `AGENT_TIMEOUT_MS=15000`
- Limit memory retrieval window

### Reduce Costs

- Use MVP agents only
- Batch analyses to reuse connections
- Cache market data
- Use smaller LLM models

## Code Style

This project follows [PEP 8](https://peps.python.org/pep-0008/):

- **Line length**: 120 characters max
- **Indentation**: 4 spaces
- **Naming**: `snake_case` for functions/variables, `PascalCase` for classes, `UPPER_CASE` for constants
- **Docstrings**: All public functions and classes
- **Type hints**: Function parameters and return values
- **Imports**: Organized in groups (stdlib, third-party, local)

### Style Checks

```bash
# Install dev dependencies
pip install flake8 black mypy

# Check style
flake8 . --max-line-length=120 --extend-ignore=E203,W503

# Format code
black . --line-length=120

# Type checking
mypy . --ignore-missing-imports
```

## Testing

```bash
pytest                   # Run all tests
pytest -m "not property" # Unit tests only
pytest -m property       # Property-based tests
pytest --cov=.          # With coverage
```

## Contributing

Contributions welcome! Please:

1. Follow PEP 8 style guidelines
2. Add docstrings to all new functions and classes
3. Include type hints for function signatures
4. Write tests for new functionality
5. Update documentation as needed

## Resources

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [Gradient AI Platform](https://docs.digitalocean.com/products/gradient/)
- [Polymarket API](https://docs.polymarket.com/)
- [Opik Observability](https://www.comet.com/docs/opik/)
- [Supabase Documentation](https://supabase.com/docs)

## License

MIT License - see LICENSE file for details
