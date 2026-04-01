"""
Social Sentiment Agent

This agent analyzes social media discourse and online community sentiment to understand
how online discourse influences market outcomes and reveals ground-level sentiment.

The agent focuses on:
- Social media sentiment analysis (Twitter, Reddit, forums)
- Viral trends and meme propagation
- Grassroots opinion dynamics and community sentiment
- Influencer positioning and thought leader views
- Sentiment velocity and momentum
- Online mobilization and activism signals
- Echo chambers and filter bubbles
- Organic vs. astroturfed sentiment
"""

from prompts import SOCIAL_SENTIMENT_PROMPT

# Agent identifier used in the workflow
AGENT_NAME = "social_sentiment"

# System prompt defining the agent's analysis perspective
SYSTEM_PROMPT = SOCIAL_SENTIMENT_PROMPT
