# TradeWizard

> AI-powered prediction trading platform providing intelligent analysis and trading recommendations for real-world outcomes on Polymarket.

TradeWizard transforms prediction markets from speculative guessing into guided, intelligence-driven trading. A multi-agent AI system analyzes markets from multiple perspectives to produce explainable trade recommendations with clear reasoning, catalysts, and risk scenarios.

## Components

| Component | Purpose | Tech Stack |
|-----------|---------|-----------|
| [tradewizard-agents/](tradewizard-agents/README.md) | Multi-agent analysis engine, CLI, and monitoring service | Node.js 18+, TypeScript, LangGraph |
| [doa/](doa/README.md) | Python replication of the analysis workflow | Python 3.10+, LangGraph, Digital Ocean Gradient AI |
| [tradewizard-frontend/](tradewizard-frontend/README.md) | Web UI for market discovery and trading | Next.js 16, React 19, Tailwind CSS 4 |

## How It Works

Both `tradewizard-agents` and `doa` implement the same multi-agent analysis pipeline — one in TypeScript, one in Python. The frontend consumes results from either. You can run them independently or together.

```
[tradewizard-agents monitor]  OR  [doa workflow service]
         ↓                                ↓
   15+ Specialized AI Agents (parallel execution)
         ↓
   Supabase (persistence)
         ↓
   tradewizard-frontend
```

### Analysis Pipeline

1. Market Ingestion — fetch live data from Polymarket APIs
2. Memory Retrieval — load historical agent signals for context
3. Parallel Agent Execution — 15+ agents analyze simultaneously
4. Thesis Construction — build bull and bear theses from signals
5. Cross-Examination — adversarial testing to challenge assumptions
6. Consensus Engine — calculate unified probability estimate
7. Recommendation Generation — produce actionable trade signal with entry/exit zones

## Prerequisites

Depending on which components you want to run:

| Requirement | Used by |
|-------------|---------|
| Node.js 18+ | tradewizard-agents, frontend |
| Python 3.10+ | doa |
| Supabase account (free tier works) | all components |
| At least one LLM API key (OpenAI, Anthropic, Google, or Amazon Nova) | tradewizard-agents |
| Digital Ocean account with Gradient AI access | doa |
| NewsData.io API key | tradewizard-agents (optional, for news agents) |

## Getting Started

Pick the path that fits your goal.

### Option A: Node.js analysis engine (tradewizard-agents)

No Python or Digital Ocean account needed. Supports OpenAI, Anthropic, Google, and Amazon Nova.

```bash
cd tradewizard-agents
npm install
cp .env.example .env
# Add at least one LLM provider key to .env
npm run build
npm run cli -- analyze <polymarket-condition-id>
```

Minimal `.env` to get started:
```bash
# Pick one provider
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
# or
GOOGLE_API_KEY=...

# Budget-friendly single-provider mode
LLM_SINGLE_PROVIDER=openai
OPENAI_DEFAULT_MODEL=gpt-4o-mini
```

See [tradewizard-agents/README.md](tradewizard-agents/README.md) for full configuration options.

### Option B: Python workflow service (doa)

No Node.js needed. Uses Digital Ocean Gradient AI (Llama models).

```bash
cd doa
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Add DIGITALOCEAN_INFERENCE_KEY to .env

# Run locally
export DIGITALOCEAN_API_TOKEN=your_token
gradient agent run
# Service available at http://localhost:8080

# Test it
curl -X POST http://localhost:8080/run \
  -H 'Content-Type: application/json' \
  -d '{"condition_id": "0x1234567890abcdef"}'
```

Minimal `.env`:
```bash
DIGITALOCEAN_INFERENCE_KEY=your_gradient_model_access_key
```

See [doa/README.md](doa/README.md) for full configuration options.

### Option C: Frontend only

```bash
cd tradewizard-frontend
npm install
cp .env.example .env.local
# Configure environment variables
npm run dev  # http://localhost:3000
```

Minimal `.env.local`:
```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=your_magic_key
```

### Option D: Full stack

Run all three components together.

```bash
# 1. Set up the database (run once)
cd tradewizard-agents
npx supabase login
npx supabase link --project-ref your-project-ref
npx supabase db push

# 2. Start the Python workflow service (terminal 1)
cd doa
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # fill in DIGITALOCEAN_INFERENCE_KEY + Supabase creds
export DIGITALOCEAN_API_TOKEN=your_token
gradient agent run

# 3. Start the Node.js monitor (terminal 2)
cd tradewizard-agents
npm install
cp .env.example .env
# Set WORKFLOW_SERVICE_URL=http://localhost:8080/run in .env
npm run build
npm run monitor:start

# 4. Start the frontend (terminal 3)
cd tradewizard-frontend
npm install
cp .env.example .env.local  # fill in Supabase + Magic Link creds
npm run dev
```

## Environment Variables Reference

### tradewizard-agents (.env)

```bash
# LLM — configure at least one provider
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Single-provider mode (budget-friendly)
LLM_SINGLE_PROVIDER=openai
OPENAI_DEFAULT_MODEL=gpt-4o-mini

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# External APIs
NEWSDATA_API_KEY=your_newsdata_key

# Remote workflow service (optional — leave unset to run locally)
WORKFLOW_SERVICE_URL=http://localhost:8080/run
DIGITALOCEAN_API_TOKEN=your_api_token

# Monitor
ANALYSIS_INTERVAL_HOURS=24
MAX_MARKETS_PER_CYCLE=3
```

### doa (.env)

```bash
# Gradient AI (required)
DIGITALOCEAN_INFERENCE_KEY=your_gradient_model_access_key

# LLM
LLM_MODEL_NAME=llama-3.3-70b-instruct
LLM_TEMPERATURE=0.7
LLM_MAX_TOKENS=2000

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
ENABLE_PERSISTENCE=true

# Observability (optional)
OPIK_API_KEY=your_opik_api_key
OPIK_PROJECT_NAME=doa-market-analysis
OPIK_TRACK_COSTS=true
```

### tradewizard-frontend (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=your_magic_key
NEXT_PUBLIC_POLYMARKET_API_URL=https://clob.polymarket.com
```

## Getting API Keys

| Service | Link |
|---------|------|
| OpenAI | https://platform.openai.com/api-keys |
| Anthropic | https://console.anthropic.com |
| Google AI | https://ai.google.dev |
| Amazon Nova (Bedrock) | AWS Console → Bedrock |
| Digital Ocean API token | https://cloud.digitalocean.com/account/api/tokens |
| Digital Ocean Inference key | https://cloud.digitalocean.com/gen-ai |
| Supabase | https://supabase.com → Settings → API |
| NewsData.io | https://newsdata.io |
| Opik (observability) | https://www.comet.com/opik |
| Magic Link (auth) | https://magic.link |

## Common Commands

### tradewizard-agents

```bash
npm run cli -- analyze <condition-id>   # Analyze a market
npm run cli -- history <condition-id>   # Query analysis history
npm run monitor:start                   # Start automated monitoring
npm run monitor:stop                    # Stop monitoring
npm run monitor:status                  # Check monitor status
npm test                                # Run tests
npm run build                           # Build for production
```

### doa

```bash
python main.py analyze <condition_id>   # Analyze a market
python main.py history <condition_id>   # Query history
gradient agent run                      # Start local service
gradient agent deploy                   # Deploy to Gradient AI Platform
pytest                                  # Run tests
pytest --cov=.                          # With coverage
```

### tradewizard-frontend

```bash
npm run dev     # Start dev server (localhost:3000)
npm run build   # Build for production
npm run lint    # Lint check
```

## Deployment

| Component | Recommended Platform |
|-----------|---------------------|
| tradewizard-agents | Digital Ocean Droplet, Docker, or any Node.js host |
| doa | Digital Ocean Gradient AI Platform (`gradient agent deploy`) |
| tradewizard-frontend | Vercel |
| Database | Supabase (managed) |

See each component's README for detailed deployment instructions.

## Project Structure

```
tradewizard/
├── tradewizard-agents/     # Node.js multi-agent engine
├── doa/                    # Python multi-agent engine
├── tradewizard-frontend/   # Next.js web application
├── docs/                   # Product and technical documentation
└── .kiro/                  # AI assistant configuration
```

## Documentation

- [tradewizard-agents/README.md](tradewizard-agents/README.md) — Node.js engine setup, CLI reference, LLM provider guide
- [doa/README.md](doa/README.md) — Python engine setup, API reference, deployment guide
- [tradewizard-frontend/README.md](tradewizard-frontend/README.md) — Frontend development guide
- [docs/](docs/) — Product overview, architecture specs, AI debate protocol

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push and open a Pull Request

Code quality requirements:
- TypeScript strict mode, no `any` types
- ESLint + Prettier (Node.js), Black + flake8 (Python)
- Tests for new functionality
- Audit logging for all agent decisions

## License

This project is proprietary software. All rights reserved.

---

**Disclaimer**: TradeWizard provides AI-generated analysis for educational and informational purposes. All trading involves risk. Past performance does not guarantee future results. Please trade responsibly.
