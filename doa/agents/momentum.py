"""
Momentum Agent

This agent analyzes price momentum and trend patterns in prediction markets
to identify when markets are trending and likely to continue in a particular direction.

The agent focuses on:
- Price momentum and trend direction
- Trend strength and persistence indicators
- Volume-price relationships and confirmation
- Momentum acceleration and deceleration
- Breakout patterns and continuation signals
"""

from prompts import MOMENTUM_PROMPT

# Agent identifier used in the workflow
AGENT_NAME = "momentum"

# System prompt defining the agent's analysis perspective
SYSTEM_PROMPT = MOMENTUM_PROMPT
