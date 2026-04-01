"""
Event Impact Agent

This agent assesses how broader event dynamics, contextual factors, and causal chains
affect prediction market outcomes, focusing on second-order effects and systemic implications.

The agent focuses on:
- Event context and background factors
- Causal chains and dependency analysis
- Second-order and tertiary effects
- Systemic implications and spillover effects
- Stakeholder incentives and strategic behavior
- Event timeline and critical path analysis
- Scenario planning and contingency analysis
"""

from prompts import EVENT_IMPACT_PROMPT

# Agent identifier used in the workflow
AGENT_NAME = "event_impact"

# System prompt defining the agent's analysis perspective
SYSTEM_PROMPT = EVENT_IMPACT_PROMPT
