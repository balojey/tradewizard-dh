"""
Historical Pattern Agent

This agent identifies historical patterns, statistical regularities, and precedent-based
insights that inform probability estimates through rigorous quantitative analysis.

The agent focuses on:
- Historical precedent analysis and pattern matching
- Statistical regularities and empirical frequencies
- Time-series patterns and seasonal effects
- Regression to the mean and reversion patterns
- Correlation analysis with related variables
- Market behavior patterns in similar events
- Prediction market accuracy patterns
- Calibration analysis of historical forecasts
"""

from prompts import HISTORICAL_PATTERN_PROMPT

# Agent identifier used in the workflow
AGENT_NAME = "historical_pattern"

# System prompt defining the agent's analysis perspective
SYSTEM_PROMPT = HISTORICAL_PATTERN_PROMPT
