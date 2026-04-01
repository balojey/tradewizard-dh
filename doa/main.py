"""
TradeWizard DOA - Market Analysis Workflow

This module implements the main LangGraph workflow for analyzing prediction markets
on Polymarket using specialized AI agents. The workflow orchestrates:

1. Market data ingestion from Polymarket
2. Historical memory retrieval for agent context
3. Keyword extraction for dynamic agent selection
4. Parallel execution of specialized intelligence agents
5. Signal fusion and thesis construction
6. Cross-examination and consensus building
7. Trade recommendation generation

Based on TradeWizard's multi-agent architecture, ported to Python and Digital Ocean's
Gradient AI Platform.
"""

import asyncio
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from gradient_adk import entrypoint
from langgraph.graph import StateGraph, START, END
from langgraph.types import Send
from langgraph.checkpoint.memory import MemorySaver

# Configure Opik at module level
try:
    import opik
    opik.configure()
except Exception as e:
    logging.warning(f"Failed to configure Opik: {e}")

# Optional PostgreSQL checkpointer
try:
    from langgraph.checkpoint.postgres import PostgresSaver
except ImportError:
    PostgresSaver = None

from config import EngineConfig, load_config
from models.state import GraphState
from models.types import AnalysisResult, AuditEntry
from tools.polymarket_client import PolymarketClient
from database.supabase_client import SupabaseClient
from database.persistence import PersistenceLayer

# Import node factories
from nodes.market_ingestion import create_market_ingestion_node
from nodes.memory_retrieval import create_memory_retrieval_node
from nodes.web_research_agent import web_research_agent_node
from nodes.keyword_extraction import create_keyword_extraction_node
from nodes.dynamic_agent_selection import create_dynamic_agent_selection_node
from nodes.agent_signal_fusion import create_agent_signal_fusion_node
from nodes.thesis_construction import create_thesis_construction_node
from nodes.cross_examination import create_cross_examination_node
from nodes.consensus_engine import create_consensus_engine_node
from nodes.recommendation_generation import create_recommendation_generation_node

# Import agent factory and agent modules
from agents.agent_factory import create_agent_node
from agents import (
    market_microstructure,
    probability_baseline,
    risk_assessment,
    breaking_news,
    event_impact,
    polling_intelligence,
    historical_pattern,
    media_sentiment,
    social_sentiment,
    narrative_velocity,
    momentum,
    mean_reversion,
    catalyst,
    tail_risk,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("TradeWizard")


# ============================================================================
# AGENT NODE CREATION
# ============================================================================

def create_all_agent_nodes(config: EngineConfig, polymarket_client: PolymarketClient) -> Dict[str, Any]:
    """
    Create all agent nodes using the agent factory.
    
    This function creates agent nodes for all available intelligence agents,
    each with their specific system prompt and configuration.
    
    Args:
        config: Engine configuration
        polymarket_client: Polymarket client instance for agents that need it
        
    Returns:
        Dictionary mapping agent names to their node functions
    """
    agent_nodes = {}
    
    # MVP Agents
    if config.agents.enable_mvp_agents:
        agent_nodes['market_microstructure'] = create_agent_node(
            agent_name=market_microstructure.AGENT_NAME,
            system_prompt=market_microstructure.SYSTEM_PROMPT,
            config=config
        )
        agent_nodes['probability_baseline'] = create_agent_node(
            agent_name=probability_baseline.AGENT_NAME,
            system_prompt=probability_baseline.SYSTEM_PROMPT,
            config=config
        )
        agent_nodes['risk_assessment'] = create_agent_node(
            agent_name=risk_assessment.AGENT_NAME,
            system_prompt=risk_assessment.SYSTEM_PROMPT,
            config=config
        )
    
    # Event Intelligence Agents
    if config.agents.enable_event_intelligence:
        # Use autonomous breaking news agent
        agent_nodes['breaking_news'] = breaking_news.create_breaking_news_agent_node(config)
        agent_nodes['event_impact'] = create_agent_node(
            agent_name=event_impact.AGENT_NAME,
            system_prompt=event_impact.SYSTEM_PROMPT,
            config=config
        )
    
    # Polling & Statistical Agents
    if config.agents.enable_polling_statistical:
        # Use autonomous polling intelligence agent
        agent_nodes['polling_intelligence'] = polling_intelligence.create_polling_intelligence_agent_node(config, polymarket_client)
        agent_nodes['historical_pattern'] = create_agent_node(
            agent_name=historical_pattern.AGENT_NAME,
            system_prompt=historical_pattern.SYSTEM_PROMPT,
            config=config
        )
    
    # Sentiment & Narrative Agents
    if config.agents.enable_sentiment_narrative:
        # Use autonomous media sentiment agent
        agent_nodes['media_sentiment'] = media_sentiment.create_media_sentiment_agent_node(config)
        agent_nodes['social_sentiment'] = create_agent_node(
            agent_name=social_sentiment.AGENT_NAME,
            system_prompt=social_sentiment.SYSTEM_PROMPT,
            config=config
        )
        agent_nodes['narrative_velocity'] = create_agent_node(
            agent_name=narrative_velocity.AGENT_NAME,
            system_prompt=narrative_velocity.SYSTEM_PROMPT,
            config=config
        )
    
    # Price Action Agents
    if config.agents.enable_price_action:
        agent_nodes['momentum'] = create_agent_node(
            agent_name=momentum.AGENT_NAME,
            system_prompt=momentum.SYSTEM_PROMPT,
            config=config
        )
        agent_nodes['mean_reversion'] = create_agent_node(
            agent_name=mean_reversion.AGENT_NAME,
            system_prompt=mean_reversion.SYSTEM_PROMPT,
            config=config
        )
    
    # Event Scenario Agents
    if config.agents.enable_event_scenario:
        agent_nodes['catalyst'] = create_agent_node(
            agent_name=catalyst.AGENT_NAME,
            system_prompt=catalyst.SYSTEM_PROMPT,
            config=config
        )
        agent_nodes['tail_risk'] = create_agent_node(
            agent_name=tail_risk.AGENT_NAME,
            system_prompt=tail_risk.SYSTEM_PROMPT,
            config=config
        )
    
    logger.info(f"Created {len(agent_nodes)} agent nodes")
    return agent_nodes


# ============================================================================
# PARALLEL AGENT DISPATCH
# ============================================================================

def dispatch_parallel_agents(state: GraphState) -> List[Send]:
    """
    Fan-out: Dispatch parallel execution for all active agents using Send API.
    
    This function creates a Send command for each active agent, which will be
    executed in parallel by LangGraph. Results are automatically collected via
    the Annotated reducer in GraphState.
    
    Args:
        state: Current workflow state with active_agents list
        
    Returns:
        List of Send commands for parallel agent execution
    """
    active_agents = state.get("active_agents", [])
    
    if not active_agents:
        logger.warning("No active agents to dispatch")
        return []
    
    logger.info(f"Dispatching {len(active_agents)} agents for parallel execution")
    
    sends = []
    for agent_name in active_agents:
        logger.info(f"  -> Dispatching agent: {agent_name}")
        sends.append(Send(agent_name, state))
    
    return sends



# ============================================================================
# WORKFLOW GRAPH CONSTRUCTION
# ============================================================================

def build_market_analysis_graph(config: EngineConfig) -> StateGraph:
    """
    Build the LangGraph workflow for market analysis.
    
    This function constructs the complete workflow graph with all nodes and edges:
    
    Workflow Structure:
    1. START → market_ingestion
    2. market_ingestion → memory_retrieval
    3. memory_retrieval → web_research (if enabled)
    4. web_research → keyword_extraction (or memory_retrieval → keyword_extraction if disabled)
    5. keyword_extraction → dynamic_agent_selection
    6. dynamic_agent_selection → [parallel agents] (via Send API)
    7. [all agents] → agent_signal_fusion (fan-in)
    8. agent_signal_fusion → thesis_construction
    9. thesis_construction → cross_examination
    10. cross_examination → consensus_engine
    11. consensus_engine → recommendation_generation
    12. recommendation_generation → END
    
    Args:
        config: Engine configuration
        
    Returns:
        Compiled StateGraph ready for execution
    """
    logger.info("Building market analysis workflow graph")
    
    # Initialize dependencies
    polymarket_client = PolymarketClient(config.polymarket)
    
    # Initialize database persistence (optional)
    persistence_layer = None
    if config.database.enable_persistence:
        try:
            supabase_client = SupabaseClient(config.database)
            persistence_layer = PersistenceLayer(supabase_client)
            logger.info("Database persistence enabled")
        except Exception as e:
            logger.warning(f"Failed to initialize database persistence: {e}")
            logger.warning("Continuing without persistence")
    
    # Create workflow graph
    workflow = StateGraph(GraphState)
    
    # ========================================================================
    # Add workflow nodes
    # ========================================================================
    
    # Market ingestion node
    workflow.add_node(
        "market_ingestion",
        create_market_ingestion_node(polymarket_client, config)
    )
    
    # Memory retrieval node
    workflow.add_node(
        "memory_retrieval",
        create_memory_retrieval_node(persistence_layer, config)
    )
    
    # Web Research Agent node (conditional)
    if config.web_research.enabled:
        async def web_research_wrapper(state):
            return await web_research_agent_node(state, config)
        
        workflow.add_node(
            "web_research",
            web_research_wrapper
        )
    
    # Keyword extraction node
    workflow.add_node(
        "keyword_extraction",
        create_keyword_extraction_node(config)
    )
    
    # Dynamic agent selection node
    workflow.add_node(
        "dynamic_agent_selection",
        create_dynamic_agent_selection_node(config)
    )
    
    # Add all agent nodes
    agent_nodes = create_all_agent_nodes(config, polymarket_client)
    for agent_name, agent_node in agent_nodes.items():
        workflow.add_node(agent_name, agent_node)
    
    # Agent signal fusion node (fan-in point)
    workflow.add_node(
        "agent_signal_fusion",
        create_agent_signal_fusion_node(config)
    )
    
    # Thesis construction node
    workflow.add_node(
        "thesis_construction",
        create_thesis_construction_node(config)
    )
    
    # Cross-examination node
    workflow.add_node(
        "cross_examination",
        create_cross_examination_node(config)
    )
    
    # Consensus engine node
    workflow.add_node(
        "consensus_engine",
        create_consensus_engine_node(config, supabase_client if config.database.enable_persistence else None)
    )
    
    # Recommendation generation node
    workflow.add_node(
        "recommendation_generation",
        create_recommendation_generation_node(config)
    )
    
    # ========================================================================
    # Define workflow edges
    # ========================================================================
    
    # Sequential edges: START → market_ingestion → memory_retrieval → web_research (if enabled) → keyword_extraction → dynamic_agent_selection
    workflow.add_edge(START, "market_ingestion")
    workflow.add_edge("market_ingestion", "memory_retrieval")
    
    # Conditional edge for web research
    if config.web_research.enabled:
        workflow.add_edge("memory_retrieval", "web_research")
        workflow.add_edge("web_research", "keyword_extraction")
    else:
        workflow.add_edge("memory_retrieval", "keyword_extraction")
    
    workflow.add_edge("keyword_extraction", "dynamic_agent_selection")
    
    # Conditional edges for parallel agent dispatch (fan-out)
    # dispatch_parallel_agents returns List[Send] for each active agent
    workflow.add_conditional_edges(
        "dynamic_agent_selection",
        dispatch_parallel_agents,
        list(agent_nodes.keys())  # All possible agent destinations
    )
    
    # All agent nodes converge to signal fusion (fan-in)
    for agent_name in agent_nodes.keys():
        workflow.add_edge(agent_name, "agent_signal_fusion")
    
    # Sequential edges: signal_fusion → thesis_construction → cross_examination → consensus_engine → recommendation_generation → END
    workflow.add_edge("agent_signal_fusion", "thesis_construction")
    workflow.add_edge("thesis_construction", "cross_examination")
    workflow.add_edge("cross_examination", "consensus_engine")
    workflow.add_edge("consensus_engine", "recommendation_generation")
    workflow.add_edge("recommendation_generation", END)
    
    logger.info("Workflow graph construction complete")
    
    return workflow



def create_checkpointer(config: EngineConfig):
    """
    Create appropriate checkpointer based on configuration.
    
    Supports:
    - memory: In-memory checkpointer (MemorySaver)
    - sqlite: SQLite-based checkpointer
    - postgres: PostgreSQL-based checkpointer
    
    Args:
        config: Engine configuration
        
    Returns:
        Checkpointer instance or None
    """
    checkpointer_type = config.langgraph.checkpointer_type.lower()
    
    if checkpointer_type == "memory":
        logger.info("Using in-memory checkpointer")
        return MemorySaver()
    
    elif checkpointer_type == "sqlite":
        logger.info(f"Using SQLite checkpointer: {config.langgraph.sqlite_path}")
        try:
            from langgraph.checkpoint.sqlite import SqliteSaver
            return SqliteSaver.from_conn_string(config.langgraph.sqlite_path)
        except ImportError:
            logger.warning("SQLite checkpointer not available, falling back to memory")
            return MemorySaver()
    
    elif checkpointer_type == "postgres":
        logger.info("Using PostgreSQL checkpointer")
        if PostgresSaver is None:
            logger.warning("PostgreSQL checkpointer not available, falling back to memory")
            return MemorySaver()
        try:
            if config.database.postgres_connection_string:
                return PostgresSaver.from_conn_string(
                    config.database.postgres_connection_string
                )
            else:
                logger.warning("No PostgreSQL connection string, falling back to memory")
                return MemorySaver()
        except Exception as e:
            logger.warning(f"Failed to create PostgreSQL checkpointer: {e}")
            return MemorySaver()
    
    else:
        logger.warning(f"Unknown checkpointer type: {checkpointer_type}, using memory")
        return MemorySaver()


# ============================================================================
# MAIN ANALYSIS FUNCTION
# ============================================================================

async def analyze_market(
    condition_id: str,
    config: Optional[EngineConfig] = None,
    thread_id: Optional[str] = None
) -> AnalysisResult:
    """
    Analyze a prediction market and generate trade recommendation.
    
    This is the main entry point for market analysis. It:
    1. Builds the workflow graph
    2. Invokes the graph with the condition_id
    3. Returns the complete analysis result
    
    Args:
        condition_id: Polymarket condition ID to analyze
        config: Engine configuration (loads from env if not provided)
        thread_id: Thread ID for checkpointing (optional)
        
    Returns:
        AnalysisResult with recommendation, agent signals, and audit log
        
    Raises:
        ValueError: If condition_id is invalid
        Exception: If workflow execution fails
        
    Examples:
        >>> config = load_config()
        >>> result = await analyze_market("0xabc123", config)
        >>> print(result.recommendation.action)
        'LONG_YES'
    """
    start_time = time.time()
    
    # Validate input
    if not condition_id:
        raise ValueError("condition_id is required")
    
    # Load config if not provided
    if config is None:
        config = load_config()
    
    # Generate thread_id if not provided
    if thread_id is None:
        thread_id = str(uuid.uuid4())[:8]
    
    logger.info("=" * 80)
    logger.info("TRADEWIZARD MARKET ANALYSIS")
    logger.info("=" * 80)
    logger.info(f"Condition ID: {condition_id}")
    logger.info(f"Thread ID: {thread_id}")
    logger.info(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}")
    logger.info(f"LangGraph Recursion Limit: {config.langgraph.recursion_limit}")
    
    try:
        # Build workflow graph
        workflow = build_market_analysis_graph(config)
        
        # Create checkpointer
        checkpointer = create_checkpointer(config)
        
        # Create Opik tracer if enabled
        opik_tracer = None
        if config.opik.is_enabled():
            try:
                from opik.integrations.langchain import OpikTracer, track_langgraph
                opik_tracer = OpikTracer(
                    project_name=config.opik.project_name,
                    tags=["doa-workflow", f"condition-{condition_id}"],
                    metadata={
                        "condition_id": condition_id,
                        "thread_id": thread_id,
                    }
                )
                logger.info("Opik tracking enabled")
            except Exception as e:
                logger.warning(f"Failed to create Opik tracer: {e}")
                logger.warning("Continuing without Opik tracking")
        else:
            logger.info("Opik tracking disabled (no API key)")
        
        # Compile graph with checkpointer
        graph = workflow.compile(checkpointer=checkpointer)
        
        # Wrap graph with Opik tracking if enabled
        if opik_tracer:
            try:
                from opik.integrations.langchain import track_langgraph
                graph = track_langgraph(graph, opik_tracer)
                logger.info("Opik tracking wrapped around LangGraph workflow")
            except Exception as e:
                logger.warning(f"Failed to wrap graph with Opik tracking: {e}")
        
        logger.info("Workflow graph compiled successfully")
        
        # Initialize state
        initial_state: GraphState = {
            "condition_id": condition_id,
            "agent_signals": [],
            "agent_errors": [],
            "audit_log": [],
            "memory_context": {}
        }
        
        # Create config for graph invocation with thread_id and recursion_limit
        # Note: recursion_limit must be at top level of config dict
        graph_config = {
            "configurable": {"thread_id": thread_id},
            "recursion_limit": config.langgraph.recursion_limit
        }
        
        logger.info(f"Graph config: recursion_limit={config.langgraph.recursion_limit}, thread_id={thread_id}")
        
        # Invoke graph (Opik tracking is already wrapped around the graph)
        logger.info("Starting workflow execution...")
        logger.info(f"Invoking graph with config: {graph_config}")
        
        final_state = await graph.ainvoke(initial_state, config=graph_config)
        
        duration_s = time.time() - start_time
        
        logger.info("=" * 80)
        logger.info("WORKFLOW EXECUTION COMPLETE")
        logger.info("=" * 80)
        logger.info(f"Duration: {duration_s:.2f}s")
        logger.info(f"Agent signals: {len(final_state.get('agent_signals', []))}")
        logger.info(f"Agent errors: {len(final_state.get('agent_errors', []))}")
        
        # Extract results from final state
        recommendation = final_state.get("recommendation")
        agent_signals = final_state.get("agent_signals", [])
        agent_errors = final_state.get("agent_errors", [])
        consensus = final_state.get("consensus")
        debate_record = final_state.get("debate_record")
        audit_log = final_state.get("audit_log", [])
        mbd = final_state.get("mbd")
        
        # Log recommendation
        if recommendation:
            logger.info(f"Recommendation: {recommendation.action}")
            logger.info(f"  Entry Zone: {recommendation.entry_zone}")
            logger.info(f"  Expected Value: ${recommendation.expected_value:.2f}")
            logger.info(f"  Win Probability: {recommendation.win_probability:.1%}")
        else:
            logger.warning("No recommendation generated")
        
        # Save results to database if persistence is enabled
        # NOTE: When this workflow is deployed as a remote service and called by the monitor,
        # the workflow service handles its own persistence. The monitor will NOT save data
        # again to avoid duplication (see monitor-service.ts analyzeMarket method).
        if config.database.enable_persistence and mbd:
            try:
                from database.supabase_client import SupabaseClient
                from database.persistence import PersistenceLayer
                from models.types import AgentSignal
                
                logger.info("Saving analysis results to Supabase...")
                
                # Initialize persistence layer
                supabase_client = SupabaseClient(config.database)
                persistence = PersistenceLayer(supabase_client)
                
                # Convert agent_signals from dicts to AgentSignal objects if needed
                signal_objects = []
                for signal in agent_signals:
                    if isinstance(signal, dict):
                        signal_objects.append(AgentSignal(**signal))
                    else:
                        signal_objects.append(signal)
                
                # Save market data and get market_id
                market_result = await persistence.save_market_data(mbd)
                if market_result.is_ok():
                    market_id = market_result.unwrap()
                    logger.info(f"Saved market data for condition_id: {condition_id}, market_id: {market_id}")
                    
                    # Save recommendation and get recommendation_id
                    recommendation_id = None
                    if recommendation:
                        rec_result = await persistence.save_recommendation(recommendation, market_id)
                        if rec_result.is_ok():
                            recommendation_id = rec_result.unwrap()
                            logger.info(f"Saved recommendation: {recommendation.action}, recommendation_id: {recommendation_id}")
                        else:
                            logger.warning(f"Failed to save recommendation: {rec_result.error}")
                    
                    # Save agent signals
                    if signal_objects:
                        signals_result = await persistence.save_agent_signals(
                            condition_id=condition_id,
                            market_id=market_id,
                            recommendation_id=recommendation_id,
                            signals=signal_objects
                        )
                        if signals_result.is_ok():
                            logger.info(f"Saved {len(signal_objects)} agent signals")
                        else:
                            logger.warning(f"Failed to save agent signals: {signals_result.error}")
                    
                    # Save analysis history
                    history_result = await persistence.save_analysis_history(
                        condition_id=final_state.get("condition_id"),
                        market_id=market_id,
                        analysis_timestamp=int(time.time()),
                        agent_count=len(signal_objects),
                        consensus=consensus,
                        recommendation_action=recommendation.action if recommendation else "NO_TRADE",
                        duration_ms=int(duration_s * 1000),
                        cost_usd=0.0,  # TODO: Calculate actual cost
                        status="success"
                    )
                    if history_result.is_ok():
                        logger.info("Saved analysis history")
                    else:
                        logger.warning(f"Failed to save analysis history: {history_result.error}")
                else:
                    logger.warning(f"Failed to save market data: {market_result.error}")
                
            except Exception as e:
                logger.error(f"Failed to save results to database: {e}", exc_info=True)
                logger.warning("Continuing without persistence")
        
        # Create analysis result
        result = AnalysisResult(
            recommendation=recommendation,
            agent_signals=agent_signals,
            agent_errors=agent_errors,
            consensus=consensus,
            debate_record=debate_record,
            audit_log=audit_log,
            analysis_timestamp=int(time.time())
        )
        
        logger.info("Analysis complete")
        
        return result
    
    except Exception as e:
        duration_s = time.time() - start_time
        logger.error(f"Market analysis failed after {duration_s:.2f}s: {e}", exc_info=True)
        raise



# ============================================================================
# GRADIENT ADK ENTRYPOINT
# ============================================================================

@entrypoint
async def main(input: Dict, context: Dict) -> Dict:
    """
    TradeWizard Market Analysis entrypoint for Digital Ocean Gradient ADK.
    
    This agent analyzes prediction markets on Polymarket using a multi-agent
    workflow and generates trade recommendations.
    
    Args:
        input: Dictionary containing:
            - condition_id or conditionId: Polymarket condition ID to analyze (required)
            - thread_id or threadId: Session ID for resuming analysis (optional)
        context: Execution context from Gradient ADK
        
    Returns:
        Dictionary containing:
            - recommendation: Trade recommendation (when complete)
            - agentSignals: Individual agent analysis results
            - cost: Analysis cost
            - _metadata: Additional metadata (thread_id, status, etc.)
    """
    # Extract inputs (support both snake_case and camelCase)
    condition_id = input.get("condition_id") or input.get("conditionId", "")
    thread_id = input.get("thread_id") or input.get("threadId", "")
    
    logger.info(f"Request received - condition_id: {condition_id}, thread_id: {thread_id or 'new'}")
    
    if not condition_id:
        return {
            "error": "Please provide a 'condition_id' or 'conditionId' field with the Polymarket condition ID to analyze.",
            "usage": {
                "analyze": {"conditionId": "0xabc123..."},
                "resume": {"conditionId": "0xabc123...", "threadId": "session-id"}
            }
        }
    
    # Generate thread_id if not provided
    if not thread_id:
        import uuid
        thread_id = str(uuid.uuid4())[:8]
    
    try:
        # Load configuration
        config = load_config()
        
        # Run analysis
        logger.info(f"Starting market analysis for condition_id: {condition_id}")
        result = await analyze_market(condition_id, config, thread_id)
        
        # Format response for monitor service compatibility
        # The monitor expects: { recommendation, agentSignals, cost }
        # Note: The Python workflow already persists data to Supabase, so the monitor
        # should NOT save this data again to avoid duplication
        response = {
            "recommendation": None,
            "agentSignals": [],
            "cost": 0.0,  # TODO: Calculate actual LLM cost
            # Additional metadata for debugging/monitoring
            "_metadata": {
                "thread_id": thread_id,
                "condition_id": condition_id,
                "status": "complete",
                "analysis_timestamp": result.analysis_timestamp,
                "agent_count": len(result.agent_signals),
                "agent_errors": len(result.agent_errors)
            }
        }
        
        # Add recommendation if available (convert to dict for JSON serialization)
        if result.recommendation:
            response["recommendation"] = {
                "marketId": result.recommendation.market_id,
                "conditionId": result.recommendation.condition_id,
                "action": result.recommendation.action,
                "entryZone": result.recommendation.entry_zone,
                "targetZone": result.recommendation.target_zone,
                "expectedValue": result.recommendation.expected_value,
                "winProbability": result.recommendation.win_probability,
                "liquidityRisk": result.recommendation.liquidity_risk,
                "explanation": {
                    "summary": result.recommendation.explanation.summary,
                    "coreThesis": result.recommendation.explanation.core_thesis,
                    "keyCatalysts": result.recommendation.explanation.key_catalysts,
                    "failureScenarios": result.recommendation.explanation.failure_scenarios
                },
                "metadata": {
                    "consensusProbability": result.recommendation.metadata.consensus_probability,
                    "marketProbability": result.recommendation.metadata.market_probability,
                    "edge": result.recommendation.metadata.edge,
                    "confidenceBand": result.recommendation.metadata.confidence_band,
                    "disagreementIndex": result.recommendation.metadata.disagreement_index,
                    "regime": result.recommendation.metadata.regime,
                    "analysisTimestamp": result.recommendation.metadata.analysis_timestamp,
                    "agentCount": result.recommendation.metadata.agent_count
                }
            }
            response["_metadata"]["status"] = "complete"
        else:
            response["_metadata"]["status"] = "no_recommendation"
        
        # Add agent signals (convert to camelCase for TypeScript compatibility)
        response["agentSignals"] = [
            {
                "agentName": signal.agent_name,
                "timestamp": signal.timestamp,
                "confidence": signal.confidence,
                "direction": signal.direction,
                "fairProbability": signal.fair_probability,
                "keyDrivers": signal.key_drivers,
                "riskFactors": signal.risk_factors,
                "metadata": signal.metadata
            }
            for signal in result.agent_signals
        ]
        
        # Add consensus to metadata if available
        if result.consensus:
            response["_metadata"]["consensus"] = {
                "consensus_probability": result.consensus.consensus_probability,
                "confidence_level": result.consensus.regime,
                "agreement_score": 1.0 - result.consensus.disagreement_index
            }
        
        # Add agent errors to metadata if any
        if result.agent_errors:
            response["_metadata"]["agent_errors"] = [
                {
                    "agent_name": error.agent_name,
                    "type": error.type,
                    "message": error.message
                }
                for error in result.agent_errors
            ]
        
        logger.info(f"Analysis complete - status: {response['_metadata']['status']}")
        return response
        
    except ValueError as e:
        logger.error(f"Validation error: {e}")
        return {
            "recommendation": None,
            "agentSignals": [],
            "cost": 0.0,
            "_metadata": {
                "thread_id": thread_id,
                "condition_id": condition_id,
                "status": "error",
                "error": str(e),
                "error_type": "validation_error"
            }
        }
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True)
        return {
            "recommendation": None,
            "agentSignals": [],
            "cost": 0.0,
            "_metadata": {
                "thread_id": thread_id,
                "condition_id": condition_id,
                "status": "error",
                "error": str(e),
                "error_type": "execution_error"
            }
        }
