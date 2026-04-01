"""
Tail Risk Agent

This agent identifies and assesses tail risk scenarios, black swan events, and extreme
outcomes that could dramatically alter market probabilities, focusing on scenarios that
markets may be underpricing or ignoring.

The agent focuses on:
- Tail risk scenarios and extreme outcomes
- Black swan events and unexpected developments
- Low-probability, high-impact events
- Fat-tail distributions and non-normal outcomes
- Systemic risks and cascading failures
"""

from prompts import TAIL_RISK_PROMPT

# Agent identifier used in the workflow
AGENT_NAME = "tail_risk"

# System prompt defining the agent's analysis perspective
SYSTEM_PROMPT = TAIL_RISK_PROMPT
