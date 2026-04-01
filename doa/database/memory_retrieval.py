"""Memory retrieval service for agent historical context."""

import asyncio
import logging
from typing import Dict, List
from datetime import datetime

from models.types import AgentSignal, AgentMemoryContext
from database.persistence import PersistenceLayer
from utils.result import Result, Ok, Err

logger = logging.getLogger(__name__)


async def query_agent_memory(
    persistence: PersistenceLayer,
    condition_id: str,
    agent_name: str,
    max_signals: int = 3,
    timeout_ms: int = 5000
) -> Result[List[AgentSignal], str]:
    """
    Query historical signals for a specific agent and market.
    
    This function retrieves past agent signals to provide memory context
    for the agent's current analysis. It includes timeout handling to
    prevent slow queries from blocking the workflow.
    
    Args:
        persistence: Persistence layer instance
        condition_id: Market condition ID
        agent_name: Name of the agent to query history for
        max_signals: Maximum number of historical signals to retrieve
        timeout_ms: Query timeout in milliseconds
        
    Returns:
        Ok(signals) on success with list of historical signals
        Err(message) on failure or timeout
        
    Examples:
        >>> result = await query_agent_memory(
        ...     persistence,
        ...     "0xabc123",
        ...     "market_microstructure",
        ...     max_signals=3,
        ...     timeout_ms=5000
        ... )
        >>> if result.is_ok():
        ...     signals = result.unwrap()
        ...     print(f"Retrieved {len(signals)} historical signals")
    """
    try:
        # Execute query with timeout
        signals_result = await asyncio.wait_for(
            persistence.get_historical_signals(
                condition_id=condition_id,
                agent_name=agent_name,
                limit=max_signals
            ),
            timeout=timeout_ms / 1000.0
        )
        
        if signals_result.is_err():
            error_msg = signals_result.unwrap_err()
            logger.warning(
                f"Failed to retrieve memory for {agent_name}: {error_msg}"
            )
            return Err(error_msg)
        
        signals = signals_result.unwrap()
        logger.info(
            f"Retrieved {len(signals)} historical signals for {agent_name} "
            f"on market {condition_id}"
        )
        
        return Ok(signals)
    
    except asyncio.TimeoutError:
        error_msg = (
            f"Memory query timeout for {agent_name} after {timeout_ms}ms"
        )
        logger.warning(error_msg)
        return Err(error_msg)
    
    except Exception as e:
        error_msg = f"Unexpected error querying memory for {agent_name}: {e}"
        logger.error(error_msg)
        return Err(error_msg)


def format_memory_context(
    agent_name: str,
    condition_id: str,
    market_id: str,
    historical_signals: List[AgentSignal]
) -> AgentMemoryContext:
    """
    Format historical signals into memory context for an agent.
    
    This function structures the historical signals into a format
    that can be easily injected into agent prompts.
    
    Args:
        agent_name: Name of the agent
        condition_id: Market condition ID
        market_id: Market ID
        historical_signals: List of historical agent signals
        
    Returns:
        AgentMemoryContext with formatted historical data
        
    Examples:
        >>> signals = [
        ...     AgentSignal(
        ...         agent_name="market_microstructure",
        ...         timestamp=1234567890,
        ...         confidence=0.8,
        ...         direction="YES",
        ...         fair_probability=0.65,
        ...         key_drivers=["Strong order flow"],
        ...         risk_factors=["Low liquidity"],
        ...         metadata={}
        ...     )
        ... ]
        >>> context = format_memory_context(
        ...     "market_microstructure",
        ...     "0xabc123",
        ...     "market-123",
        ...     signals
        ... )
        >>> print(context.agent_name)
        market_microstructure
    """
    return AgentMemoryContext(
        agent_name=agent_name,
        historical_signals=historical_signals,
        market_id=market_id,
        condition_id=condition_id
    )


async def query_all_agent_memories(
    persistence: PersistenceLayer,
    condition_id: str,
    market_id: str,
    agent_names: List[str],
    max_signals: int = 3,
    timeout_ms: int = 5000
) -> Dict[str, AgentMemoryContext]:
    """
    Query historical signals for multiple agents in parallel.
    
    This function retrieves memory context for all specified agents
    concurrently to minimize latency. Failed queries return empty
    memory context rather than blocking the workflow.
    
    Args:
        persistence: Persistence layer instance
        condition_id: Market condition ID
        market_id: Market ID
        agent_names: List of agent names to query
        max_signals: Maximum signals per agent
        timeout_ms: Query timeout per agent in milliseconds
        
    Returns:
        Dictionary mapping agent names to their memory contexts
        
    Examples:
        >>> memory_contexts = await query_all_agent_memories(
        ...     persistence,
        ...     "0xabc123",
        ...     "market-123",
        ...     ["market_microstructure", "probability_baseline"],
        ...     max_signals=3,
        ...     timeout_ms=5000
        ... )
        >>> print(len(memory_contexts))
        2
    """
    memory_contexts: Dict[str, AgentMemoryContext] = {}
    
    # Query all agents in parallel
    tasks = [
        query_agent_memory(
            persistence,
            condition_id,
            agent_name,
            max_signals,
            timeout_ms
        )
        for agent_name in agent_names
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Process results
    for agent_name, result in zip(agent_names, results):
        # Handle exceptions from gather
        if isinstance(result, Exception):
            logger.warning(
                f"Exception querying memory for {agent_name}: {result}"
            )
            # Create empty memory context
            memory_contexts[agent_name] = format_memory_context(
                agent_name,
                condition_id,
                market_id,
                []
            )
            continue
        
        # Handle Result type
        if result.is_ok():
            signals = result.unwrap()
            memory_contexts[agent_name] = format_memory_context(
                agent_name,
                condition_id,
                market_id,
                signals
            )
        else:
            # Query failed, use empty memory context
            logger.warning(
                f"Failed to retrieve memory for {agent_name}: "
                f"{result.unwrap_err()}"
            )
            memory_contexts[agent_name] = format_memory_context(
                agent_name,
                condition_id,
                market_id,
                []
            )
    
    logger.info(
        f"Retrieved memory contexts for {len(memory_contexts)} agents "
        f"on market {condition_id}"
    )
    
    return memory_contexts


def format_memory_for_prompt(memory_context: AgentMemoryContext) -> str:
    """
    Format memory context into a string for injection into agent prompts.
    
    This function converts the structured memory context into a
    human-readable format that can be included in the agent's
    system prompt or user message.
    
    Args:
        memory_context: Agent memory context to format
        
    Returns:
        Formatted string describing historical signals
        
    Examples:
        >>> context = AgentMemoryContext(
        ...     agent_name="market_microstructure",
        ...     historical_signals=[
        ...         AgentSignal(
        ...             agent_name="market_microstructure",
        ...             timestamp=1234567890,
        ...             confidence=0.8,
        ...             direction="YES",
        ...             fair_probability=0.65,
        ...             key_drivers=["Strong order flow"],
        ...             risk_factors=["Low liquidity"],
        ...             metadata={}
        ...         )
        ...     ],
        ...     market_id="market-123",
        ...     condition_id="0xabc123"
        ... )
        >>> prompt = format_memory_for_prompt(context)
        >>> print("Previous analysis:" in prompt)
        True
    """
    if not memory_context.historical_signals:
        return "No previous analysis available for this market."
    
    lines = [
        f"Previous analysis by {memory_context.agent_name}:",
        ""
    ]
    
    for i, signal in enumerate(memory_context.historical_signals, 1):
        # Format timestamp
        timestamp_str = datetime.fromtimestamp(signal.timestamp).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        
        lines.extend([
            f"Analysis #{i} ({timestamp_str}):",
            f"  Direction: {signal.direction}",
            f"  Fair Probability: {signal.fair_probability:.2%}",
            f"  Confidence: {signal.confidence:.2%}",
            f"  Key Drivers: {', '.join(signal.key_drivers)}",
            f"  Risk Factors: {', '.join(signal.risk_factors)}",
            ""
        ])
    
    return "\n".join(lines)
