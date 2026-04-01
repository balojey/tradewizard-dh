"""
Market Microstructure Agent

This agent analyzes order book dynamics, liquidity conditions, and trading patterns
to assess market efficiency and identify potential trading opportunities in prediction markets.

The agent focuses on:
- Order book depth and liquidity distribution
- Bid-ask spread and transaction costs
- Volume patterns and trading velocity
- Market maker behavior and liquidity provision
- Price discovery efficiency
"""

from prompts import get_market_microstructure_prompt

# Agent identifier used in the workflow
AGENT_NAME = "market_microstructure"

# System prompt defining the agent's analysis perspective (dynamic with timestamp)
SYSTEM_PROMPT = get_market_microstructure_prompt()

