"""
Risk Assessment Agent

This agent identifies tail risks, failure modes, and uncertainty factors that could
cause unexpected outcomes or invalidate conventional analysis in prediction markets.

The agent focuses on:
- Tail risk scenarios and black swan events
- Model uncertainty and assumption failures
- Information gaps and unknown unknowns
- Structural risks in market design
- Resolution ambiguity and edge cases
"""

from prompts import get_risk_assessment_prompt

# Agent identifier used in the workflow
AGENT_NAME = "risk_assessment"

# System prompt defining the agent's analysis perspective (dynamic with timestamp)
SYSTEM_PROMPT = get_risk_assessment_prompt()
