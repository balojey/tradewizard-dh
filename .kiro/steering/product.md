---
inclusion: always
---

# Product Overview

TradeWizard is an AI-powered prediction trading platform that provides intelligent analysis and trading recommendations for real-world outcomes on Polymarket.

## Core Value Proposition

Transforms prediction markets from speculative guessing into guided, intelligence-driven trading through multi-agent AI analysis.

## System Architecture

### Codebase Organization

- **tradewizard-agents**: Multi-agent backend (Node.js + TypeScript + LangGraph) orchestrating specialized AI agents for market analysis
- **tradewizard-frontend**: Web application (Next.js + React + TypeScript) providing UI for market discovery and trading
- **doa**: Python replication of the multi-agent system using Digital Ocean's Gradient AI Platform

### Multi-Agent Intelligence System

The platform uses specialized AI agents analyzing markets from multiple perspectives:

- Market microstructure and liquidity analysis
- Probability baseline estimation
- Risk assessment and tail risk modeling
- Breaking news and event impact analysis
- Polling intelligence and historical patterns
- Media and social sentiment tracking
- Price momentum and mean reversion signals
- Catalyst identification and narrative velocity

## Analysis Workflow

The LangGraph workflow orchestrates analysis through sequential and parallel stages:

1. **Market Ingestion**: Fetch market data from Polymarket APIs
2. **Memory Retrieval**: Load historical agent signals for context
3. **Parallel Agent Execution**: All agents analyze simultaneously using autonomous tool-calling
4. **Thesis Construction**: Build bull and bear theses from agent signals
5. **Cross-Examination**: Adversarial testing of assumptions to prevent groupthink
6. **Consensus Engine**: Calculate unified probability estimate from all signals
7. **Recommendation Generation**: Create actionable trade signals with entry/exit zones and risk assessment

## Key Architectural Principles

- **Explainability**: All recommendations include clear reasoning chains
- **Autonomy**: Agents use ReAct pattern with tool-calling to fetch data dynamically
- **Observability**: Full tracing via Opik integration for debugging and cost tracking
- **Memory**: Historical agent signals stored in Supabase for closed-loop learning
- **Resilience**: Graceful degradation—partial failures don't crash the pipeline
- **Multi-Provider**: LLM factory pattern allows different agents to use different providers

## Development Guidance

### When Adding Features

- Maintain separation between agent logic (agents/), workflow nodes (nodes/), and tools (tools/)
- New agents should follow the existing agent factory pattern
- New workflow stages should be implemented as LangGraph nodes
- External integrations should be wrapped as LangChain tools

### When Fixing Issues

- Check audit logs for error context
- Verify agent memory retrieval is working (memory_retrieval.ts)
- Test with property-based testing to ensure correctness properties hold
- Use Opik traces to identify bottlenecks or failures

### Code Quality Standards

- TypeScript strict mode required for backend
- Property-based testing for critical paths (fast-check)
- 30s timeout for LLM-dependent tests
- Comprehensive audit logging for all agent decisions
