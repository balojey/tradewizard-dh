"""
Autonomous Media Sentiment Agent

This agent autonomously fetches and analyzes media sentiment, narrative framing,
and editorial positioning to understand how media coverage influences public
perception and market outcomes. It uses the ReAct (Reasoning + Acting) pattern
to decide which NewsData tools to call based on market context.

The agent focuses on:
- Media sentiment analysis (positive, negative, neutral)
- Narrative framing and editorial positioning
- Media coverage volume and prominence
- Source diversity and ideological balance
- Sentiment shifts and trend analysis
- Media influence on public opinion
- Credibility and bias assessment
- Coverage gaps and underreported angles

Tool Selection Strategy:
- Make 2-3 queries with different sentiment filters (positive, negative, neutral)
- Use fetch_latest_news for current sentiment (24h)
- Use fetch_archive_news for historical comparison (7d ago)
- For crypto markets: Use fetch_crypto_news with sentiment filters
- For policy markets: Analyze framing and narrative patterns
- Calculate aggregate sentiment distribution
- Weight sentiment by source priority and recency
- Identify sentiment shifts when recent differs from historical

Requirements: 7.1-7.10
"""

import os
from typing import Dict, Any, Callable

from models.state import GraphState
from prompts import MEDIA_SENTIMENT_PROMPT


# Agent identifier used in the workflow
AGENT_NAME = "media_sentiment"


def create_media_sentiment_agent_node(config: Any) -> Callable[[GraphState], Dict[str, Any]]:
    """
    Create the autonomous Media Sentiment agent node.
    
    This function creates a LangGraph node that:
    1. Checks for MBD availability
    2. Checks for NewsData configuration
    3. Initializes NewsData client and tool cache
    4. Creates NewsData tools with audit logging
    5. Creates autonomous agent with tools
    6. Executes agent with timeout handling
    7. Parses output into AgentSignal
    8. Adds tool usage metadata
    9. Implements graceful degradation on tool failures
    10. Returns agent signal with comprehensive audit log
    
    Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
    
    Args:
        config: Engine configuration containing LLM and agent settings
        
    Returns:
        Async function that takes GraphState and returns state update
        
    Example:
        >>> node = create_media_sentiment_agent_node(config)
        >>> state_update = await node(state)
    """
    from agents.autonomous_agent_factory import create_autonomous_agent_node
    from tools.newsdata_client import NewsDataClient
    from tools.newsdata_tools import (
        create_fetch_latest_news_tool,
        create_fetch_archive_news_tool,
        create_fetch_crypto_news_tool,
        create_fetch_market_news_tool,
        ToolContext
    )
    from utils.tool_cache import ToolCache
    from models.types import AgentError
    
    # Enhanced system prompt with sentiment analysis strategy
    enhanced_prompt = MEDIA_SENTIMENT_PROMPT + """

AUTONOMOUS TOOL USAGE STRATEGY:

You have access to NewsData tools to fetch news with sentiment analysis. Use them strategically:

1. **Make separate queries for different sentiment filters**:
   - Query with sentiment="positive" to get positive coverage
   - Query with sentiment="negative" to get negative coverage
   - Query with sentiment="neutral" to get neutral coverage
   - Calculate aggregate sentiment distribution from results

2. **Compare current vs historical sentiment**:
   - Use fetch_latest_news for current sentiment (24h timeframe)
   - Use fetch_archive_news for historical comparison (7 days ago)
   - Identify sentiment shifts when recent differs from historical
   - Assess if sentiment is improving, deteriorating, or stable

3. **For crypto markets**:
   - Use fetch_crypto_news with coin symbols
   - Apply sentiment filters to crypto-specific news
   - Monitor regulatory sentiment, adoption sentiment, technical sentiment

4. **For policy markets**:
   - Analyze framing patterns in coverage
   - Look for narrative shifts in how issues are presented
   - Assess editorial positioning across different outlets
   - Identify which narratives are gaining/losing prominence

5. **For election markets**:
   - Compare sentiment across different news sources
   - Identify ideological balance in coverage
   - Assess if coverage is one-sided or balanced
   - Look for sentiment shifts following key events

6. **Weight sentiment by source priority and recency**:
   - More recent articles carry higher weight
   - High-credibility sources carry higher weight
   - Calculate weighted sentiment distribution
   - Identify dominant sentiment trend

7. **Identify coverage gaps and underreported angles**:
   - Look for perspectives missing from coverage
   - Identify potential blind spots in media narrative
   - Assess if important factors are being overlooked

IMPORTANT: You have a maximum of 5 tool calls. Use them wisely to gather
comprehensive sentiment data across different filters and timeframes before
making your assessment.
"""
    
    async def media_sentiment_node(state: GraphState) -> Dict[str, Any]:
        """
        Execute autonomous Media Sentiment agent.
        
        Requirements: 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
        
        Args:
            state: Current workflow state containing MBD
            
        Returns:
            State update dict with agent_signals and/or agent_errors
        """
        # Check for MBD availability (Requirement 7.3)
        mbd = state.get("mbd")
        if not mbd:
            return {
                "agent_errors": [AgentError(
                    type="EXECUTION_FAILED",
                    agent_name=AGENT_NAME,
                    message="No MarketBriefingDocument available in state"
                ).model_dump()]
            }
        
        # Check for NewsData configuration (Requirement 7.3)
        newsdata_api_key = os.getenv("NEWSDATA_API_KEY")
        if not newsdata_api_key:
            # Graceful degradation: Return low-confidence signal without tools
            from models.types import AgentSignal
            import time
            
            return {
                "agent_signals": [AgentSignal(
                    agent_name=AGENT_NAME,
                    timestamp=int(time.time()),
                    confidence=0.2,  # Very low confidence without news data
                    direction="NEUTRAL",
                    fair_probability=mbd.current_probability,
                    key_drivers=["NewsData API not configured - unable to fetch media sentiment"],
                    risk_factors=["Analysis limited without real-time news data"],
                    metadata={"newsdata_available": False}
                ).model_dump()]
            }
        
        # Initialize NewsData client (Requirement 7.3)
        newsdata_client = NewsDataClient(
            api_key=newsdata_api_key,
            base_url=os.getenv("NEWSDATA_BASE_URL", "https://newsdata.io/api/1"),
            timeout=int(os.getenv("NEWSDATA_TIMEOUT", "30")),
            is_free_tier=os.getenv("NEWSDATA_FREE_TIER", "false").lower() == "true"
        )
        
        # Initialize tool cache (Requirement 7.3)
        # Use condition_id as session_id for cache scoping
        condition_id = getattr(mbd, 'condition_id', 'unknown')
        tool_cache = ToolCache(session_id=f"{AGENT_NAME}_{condition_id}")
        
        # Create audit log for tool invocations (Requirement 7.8)
        audit_log = []
        
        # Create tool context (Requirement 7.3)
        tool_context = ToolContext(
            newsdata_client=newsdata_client,
            cache=tool_cache,
            audit_log=audit_log,
            agent_name=AGENT_NAME
        )
        
        # Create NewsData tools (Requirement 7.2)
        tools = [
            create_fetch_latest_news_tool(tool_context),
            create_fetch_archive_news_tool(tool_context),
            create_fetch_crypto_news_tool(tool_context),
            create_fetch_market_news_tool(tool_context)
        ]
        
        # Get max tool calls from config (Requirement 7.3)
        max_tool_calls = 5  # Default as per requirements
        if hasattr(config, 'autonomous_agents') and hasattr(config.autonomous_agents, 'max_tool_calls'):
            max_tool_calls = config.autonomous_agents.max_tool_calls
        
        # Create autonomous agent node (Requirement 7.1, 7.2)
        agent_node = create_autonomous_agent_node(
            agent_name=AGENT_NAME,
            system_prompt=enhanced_prompt,
            tools=tools,
            config=config,
            tool_context={"cache": tool_cache, "audit_log": audit_log}
        )
        
        # Execute agent (Requirement 7.3, 7.4, 7.5, 7.6, 7.7)
        # The autonomous_agent_factory handles:
        # - Timeout handling (Requirement 7.6)
        # - Output parsing into AgentSignal (Requirement 7.4)
        # - Tool usage metadata extraction (Requirement 7.7)
        # - Graceful degradation on tool failures (Requirement 7.5)
        # - Comprehensive audit logging (Requirement 7.8)
        result = await agent_node(state)
        
        return result
    
    return media_sentiment_node
