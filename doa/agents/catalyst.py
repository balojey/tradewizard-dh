"""
Catalyst Agent

This agent identifies potential catalysts and trigger events for prediction markets,
focusing on upcoming events, announcements, deadlines, and developments that could
serve as catalysts to move market probabilities.

The agent focuses on:
- Upcoming catalysts and trigger events
- Event timing and deadline analysis
- Catalyst magnitude and market-moving potential
- Directional impact assessment (bullish/bearish)
- Catalyst probability and likelihood
"""

from prompts import CATALYST_PROMPT

# Agent identifier used in the workflow
AGENT_NAME = "catalyst"

# System prompt defining the agent's analysis perspective
SYSTEM_PROMPT = CATALYST_PROMPT
