"""
Autonomous Agent Factory

This module provides factory functions for creating ReAct (Reasoning + Acting)
agents with tools using LangGraph. It implements the autonomous agent pattern
where agents can autonomously decide which tools to call based on market context.

The factory handles:
- Agent creation with LangGraph's create_react_agent
- Timeout handling using asyncio.wait_for
- Output parsing and validation
- Tool usage metadata extraction
- Error handling and graceful degradation

Requirements: 5.1-5.8
"""

import asyncio
import time
from typing import Any, Callable, Dict, List, Optional

from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool
from langgraph.prebuilt import create_react_agent

from models.state import GraphState
from models.types import AgentSignal


def extract_web_research_context(state: GraphState) -> Optional[str]:
    """
    Extract comprehensive web research document from state.
    
    Searches through agent_signals for the web_research agent's signal
    and extracts the research_summary from its metadata.
    
    Args:
        state: Current workflow state containing agent_signals
        
    Returns:
        Comprehensive research document string, or None if not available
    """
    agent_signals = state.get("agent_signals", [])
    
    if not agent_signals:
        return None
    
    # Find web research signal
    for signal in agent_signals:
        # Handle both dict and AgentSignal object
        if isinstance(signal, dict):
            agent_name = signal.get("agent_name")
            metadata = signal.get("metadata", {})
        else:
            agent_name = getattr(signal, "agent_name", None)
            metadata = getattr(signal, "metadata", {}) or {}
        
        # Check if this is the web research agent
        if agent_name == "web_research":
            # Extract research_summary from metadata
            research_summary = metadata.get("research_summary")
            if research_summary and isinstance(research_summary, str) and len(research_summary) > 50:
                return research_summary
    
    return None


def create_autonomous_agent(
    agent_name: str,
    system_prompt: str,
    llm: BaseChatModel,
    tools: List[BaseTool],
    max_tool_calls: int = 5,
    timeout_ms: int = 45000
) -> Callable:
    """
    Create a ReAct agent with tools using LangGraph.
    
    This function creates an autonomous agent that follows the ReAct pattern:
    1. Reason about the problem
    2. Act by calling tools
    3. Observe the results
    4. Repeat until satisfied or limit reached
    
    The agent uses LangGraph's create_react_agent which provides:
    - Automatic tool calling based on LLM reasoning
    - State management for multi-step reasoning
    - Built-in error handling for tool failures
    
    Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
    
    Args:
        agent_name: Unique identifier for the agent (e.g., "breaking_news")
        system_prompt: System prompt defining agent's role and strategy
        llm: LLM instance for reasoning (e.g., ChatOpenAI, ChatAnthropic)
        tools: List of LangChain tools available to the agent
        max_tool_calls: Maximum tool calls per analysis (default: 5)
        timeout_ms: Timeout in milliseconds (default: 45000)
        
    Returns:
        Agent executor function that can be invoked with messages
        
    Example:
        >>> agent = create_autonomous_agent(
        ...     agent_name="breaking_news",
        ...     system_prompt="You are a breaking news analyst...",
        ...     llm=llm,
        ...     tools=[fetch_latest_news_tool, fetch_archive_news_tool],
        ...     max_tool_calls=5
        ... )
        >>> result = await agent.ainvoke({"messages": [("user", "Analyze this market")]})
    """
    # Create ReAct agent using LangGraph (Requirement 5.1, 5.2)
    # Bind the system prompt to the model before creating the agent
    llm_with_system = llm.bind(system=system_prompt)
    
    agent = create_react_agent(
        model=llm_with_system,
        tools=tools
    )
    
    # Set recursion limit to prevent infinite loops (Requirement 5.5)
    # Add extra buffer for reasoning steps beyond tool calls
    # Each tool call typically requires 2-3 reasoning steps
    recursion_limit = max_tool_calls * 3 + 10
    
    # Return the agent executor with configuration
    # The agent will be invoked with config containing recursion_limit
    return agent


def create_autonomous_agent_node(
    agent_name: str,
    system_prompt: str,
    tools: List[BaseTool],
    config: Any,  # EngineConfig
    tool_context: Dict[str, Any]
) -> Callable[[GraphState], Dict[str, Any]]:
    """
    Create a LangGraph node for an autonomous agent.
    
    This wraps the ReAct agent with additional functionality:
    - Timeout handling to prevent long-running operations
    - Output parsing to extract AgentSignal from agent messages
    - Tool usage metadata extraction from audit log
    - Error handling and graceful degradation
    - Audit logging for debugging and monitoring
    
    The node function takes GraphState and returns a state update dict
    that will be merged into the workflow state.
    
    Requirements: 5.6, 5.7, 5.8
    
    Args:
        agent_name: Unique identifier for the agent
        system_prompt: System prompt defining agent's role
        tools: List of LangChain tools
        config: Engine configuration (contains LLM config, timeout settings)
        tool_context: Tool execution context (client, cache, audit log)
        
    Returns:
        Async function that takes GraphState and returns state update
        
    Example:
        >>> node = create_autonomous_agent_node(
        ...     agent_name="breaking_news",
        ...     system_prompt="You are a breaking news analyst...",
        ...     tools=[fetch_latest_news_tool],
        ...     config=engine_config,
        ...     tool_context={"cache": cache, "audit_log": []}
        ... )
        >>> state_update = await node(state)
    """
    from utils.llm_factory import create_llm_instance
    from utils.llm_rotation_manager import LLMRotationManager
    
    # Create rotation manager if multiple models configured
    rotation_manager = None
    if len(config.llm.model_names) > 1:
        # Multiple models configured - create rotation manager
        model_names_str = ",".join(config.llm.model_names)
        rotation_manager = LLMRotationManager(model_names_str)
    
    # Create LLM instance from config with optional rotation manager
    llm = create_llm_instance(config.llm, rotation_manager=rotation_manager)
    
    # Get timeout from config (default to 45 seconds)
    timeout_seconds = config.agents.timeout_ms / 1000.0
    
    # Get max tool calls from config if available, otherwise use default
    max_tool_calls = getattr(config, 'autonomous_agents', None)
    if max_tool_calls and hasattr(max_tool_calls, 'max_tool_calls'):
        max_tool_calls = max_tool_calls.max_tool_calls
    else:
        max_tool_calls = 5  # Default
    
    # Create the autonomous agent
    agent = create_autonomous_agent(
        agent_name=agent_name,
        system_prompt=system_prompt,
        llm=llm,
        tools=tools,
        max_tool_calls=max_tool_calls,
        timeout_ms=int(timeout_seconds * 1000)
    )
    
    async def agent_node(state: GraphState) -> Dict[str, Any]:
        """
        Execute autonomous agent and return state update.
        
        This function:
        1. Extracts market context from state
        2. Invokes agent with timeout handling
        3. Parses agent output into AgentSignal
        4. Extracts tool usage metadata from audit log
        5. Handles errors gracefully with fallback signals
        
        Requirements: 5.6, 5.7, 5.8
        
        Args:
            state: Current workflow state containing MBD and context
            
        Returns:
            State update dict with agent_signals and agent_errors
        """
        import logging
        logger = logging.getLogger("TradeWizard")
        
        start_time = time.time()
        
        # Get MBD from state
        mbd = state.get("mbd")
        if not mbd:
            # Return error if no MBD available
            from models.types import AgentError
            return {
                "agent_errors": [AgentError(
                    type="EXECUTION_FAILED",
                    agent_name=agent_name,
                    message="No MarketBriefingDocument available in state"
                ).model_dump()]
            }
        
        # Extract web research context (CRITICAL: Provides comprehensive external research)
        web_research_context = extract_web_research_context(state)
        if web_research_context:
            logger.info(f"Agent {agent_name}: Including web research context ({len(web_research_context)} chars)")
        else:
            logger.debug(f"Agent {agent_name}: No web research context available")
        
        # Construct user message with market context and web research
        user_message_parts = [
            f"Analyze this prediction market:",
            f"",
            f"Market ID: {mbd.market_id}",
            f"Condition ID: {mbd.condition_id}",
            f"Question: {mbd.question}",
            f"Current Probability: {mbd.current_probability:.1%}",
            f"Event Type: {mbd.event_type}",
            f"Resolution Criteria: {mbd.resolution_criteria}",
            f"Expiry: {mbd.expiry_timestamp}",
        ]
        
        # Add web research context if available
        if web_research_context:
            user_message_parts.extend([
                f"",
                f"## Web Research Context",
                f"",
                f"The following comprehensive research document was gathered from web sources to provide",
                f"detailed background, current status, and recent developments related to this market:",
                f"",
                f"---",
                web_research_context,
                f"---",
                f"",
                f"**IMPORTANT**: Use this web research context to inform your analysis. It contains",
                f"factual information from authoritative sources that should guide your assessment.",
                f"",
            ])
        
        user_message_parts.extend([
            f"",
            f"Use the available tools to gather relevant data before making your assessment.",
            f"",
            f"After your analysis, provide your final assessment in JSON format:",
            f"",
            f"```json",
            f"{{",
            f'  "direction": "YES|NO|NEUTRAL",',
            f'  "fair_probability": 0.0-1.0,',
            f'  "confidence": 0.0-1.0,',
            f'  "key_drivers": ["driver1", "driver2", "driver3"],',
            f'  "risk_factors": ["risk1", "risk2", "risk3"]',
            f"}}",
            f"```",
            f"",
            f"IMPORTANT: Your final message MUST include this JSON structure.",
        ])
        
        user_message = "\n".join(user_message_parts)
        
        try:
            # Execute agent with timeout (Requirement 5.6)
            # Set recursion limit in config
            recursion_limit = max_tool_calls * 3 + 10
            agent_config = {"recursion_limit": recursion_limit}
            
            result = await asyncio.wait_for(
                agent.ainvoke(
                    {"messages": [("user", user_message)]},
                    config=agent_config
                ),
                timeout=timeout_seconds
            )
            
            # Parse output into AgentSignal (Requirement 5.7)
            agent_signal = _parse_agent_output(
                agent_name=agent_name,
                result=result,
                mbd=mbd,
                start_time=start_time
            )
            
            # Extract tool usage metadata (Requirement 5.7)
            tool_usage = _extract_tool_usage_metadata(tool_context.get("audit_log", []))
            
            # Add tool usage to signal metadata
            if agent_signal.metadata is None:
                agent_signal.metadata = {}
            agent_signal.metadata["tool_usage"] = tool_usage
            
            # Return state update with agent signal
            return {
                "agent_signals": [agent_signal.model_dump()]
            }
            
        except asyncio.TimeoutError:
            # Handle timeout gracefully (Requirement 5.8)
            end_time = time.time()
            duration_ms = int((end_time - start_time) * 1000)
            
            # Return partial results with reduced confidence
            from models.types import AgentError
            return {
                "agent_errors": [AgentError(
                    type="TIMEOUT",
                    agent_name=agent_name,
                    message=f"Agent execution exceeded timeout of {timeout_seconds}s",
                    timeout_ms=int(timeout_seconds * 1000),
                    details={
                        "duration_ms": duration_ms,
                        "tool_calls_completed": len(tool_context.get("audit_log", []))
                    }
                ).model_dump()],
                "agent_signals": [_create_timeout_signal(
                    agent_name=agent_name,
                    mbd=mbd,
                    start_time=start_time,
                    tool_context=tool_context
                ).model_dump()]
            }
            
        except Exception as e:
            # Handle other errors gracefully (Requirement 5.8)
            from models.types import AgentError
            return {
                "agent_errors": [AgentError(
                    type="EXECUTION_FAILED",
                    agent_name=agent_name,
                    message=f"Agent execution failed: {str(e)}",
                    details={"error_type": type(e).__name__}
                ).model_dump()],
                "agent_signals": [_create_error_signal(
                    agent_name=agent_name,
                    mbd=mbd,
                    error=str(e),
                    start_time=start_time
                ).model_dump()]
            }
    
    return agent_node


# ============================================================================
# Helper Functions for Output Parsing and Error Handling
# ============================================================================

def _parse_agent_output(
    agent_name: str,
    result: Dict[str, Any],
    mbd: Any,
    start_time: float
) -> AgentSignal:
    """
    Parse agent output into AgentSignal.
    
    Extracts structured information from agent messages and converts
    to AgentSignal format. Handles various output formats and provides
    fallback values for missing fields.
    
    Args:
        agent_name: Name of the agent
        result: Agent execution result from LangGraph
        mbd: MarketBriefingDocument
        start_time: Execution start time
        
    Returns:
        AgentSignal with parsed information
    """
    import json
    import re
    import logging
    
    logger = logging.getLogger("TradeWizard")
    
    # Get final message from agent
    messages = result.get("messages", [])
    if not messages:
        # No output - return neutral signal
        return _create_neutral_signal(agent_name, mbd, start_time)
    
    # Get last AI message
    last_message = messages[-1]
    content = last_message.content if hasattr(last_message, 'content') else str(last_message)
    
    # Try to extract JSON from the content
    # Look for JSON in markdown code blocks or plain text
    json_data = None
    
    # Pattern 1: JSON in markdown code block
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
    if json_match:
        try:
            json_data = json.loads(json_match.group(1))
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON from code block: {e}")
    
    # Pattern 2: JSON in plain text
    if not json_data:
        json_match = re.search(r'\{[^{}]*"direction"[^{}]*\}', content, re.DOTALL)
        if json_match:
            try:
                json_data = json.loads(json_match.group(0))
            except json.JSONDecodeError as e:
                logger.warning(f"Failed to parse JSON from plain text: {e}")
    
    # If we successfully parsed JSON, use it
    if json_data:
        try:
            direction = json_data.get("direction", "NEUTRAL").upper()
            fair_probability = float(json_data.get("fair_probability", mbd.current_probability))
            confidence = float(json_data.get("confidence", 0.6))
            key_drivers = json_data.get("key_drivers", ["Analysis based on available data"])
            risk_factors = json_data.get("risk_factors", ["Standard market risks apply"])
            
            # Validate and clamp values
            fair_probability = max(0.0, min(1.0, fair_probability))
            confidence = max(0.0, min(1.0, confidence))
            
            # Ensure lists
            if not isinstance(key_drivers, list):
                key_drivers = [str(key_drivers)]
            if not isinstance(risk_factors, list):
                risk_factors = [str(risk_factors)]
            
            # Create AgentSignal
            return AgentSignal(
                agent_name=agent_name,
                timestamp=int(start_time),
                confidence=confidence,
                direction=direction,
                fair_probability=fair_probability,
                key_drivers=key_drivers[:5],  # Limit to 5
                risk_factors=risk_factors[:5],  # Limit to 5
                metadata={}
            )
        except Exception as e:
            logger.warning(f"Failed to parse structured JSON data: {e}")
    
    # Fallback to text parsing if JSON parsing failed
    logger.info(f"Falling back to text parsing for {agent_name}")
    direction = _extract_direction(content)
    fair_probability = _extract_probability(content, mbd.current_probability)
    confidence = _extract_confidence(content)
    key_drivers = _extract_key_drivers(content)
    risk_factors = _extract_risk_factors(content)
    
    # Create AgentSignal
    return AgentSignal(
        agent_name=agent_name,
        timestamp=int(start_time),
        confidence=confidence,
        direction=direction,
        fair_probability=fair_probability,
        key_drivers=key_drivers,
        risk_factors=risk_factors,
        metadata={}
    )


def _extract_direction(content: str) -> str:
    """Extract direction from agent output."""
    content_lower = content.lower()
    
    # Look for explicit direction statements
    if "direction: yes" in content_lower or "recommend yes" in content_lower:
        return "YES"
    elif "direction: no" in content_lower or "recommend no" in content_lower:
        return "NO"
    elif "direction: neutral" in content_lower or "no clear direction" in content_lower:
        return "NEUTRAL"
    
    # Default to neutral if unclear
    return "NEUTRAL"


def _extract_probability(content: str, current_prob: float) -> float:
    """Extract fair probability from agent output."""
    import re
    
    # Look for probability patterns
    # Pattern 1: "fair probability: 0.65" or "probability: 65%"
    prob_patterns = [
        r"fair probability[:\s]+([0-9.]+)",
        r"probability[:\s]+([0-9.]+)%",
        r"estimate[:\s]+([0-9.]+)",
    ]
    
    for pattern in prob_patterns:
        match = re.search(pattern, content.lower())
        if match:
            prob_str = match.group(1)
            prob = float(prob_str)
            # Convert percentage to decimal if needed
            if prob > 1.0:
                prob = prob / 100.0
            # Clamp to valid range
            return max(0.0, min(1.0, prob))
    
    # Default to current market probability if not found
    return current_prob


def _extract_confidence(content: str) -> float:
    """Extract confidence level from agent output."""
    import re
    
    # Look for confidence patterns
    conf_patterns = [
        r"confidence[:\s]+([0-9.]+)",
        r"confidence[:\s]+([0-9.]+)%",
    ]
    
    for pattern in conf_patterns:
        match = re.search(pattern, content.lower())
        if match:
            conf_str = match.group(1)
            conf = float(conf_str)
            # Convert percentage to decimal if needed
            if conf > 1.0:
                conf = conf / 100.0
            # Clamp to valid range
            return max(0.0, min(1.0, conf))
    
    # Default to moderate confidence
    return 0.6


def _extract_key_drivers(content: str) -> List[str]:
    """Extract key drivers from agent output."""
    drivers = []
    
    # Look for numbered lists or bullet points
    lines = content.split('\n')
    in_drivers_section = False
    
    for line in lines:
        line = line.strip()
        
        # Check if we're entering key drivers section
        if 'key driver' in line.lower() or 'main factor' in line.lower():
            in_drivers_section = True
            continue
        
        # Check if we're leaving the section
        if in_drivers_section and ('risk factor' in line.lower() or 'conclusion' in line.lower()):
            break
        
        # Extract drivers from numbered or bulleted lists
        if in_drivers_section and (line.startswith(('-', '*', '•')) or line[0:2].replace('.', '').isdigit()):
            # Remove list markers
            driver = line.lstrip('-*•0123456789. ')
            if driver and len(driver) > 10:  # Ignore very short lines
                drivers.append(driver)
    
    # If no drivers found, return generic message
    if not drivers:
        drivers = ["Analysis based on available data"]
    
    return drivers[:5]  # Limit to 5 drivers


def _extract_risk_factors(content: str) -> List[str]:
    """Extract risk factors from agent output."""
    risks = []
    
    # Look for risk factors section
    lines = content.split('\n')
    in_risks_section = False
    
    for line in lines:
        line = line.strip()
        
        # Check if we're entering risk factors section
        if 'risk factor' in line.lower() or 'potential issue' in line.lower():
            in_risks_section = True
            continue
        
        # Check if we're leaving the section
        if in_risks_section and ('conclusion' in line.lower() or 'recommendation' in line.lower()):
            break
        
        # Extract risks from numbered or bulleted lists
        if in_risks_section and (line.startswith(('-', '*', '•')) or line[0:2].replace('.', '').isdigit()):
            # Remove list markers
            risk = line.lstrip('-*•0123456789. ')
            if risk and len(risk) > 10:  # Ignore very short lines
                risks.append(risk)
    
    # If no risks found, return generic message
    if not risks:
        risks = ["Standard market risks apply"]
    
    return risks[:5]  # Limit to 5 risks


def _extract_tool_usage_metadata(audit_log: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Extract tool usage metadata from audit log.
    
    Calculates summary statistics about tool usage for inclusion
    in AgentSignal metadata.
    
    Args:
        audit_log: List of tool audit entries
        
    Returns:
        Dictionary with tool usage statistics
    """
    from tools.newsdata_tools import get_tool_usage_summary
    
    if not audit_log:
        return {
            "tools_called": 0,
            "total_tool_time": 0,
            "cache_hits": 0,
            "cache_misses": 0,
            "tool_breakdown": {}
        }
    
    return get_tool_usage_summary(audit_log)


def _create_timeout_signal(
    agent_name: str,
    mbd: Any,
    start_time: float,
    tool_context: Dict[str, Any]
) -> AgentSignal:
    """
    Create a low-confidence signal when agent times out.
    
    Returns partial results with reduced confidence and timeout indication.
    
    Args:
        agent_name: Name of the agent
        mbd: MarketBriefingDocument
        start_time: Execution start time
        tool_context: Tool execution context
        
    Returns:
        AgentSignal with timeout indication
    """
    # Extract tool usage metadata
    tool_usage = _extract_tool_usage_metadata(tool_context.get("audit_log", []))
    
    return AgentSignal(
        agent_name=agent_name,
        timestamp=int(start_time),
        confidence=0.3,  # Low confidence due to timeout
        direction="NEUTRAL",
        fair_probability=mbd.current_probability,
        key_drivers=["Analysis incomplete due to timeout"],
        risk_factors=["Insufficient time for complete analysis"],
        metadata={
            "timeout": True,
            "tool_usage": tool_usage
        }
    )


def _create_error_signal(
    agent_name: str,
    mbd: Any,
    error: str,
    start_time: float
) -> AgentSignal:
    """
    Create a low-confidence signal when agent encounters an error.
    
    Args:
        agent_name: Name of the agent
        mbd: MarketBriefingDocument
        error: Error message
        start_time: Execution start time
        
    Returns:
        AgentSignal with error indication
    """
    return AgentSignal(
        agent_name=agent_name,
        timestamp=int(start_time),
        confidence=0.2,  # Very low confidence due to error
        direction="NEUTRAL",
        fair_probability=mbd.current_probability,
        key_drivers=[f"Analysis failed: {error}"],
        risk_factors=["Agent execution error"],
        metadata={"error": error}
    )


def _create_neutral_signal(
    agent_name: str,
    mbd: Any,
    start_time: float
) -> AgentSignal:
    """
    Create a neutral signal when agent produces no output.
    
    Args:
        agent_name: Name of the agent
        mbd: MarketBriefingDocument
        start_time: Execution start time
        
    Returns:
        Neutral AgentSignal
    """
    return AgentSignal(
        agent_name=agent_name,
        timestamp=int(start_time),
        confidence=0.4,
        direction="NEUTRAL",
        fair_probability=mbd.current_probability,
        key_drivers=["No clear signal from analysis"],
        risk_factors=["Insufficient data for confident assessment"],
        metadata={}
    )
