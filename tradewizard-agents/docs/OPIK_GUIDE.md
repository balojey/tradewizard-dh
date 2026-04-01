# Opik Observability Guide

Complete guide to using Opik for LLM observability, tracing, and debugging in the Market Intelligence Engine.

## Table of Contents

- [What is Opik?](#what-is-opik)
- [Setup](#setup)
  - [Cloud Opik](#cloud-opik)
  - [Self-Hosted Opik](#self-hosted-opik)
- [Configuration](#configuration)
- [Using Opik](#using-opik)
- [Viewing Traces](#viewing-traces)
- [Cost Tracking](#cost-tracking)
- [Debugging with Opik](#debugging-with-opik)
- [Querying Traces](#querying-traces)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

## What is Opik?

Opik is an open-source LLM observability platform that provides:

- **Complete Tracing**: Every LLM call, agent execution, and state transition
- **Graph Visualization**: Visual representation of LangGraph workflows
- **Cost Tracking**: Automatic token usage and cost calculation
- **Debugging Tools**: Step-by-step execution inspection
- **Performance Metrics**: Latency, throughput, and error rates
- **Thread-Based Organization**: Group related executions by market ID

### Why Use Opik?

**Without Opik:**
- ❌ No visibility into LLM calls
- ❌ Difficult to debug failures
- ❌ Unknown costs per analysis
- ❌ Can't replay executions
- ❌ No performance insights

**With Opik:**
- ✅ Complete execution traces
- ✅ Visual debugging with graph view
- ✅ Automatic cost tracking
- ✅ Replay and analyze past executions
- ✅ Performance optimization insights

## Setup

### Cloud Opik

Cloud Opik is the easiest way to get started. It's hosted by Comet ML and requires no infrastructure setup.

#### 1. Create Account

1. Visit [https://www.comet.com/opik](https://www.comet.com/opik)
2. Click "Sign Up" or "Get Started"
3. Sign up with email or Google/GitHub account
4. Verify your email address

#### 2. Create Project

1. Log in to Opik dashboard
2. Click "New Project"
3. Name your project (e.g., "market-intelligence-engine")
4. Select workspace (default or create new)

#### 3. Get API Key

1. Navigate to Settings → API Keys
2. Click "Create API Key"
3. Name your key (e.g., "market-intelligence-engine-prod")
4. Copy the API key immediately
5. Store securely in your `.env` file

#### 4. Configure Application

```bash
# .env
OPIK_API_KEY=your_opik_api_key_here
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_WORKSPACE=default
OPIK_TRACK_COSTS=true
```

#### 5. Test Connection

```bash
npm run cli -- analyze <condition-id> --opik-trace
```

You should see a trace URL printed to the console.

### Self-Hosted Opik

Self-hosted Opik gives you full control and data privacy.

#### 1. Install Docker

Ensure Docker and Docker Compose are installed:

```bash
docker --version
docker-compose --version
```

#### 2. Deploy Opik

**Option A: Using Docker Compose (Recommended)**

Create `docker-compose.opik.yml`:

```yaml
version: '3.8'

services:
  opik:
    image: comet-ml/opik:latest
    container_name: opik
    ports:
      - "5000:5000"
    volumes:
      - opik-data:/data
      - opik-logs:/logs
    environment:
      - OPIK_DATABASE_URL=postgresql://opik:opik@postgres:5432/opik
      - OPIK_SECRET_KEY=your-secret-key-here
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    container_name: opik-postgres
    environment:
      - POSTGRES_USER=opik
      - POSTGRES_PASSWORD=opik
      - POSTGRES_DB=opik
    volumes:
      - postgres-data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  opik-data:
  opik-logs:
  postgres-data:
```

Start Opik:

```bash
docker-compose -f docker-compose.opik.yml up -d
```

**Option B: Using Docker Run**

```bash
# Start PostgreSQL
docker run -d \
  --name opik-postgres \
  -e POSTGRES_USER=opik \
  -e POSTGRES_PASSWORD=opik \
  -e POSTGRES_DB=opik \
  -v opik-postgres-data:/var/lib/postgresql/data \
  postgres:15-alpine

# Start Opik
docker run -d \
  --name opik \
  -p 5000:5000 \
  -e OPIK_DATABASE_URL=postgresql://opik:opik@opik-postgres:5432/opik \
  -e OPIK_SECRET_KEY=your-secret-key-here \
  -v opik-data:/data \
  --link opik-postgres \
  comet-ml/opik:latest
```

#### 3. Access Opik UI

Open your browser and navigate to:

```
http://localhost:5000
```

#### 4. Configure Application

```bash
# .env
OPIK_BASE_URL=http://localhost:5000
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_TRACK_COSTS=true
```

**Note:** No API key needed for self-hosted Opik.

#### 5. Test Connection

```bash
npm run cli -- analyze <condition-id> --opik-trace
```

The trace should appear in your local Opik UI.

## Configuration

### Environment Variables

```bash
# Cloud Opik
OPIK_API_KEY=your_api_key_here
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_WORKSPACE=default
OPIK_TRACK_COSTS=true

# Self-Hosted Opik
OPIK_BASE_URL=http://localhost:5000
OPIK_PROJECT_NAME=market-intelligence-engine
OPIK_TRACK_COSTS=true

# Optional: Add tags to all traces
OPIK_TAGS=production,v1.0,debate-protocol
```

### Configuration Options

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPIK_API_KEY` | Yes (cloud) | - | API key for cloud Opik |
| `OPIK_BASE_URL` | Yes (self-hosted) | - | URL for self-hosted Opik |
| `OPIK_PROJECT_NAME` | Yes | - | Project name in Opik |
| `OPIK_WORKSPACE` | No | default | Workspace name (cloud only) |
| `OPIK_TRACK_COSTS` | No | true | Enable automatic cost tracking |
| `OPIK_TAGS` | No | - | Comma-separated tags for all traces |

### Programmatic Configuration

```typescript
import { OpikTracer } from 'opik/integrations/langchain';

const opikTracer = new OpikTracer({
  projectName: 'market-intelligence-engine',
  tags: ['production', 'debate-protocol'],
  metadata: {
    version: '1.0.0',
    environment: 'production'
  }
});
```

## Using Opik

### Automatic Tracing

The Market Intelligence Engine automatically traces all executions when Opik is configured. No code changes needed!

```bash
# Every analysis is automatically traced
npm run cli -- analyze <condition-id>
```

### What Gets Traced?

**LangGraph Workflow:**
- Complete graph structure and execution flow
- State transitions between nodes
- Node execution timing
- Conditional edge decisions

**LLM Calls:**
- All prompts sent to LLMs
- All responses from LLMs
- Token usage (input/output)
- Latency per call
- Cost per call

**Agent Executions:**
- Agent inputs (Market Briefing Document)
- Agent outputs (signals, theses, etc.)
- Agent errors and failures
- Agent execution time

**State Changes:**
- Graph state at each checkpoint
- Audit log entries
- Error states

### Thread-Based Organization

Each market analysis uses the condition ID as the thread ID, grouping all related executions:

```typescript
// Automatically uses condition ID as thread ID
const result = await analyzeMarket('0x1234567890abcdef');
```

All analyses for the same market are grouped together in Opik.

## Viewing Traces

### Accessing the Dashboard

**Cloud Opik:**
```
https://www.comet.com/opik
```

**Self-Hosted Opik:**
```
http://localhost:5000
```

### Dashboard Overview

The Opik dashboard shows:

1. **Projects**: List of all your projects
2. **Traces**: List of all execution traces
3. **Threads**: Grouped executions by market ID
4. **Metrics**: Performance and cost metrics
5. **Errors**: Failed executions and errors

### Viewing a Trace

1. **Navigate to your project:**
   - Click on "market-intelligence-engine"

2. **Find your trace:**
   - Search by market ID (condition ID)
   - Filter by date/time
   - Filter by status (success/error)
   - Sort by cost, duration, etc.

3. **Open trace details:**
   - Click on a trace to view details

### Trace Details View

**Timeline View:**
- Visual timeline of all operations
- Node execution order
- Parallel agent execution
- LLM call timing

**Graph View:**
- Visual representation of LangGraph workflow
- Node connections and edges
- State flow through the graph
- Conditional routing

**Spans View:**
- Hierarchical view of all operations
- Expand/collapse spans
- View inputs/outputs
- Check timing and costs

**LLM Calls:**
- View all prompts and responses
- Token usage breakdown
- Cost per call
- Model used

**State Inspector:**
- View graph state at any point
- Inspect checkpoint data
- Review audit log entries

### Example Trace

```
Trace: Market Analysis - 0x1234567890abcdef
Duration: 12.5s
Cost: $0.08
Status: Success

Timeline:
├─ market_ingestion (2.1s)
│  └─ Polymarket API call (1.8s)
├─ Parallel Agent Execution (5.2s)
│  ├─ market_microstructure_agent (4.8s)
│  │  └─ OpenAI GPT-4-turbo call (4.5s) - $0.05
│  ├─ probability_baseline_agent (3.2s)
│  │  └─ Google Gemini call (2.9s) - $0.002
│  └─ risk_assessment_agent (5.1s)
│     └─ Anthropic Claude call (4.8s) - $0.03
├─ thesis_construction (3.5s)
│  ├─ Bull thesis generation (1.7s) - $0.01
│  └─ Bear thesis generation (1.6s) - $0.01
├─ cross_examination (2.8s)
├─ consensus_engine (0.5s)
└─ recommendation_generation (1.2s)
```

## Cost Tracking

### Automatic Cost Calculation

Opik automatically tracks costs when `OPIK_TRACK_COSTS=true`:

- Token usage per LLM call
- Cost per token (based on provider pricing)
- Total cost per trace
- Cost breakdown by agent/node

### Viewing Costs

**Per-Trace Costs:**
1. Open trace details
2. View "Cost" field in header
3. Expand LLM calls to see per-call costs

**Aggregate Costs:**
1. Navigate to project dashboard
2. View "Costs" tab
3. See total costs over time
4. Filter by date range, agent, model

**Cost Breakdown:**
- By agent (which agent costs most)
- By model (which LLM costs most)
- By market (which markets are expensive)
- Over time (daily/weekly/monthly trends)

### Cost Optimization

Use Opik to identify cost optimization opportunities:

1. **Identify expensive agents:**
   - Which agent uses most tokens?
   - Can we use a cheaper model?

2. **Analyze token usage:**
   - Are prompts too long?
   - Can we reduce context?

3. **Compare configurations:**
   - Multi-provider vs single-provider
   - Premium models vs budget models

4. **Set up alerts:**
   - Alert when cost exceeds threshold
   - Daily/weekly cost reports

### Example Cost Analysis

```
Cost Breakdown (Last 100 Analyses):

Total Cost: $8.50
Average per Analysis: $0.085

By Agent:
- Market Microstructure: $5.00 (59%)
- Risk Assessment: $3.00 (35%)
- Probability Baseline: $0.50 (6%)

By Model:
- GPT-4-turbo: $5.00 (59%)
- Claude-3-sonnet: $3.00 (35%)
- Gemini-1.5-flash: $0.50 (6%)

Optimization Suggestions:
- Switch Market Microstructure to gpt-4o: Save $2.50
- Use single-provider mode: Save $4.00
```

## Debugging with Opik

### Debugging Failed Executions

1. **Find failed trace:**
   - Filter by status: "Error"
   - Search by market ID

2. **View error details:**
   - Click on failed trace
   - View error message and stack trace
   - Check which node failed

3. **Inspect state:**
   - View graph state before failure
   - Check inputs to failed node
   - Review audit log

4. **Identify root cause:**
   - Was it an API error?
   - Was it a validation error?
   - Was it a timeout?

### Debugging Slow Executions

1. **Find slow trace:**
   - Sort by duration
   - Filter by duration > threshold

2. **Analyze timeline:**
   - Which node took longest?
   - Were there sequential bottlenecks?
   - Were parallel agents slow?

3. **Check LLM calls:**
   - Which LLM call was slowest?
   - Was it a large prompt?
   - Was it a slow model?

4. **Optimize:**
   - Use faster models
   - Reduce prompt size
   - Increase parallelism

### Debugging Incorrect Results

1. **Find trace with incorrect result:**
   - Search by market ID
   - View recommendation

2. **Inspect agent signals:**
   - What did each agent output?
   - Were signals reasonable?
   - Was there high disagreement?

3. **Review LLM prompts:**
   - Were prompts clear?
   - Was context sufficient?
   - Were instructions followed?

4. **Check debate process:**
   - Did cross-examination work?
   - Were weak arguments caught?
   - Was consensus reasonable?

### Example Debugging Session

```
Problem: Analysis returned NO_TRADE when edge was 8%

1. Find trace in Opik
2. View recommendation: action=NO_TRADE, edge=0.08
3. Check consensus: consensusProbability=0.58, marketProbability=0.50
4. Review agent signals:
   - Market Microstructure: 0.55 (low confidence)
   - Probability Baseline: 0.62 (high confidence)
   - Risk Assessment: 0.57 (medium confidence)
5. Check cross-examination:
   - Bull thesis weakened by evidence test
   - Bear thesis survived all tests
6. Root cause: Evidence test found factual error in bull thesis
7. Solution: Improve evidence verification logic
```

## Querying Traces

### Using the CLI

Query historical traces by market ID:

```bash
npm run cli -- history <condition-id>
```

This shows all past analyses for a market.

### Programmatic Querying

```typescript
import { OpikClient } from 'opik';

const client = new OpikClient({
  apiKey: process.env.OPIK_API_KEY
});

// Get all traces for a market
const traces = await client.getTraces({
  projectName: 'market-intelligence-engine',
  filter: {
    threadId: '0x1234567890abcdef'
  }
});

// Get traces by date range
const recentTraces = await client.getTraces({
  projectName: 'market-intelligence-engine',
  filter: {
    startTime: new Date('2024-01-01'),
    endTime: new Date('2024-01-31')
  }
});

// Get failed traces
const failedTraces = await client.getTraces({
  projectName: 'market-intelligence-engine',
  filter: {
    status: 'error'
  }
});
```

### Filtering and Sorting

**Filter by:**
- Thread ID (market ID)
- Date range
- Status (success/error)
- Duration
- Cost
- Tags
- Metadata

**Sort by:**
- Date (newest/oldest)
- Duration (longest/shortest)
- Cost (highest/lowest)
- Status

### Exporting Traces

Export traces for analysis:

```typescript
// Export to JSON
const traces = await client.getTraces({...});
fs.writeFileSync('traces.json', JSON.stringify(traces, null, 2));

// Export to CSV
const csv = traces.map(t => ({
  id: t.id,
  marketId: t.threadId,
  duration: t.duration,
  cost: t.cost,
  status: t.status
}));
```

## Best Practices

### 1. Use Descriptive Project Names

```bash
# Good
OPIK_PROJECT_NAME=market-intelligence-engine-prod
OPIK_PROJECT_NAME=market-intelligence-engine-dev

# Bad
OPIK_PROJECT_NAME=project1
OPIK_PROJECT_NAME=test
```

### 2. Add Meaningful Tags

```bash
# .env
OPIK_TAGS=production,v1.0,debate-protocol,multi-provider
```

Tags help filter and organize traces.

### 3. Use Thread IDs Consistently

Always use market ID (condition ID) as thread ID to group related analyses.

### 4. Monitor Costs Regularly

- Check daily costs
- Set up cost alerts
- Review cost trends weekly

### 5. Review Failed Traces

- Investigate all failures
- Identify patterns
- Fix root causes

### 6. Optimize Based on Insights

- Use Opik data to optimize prompts
- Identify slow operations
- Reduce unnecessary LLM calls

### 7. Archive Old Traces

For self-hosted Opik, archive old traces to save storage:

```bash
# Archive traces older than 90 days
opik archive --older-than 90d
```

### 8. Set Up Alerts

Configure alerts for:
- High error rates (>5%)
- High costs (>$10/day)
- Slow executions (>30s)

## Troubleshooting

### Traces Not Appearing

**Problem:** Traces not showing up in Opik dashboard.

**Solutions:**

1. **Check configuration:**
   ```bash
   # Verify environment variables
   echo $OPIK_API_KEY
   echo $OPIK_PROJECT_NAME
   ```

2. **Check network connectivity:**
   ```bash
   # Cloud Opik
   curl https://www.comet.com/opik/api/health
   
   # Self-hosted
   curl http://localhost:5000/health
   ```

3. **Check application logs:**
   ```bash
   # Look for Opik errors
   npm run cli -- analyze <condition-id> --debug
   ```

4. **Verify project exists:**
   - Log in to Opik dashboard
   - Check project name matches configuration

### Authentication Errors

**Problem:** "Authentication failed" or "Invalid API key"

**Solutions:**

1. **Verify API key:**
   - Check key in Opik dashboard
   - Ensure no extra spaces in `.env`
   - Regenerate key if needed

2. **Check workspace:**
   ```bash
   # Ensure workspace is correct
   OPIK_WORKSPACE=default
   ```

3. **For self-hosted:**
   - No API key needed
   - Ensure `OPIK_BASE_URL` is set

### High Costs

**Problem:** Opik showing unexpectedly high costs

**Solutions:**

1. **Review cost breakdown:**
   - Which agent costs most?
   - Which model costs most?

2. **Optimize configuration:**
   - Switch to single-provider mode
   - Use budget models
   - Reduce prompt sizes

3. **Implement caching:**
   - Cache frequently analyzed markets
   - Avoid redundant analyses

### Slow Dashboard

**Problem:** Opik dashboard loading slowly

**Solutions:**

1. **Filter traces:**
   - Use date range filters
   - Filter by specific markets

2. **Archive old traces:**
   - Archive traces older than 90 days

3. **For self-hosted:**
   - Increase database resources
   - Add indexes to database

### Missing Cost Data

**Problem:** Cost data not showing in traces

**Solutions:**

1. **Enable cost tracking:**
   ```bash
   OPIK_TRACK_COSTS=true
   ```

2. **Check LLM provider:**
   - Ensure provider supports cost tracking
   - Verify model pricing is available

3. **Update Opik:**
   - Use latest version of Opik
   - Update opik-langchain integration

## Support

For Opik-specific issues:
- **Documentation:** [https://www.comet.com/docs/opik/](https://www.comet.com/docs/opik/)
- **GitHub:** [https://github.com/comet-ml/opik](https://github.com/comet-ml/opik)
- **Community:** [https://community.comet.com/](https://community.comet.com/)

For application issues:
- Check [Troubleshooting Guide](../README.md#troubleshooting)
- Review application logs
- Check LangGraph documentation

---

**Last Updated:** January 2026
