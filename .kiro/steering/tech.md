---
inclusion: always
---

# Technology Stack

## Backend (tradewizard-agents)

### Runtime & Language
- Node.js 18+
- TypeScript 5.9+ with strict mode (required)
- ESM modules (type: "module")

### AI & Workflow Framework
- **LangGraph**: Multi-agent workflow orchestration with state management
  - State flows through nodes sequentially or in parallel
  - Checkpointers enable persistence and resumability
  - Update `src/models/state.ts` when adding new state fields
- **LangChain**: LLM integrations and tool-calling capabilities
  - Agents use ReAct pattern with autonomous tool-calling
  - Tools are bound to agent LLMs at runtime
- **Opik**: LLM observability, tracing, and cost tracking
  - All LLM calls should be traced for debugging and cost analysis

### LLM Providers
- OpenAI (GPT-4, GPT-4-turbo, GPT-4o-mini)
- Anthropic (Claude-3-sonnet, Claude-3-haiku)
- Google (Gemini-1.5-pro, Gemini-1.5-flash, Gemini-2.5-flash)
- Amazon Nova (via AWS Bedrock)
- **Note**: Use LLM factory pattern for multi-provider support; different agents can use different providers

### Database & Storage
- Supabase (PostgreSQL) for persistence
- LangGraph checkpointers: memory, sqlite, postgres
- Agent memory stored in database for closed-loop learning and consistency

### External APIs
- Polymarket CLOB API (@polymarket/clob-client)
- NewsData.io API for news intelligence
- Polymarket Gamma API for market data
- **Note**: Wrap all external integrations as LangChain tools with error handling and audit logging

### Testing
- Vitest for unit and integration tests
- fast-check for property-based testing
- **Critical**: 30s timeout for LLM-dependent tests (LLM calls must complete within this window)
- Property-based tests validate correctness properties of critical paths

### Build & Development
- esbuild for production builds
- tsx for development with hot reload
- ESLint + Prettier for code quality
- Audit logging for all agent decisions and API calls

## Python Backend (doa)

### Runtime & Language
- Python 3.10+
- Type hints with mypy (required for type checking)
- snake_case for functions/variables, PascalCase for classes

### AI Framework
- LangGraph for workflow orchestration
- LangChain for LLM integrations
- Digital Ocean Gradient AI Platform
- Opik for observability and tracing

### LLM Models
- Llama-3.3-70b-instruct (default)
- Llama-3.1-8b-instruct (budget option)
- **Note**: Use agent factory pattern for multi-model support

### Database
- Supabase (PostgreSQL)
- SQLAlchemy for ORM
- Agent memory stored for closed-loop learning

### Testing
- pytest with pytest-asyncio
- Hypothesis for property-based testing
- pytest-cov for coverage
- Property-based tests validate correctness properties

### Code Style
- PEP 8 guidelines (strict)
- Black formatter (120 char line length)
- flake8 for linting
- Comprehensive audit logging for all agent decisions

## Frontend (tradewizard-frontend)

### Framework
- Next.js 16 with App Router
- React 19
- TypeScript 5 (strict mode)

### Styling
- Tailwind CSS 4
- Framer Motion for animations
- Lucide React for icons

### State Management
- TanStack React Query (@tanstack/react-query) for server state
- React hooks for local state

### Authentication & Blockchain
- Magic Link SDK for authentication
- ethers.js v5 for Ethereum interactions
- viem for modern Ethereum utilities

### Data Fetching
- Supabase client (@supabase/supabase-js)
- Polymarket CLOB client
- **Note**: Implement error handling and retry logic for all API calls

### UI Components
- Recharts for data visualization
- react-intersection-observer for lazy loading

## Code Style & Conventions

### TypeScript/JavaScript (tradewizard-agents & frontend)
- kebab-case for files: `market-ingestion.ts`
- PascalCase for classes: `MarketBriefingDocument`
- camelCase for functions/variables: `analyzeMarket`
- Strict mode required for all TypeScript files

### Python (doa)
- snake_case for files: `market_ingestion.py`
- PascalCase for classes: `MarketBriefingDocument`
- snake_case for functions/variables: `analyze_market`
- Type hints required (mypy validation)

## Common Commands

### Backend (tradewizard-agents)

```bash
# Development
npm run dev              # Start with hot reload
npm run build            # Build for production
npm start                # Run production build

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode (use for development)
npm run test:e2e         # End-to-end tests

# CLI
npm run cli -- analyze <condition-id>  # Analyze market
npm run cli -- history <condition-id>  # Query history

# Monitoring Service
npm run monitor:start    # Start monitoring
npm run monitor:stop     # Stop monitoring
npm run monitor:status   # Check status

# Database
npm run migrate          # Run migrations
npm run migrate:status   # Check migration status

# Code Quality
npm run lint             # Check linting
npm run lint:fix         # Fix linting issues
npm run format           # Format code
npm run format:check     # Check formatting
```

### Python Backend (doa)

```bash
# Setup
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Development
python main.py analyze <condition-id>  # Analyze market
python main.py history <condition-id>  # Query history
python main.py monitor                 # Start monitoring

# Testing
pytest                   # Run all tests
pytest -m "not property" # Unit tests only
pytest -m property       # Property-based tests only
pytest --cov=.          # With coverage

# Code Quality
flake8 . --max-line-length=120
black . --line-length=120
mypy . --ignore-missing-imports

# Database
python -m database.migrations.001_initial_schema
```

### Frontend (tradewizard-frontend)

```bash
# Development
npm run dev              # Start dev server (localhost:3000)
npm run build            # Build for production
npm start                # Run production build

# Code Quality
npm run lint             # Check linting
```

## Configuration Files

- `.env` / `.env.example` - Environment variables (required for all services)
- `package.json` - Node.js dependencies and scripts
- `tsconfig.json` - TypeScript configuration (strict mode)
- `vitest.config.ts` - Vitest test configuration
- `requirements.txt` - Python dependencies
- `.env.production` - Production environment variables

## Critical Implementation Patterns

### Adding New Agents
- **Node.js**: Create `src/agents/agent-name.ts` following existing agent patterns with tool-calling interface
- **Python**: Create `agents/agent_name.py` with agent factory registration
- All agents must implement error handling and audit logging
- Register in agent factory for dynamic selection

### Adding New Workflow Nodes
- Implement LangGraph node interface
- Update `src/models/state.ts` (Node.js) or `models/state.py` (Python) if adding new state fields
- Integrate into workflow graph definition
- Include comprehensive error handling and graceful degradation

### Adding New Tools
- Wrap external APIs as LangChain tools
- Implement error handling and retry logic
- Add audit logging for all API calls
- Include timeout handling for external services

### Database Migrations
- **Node.js**: Use `src/database/migrate.ts` pattern
- **Python**: Add SQL files to `doa/database/migrations/` with sequential numbering
- Always test migrations in both directions (up/down)
- Verify agent memory retrieval works after schema changes

### Testing Strategy
- **Unit tests**: Test individual functions/methods in isolation
- **Integration tests**: Test component interactions (e.g., agent + tools)
- **Property-based tests**: Use fast-check (Node.js) or Hypothesis (Python) for correctness properties
- **E2E tests**: Test full workflow with real or mocked external APIs
- **Critical**: All LLM-dependent tests must complete within 30 seconds

## Error Handling & Observability

- Graceful degradation at every layer—partial failures don't crash the pipeline
- Comprehensive audit logging for all agent decisions and API calls
- Use Opik for tracing and cost tracking of all LLM calls
- Check audit logs and memory retrieval when debugging issues
- Implement timeout handling for all external API calls
