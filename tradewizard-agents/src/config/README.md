# Market Intelligence Engine Configuration

This document describes the configuration system for the Market Intelligence Engine.

## Overview

The engine uses environment variables for configuration with sensible defaults. Configuration is validated using Zod schemas to ensure type safety and correctness.

## Configuration Modes

### Single-Provider LLM Mode (Budget-Friendly)

Use one LLM provider for all agents. This mode is cost-effective and simplifies API key management while maintaining agent specialization through different system prompts.

**Environment Variables:**
```bash
# Set single provider mode
LLM_SINGLE_PROVIDER=openai

# Configure the provider
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4o-mini
```

**Programmatic Configuration:**
```typescript
import { createConfig } from './config';

const config = createConfig({
  llm: {
    singleProvider: 'openai',
    openai: {
      apiKey: 'sk-...',
      defaultModel: 'gpt-4o-mini'
    }
  }
});
```

**Supported Providers:**
- `openai` - OpenAI models (GPT-4, GPT-4-turbo, GPT-4o-mini, etc.)
- `anthropic` - Anthropic models (Claude-3-sonnet, Claude-3-haiku, etc.)
- `google` - Google models (Gemini-1.5-pro, Gemini-1.5-flash, etc.)

### Multi-Provider LLM Mode (Optimal Quality, Default)

Use different LLM providers for different agents. This mode provides diverse perspectives and reduces model-specific biases, resulting in higher quality recommendations.

**Environment Variables:**
```bash
# Configure multiple providers (no LLM_SINGLE_PROVIDER set)
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4-turbo

ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_DEFAULT_MODEL=claude-3-sonnet-20240229

GOOGLE_API_KEY=...
GOOGLE_DEFAULT_MODEL=gemini-2.5-flash
```

**Programmatic Configuration:**
```typescript
import { createConfig } from './config';

const config = createConfig({
  llm: {
    openai: {
      apiKey: 'sk-...',
      defaultModel: 'gpt-4-turbo'
    },
    anthropic: {
      apiKey: 'sk-ant-...',
      defaultModel: 'claude-3-sonnet-20240229'
    },
    google: {
      apiKey: '...',
      defaultModel: 'gemini-2.5-flash'
    }
  }
});
```

**Agent-to-Provider Mapping (Multi-Provider Mode):**
- Market Microstructure Agent → OpenAI (GPT-4-turbo)
- Probability Baseline Agent → Google (Gemini-2.5-flash)
- Risk Assessment Agent → Anthropic (Claude-3-sonnet)

## Configuration Sections

### Polymarket API

Configure connection to Polymarket's prediction market APIs.

```bash
POLYMARKET_GAMMA_API_URL=https://gamma-api.polymarket.com
POLYMARKET_CLOB_API_URL=https://clob.polymarket.com
POLYMARKET_RATE_LIMIT_BUFFER=80  # Use 80% of rate limit (0-100)
```

### LangGraph

Configure the LangGraph workflow engine.

```bash
LANGGRAPH_CHECKPOINTER=memory     # memory | sqlite | postgres
LANGGRAPH_RECURSION_LIMIT=25      # Max graph execution depth
LANGGRAPH_STREAM_MODE=values      # values | updates
```

**Checkpointer Options:**
- `memory` - In-memory checkpointing (development, no persistence)
- `sqlite` - SQLite-based checkpointing (production, file-based persistence)
- `postgres` - PostgreSQL-based checkpointing (production, database persistence)

### Opik Observability

Configure Opik for LLM tracing, debugging, and cost tracking.

```bash
# Cloud Opik (default)
OPIK_API_KEY=your_opik_api_key
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_WORKSPACE=default
OPIK_TRACK_COSTS=true

# Self-Hosted Opik
OPIK_BASE_URL=http://localhost:5000
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_TRACK_COSTS=true
```

**Opik Features:**
- Automatic LLM call tracing with input/output logging
- Graph visualization for debugging workflow execution
- Token usage and cost tracking per market analysis
- Thread-based conversation tracking using market IDs

### Agent Configuration

Configure agent behavior and thresholds.

```bash
AGENT_TIMEOUT_MS=10000           # Max time per agent (milliseconds)
MIN_AGENTS_REQUIRED=2            # Minimum agents for consensus
```

### Consensus Configuration

Configure consensus calculation and trade thresholds.

```bash
MIN_EDGE_THRESHOLD=0.05                # Minimum edge to recommend trade (5%)
HIGH_DISAGREEMENT_THRESHOLD=0.15       # Disagreement index threshold
```

### Logging

Configure system logging behavior.

```bash
LOG_LEVEL=info                        # debug | info | warn | error
AUDIT_TRAIL_RETENTION_DAYS=30         # Days to retain audit logs
```

## Usage Examples

### Loading Default Configuration

```typescript
import { config } from './config';

// Use default configuration from environment variables
console.log(config.opik.projectName);
```

### Creating Configuration with Overrides

```typescript
import { createConfig } from './config';

// Override specific values
const customConfig = createConfig({
  opik: {
    projectName: 'my-custom-project'
  },
  agents: {
    timeoutMs: 15000  // Increase timeout to 15 seconds
  }
});
```

### Single-Provider Mode Example

```typescript
import { createConfig } from './config';

// Budget-friendly: Use OpenAI for all agents
const budgetConfig = createConfig({
  llm: {
    singleProvider: 'openai',
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      defaultModel: 'gpt-4o-mini'  // Cheaper model
    }
  }
});
```

### Multi-Provider Mode Example

```typescript
import { createConfig } from './config';

// Optimal quality: Use different providers per agent
const optimalConfig = createConfig({
  llm: {
    openai: {
      apiKey: process.env.OPENAI_API_KEY!,
      defaultModel: 'gpt-4-turbo'
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY!,
      defaultModel: 'claude-3-sonnet-20240229'
    },
    google: {
      apiKey: process.env.GOOGLE_API_KEY!,
      defaultModel: 'gemini-1.5-flash'
    }
  }
});
```

### Testing Configuration

```typescript
import { createConfig } from './config';

// Test configuration with mocked values
const testConfig = createConfig({
  polymarket: {
    gammaApiUrl: 'http://localhost:3000/mock-gamma',
    clobApiUrl: 'http://localhost:3000/mock-clob',
    rateLimitBuffer: 100
  },
  agents: {
    timeoutMs: 1000,  // Faster timeouts for tests
    minAgentsRequired: 1
  },
  logging: {
    level: 'error'  // Reduce noise in tests
  }
});
```

## Validation

Configuration is automatically validated using Zod schemas. Invalid configurations will throw descriptive errors:

```typescript
import { loadConfig } from './config';

try {
  const config = loadConfig();
} catch (error) {
  console.error('Configuration validation failed:', error.message);
  // Example: "POLYMARKET_RATE_LIMIT_BUFFER must be between 0 and 100"
}
```

### Common Validation Errors

1. **Single-provider mode without provider configuration:**
   ```
   LLM configuration invalid: In single-provider mode, the specified provider must be configured.
   ```
   **Fix:** Set the API key and model for the specified provider.

2. **Multi-provider mode with no providers:**
   ```
   LLM configuration invalid: In multi-provider mode, at least one provider must be configured.
   ```
   **Fix:** Configure at least one LLM provider (OpenAI, Anthropic, or Google).

3. **Invalid rate limit buffer:**
   ```
   POLYMARKET_RATE_LIMIT_BUFFER must be between 0 and 100
   ```
   **Fix:** Set a value between 0 and 100 (percentage).

4. **Invalid URL format:**
   ```
   POLYMARKET_GAMMA_API_URL must be a valid URL
   ```
   **Fix:** Ensure URLs start with `http://` or `https://`.

## Environment Variable Reference

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `POLYMARKET_GAMMA_API_URL` | URL | `https://gamma-api.polymarket.com` | Polymarket Gamma API endpoint |
| `POLYMARKET_CLOB_API_URL` | URL | `https://clob.polymarket.com` | Polymarket CLOB API endpoint |
| `POLYMARKET_RATE_LIMIT_BUFFER` | 0-100 | `80` | Percentage of rate limit to use |
| `LLM_SINGLE_PROVIDER` | `openai`\|`anthropic`\|`google` | - | Single provider mode (optional) |
| `OPENAI_API_KEY` | string | - | OpenAI API key |
| `OPENAI_DEFAULT_MODEL` | string | `gpt-4-turbo` | OpenAI model name |
| `ANTHROPIC_API_KEY` | string | - | Anthropic API key |
| `ANTHROPIC_DEFAULT_MODEL` | string | `claude-3-sonnet-20240229` | Anthropic model name |
| `GOOGLE_API_KEY` | string | - | Google API key |
| `GOOGLE_DEFAULT_MODEL` | string | `gemini-1.5-flash` | Google model name |
| `LANGGRAPH_CHECKPOINTER` | `memory`\|`sqlite`\|`postgres` | `memory` | Checkpointer type |
| `LANGGRAPH_RECURSION_LIMIT` | number | `25` | Max graph depth |
| `LANGGRAPH_STREAM_MODE` | `values`\|`updates` | `values` | Stream mode |
| `OPIK_API_KEY` | string | - | Opik API key (cloud) |
| `OPIK_PROJECT_NAME` | string | `market-intelligence-engine` | Opik project name |
| `OPIK_WORKSPACE` | string | - | Opik workspace (cloud) |
| `OPIK_BASE_URL` | URL | - | Opik base URL (self-hosted) |
| `OPIK_TAGS` | string | - | Comma-separated tags |
| `OPIK_TRACK_COSTS` | boolean | `true` | Enable cost tracking |
| `AGENT_TIMEOUT_MS` | number | `10000` | Agent timeout (ms) |
| `MIN_AGENTS_REQUIRED` | number | `2` | Minimum agents for consensus |
| `MIN_EDGE_THRESHOLD` | 0-1 | `0.05` | Minimum edge for trade (5%) |
| `HIGH_DISAGREEMENT_THRESHOLD` | 0-1 | `0.15` | High disagreement threshold |
| `LOG_LEVEL` | `debug`\|`info`\|`warn`\|`error` | `info` | Logging level |
| `AUDIT_TRAIL_RETENTION_DAYS` | number | `30` | Audit log retention |

## Best Practices

1. **Use environment variables for secrets** - Never hardcode API keys in code
2. **Use single-provider mode for development** - Reduces costs during testing
3. **Use multi-provider mode for production** - Better quality recommendations
4. **Enable Opik tracing** - Essential for debugging and optimization
5. **Set appropriate timeouts** - Balance between quality and latency
6. **Monitor rate limits** - Adjust `POLYMARKET_RATE_LIMIT_BUFFER` based on usage
7. **Use SQLite or Postgres checkpointer in production** - Enables audit trail persistence
8. **Tag Opik traces** - Use `OPIK_TAGS` to organize traces by environment or feature

## Troubleshooting

### Configuration not loading

**Problem:** Configuration values not being read from environment variables.

**Solution:** Ensure environment variables are set before importing the config module:
```typescript
// Set env vars first
process.env.OPIK_PROJECT_NAME = 'my-project';

// Then import config
import { config } from './config';
```

### Validation errors

**Problem:** Configuration validation fails with cryptic errors.

**Solution:** Check the error message for specific field names and constraints. Use `getDefaultConfig()` to see expected structure:
```typescript
import { getDefaultConfig } from './config';
console.log(JSON.stringify(getDefaultConfig(), null, 2));
```

### LLM provider not working

**Problem:** Single-provider mode not using the specified provider.

**Solution:** Ensure both `LLM_SINGLE_PROVIDER` and the provider's API key are set:
```bash
LLM_SINGLE_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_DEFAULT_MODEL=gpt-4-turbo
```

### Opik traces not appearing

**Problem:** Opik traces not showing up in the dashboard.

**Solution:** 
1. Verify `OPIK_API_KEY` is set correctly
2. Check `OPIK_PROJECT_NAME` matches your Opik project
3. For self-hosted, ensure `OPIK_BASE_URL` is correct
4. Verify network connectivity to Opik servers
