---
inclusion: always
---

# Project Structure

## Repository Layout

```
tradewizard/
├── tradewizard-agents/     # Node.js multi-agent backend
├── tradewizard-frontend/   # Next.js web application
├── doa/                    # Python DOA replication
├── docs/                   # Product and technical documentation
└── .kiro/                  # AI assistant configuration
    ├── specs/              # Feature specifications
    ├── steering/           # Steering rules
    └── settings/           # MCP and other settings
```

## Backend Structure (tradewizard-agents)

```
tradewizard-agents/
├── src/
│   ├── __tests__/          # Centralized test directory
│   │   ├── config/         # Config tests
│   │   ├── database/       # Database tests
│   │   ├── models/         # Model tests
│   │   ├── nodes/          # Node tests
│   │   ├── tools/          # Tool tests
│   │   ├── utils/          # Utility tests
│   │   └── *.test.ts       # Root-level tests (workflow, cli, monitor)
│   ├── nodes/              # LangGraph workflow nodes
│   │   ├── market-ingestion.ts
│   │   ├── memory-retrieval.ts
│   │   ├── agents.ts       # Intelligence agent nodes
│   │   ├── thesis-construction.ts
│   │   ├── cross-examination.ts
│   │   ├── consensus-engine.ts
│   │   └── recommendation-generation.ts
│   ├── agents/             # Agent implementations
│   │   ├── breaking-news.ts
│   │   ├── media-sentiment.ts
│   │   ├── polling-intelligence.ts
│   │   └── ... (other agents)
│   ├── models/             # Data models and types
│   │   ├── types.ts        # TypeScript interfaces
│   │   ├── schemas.ts      # Zod validation schemas
│   │   └── state.ts        # LangGraph state definition
│   ├── tools/              # LangChain tools for autonomous agents
│   │   ├── newsdata/       # NewsData.io tools
│   │   └── polymarket/     # Polymarket tools
│   ├── database/           # Database layer
│   │   ├── supabase.ts     # Supabase client
│   │   ├── persistence.ts  # Data persistence
│   │   ├── memory-retrieval.ts  # Agent memory system
│   │   └── migrate.ts      # Database migrations
│   ├── utils/              # Utility functions
│   │   ├── polymarket-client.ts
│   │   ├── audit-logger.ts
│   │   ├── timestamp-formatter.ts
│   │   └── opik-integration.ts
│   ├── config/             # Configuration management
│   │   └── index.ts
│   ├── workflow.ts         # LangGraph workflow definition
│   ├── cli.ts              # CLI interface
│   ├── monitor.ts          # Automated monitoring service
│   └── index.ts            # Entry point
├── scripts/                # Utility scripts
│   ├── e2e-test.ts
│   └── run-24h-test.ts
├── dist/                   # Compiled JavaScript (generated)
├── docs/                   # Backend documentation
├── .env.example            # Environment template
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Python Backend Structure (doa)

```
doa/
├── tests/                  # Centralized test directory
│   ├── agents/             # Agent tests
│   ├── database/           # Database tests
│   ├── nodes/              # Node tests
│   ├── tools/              # Tool tests
│   ├── utils/              # Utility tests
│   └── test_*.py           # Root-level tests (config, imports, integration)
├── agents/                 # Intelligence agent implementations
│   ├── agent_factory.py
│   ├── autonomous_agent_factory.py
│   ├── breaking_news.py
│   ├── catalyst.py
│   ├── event_impact.py
│   ├── historical_pattern.py
│   ├── market_microstructure.py
│   ├── mean_reversion.py
│   ├── media_sentiment.py
│   ├── momentum.py
│   ├── narrative_velocity.py
│   ├── polling_intelligence.py
│   ├── probability_baseline.py
│   ├── risk_assessment.py
│   ├── social_sentiment.py
│   └── tail_risk.py
├── nodes/                  # LangGraph workflow nodes
│   ├── agent_signal_fusion.py
│   ├── consensus_engine.py
│   ├── cross_examination.py
│   ├── dynamic_agent_selection.py
│   ├── keyword_extraction.py
│   ├── market_ingestion.py
│   ├── memory_retrieval.py
│   ├── recommendation_generation.py
│   └── thesis_construction.py
├── models/                 # Data models
│   ├── state.py           # LangGraph state
│   └── types.py           # Pydantic models
├── tools/                  # External integrations
│   ├── newsdata_client.py
│   └── polymarket_client.py
├── database/               # Persistence layer
│   ├── supabase_client.py
│   ├── persistence.py
│   ├── memory_retrieval.py
│   └── migrations/
│       └── 001_initial_schema.sql
├── config.py               # Configuration management
├── prompts.py              # Agent prompts
├── main.py                 # Main workflow and CLI
├── requirements.txt
└── .env.example
```

## Frontend Structure (tradewizard-frontend)

```
tradewizard-frontend/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   ├── markets/           # Market pages
│   ├── analysis/          # Analysis pages
│   └── api/               # API routes
├── components/             # React components
│   ├── ui/                # UI primitives
│   ├── markets/           # Market-specific components
│   └── analysis/          # Analysis components
├── lib/                    # Utility libraries
│   ├── supabase.ts        # Supabase client
│   ├── polymarket.ts      # Polymarket client
│   └── magic.ts           # Magic Link auth
├── hooks/                  # Custom React hooks
├── types/                  # TypeScript types
├── public/                 # Static assets
└── styles/                 # Global styles
```

## Key Architectural Patterns

### LangGraph State Management
- All workflow nodes share a common `GraphState` object
- State flows through nodes sequentially or in parallel
- Checkpointers enable persistence and resumability
- **When modifying**: Update state.ts, then propagate changes through affected nodes

### Agent Autonomy
- Agents use LangChain tool-calling (ReAct pattern)
- Tools are bound to agent LLMs at runtime
- Agents autonomously decide which tools to call
- **When adding agents**: Follow agent factory pattern in agents/ directory, implement tool-calling interface

### Memory System
- Historical agent signals stored in database
- Retrieved before each analysis for context
- Enables closed-loop learning and consistency
- **When debugging**: Check memory_retrieval.ts for context loading issues

### Error Handling
- Graceful degradation at every layer
- Partial failures don't crash the pipeline
- Comprehensive audit logging for debugging
- **When adding features**: Include error handling and audit logging from the start

### Multi-Provider LLM Support
- Abstract LLM factory pattern
- Different agents can use different providers
- Single-provider mode for cost optimization
- **When integrating new LLM**: Update config.py (Python) or config/index.ts (Node.js)

## File Naming Conventions

### TypeScript/JavaScript
- kebab-case for files: `market-ingestion.ts`
- PascalCase for classes: `MarketBriefingDocument`
- camelCase for functions/variables: `analyzeMarket`

### Python
- snake_case for files: `market_ingestion.py`
- PascalCase for classes: `MarketBriefingDocument`
- snake_case for functions/variables: `analyze_market`

## Test File Locations

### Backend (tradewizard-agents)
- Centralized in `src/__tests__/` directory
- Structure mirrors source layout: `src/__tests__/nodes/`, `src/__tests__/utils/`, etc.
- Property tests: `*.property.test.ts`
- Integration tests: `*.integration.test.ts`
- E2E tests: `*.e2e.test.ts`
- Performance tests: `*.performance.test.ts`

### Python (doa)
- Centralized in `tests/` directory
- Structure mirrors source layout: `tests/agents/`, `tests/nodes/`, etc.
- Test prefix: `test_*.py`
- Property tests: `test_*_property.py`
- Integration tests: `test_*_integration.py`

## Configuration Files Location

- Root `.env` files for each project
- `.env.example` templates for documentation
- `.env.production` for production overrides
- `.kiro/settings/` for AI assistant configuration

## Common Development Tasks

### Adding a New Agent (Node.js)
1. Create `src/agents/agent-name.ts` following existing agent patterns
2. Implement tool-calling interface with LangChain
3. Register in agent factory if needed
4. Add tests in `src/__tests__/agents/agent-name.test.ts`
5. Integrate into workflow nodes as needed

### Adding a New Workflow Node (Node.js)
1. Create `src/nodes/node-name.ts` implementing LangGraph node interface
2. Update `src/models/state.ts` if adding new state fields
3. Integrate into `src/workflow.ts` graph definition
4. Add tests in `src/__tests__/nodes/node-name.test.ts`

### Adding a New Tool (Node.js)
1. Create `src/tools/category/tool-name.ts` wrapping external API
2. Implement LangChain tool interface with proper error handling
3. Add audit logging for all API calls
4. Add tests in `src/__tests__/tools/category/tool-name.test.ts`

### Adding a New Agent (Python)
1. Create `agents/agent_name.py` following existing agent patterns
2. Implement agent factory registration
3. Add tests in `tests/agents/test_agent_name.py`
4. Update prompts.py if adding new prompts

### Database Migrations
- Node.js: Use `src/database/migrate.ts` pattern
- Python: Add SQL files to `doa/database/migrations/` with sequential numbering
- Always test migrations in both directions (up/down)

### Testing Strategy
- **Unit tests**: Test individual functions/methods in isolation
- **Integration tests**: Test component interactions (e.g., agent + tools)
- **Property-based tests**: Use fast-check (Node.js) or Hypothesis (Python) for correctness properties
- **E2E tests**: Test full workflow with real or mocked external APIs
- All LLM-dependent tests must complete within 30 seconds
