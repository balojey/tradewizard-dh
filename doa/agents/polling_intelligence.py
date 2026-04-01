"""
Autonomous Polling Intelligence Agent

This agent autonomously analyzes prediction markets as polling mechanisms,
assessing market participant beliefs, information aggregation efficiency, and
crowd intelligence signals. It uses the ReAct (Reasoning + Acting) pattern
to decide which Polymarket tools to call based on market context.

The agent focuses on:
- Market as polling mechanism and crowd wisdom
- Information aggregation efficiency
- Market quality indicators (volume, liquidity, participation)
- Cross-market patterns and correlations
- Price trends and momentum analysis
- Sentiment shifts and rapid changes
- Crowd wisdom score calculation
- Market participant behavior analysis

Tool Selection Strategy:
- Start with fetch_related_markets to find cross-market patterns
- Use fetch_historical_prices for trend analysis
- Use analyze_market_momentum when volume is high
- Use detect_sentiment_shifts when volatility is high
- Use fetch_cross_market_data when related markets exist
- Calculate crowd wisdom score from market quality indicators

Requirements: 8.1-8.10
"""

import os
from typing import Dict, Any, Callable

from models.state import GraphState
from prompts import POLLING_INTELLIGENCE_PROMPT


# Agent identifier used in the workflow
AGENT_NAME = "polling_intelligence"


def create_polling_intelligence_agent_node(config: Any, polymarket_client: Any = None) -> Callable[[GraphState], Dict[str, Any]]:
    """
    Create the autonomous Polling Intelligence agent node.
    
    This function creates a LangGraph node that:
    1. Checks for MBD availability
    2. Checks for Polymarket client availability
    3. Initializes tool cache
    4. Creates Polymarket tools with audit logging
    5. Creates autonomous agent with tools
    6. Executes agent with timeout handling
    7. Parses output into AgentSignal
    8. Adds tool usage metadata
    9. Implements graceful degradation on tool failures
    10. Returns agent signal with comprehensive audit log
    
    Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
    
    Args:
        config: Engine configuration containing LLM and agent settings
        polymarket_client: PolymarketClient instance for making API requests
        
    Returns:
        Async function that takes GraphState and returns state update
        
    Example:
        >>> node = create_polling_intelligence_agent_node(config, polymarket_client)
        >>> state_update = await node(state)
    """
    from agents.autonomous_agent_factory import create_autonomous_agent_node
    from tools.polymarket_tools import (
        create_fetch_related_markets_tool,
        create_fetch_historical_prices_tool,
        create_fetch_cross_market_data_tool,
        create_analyze_market_momentum_tool,
        create_detect_sentiment_shifts_tool,
        ToolContext
    )
    from utils.tool_cache import ToolCache
    from models.types import AgentError
    
    # Enhanced system prompt with tool selection strategy
    enhanced_prompt = POLLING_INTELLIGENCE_PROMPT + """

CRITICAL: TOOL PARAMETER REQUIREMENTS

When calling tools, you MUST use the condition_id provided in the market briefing.
The condition_id is a unique identifier for this market on Polymarket.

Example:
- Market Question: "Will the Fed raise rates in 2026?"
- Condition ID: "0x1234567890abcdef..."
- CORRECT: fetch_related_markets(condition_id="0x1234567890abcdef...")
- WRONG: fetch_related_markets(condition_id="Will the Fed raise rates in 2026?")

AUTONOMOUS TOOL USAGE STRATEGY:

You have access to Polymarket tools to analyze market dynamics and crowd wisdom. Use them strategically:

1. **Start with fetch_related_markets** - Find cross-market patterns and context
   - Use the condition_id from the market briefing
   - Identify related markets that provide additional signals
   - Look for correlation patterns across similar questions
   - Assess if related markets show consistent or conflicting signals
   - Use related market data to validate or challenge current market pricing

2. **Use fetch_historical_prices** - Analyze price trends and patterns
   - Use the condition_id from the market briefing
   - Examine price movements over different timeframes (1d, 7d, 30d)
   - Identify trend direction (upward, downward, sideways)
   - Assess trend strength and consistency
   - Look for inflection points or regime changes
   - Calculate rate of change and acceleration

3. **Use analyze_market_momentum** - Detect momentum when volume is high
   - Use the condition_id from the market briefing
   - Calculate momentum indicators from price and volume data
   - Identify if market is gaining or losing momentum
   - Assess if current momentum is sustainable
   - Look for momentum divergences (price vs volume)
   - Use momentum to gauge conviction level of market participants

4. **Use detect_sentiment_shifts** - Identify rapid changes when volatility is high
   - Use the condition_id from the market briefing
   - Detect sudden price movements above threshold (default 5%)
   - Identify catalysts for sentiment shifts
   - Assess if shifts are temporary or sustained
   - Look for volatility clustering patterns
   - Evaluate if shifts represent new information or noise

5. **Use fetch_cross_market_data** - Compare when related markets exist
   - Use condition_ids from the market briefing and related markets
   - Fetch data for multiple related markets simultaneously
   - Calculate correlation coefficients between markets
   - Identify arbitrage opportunities or inconsistencies
   - Assess if markets are pricing similar events consistently
   - Look for lead-lag relationships between markets

6. **Calculate crowd wisdom score** - Assess market quality
   - Volume: Higher volume indicates more participation and information
   - Liquidity: Better liquidity suggests more efficient pricing
   - Participation: More unique participants increases wisdom of crowds
   - Consistency: Stable prices suggest consensus, volatility suggests uncertainty
   - Cross-market coherence: Consistent pricing across related markets
   - Combine indicators into overall crowd wisdom score (0.0-1.0)

TOOL SELECTION LOGIC:

- **Always start with fetch_related_markets** to understand context (use condition_id)
- **Use fetch_historical_prices** for all markets to understand trends (use condition_id)
- **Use analyze_market_momentum** when:
  - Volume is above average (indicates active trading)
  - You need to assess conviction level
  - Trend direction is unclear from price alone
- **Use detect_sentiment_shifts** when:
  - Recent volatility is high (price changes > 5%)
  - You need to identify catalysts for changes
  - Market appears to be reacting to new information
- **Use fetch_cross_market_data** when:
  - Related markets exist (found via fetch_related_markets)
  - You need to validate pricing consistency
  - Looking for arbitrage or inconsistencies

IMPORTANT: You have a maximum of 5 tool calls. Use them wisely to gather
comprehensive market intelligence before making your assessment. Prioritize
tools based on market characteristics (volume, volatility, related markets).
"""
    
    async def polling_intelligence_node(state: GraphState) -> Dict[str, Any]:
        """
        Execute autonomous Polling Intelligence agent.
        
        Requirements: 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
        
        Args:
            state: Current workflow state containing MBD
            
        Returns:
            State update dict with agent_signals and/or agent_errors
        """
        # Check for MBD availability (Requirement 8.3)
        mbd = state.get("mbd")
        if not mbd:
            return {
                "agent_errors": [AgentError(
                    type="EXECUTION_FAILED",
                    agent_name=AGENT_NAME,
                    message="No MarketBriefingDocument available in state"
                ).model_dump()]
            }
        
        # Check for Polymarket client availability (Requirement 8.3)
        if polymarket_client is None:
            # Graceful degradation: Return low-confidence signal without tools
            from models.types import AgentSignal
            import time
            
            return {
                "agent_signals": [AgentSignal(
                    agent_name=AGENT_NAME,
                    timestamp=int(time.time()),
                    confidence=0.2,  # Very low confidence without Polymarket data
                    direction="NEUTRAL",
                    fair_probability=mbd.current_probability,
                    key_drivers=["Polymarket client not available - unable to fetch market intelligence"],
                    risk_factors=["Analysis limited without market data access"],
                    metadata={"polymarket_available": False}
                ).model_dump()]
            }
        
        # Initialize tool cache (Requirement 8.3)
        # Use condition_id as session_id for cache scoping
        condition_id = getattr(mbd, 'condition_id', 'unknown')
        tool_cache = ToolCache(session_id=f"{AGENT_NAME}_{condition_id}")
        
        # Create audit log for tool invocations (Requirement 8.8)
        audit_log = []
        
        # Create tool context (Requirement 8.3)
        tool_context = ToolContext(
            newsdata_client=None,  # Not used for Polymarket tools
            polymarket_client=polymarket_client,
            cache=tool_cache,
            audit_log=audit_log,
            agent_name=AGENT_NAME
        )
        
        # Create Polymarket tools (Requirement 8.2)
        tools = [
            create_fetch_related_markets_tool(tool_context),
            create_fetch_historical_prices_tool(tool_context),
            create_fetch_cross_market_data_tool(tool_context),
            create_analyze_market_momentum_tool(tool_context),
            create_detect_sentiment_shifts_tool(tool_context)
        ]
        
        # DEBUG: Log tool information
        import logging
        logger = logging.getLogger("TradeWizard")
        logger.info(f"[{AGENT_NAME}] Created {len(tools)} tools:")
        for tool in tools:
            logger.info(f"  - {tool.name}: {tool.description[:80]}...")
            logger.info(f"    Tool type: {type(tool)}")
            logger.info(f"    Has coroutine: {hasattr(tool, 'coroutine')}")
        
        # Get max tool calls from config (Requirement 8.3)
        max_tool_calls = 5  # Default as per requirements
        if hasattr(config, 'autonomous_agents') and hasattr(config.autonomous_agents, 'max_tool_calls'):
            max_tool_calls = config.autonomous_agents.max_tool_calls
        
        # Create autonomous agent node (Requirement 8.1, 8.2)
        agent_node = create_autonomous_agent_node(
            agent_name=AGENT_NAME,
            system_prompt=enhanced_prompt,
            tools=tools,
            config=config,
            tool_context={"cache": tool_cache, "audit_log": audit_log}
        )
        
        # Execute agent (Requirement 8.3, 8.4, 8.5, 8.6, 8.7)
        # The autonomous_agent_factory handles:
        # - Timeout handling (Requirement 8.6)
        # - Output parsing into AgentSignal (Requirement 8.4)
        # - Tool usage metadata extraction (Requirement 8.7)
        # - Graceful degradation on tool failures (Requirement 8.5)
        # - Comprehensive audit logging (Requirement 8.8)
        result = await agent_node(state)
        
        return result
    
    return polling_intelligence_node
