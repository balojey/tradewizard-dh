# Market Intelligence Engine CLI

Command-line interface for analyzing prediction markets with AI agents.

## Installation

```bash
npm install
```

## Configuration

Set up your environment variables in `.env`:

```bash
# Required: At least one LLM provider
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...

# Optional: Opik configuration
OPIK_API_KEY=...
OPIK_PROJECT_NAME=market-intelligence-engine

# Optional: LLM mode (single-provider or multi-provider)
LLM_SINGLE_PROVIDER=openai  # or anthropic, google (leave empty for multi-provider)
```

## Usage

### Analyze a Market

Analyze a prediction market by condition ID:

```bash
npm run cli -- analyze <conditionId>
```

**Options:**
- `--debug` - Show debug information and graph state
- `--visualize` - Generate LangGraph workflow visualization (Mermaid)
- `--opik-trace` - Display Opik trace URL for detailed inspection
- `--single-provider <provider>` - Use single LLM provider (openai|anthropic|google)
- `--model <model>` - Override default model for single-provider mode
- `--project <name>` - Override Opik project name
- `--show-costs` - Display LLM cost tracking information
- `--replay` - Replay from checkpoint (if available)

**Examples:**

```bash
# Basic analysis
npm run cli -- analyze 0x1234567890abcdef

# With debug information
npm run cli -- analyze 0x1234567890abcdef --debug

# With visualization
npm run cli -- analyze 0x1234567890abcdef --visualize

# Single-provider mode with OpenAI
npm run cli -- analyze 0x1234567890abcdef --single-provider openai

# Single-provider mode with custom model
npm run cli -- analyze 0x1234567890abcdef --single-provider openai --model gpt-4o-mini

# Show costs and Opik trace
npm run cli -- analyze 0x1234567890abcdef --show-costs --opik-trace
```

### Query Historical Traces

Query historical traces from Opik by market ID:

```bash
npm run cli -- history <conditionId>
```

**Options:**
- `--project <name>` - Override Opik project name

**Example:**

```bash
npm run cli -- history 0x1234567890abcdef
```

### Inspect Checkpoint State

Inspect checkpoint state for a market analysis:

```bash
npm run cli -- checkpoint <conditionId>
```

**Options:**
- `--project <name>` - Override Opik project name

**Example:**

```bash
npm run cli -- checkpoint 0x1234567890abcdef
```

## LLM Configuration Modes

The CLI supports two LLM configuration modes:

### Multi-Provider Mode (Default)

Uses different LLMs for different agents to get diverse perspectives:
- Market Microstructure Agent: GPT-4-turbo (OpenAI)
- Probability Baseline Agent: Gemini-1.5-flash (Google)
- Risk Assessment Agent: Claude-3-sonnet (Anthropic)

**Pros:**
- Diverse perspectives reduce model-specific biases
- Better quality recommendations
- Each agent uses the LLM best suited for its task

**Cons:**
- Higher cost
- Requires API keys for multiple providers

**Configuration:**
```bash
# .env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
```

### Single-Provider Mode

Uses one LLM for all agents with different system prompts:

**Pros:**
- Lower cost
- Simpler API key management
- Still maintains agent specialization through prompts

**Cons:**
- Less diverse perspectives
- Potential for model-specific biases

**Configuration:**
```bash
# .env
LLM_SINGLE_PROVIDER=openai  # or anthropic, google
OPENAI_API_KEY=sk-...
```

**CLI Usage:**
```bash
npm run cli -- analyze <conditionId> --single-provider openai
npm run cli -- analyze <conditionId> --single-provider anthropic
npm run cli -- analyze <conditionId> --single-provider google
```

## Output Format

The CLI displays:

### Trade Recommendation
- **Action**: LONG_YES, LONG_NO, or NO_TRADE
- **Expected Value**: Dollars per $100 invested
- **Win Probability**: Probability of winning the trade
- **Entry Zone**: Recommended entry price range
- **Target Zone**: Target price range
- **Liquidity Risk**: Low, medium, or high

### Explanation
- **Summary**: 2-3 sentence plain language explanation
- **Core Thesis**: Main argument for the trade
- **Key Catalysts**: Events that could drive the outcome
- **Failure Scenarios**: Conditions that would invalidate the thesis
- **Uncertainty Note**: Present if agent disagreement is high

### Metadata
- **Market Probability**: Current market-implied probability
- **Consensus Probability**: AI-calculated fair probability
- **Edge**: Difference between consensus and market probability
- **Confidence Band**: Range of uncertainty

### Debug Information (with --debug)
- Configuration details
- Audit log entries
- Agent signals and confidence scores
- Agent errors (if any)
- Debate scores
- Consensus details

## Opik Integration

The CLI automatically logs all executions to Opik for observability:

- **Traces**: Complete execution trace with all LLM calls
- **Graph Visualization**: LangGraph workflow diagram
- **Cost Tracking**: Token usage and costs per execution
- **Thread Tracking**: All analyses for a market ID grouped together

Access traces in the Opik web UI:
- Cloud: https://www.comet.com/opik
- Self-hosted: Configure `OPIK_BASE_URL` in `.env`

## Testing

Run the CLI tests:

```bash
npm test -- cli.test.ts
```

For integration tests with real API calls:
1. Set up your `.env` file with API keys
2. Set `TEST_CONDITION_ID` to a valid Polymarket condition ID
3. Run: `npm test -- cli.test.ts`

## Troubleshooting

### "No API keys configured"
- Ensure at least one LLM provider API key is set in `.env`
- For single-provider mode, ensure the specified provider has an API key

### "Market analysis failed"
- Check that the condition ID is valid
- Verify Polymarket API is accessible
- Check API rate limits

### "Configuration invalid"
- Verify `.env` file is properly formatted
- Ensure required fields are present
- Check that single-provider configuration matches available API keys

### Tests timing out
- Increase timeout in test configuration
- Check network connectivity
- Verify API keys are valid

## Examples

### Full Analysis with All Options

```bash
npm run cli -- analyze 0x1234567890abcdef \
  --debug \
  --visualize \
  --show-costs \
  --opik-trace \
  --single-provider openai \
  --model gpt-4o-mini \
  --project my-custom-project
```

### Quick Analysis

```bash
npm run cli -- analyze 0x1234567890abcdef
```

### Budget-Friendly Analysis

```bash
npm run cli -- analyze 0x1234567890abcdef \
  --single-provider openai \
  --model gpt-4o-mini
```

### High-Quality Analysis

```bash
# Uses multi-provider mode by default
npm run cli -- analyze 0x1234567890abcdef --debug
```
