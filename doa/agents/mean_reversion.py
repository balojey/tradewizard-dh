"""
Mean Reversion Agent

This agent identifies overextended markets and reversal opportunities in prediction markets
by detecting when prices have deviated significantly from fair value.

The agent focuses on:
- Mean reversion patterns and cycles
- Overbought and oversold conditions
- Price extremes and deviation from fair value
- Volatility spikes and compression
- Sentiment extremes and contrarian signals
"""

from prompts import MEAN_REVERSION_PROMPT

# Agent identifier used in the workflow
AGENT_NAME = "mean_reversion"

# System prompt defining the agent's analysis perspective
SYSTEM_PROMPT = MEAN_REVERSION_PROMPT
