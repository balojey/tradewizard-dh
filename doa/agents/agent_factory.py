"""Agent factory for creating LangGraph agent nodes with consistent patterns."""

import asyncio
import logging
import time
from typing import Any, Awaitable, Callable, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from config import EngineConfig
from models.state import GraphState
from models.types import AgentError, AgentMemoryContext, AgentSignal
from utils.llm_factory import create_agent_llm

logger = logging.getLogger(__name__)


def format_memory_context(
    memory_context: Optional[AgentMemoryContext],
    agent_name: str
) -> str:
    """
    Format historical memory context for injection into agent prompts.
    
    Args:
        memory_context: Historical signals for this agent
        agent_name: Name of the agent
        
    Returns:
        Formatted memory context string for prompt injection
    """
    if not memory_context or not memory_context.historical_signals:
        return "\n## Historical Context\n\nNo previous analysis available for this market."
    
    context_lines = ["\n## Historical Context"]
    context_lines.append(
        f"\nYou have analyzed this market {len(memory_context.historical_signals)} time(s) before. "
        "Here are your previous signals:\n"
    )
    
    for i, signal in enumerate(memory_context.historical_signals, 1):
        timestamp_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(signal.timestamp))
        context_lines.append(f"\n### Previous Analysis {i} ({timestamp_str})")
        context_lines.append(f"- Direction: {signal.direction}")
        context_lines.append(f"- Fair Probability: {signal.fair_probability:.2%}")
        context_lines.append(f"- Confidence: {signal.confidence:.2%}")
        context_lines.append(f"- Key Drivers: {', '.join(signal.key_drivers)}")
        context_lines.append(f"- Risk Factors: {', '.join(signal.risk_factors)}")
    
    context_lines.append(
        "\n**Note**: Use this historical context to inform your current analysis, "
        "but base your decision on the current market data provided."
    )
    
    return "\n".join(context_lines)


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


def format_market_briefing(mbd: Any, web_research_context: Optional[str] = None) -> str:
    """
    Format Market Briefing Document for agent consumption.
    
    Args:
        mbd: MarketBriefingDocument instance
        web_research_context: Optional comprehensive web research document
        
    Returns:
        Formatted market briefing string
    """
    lines = [
        "# Market Briefing Document",
        f"\n## Market Overview",
        f"- Question: {mbd.question}",
        f"- Market ID: {mbd.market_id}",
        f"- Condition ID: {mbd.condition_id}",
        f"- Event Type: {mbd.event_type}",
        f"\n## Current Market State",
        f"- Current Probability: {mbd.current_probability:.2%}",
        f"- Liquidity Score: {mbd.liquidity_score:.1f}/10",
        f"- Bid-Ask Spread: {mbd.bid_ask_spread:.2f} cents",
        f"- Volatility Regime: {mbd.volatility_regime}",
        f"- 24h Volume: ${mbd.volume_24h:,.2f}",
        f"\n## Resolution",
        f"- Criteria: {mbd.resolution_criteria}",
        f"- Expiry: {time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(mbd.expiry_timestamp))}",
    ]
    
    # Add event context if available
    if mbd.event_context:
        lines.extend([
            f"\n## Event Context",
            f"- Event: {mbd.event_context.event_title}",
            f"- Description: {mbd.event_context.event_description}",
            f"- Tags: {', '.join(mbd.event_context.tags)}",
        ])
    
    # Add keywords if available
    if mbd.keywords:
        lines.append(f"\n## Keywords")
        lines.append(f"- {', '.join(mbd.keywords)}")
    
    # Add web research context if available (CRITICAL: This provides comprehensive external context)
    if web_research_context:
        lines.extend([
            f"\n## Web Research Context",
            f"\nThe following comprehensive research document was gathered from web sources to provide",
            f"detailed background, current status, and recent developments related to this market:",
            f"\n---\n",
            web_research_context,
            f"\n---\n",
            f"\n**IMPORTANT**: Use this web research context to inform your analysis. It contains",
            f"factual information from authoritative sources that should guide your assessment.",
        ])
    
    return "\n".join(lines)


async def execute_agent_with_timeout(
    agent_fn: Callable[[], Awaitable[AgentSignal]],
    agent_name: str,
    timeout_ms: int
) -> Dict[str, Any]:
    """
    Execute an agent with timeout handling.
    
    Args:
        agent_fn: Async function that executes the agent
        agent_name: Name of the agent (for error reporting)
        timeout_ms: Timeout in milliseconds
        
    Returns:
        Dict with either agent_signals or agent_errors
    """
    try:
        signal = await asyncio.wait_for(
            agent_fn(),
            timeout=timeout_ms / 1000
        )
        return {"agent_signals": [signal]}
        
    except asyncio.TimeoutError:
        logger.warning(f"Agent {agent_name} timed out after {timeout_ms}ms")
        return {
            "agent_errors": [AgentError(
                type="TIMEOUT",
                agent_name=agent_name,
                message=f"Agent execution exceeded timeout of {timeout_ms}ms",
                timeout_ms=timeout_ms
            )]
        }
    except Exception as e:
        logger.error(f"Agent {agent_name} execution failed: {e}", exc_info=True)
        return {
            "agent_errors": [AgentError(
                type="EXECUTION_FAILED",
                agent_name=agent_name,
                message=str(e),
                details={"error_type": type(e).__name__}
            )]
        }


async def retry_with_backoff(
    agent_fn: Callable[[], Awaitable[AgentSignal]],
    agent_name: str,
    max_retries: int = 3,
    initial_delay: float = 1.0
) -> AgentSignal:
    """
    Retry agent execution with exponential backoff for invalid structured output.
    
    Args:
        agent_fn: Async function that executes the agent
        agent_name: Name of the agent (for logging)
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds (doubles each retry)
        
    Returns:
        AgentSignal from successful execution
        
    Raises:
        Exception: If all retries fail
    """
    last_error = None
    delay = initial_delay
    
    for attempt in range(max_retries):
        try:
            return await agent_fn()
        except Exception as e:
            last_error = e
            if attempt < max_retries - 1:
                logger.warning(
                    f"Agent {agent_name} attempt {attempt + 1} failed: {e}. "
                    f"Retrying in {delay}s..."
                )
                await asyncio.sleep(delay)
                delay *= 2  # Exponential backoff
            else:
                logger.error(
                    f"Agent {agent_name} failed after {max_retries} attempts"
                )
    
    raise last_error


def create_agent_node(
    agent_name: str,
    system_prompt: str,
    config: EngineConfig
) -> Callable[[GraphState], Awaitable[Dict[str, Any]]]:
    """
    Create a LangGraph node for an intelligence agent.
    
    This factory function creates agent nodes with consistent patterns:
    - Memory context formatting and injection
    - Timeout handling with graceful degradation
    - Retry logic for invalid structured output
    - Structured error handling
    - Opik tracing integration
    
    Args:
        agent_name: Unique identifier for the agent (e.g., "market_microstructure")
        system_prompt: System prompt defining agent's analysis perspective
        config: Engine configuration with LLM, timeout, and retry settings
        
    Returns:
        Async function that takes GraphState and returns state update dict
        
    Example:
        >>> from prompts import get_market_microstructure_prompt
        >>> market_microstructure_node = create_agent_node(
        ...     agent_name="market_microstructure",
        ...     system_prompt=get_market_microstructure_prompt(),
        ...     config=engine_config
        ... )
    """
    
    async def agent_node(state: GraphState) -> Dict[str, Any]:
        """
        Agent node function that analyzes market and returns AgentSignal.
        
        Args:
            state: Current workflow state with MBD and memory context
            
        Returns:
            Dict with agent_signals (on success) or agent_errors (on failure)
        """
        logger.info(f"Executing agent: {agent_name}")
        
        # Validate required state
        if not state.get("mbd"):
            logger.error(f"Agent {agent_name}: No MBD in state")
            return {
                "agent_errors": [AgentError(
                    type="EXECUTION_FAILED",
                    agent_name=agent_name,
                    message="No Market Briefing Document available in state"
                )]
            }
        
        mbd = state["mbd"]
        
        # Get memory context for this agent
        memory_context = state.get("memory_context", {}).get(agent_name)
        
        # Format memory context
        memory_str = format_memory_context(memory_context, agent_name)
        
        # Extract web research context (CRITICAL: Provides comprehensive external research)
        web_research_context = extract_web_research_context(state)
        if web_research_context:
            logger.info(f"Agent {agent_name}: Including web research context ({len(web_research_context)} chars)")
        else:
            logger.debug(f"Agent {agent_name}: No web research context available")
        
        # Format market briefing with web research context
        market_briefing = format_market_briefing(mbd, web_research_context)
        
        # Enhanced prompt with memory context and explicit instructions (matching TypeScript implementation)
        enhanced_system_prompt = f"""{system_prompt}

## Your Previous Analysis

{memory_str}

## Instructions for Using Memory Context

When you have previous analysis available:
1. Review your previous analysis before generating new analysis
2. Identify what has changed since your last analysis (market conditions, probabilities, key drivers)
3. If your view has changed significantly, explain the reasoning for the change in your key drivers
4. If your view remains consistent, acknowledge the continuity and reinforce your reasoning
5. Reference specific changes from previous analysis when relevant

Your analysis should show thoughtful evolution over time, not random fluctuation."""
        
        # Create LLM instance with structured output
        try:
            llm = create_agent_llm(
                config=config,
                agent_name=agent_name,
                output_model=AgentSignal
            )
        except Exception as e:
            logger.error(f"Failed to create LLM for agent {agent_name}: {e}")
            return {
                "agent_errors": [AgentError(
                    type="EXECUTION_FAILED",
                    agent_name=agent_name,
                    message=f"Failed to initialize LLM: {e}"
                )]
            }
        
        # Define agent execution function
        async def execute_agent() -> AgentSignal:
            """Execute the agent with retry logic."""
            messages = [
                SystemMessage(content=enhanced_system_prompt),
                HumanMessage(content=market_briefing)
            ]
            
            # Invoke LLM with structured output
            signal = await llm.ainvoke(messages)
            
            # Ensure agent_name and timestamp are set
            signal.agent_name = agent_name
            signal.timestamp = int(time.time())
            
            logger.info(
                f"Agent {agent_name} completed: "
                f"direction={signal.direction}, "
                f"fair_probability={signal.fair_probability:.2%}, "
                f"confidence={signal.confidence:.2%}"
            )
            
            return signal
        
        # Execute with retry logic
        async def execute_with_retry() -> AgentSignal:
            return await retry_with_backoff(
                execute_agent,
                agent_name=agent_name,
                max_retries=config.agents.max_retries
            )
        
        # Execute with timeout
        result = await execute_agent_with_timeout(
            execute_with_retry,
            agent_name=agent_name,
            timeout_ms=config.agents.timeout_ms
        )
        
        return result
    
    return agent_node

