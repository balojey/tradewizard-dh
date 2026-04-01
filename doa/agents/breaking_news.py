"""
Autonomous Breaking News Agent

This agent autonomously fetches and analyzes breaking news developments that could
materially impact prediction market outcomes. It uses the ReAct (Reasoning + Acting)
pattern to decide which NewsData tools to call based on market context.

The agent focuses on:
- Breaking news developments and real-time updates
- Information velocity and propagation speed (articles per hour)
- Source credibility and verification status
- Market-moving potential of new information
- News sentiment and directional implications
- Breaking news themes by clustering keywords

Tool Selection Strategy:
- For all markets: Start with fetch_latest_news (1h timeframe)
- For election markets: Use candidate names in queryInTitle, add country filters
- For crypto markets: Use fetch_crypto_news with coin symbols
- For policy markets: Use keywords like "bill", "legislation", "vote"
- For company markets: Use fetch_market_news with organization names

Requirements: 6.1-6.10
"""

import os
from typing import Dict, Any, Callable

from models.state import GraphState
from prompts import BREAKING_NEWS_PROMPT


# Agent identifier used in the workflow
AGENT_NAME = "breaking_news"


def create_breaking_news_agent_node(config: Any) -> Callable[[GraphState], Dict[str, Any]]:
    """
    Create the autonomous Breaking News agent node.
    
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
    
    Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
    
    Args:
        config: Engine configuration containing LLM and agent settings
        
    Returns:
        Async function that takes GraphState and returns state update
        
    Example:
        >>> node = create_breaking_news_agent_node(config)
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
    
    # Enhanced system prompt with tool selection strategy
    enhanced_prompt = BREAKING_NEWS_PROMPT + """

AUTONOMOUS TOOL USAGE STRATEGY:

You have access to NewsData tools to fetch real-time news. Use them strategically:

1. **Start with fetch_latest_news (1h timeframe)** - Get the most recent breaking news
   - Use queryInTitle with key terms from the market question for precision
   - Calculate breaking news velocity: articles per hour
   - Flag high activity when velocity > 5 articles/hour

2. **For election markets**:
   - Use candidate names in queryInTitle parameter
   - Add country filters (e.g., country=['us'] for US elections)
   - Look for polling, endorsements, campaign events

3. **For crypto markets**:
   - Use fetch_crypto_news with coin symbols
   - Monitor for exchange news, regulatory announcements, major transactions

4. **For policy markets**:
   - Use keywords like "bill", "legislation", "vote", "congress", "senate"
   - Look for committee votes, floor votes, executive actions

5. **For company markets**:
   - Use fetch_market_news with organization names
   - Monitor earnings, acquisitions, regulatory filings

6. **Identify breaking news themes**:
   - Cluster keywords from article titles
   - Identify common themes across multiple sources
   - Assess if news is accelerating or decelerating

IMPORTANT: You have a maximum of 5 tool calls. Use them wisely to gather the most
relevant breaking news data before making your assessment.
"""
    
    async def breaking_news_node(state: GraphState) -> Dict[str, Any]:
        """
        Execute autonomous Breaking News agent.
        
        Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8
        
        Args:
            state: Current workflow state containing MBD
            
        Returns:
            State update dict with agent_signals and/or agent_errors
        """
        # Check for MBD availability (Requirement 6.3)
        mbd = state.get("mbd")
        if not mbd:
            return {
                "agent_errors": [AgentError(
                    type="EXECUTION_FAILED",
                    agent_name=AGENT_NAME,
                    message="No MarketBriefingDocument available in state"
                ).model_dump()]
            }
        
        # Check for NewsData configuration (Requirement 6.3)
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
                    key_drivers=["NewsData API not configured - unable to fetch breaking news"],
                    risk_factors=["Analysis limited without real-time news data"],
                    metadata={"newsdata_available": False}
                ).model_dump()]
            }
        
        # Initialize NewsData client (Requirement 6.3)
        newsdata_client = NewsDataClient(
            api_key=newsdata_api_key,
            base_url=os.getenv("NEWSDATA_BASE_URL", "https://newsdata.io/api/1"),
            timeout=int(os.getenv("NEWSDATA_TIMEOUT", "30")),
            is_free_tier=os.getenv("NEWSDATA_FREE_TIER", "false").lower() == "true"
        )
        
        # Initialize tool cache (Requirement 6.3)
        # Use condition_id as session_id for cache scoping
        condition_id = getattr(mbd, 'condition_id', 'unknown')
        tool_cache = ToolCache(session_id=f"{AGENT_NAME}_{condition_id}")
        
        # Create audit log for tool invocations (Requirement 6.8)
        audit_log = []
        
        # Create tool context (Requirement 6.3)
        tool_context = ToolContext(
            newsdata_client=newsdata_client,
            cache=tool_cache,
            audit_log=audit_log,
            agent_name=AGENT_NAME
        )
        
        # Create NewsData tools (Requirement 6.2)
        tools = [
            create_fetch_latest_news_tool(tool_context),
            create_fetch_archive_news_tool(tool_context),
            create_fetch_crypto_news_tool(tool_context),
            create_fetch_market_news_tool(tool_context)
        ]
        
        # Get max tool calls from config (Requirement 6.3)
        max_tool_calls = 5  # Default as per requirements
        if hasattr(config, 'autonomous_agents') and hasattr(config.autonomous_agents, 'max_tool_calls'):
            max_tool_calls = config.autonomous_agents.max_tool_calls
        
        # Create autonomous agent node (Requirement 6.1, 6.2)
        agent_node = create_autonomous_agent_node(
            agent_name=AGENT_NAME,
            system_prompt=enhanced_prompt,
            tools=tools,
            config=config,
            tool_context={"cache": tool_cache, "audit_log": audit_log}
        )
        
        # Execute agent (Requirement 6.3, 6.4, 6.5, 6.6, 6.7)
        # The autonomous_agent_factory handles:
        # - Timeout handling (Requirement 6.6)
        # - Output parsing into AgentSignal (Requirement 6.4)
        # - Tool usage metadata extraction (Requirement 6.7)
        # - Graceful degradation on tool failures (Requirement 6.5)
        # - Comprehensive audit logging (Requirement 6.8)
        result = await agent_node(state)
        
        return result
    
    return breaking_news_node
