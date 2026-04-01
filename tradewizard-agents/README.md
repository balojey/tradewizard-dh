# TradeWizard Agents

> Node.js multi-agent analysis engine for Polymarket prediction markets

Orchestrates 15+ specialized AI agents that analyze markets from multiple perspectives, debate competing theses, and produce explainable trade recommendations with entry/exit zones and risk assessment.

## Components

This package does two things:

- **Analysis engine** — runs the full LangGraph multi-agent workflow locally via CLI
- **Monitor service** — background service that discovers and schedules market analyses automatically

Both can run independently. The monitor can delegate workflow execution to a remote service (like [doa](../doa/README.md)) or run it locally.

## Prerequisites

- Node.js 18+
- At least one LLM provider API key (OpenAI, Anthropic, Google, or Amazon Nova)
- Supabase account (free tier works) — required for the monitor service and agent memory

## Quick Start

```bash
cd tradewizard-agents
npm install
cp .env.example .env
# Add at least one LLM provider key (see Configuration below)
npm run build
npm run cli -- analyze <polymarket-condition-id>
```

### Minimal .env to get started

```bash
# Pick one provider
LLM_SINGLE_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini
```

That's it for a basic analysis. Everything else is optional.

## CLI Usage

```bash
# Analyze a market
npm run cli -- analyze <conditionId>

# With options
npm run cli -- analyze <conditionId> --debug
npm run cli -- analyze <conditionId> --single-provider google --model gemini-2.5-flash
npm run cli -- analyze <conditionId> --show-costs --opik-trace

# Query history
npm run cli -- history <conditionId>

# Inspect checkpoint state
npm run cli -- checkpoint <conditionId>
```

### Example output

```
═══════════════════════════════════════════════════════════════
TRADE RECOMMENDATION
═══════════════════════════════════════════════════════════════

Action: LONG_YES
Expected Value: $12.50 per $100 invested
Win Probability: 62%
Entry Zone: $0.48 - $0.52
Target Zone: $0.60 - $0.65
Liquidity Risk: Low

───────────────────────────────────────────────────────────────
EXPLANATION
───────────────────────────────────────────────────────────────

Summary: Market is underpricing the probability based on strong
fundamental catalysts and favorable risk/reward.

Key Catalysts:
• Policy announcement expected March 15, 2024
• Historical precedent shows 75% success rate

Failure Scenarios:
• Unexpected regulatory intervention
• External economic shock
```

## Monitor Service

The monitor automatically discovers active Polymarket markets and schedules analyses on a configurable interval.

```bash
npm run monitor:start    # Start background monitoring
npm run monitor:stop     # Stop monitoring
npm run monitor:status   # Check status
npm run monitor:trigger  # Trigger a manual cycle
```

Requires Supabase credentials in `.env` for persistence.

## Configuration

### LLM Providers

Two modes available:

**Single-provider** (simpler, lower cost):
```bash
LLM_SINGLE_PROVIDER=openai          # openai | anthropic | google | nova
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini
```

**Multi-provider** (each agent uses a different LLM):
```bash
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4-turbo

ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229

GOOGLE_API_KEY=...
GOOGLE_DEFAULT_MODEL=gemini-2.5-flash
```

Default agent-to-provider mapping in multi-provider mode:
- Market Microstructure → GPT-4-turbo
- Probability Baseline → Gemini-2.5-flash
- Risk Assessment → Claude-3-sonnet

**Amazon Nova (AWS Bedrock):**
```bash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
NOVA_MODEL_NAME=global.amazon.nova-2-lite-v1:0
LLM_SINGLE_PROVIDER=nova            # or use per-agent via NEWS_AGENT_PROVIDER=nova
```

Cost comparison per 100 analyses:
| Mode | Estimated cost |
|------|---------------|
| Multi-provider (GPT-4 + Claude + Gemini) | $10–15 |
| Single-provider (gpt-4o-mini) | $1–2 |
| Single-provider (Gemini 2.5 flash) | $0.60–1 |
| Single-provider (Nova Lite) | $0.20–0.40 |

See [docs/LLM_PROVIDERS.md](./docs/LLM_PROVIDERS.md) for full provider setup.

### Full .env reference

```bash
# ── LLM ──────────────────────────────────────────────────────
LLM_SINGLE_PROVIDER=openai                  # omit for multi-provider mode
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229
GOOGLE_API_KEY=...
GOOGLE_DEFAULT_MODEL=gemini-2.5-flash
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
NOVA_MODEL_NAME=global.amazon.nova-2-lite-v1:0

# ── Database ──────────────────────────────────────────────────
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# ── External APIs ─────────────────────────────────────────────
NEWSDATA_API_KEY=...                        # for autonomous news agents
SERPER_API_KEY=...                          # for web research agent

# ── Observability ─────────────────────────────────────────────
OPIK_API_KEY=...
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_TRACK_COSTS=true

# ── Agent behavior ────────────────────────────────────────────
AGENT_TIMEOUT_MS=10000
MIN_AGENTS_REQUIRED=2
MAX_TOOL_CALLS=5
TOOL_CACHE_ENABLED=true

# ── Memory system ─────────────────────────────────────────────
MEMORY_SYSTEM_ENABLED=true
MEMORY_MAX_SIGNALS_PER_AGENT=3
MEMORY_QUERY_TIMEOUT_MS=5000

# ── LangGraph ─────────────────────────────────────────────────
LANGGRAPH_CHECKPOINTER=memory               # memory | sqlite | postgres
LANGGRAPH_RECURSION_LIMIT=25

# ── Monitor ───────────────────────────────────────────────────
ANALYSIS_INTERVAL_HOURS=24
MAX_MARKETS_PER_CYCLE=3

# ── Remote workflow service (optional) ────────────────────────
# Leave unset to run workflows locally
WORKFLOW_SERVICE_URL=https://your-doa-service.com/run
DIGITALOCEAN_API_TOKEN=...
WORKFLOW_SERVICE_TIMEOUT_MS=120000
```

### Getting API keys

| Service | Link |
|---------|------|
| OpenAI | https://platform.openai.com/api-keys |
| Anthropic | https://console.anthropic.com |
| Google AI | https://ai.google.dev |
| Amazon Nova | AWS Console → Bedrock |
| Supabase | https://supabase.com → Settings → API |
| NewsData.io | https://newsdata.io |
| Serper | https://serper.dev |
| Opik | https://www.comet.com/opik |

## Architecture

### Workflow

```
Market Analysis Request
    ↓
[Market Ingestion]         fetch live data from Polymarket
    ↓
[Memory Retrieval]         load historical agent signals
    ↓
[Keyword Extraction]       extract key terms for agent context
    ↓
[Dynamic Agent Selection]  activate relevant agents for this market
    ↓
[Parallel Agent Execution] all agents analyze simultaneously
    ├─ Breaking News (autonomous tool-calling)
    ├─ Media Sentiment (autonomous tool-calling)
    ├─ Polling Intelligence (autonomous tool-calling)
    ├─ Web Research (Serper search + scrape)
    ├─ Market Microstructure
    ├─ Probability Baseline
    ├─ Risk Assessment
    ├─ Event Impact / Catalyst
    ├─ Historical Pattern
    ├─ Momentum / Mean Reversion
    └─ Tail Risk / Narrative Velocity
    ↓
[Agent Signal Fusion]      aggregate signals
    ↓
[Thesis Construction]      build bull and bear theses
    ↓
[Cross-Examination]        adversarial testing of assumptions
    ↓
[Consensus Engine]         calculate unified probability estimate
    ↓
[Recommendation Generation] produce trade signal with entry/exit zones
```

### Project structure

```
tradewizard-agents/
├── src/
│   ├── nodes/              # LangGraph workflow nodes
│   │   ├── market-ingestion.ts
│   │   ├── memory-retrieval.ts
│   │   ├── keyword-extraction.ts
│   │   ├── dynamic-agent-selection.ts
│   │   ├── agents.ts
│   │   ├── autonomous-news-agents.ts
│   │   ├── autonomous-polling-agent.ts
│   │   ├── web-research-agent.ts
│   │   ├── agent-signal-fusion.ts
│   │   ├── thesis-construction.ts
│   │   ├── cross-examination.ts
│   │   ├── consensus-engine.ts
│   │   └── recommendation-generation.ts
│   ├── tools/              # LangChain tools
│   │   ├── newsdata-tools.ts
│   │   ├── polling-tools.ts
│   │   └── serper-tools.ts
│   ├── models/             # TypeScript types and state
│   │   ├── types.ts
│   │   ├── schemas.ts
│   │   └── state.ts
│   ├── database/           # Supabase persistence and memory
│   │   ├── supabase.ts
│   │   ├── persistence.ts
│   │   ├── memory-retrieval.ts
│   │   └── migrate.ts
│   ├── utils/
│   │   ├── polymarket-client.ts
│   │   ├── audit-logger.ts
│   │   ├── timestamp-formatter.ts
│   │   └── opik-integration.ts
│   ├── config/
│   ├── workflow.ts
│   ├── cli.ts
│   ├── monitor.ts
│   └── index.ts
├── docs/
├── .env.example
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Development

```bash
npm run dev          # hot-reload development mode
npm run build        # production build
npm run lint         # ESLint
npm run lint:fix     # auto-fix lint issues
npm run format       # Prettier
```

## Testing

```bash
npm test                              # all tests
npm test -- market-ingestion.test.ts  # specific file
npm test -- *.property.test.ts        # property-based tests
npm test -- workflow.integration.test.ts
npm test -- --coverage
npm run test:e2e                      # end-to-end
```

LLM-dependent tests have a 30s timeout. See `vitest.config.ts` to adjust.

## Deployment

### Node.js / PM2

```bash
npm run build
npm start

# or with PM2
pm2 start dist/index.js --name tradewizard-agents
```

### Docker

```bash
docker build -t tradewizard-agents .
docker run -d --env-file .env tradewizard-agents
```

A `docker-compose.yml` is included for local multi-service setups.

### Environment presets

Development:
```bash
LOG_LEVEL=debug
LANGGRAPH_CHECKPOINTER=memory
LLM_SINGLE_PROVIDER=openai
OPENAI_DEFAULT_MODEL=gpt-4o-mini
```

Production:
```bash
LOG_LEVEL=info
LANGGRAPH_CHECKPOINTER=sqlite
AUDIT_TRAIL_RETENTION_DAYS=90
OPIK_TRACK_COSTS=true
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No API keys configured | Verify `.env` has at least one LLM provider key |
| Market analysis failed | Check condition ID is valid on Polymarket |
| LangGraph recursion limit | Increase `LANGGRAPH_RECURSION_LIMIT` |
| Tests timing out | Increase timeout in `vitest.config.ts` |
| Memory system not working | Set `MEMORY_SYSTEM_ENABLED=true`, verify Supabase connection |
| Opik traces missing | Verify `OPIK_API_KEY` and `OPIK_PROJECT_NAME` |
| Monitor not persisting | Verify Supabase credentials and run `npm run migrate` |

## Documentation

- [CLI Reference](./CLI.md)
- [Monitor CLI](./CLI-MONITOR.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [LLM Provider Setup](./docs/LLM_PROVIDERS.md)
- [Autonomous News Agents](./docs/AUTONOMOUS_NEWS_AGENTS.md)
- [Agent Memory System](./src/database/MEMORY_SYSTEM_CONFIG.md)
- [Opik Integration](./docs/OPIK_GUIDE.md)
- [External Data Sources](./docs/EXTERNAL_DATA_SOURCES.md)

## License

ISC
