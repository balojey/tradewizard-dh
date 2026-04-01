"""Memory retrieval node for LangGraph workflow."""

import logging
import time
from typing import Any, Dict

from models.state import GraphState
from models.types import AuditEntry, AgentMemoryContext
from database.persistence import PersistenceLayer
from database.memory_retrieval import query_all_agent_memories
from config import EngineConfig

logger = logging.getLogger(__name__)


async def memory_retrieval_node(
    state: GraphState,
    persistence: PersistenceLayer,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Retrieve historical agent signals for memory context.
    
    This node queries the database for past agent signals on the same
    market, providing agents with historical context for their analysis.
    It executes after market ingestion and before agent execution.
    
    The node:
    1. Checks if memory system is enabled
    2. Determines which agents will be active (or queries all known agents)
    3. Retrieves historical signals for each agent in parallel
    4. Formats memory contexts and adds to state
    5. Handles failures gracefully (empty memory on errors)
    
    Args:
        state: Current workflow state with condition_id and mbd
        persistence: Persistence layer for database queries
        config: Engine configuration with memory settings
        
    Returns:
        State update with memory_context populated and audit entry
        
    State Requirements:
        - condition_id: Market condition ID (required)
        - mbd: Market briefing document (required for market_id)
        - active_agents: List of agent names (optional, will query all if missing)
        
    State Updates:
        - memory_context: Dict mapping agent names to AgentMemoryContext
        - audit_log: Audit entry for memory retrieval stage
        
    Examples:
        >>> state = {
        ...     "condition_id": "0xabc123",
        ...     "mbd": MarketBriefingDocument(...),
        ...     "active_agents": ["market_microstructure", "probability_baseline"]
        ... }
        >>> result = await memory_retrieval_node(state, persistence, config)
        >>> print(len(result["memory_context"]))
        2
    """
    start_time = time.time()
    
    # Extract required state
    condition_id = state.get("condition_id")
    mbd = state.get("mbd")
    
    # Validate required state
    if not condition_id:
        logger.error("Memory retrieval node called without condition_id")
        return {
            "memory_context": {},
            "audit_log": [AuditEntry(
                stage="memory_retrieval",
                timestamp=int(time.time()),
                status="failed",
                details={"error": "Missing condition_id"}
            )]
        }
    
    if not mbd:
        logger.warning(
            f"Memory retrieval node called without MBD for {condition_id}"
        )
        return {
            "memory_context": {},
            "audit_log": [AuditEntry(
                stage="memory_retrieval",
                timestamp=int(time.time()),
                status="failed",
                details={"error": "Missing market briefing document"}
            )]
        }
    
    # Check if memory system is enabled
    if not config.memory_system.enable_memory:
        logger.info("Memory system disabled, skipping memory retrieval")
        return {
            "memory_context": {},
            "audit_log": [AuditEntry(
                stage="memory_retrieval",
                timestamp=int(time.time()),
                status="completed",
                details={"memory_enabled": False}
            )]
        }
    
    # Determine which agents to query
    # If active_agents is already set, use that list
    # Otherwise, query for all known agent types
    active_agents = state.get("active_agents", [])
    
    if not active_agents:
        # Default to all possible agents if not yet determined
        # This list should match the agents that will be selected
        # In practice, dynamic_agent_selection runs before this,
        # but we provide a fallback
        active_agents = _get_all_agent_names(config)
        logger.info(
            f"No active agents specified, querying memory for all {len(active_agents)} agents"
        )
    
    logger.info(
        f"Retrieving memory context for {len(active_agents)} agents "
        f"on market {condition_id}"
    )
    
    try:
        # Query historical signals for all agents in parallel
        memory_contexts = await query_all_agent_memories(
            persistence=persistence,
            condition_id=condition_id,
            market_id=mbd.market_id,
            agent_names=active_agents,
            max_signals=config.memory_system.max_historical_signals,
            timeout_ms=config.memory_system.memory_timeout_ms
        )
        
        # Calculate statistics
        total_signals = sum(
            len(ctx.historical_signals)
            for ctx in memory_contexts.values()
        )
        
        agents_with_memory = sum(
            1 for ctx in memory_contexts.values()
            if ctx.historical_signals
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"Memory retrieval completed in {duration_ms}ms: "
            f"{total_signals} signals from {agents_with_memory}/{len(active_agents)} agents"
        )
        
        return {
            "memory_context": memory_contexts,
            "audit_log": [AuditEntry(
                stage="memory_retrieval",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "agents_queried": len(active_agents),
                    "agents_with_memory": agents_with_memory,
                    "total_signals": total_signals,
                    "max_signals_per_agent": config.memory_system.max_historical_signals
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Memory retrieval failed after {duration_ms}ms: {e}")
        
        # Return empty memory contexts on failure
        # This allows the workflow to continue without memory
        empty_contexts = {
            agent_name: AgentMemoryContext(
                agent_name=agent_name,
                historical_signals=[],
                market_id=mbd.market_id,
                condition_id=condition_id
            )
            for agent_name in active_agents
        }
        
        return {
            "memory_context": empty_contexts,
            "audit_log": [AuditEntry(
                stage="memory_retrieval",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e),
                    "fallback": "empty_memory_contexts"
                }
            )]
        }


def _get_all_agent_names(config: EngineConfig) -> list[str]:
    """
    Get list of all possible agent names based on configuration.
    
    This function returns the names of all agents that could potentially
    be activated, based on which agent categories are enabled in config.
    
    Args:
        config: Engine configuration
        
    Returns:
        List of agent names
    """
    agent_names = []
    
    # MVP agents (always included if enabled)
    if config.agents.enable_mvp_agents:
        agent_names.extend([
            "market_microstructure",
            "probability_baseline",
            "risk_assessment"
        ])
    
    # Event Intelligence agents
    if config.agents.enable_event_intelligence:
        agent_names.extend([
            "breaking_news",
            "event_impact"
        ])
    
    # Polling & Statistical agents
    if config.agents.enable_polling_statistical:
        agent_names.extend([
            "polling_intelligence",
            "historical_pattern"
        ])
    
    # Sentiment & Narrative agents
    if config.agents.enable_sentiment_narrative:
        agent_names.extend([
            "media_sentiment",
            "social_sentiment",
            "narrative_velocity"
        ])
    
    # Price Action agents
    if config.agents.enable_price_action:
        agent_names.extend([
            "momentum",
            "mean_reversion"
        ])
    
    # Event Scenario agents
    if config.agents.enable_event_scenario:
        agent_names.extend([
            "catalyst",
            "tail_risk"
        ])
    
    return agent_names


def create_memory_retrieval_node(
    persistence: PersistenceLayer,
    config: EngineConfig
):
    """
    Factory function to create memory retrieval node with dependencies.
    
    This factory pattern allows the node to be created with the required
    dependencies (persistence layer and config) while maintaining the
    standard LangGraph node signature.
    
    Args:
        persistence: Persistence layer instance
        config: Engine configuration
        
    Returns:
        Async function that takes state and returns state update
        
    Examples:
        >>> persistence = PersistenceLayer(supabase_client)
        >>> config = load_config()
        >>> node = create_memory_retrieval_node(persistence, config)
        >>> result = await node(state)
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await memory_retrieval_node(state, persistence, config)
    
    return node
