"""Dynamic agent selection node for LangGraph workflow.

This node determines which agents to activate based on:
- Market type (election, court, policy, etc.)
- Data availability (external data sources)
- Configuration (enabled/disabled agent groups)
- Cost optimization (budget constraints)
"""

import logging
import time
from typing import Any, Dict, List, Set, Optional

from models.state import GraphState, EventKeywords
from models.types import AuditEntry, MarketBriefingDocument
from config import EngineConfig, AgentConfig

logger = logging.getLogger(__name__)

# Agent name constants
MVP_AGENTS = [
    'market_microstructure',
    'probability_baseline',
    'risk_assessment',
]

EVENT_INTELLIGENCE_AGENTS = ['breaking_news', 'event_impact']

POLLING_STATISTICAL_AGENTS = [
    'polling_intelligence',
    'historical_pattern',
]

SENTIMENT_NARRATIVE_AGENTS = [
    'media_sentiment',
    'social_sentiment',
    'narrative_velocity',
]

PRICE_ACTION_AGENTS = ['momentum', 'mean_reversion']

EVENT_SCENARIO_AGENTS = ['catalyst', 'tail_risk']


def select_agents_by_market_type(event_type: str) -> List[str]:
    """
    Select agents based on market type.
    
    Different market types benefit from different agent specializations:
    - Election: Polling, sentiment, narrative agents
    - Court: Event intelligence, polling, historical pattern agents
    - Policy: Event intelligence, polling, sentiment, catalyst agents
    - Economic: Event intelligence, polling, historical pattern agents
    - Geopolitical: Event intelligence, polling, sentiment, catalyst agents
    - Other: All available agents
    
    Note: Polling intelligence is valuable for all market types as it provides
    insights into public opinion, approval ratings, and statistical patterns.
    
    Args:
        event_type: Market event type (election, court, policy, etc.)
        
    Returns:
        List of agent names appropriate for this market type
    """
    agents: List[str] = []
    
    if event_type == 'election':
        # Elections benefit from polling data and sentiment analysis
        agents.extend(POLLING_STATISTICAL_AGENTS)
        agents.extend(SENTIMENT_NARRATIVE_AGENTS)
        agents.extend(EVENT_INTELLIGENCE_AGENTS)
    
    elif event_type == 'court':
        # Court cases benefit from event intelligence and historical patterns
        agents.extend(EVENT_INTELLIGENCE_AGENTS)
        agents.extend(POLLING_STATISTICAL_AGENTS)
    
    elif event_type == 'policy':
        # Policy markets benefit from event intelligence, polling, sentiment, and catalysts
        agents.extend(EVENT_INTELLIGENCE_AGENTS)
        agents.extend(POLLING_STATISTICAL_AGENTS)
        agents.extend(SENTIMENT_NARRATIVE_AGENTS)
        agents.extend(EVENT_SCENARIO_AGENTS)
    
    elif event_type == 'economic':
        # Economic markets benefit from event intelligence and historical patterns
        agents.extend(EVENT_INTELLIGENCE_AGENTS)
        agents.extend(POLLING_STATISTICAL_AGENTS)
    
    elif event_type == 'geopolitical':
        # Geopolitical markets benefit from event intelligence, polling, sentiment, and catalysts
        agents.extend(EVENT_INTELLIGENCE_AGENTS)
        agents.extend(POLLING_STATISTICAL_AGENTS)
        agents.extend(SENTIMENT_NARRATIVE_AGENTS)
        agents.extend(EVENT_SCENARIO_AGENTS)
    
    else:  # 'other' or unknown
        # Unknown market types get all available agents
        agents.extend(EVENT_INTELLIGENCE_AGENTS)
        agents.extend(POLLING_STATISTICAL_AGENTS)
        agents.extend(SENTIMENT_NARRATIVE_AGENTS)
        agents.extend(PRICE_ACTION_AGENTS)
        agents.extend(EVENT_SCENARIO_AGENTS)
    
    # Always consider event scenario agents if not already included
    if 'catalyst' not in agents:
        agents.extend(EVENT_SCENARIO_AGENTS)
    
    return agents


def apply_configuration_filters(agents: List[str], config: AgentConfig) -> List[str]:
    """
    Apply configuration-based filtering.
    
    Removes agents that are disabled in configuration.
    
    Args:
        agents: Candidate agent names
        config: Agent configuration
        
    Returns:
        Filtered agent names
    """
    filtered: List[str] = []
    
    for agent in agents:
        # Check if agent's group is enabled
        if agent in EVENT_INTELLIGENCE_AGENTS:
            if not config.enable_event_intelligence:
                continue
        
        elif agent in POLLING_STATISTICAL_AGENTS:
            if not config.enable_polling_statistical:
                continue
        
        elif agent in SENTIMENT_NARRATIVE_AGENTS:
            if not config.enable_sentiment_narrative:
                continue
        
        elif agent in PRICE_ACTION_AGENTS:
            if not config.enable_price_action:
                continue
        
        elif agent in EVENT_SCENARIO_AGENTS:
            if not config.enable_event_scenario:
                continue
        
        filtered.append(agent)
    
    return filtered


def filter_by_data_availability(
    agents: List[str],
    mbd: MarketBriefingDocument,
    news_available: bool = True,
    polling_available: bool = False,
    social_available: bool = False
) -> List[str]:
    """
    Filter agents by data availability.
    
    Removes agents whose required data sources are unavailable.
    
    Args:
        agents: Candidate agent names
        mbd: Market briefing document
        news_available: Whether news data is available
        polling_available: Whether polling data is available
        social_available: Whether social media data is available
        
    Returns:
        Filtered agent names
    """
    filtered: List[str] = []
    
    for agent in agents:
        should_include = True
        
        # Event intelligence agents require news data
        if agent in EVENT_INTELLIGENCE_AGENTS:
            if not news_available:
                should_include = False
        
        # Polling intelligence agent is autonomous and fetches its own data
        # No longer filtered by external polling data availability
        # (kept for historical_pattern which may still need pre-fetched data)
        if agent == 'historical_pattern':
            if not polling_available:
                should_include = False
        
        # Sentiment agents require news or social data
        if agent in SENTIMENT_NARRATIVE_AGENTS:
            if not news_available and not social_available:
                should_include = False
        
        # Price action agents require sufficient trading history
        if agent in PRICE_ACTION_AGENTS:
            # Check if market has sufficient volume
            volume_24h = getattr(mbd, 'volume_24h', 0) or getattr(mbd, 'volume24h', 0)
            if volume_24h < 1000:
                should_include = False
        
        if should_include:
            filtered.append(agent)
    
    return filtered


def apply_cost_optimization(
    agents: List[str],
    max_agents: Optional[int] = None
) -> Dict[str, Any]:
    """
    Apply cost optimization filtering.
    
    Limits the number of agents based on budget constraints.
    Uses priority-based selection to keep most important agents.
    
    Agent Priority (highest to lowest):
    1. MVP agents (always included)
    2. Event intelligence agents
    3. Polling/statistical agents
    4. Sentiment/narrative agents
    5. Event scenario agents
    6. Price action agents
    
    Args:
        agents: Candidate agent names
        max_agents: Maximum number of agents to select (None = no limit)
        
    Returns:
        Dictionary with selected_agents, skipped_agents, and metadata
    """
    if max_agents is None or len(agents) <= max_agents:
        return {
            'selected_agents': agents,
            'skipped_agents': [],
            'total_requested': len(agents),
            'total_selected': len(agents),
            'optimization_applied': False
        }
    
    # Define priority order
    priority_order = [
        EVENT_INTELLIGENCE_AGENTS,
        POLLING_STATISTICAL_AGENTS,
        SENTIMENT_NARRATIVE_AGENTS,
        EVENT_SCENARIO_AGENTS,
        PRICE_ACTION_AGENTS,
    ]
    
    selected: List[str] = []
    skipped: List[str] = []
    
    # Add agents by priority until we hit the limit
    for agent_group in priority_order:
        for agent in agent_group:
            if agent in agents:
                if len(selected) < max_agents:
                    selected.append(agent)
                else:
                    skipped.append(agent)
    
    return {
        'selected_agents': selected,
        'skipped_agents': skipped,
        'total_requested': len(agents),
        'total_selected': len(selected),
        'optimization_applied': True,
        'max_agents': max_agents
    }


def select_agents_by_keywords(
    keywords: EventKeywords,
    event_type: str,
    config: AgentConfig
) -> Set[str]:
    """
    DEPRECATED: Use select_agents_by_market_type instead.
    
    This function is kept for backward compatibility but is no longer
    the primary selection method. The new approach uses market type
    as the primary signal, with configuration and data availability
    as filters.
    
    Select specialized agents based on keywords and event type.
    
    This function determines which advanced agents should be activated
    based on the presence of relevant keywords in the market data.
    
    Agent Selection Rules:
    - Event Intelligence: Activated for breaking news keywords
    - Polling & Statistical: Activated for election/polling keywords
    - Sentiment & Narrative: Activated for social/media keywords
    - Price Action: Always activated if enabled
    - Event Scenario: Activated for catalyst/risk keywords
    
    Args:
        keywords: Event and market level keywords
        event_type: Type of event (election, policy, etc.)
        config: Agent configuration
        
    Returns:
        Set of agent names to activate
    """
    selected_agents: Set[str] = set()
    
    # Combine all keywords for matching
    all_keywords = keywords.get("event_level", []) + keywords.get("market_level", [])
    all_keywords_lower = [k.lower() for k in all_keywords]
    
    # Event Intelligence agents - activated for news/breaking events
    if config.enable_event_intelligence:
        news_keywords = {'breaking', 'news', 'announcement', 'report', 'statement', 'press'}
        if any(kw in ' '.join(all_keywords_lower) for kw in news_keywords):
            selected_agents.add('breaking_news')
            selected_agents.add('event_impact')
    
    # Polling & Statistical agents - activated for elections/polls
    if config.enable_polling_statistical:
        polling_keywords = {'poll', 'polling', 'election', 'vote', 'voter', 'survey', 'approval'}
        if (event_type == 'election' or 
            any(kw in ' '.join(all_keywords_lower) for kw in polling_keywords)):
            selected_agents.add('polling_intelligence')
            selected_agents.add('historical_pattern')
    
    # Sentiment & Narrative agents - activated for social/media topics
    if config.enable_sentiment_narrative:
        sentiment_keywords = {'social', 'media', 'twitter', 'sentiment', 'narrative', 'public'}
        if any(kw in ' '.join(all_keywords_lower) for kw in sentiment_keywords):
            selected_agents.add('media_sentiment')
            selected_agents.add('social_sentiment')
            selected_agents.add('narrative_velocity')
    
    # Price Action agents - always activated if enabled (analyze market dynamics)
    if config.enable_price_action:
        selected_agents.add('momentum')
        selected_agents.add('mean_reversion')
    
    # Event Scenario agents - activated for catalyst/risk keywords
    if config.enable_event_scenario:
        scenario_keywords = {'catalyst', 'risk', 'scenario', 'outcome', 'impact', 'consequence'}
        if any(kw in ' '.join(all_keywords_lower) for kw in scenario_keywords):
            selected_agents.add('catalyst')
            selected_agents.add('tail_risk')
    
    return selected_agents



async def dynamic_agent_selection_node(
    state: GraphState,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Determine which agents should be activated for analysis.
    
    This node implements dynamic agent selection based on:
    1. Market type (election, court, policy, etc.) - PRIMARY SIGNAL
    2. Configuration filters (which agent groups are enabled)
    3. Data availability (external data sources)
    4. Cost optimization (budget constraints)
    
    Selection Strategy:
    - MVP agents (market_microstructure, probability_baseline, risk_assessment)
      are ALWAYS included if enabled
    - Advanced agents are selected based on market type
    - Configuration filters remove disabled agent groups
    - Data availability filters remove agents without required data
    - Cost optimization limits total agents based on budget
    
    Args:
        state: Current workflow state with mbd
        config: Engine configuration with agent settings
        
    Returns:
        State update with active_agents list and audit entry
        
    State Requirements:
        - mbd: Market Briefing Document (required)
        
    State Updates:
        - active_agents: List of agent names to activate
        - audit_log: Audit entry for agent selection stage
        
    Examples:
        >>> state = {"mbd": MarketBriefingDocument(event_type="election", ...)}
        >>> result = await dynamic_agent_selection_node(state, config)
        >>> print(result["active_agents"])
        ['market_microstructure', 'probability_baseline', 'risk_assessment', 
         'polling_intelligence', 'historical_pattern', 'media_sentiment']
    """
    start_time = time.time()
    
    # Extract required state
    mbd = state.get("mbd")
    
    # Validate required state
    if not mbd:
        logger.error("Dynamic agent selection node called without MBD")
        return {
            "active_agents": [],
            "audit_log": [AuditEntry(
                stage="dynamic_agent_selection",
                timestamp=int(time.time()),
                status="failed",
                details={"error": "Missing market briefing document"}
            )]
        }
    
    try:
        logger.info(f"Selecting agents for market: {mbd.question} (type: {mbd.event_type})")
        # Track selection decisions for audit log
        selection_decisions: Dict[str, str] = {}
        
        # ========================================================================
        # Step 1: Start with MVP agents (always active)
        # ========================================================================
        active_agents: List[str] = []
        
        if config.agents.enable_mvp_agents:
            active_agents.extend(MVP_AGENTS)
            selection_decisions['mvp_agents'] = 'Always active'
            logger.info(f"Added {len(MVP_AGENTS)} MVP agents")
        
        # ========================================================================
        # Step 2: Market Type-Based Agent Selection
        # ========================================================================
        market_type_agents = select_agents_by_market_type(mbd.event_type)
        selection_decisions['market_type'] = (
            f"Market type: {mbd.event_type}, "
            f"suggested agents: {', '.join(market_type_agents)}"
        )
        logger.info(f"Market type '{mbd.event_type}' suggests {len(market_type_agents)} agents")
        
        # ========================================================================
        # Step 3: Configuration-Based Filtering
        # ========================================================================
        config_filtered_agents = apply_configuration_filters(market_type_agents, config.agents)
        selection_decisions['configuration_filter'] = (
            f"After config filter: {', '.join(config_filtered_agents)}"
        )
        logger.info(f"After config filter: {len(config_filtered_agents)} agents remain")
        
        # ========================================================================
        # Step 4: Data Availability Filtering
        # ========================================================================
        # TODO: Integrate with actual data availability checks
        # For now, assume news is available, polling/social are not
        data_filtered_agents = filter_by_data_availability(
            config_filtered_agents,
            mbd,
            news_available=True,
            polling_available=False,
            social_available=False
        )
        selection_decisions['data_availability'] = (
            f"After data availability check: {', '.join(data_filtered_agents)}"
        )
        logger.info(f"After data availability filter: {len(data_filtered_agents)} agents remain")
        
        # ========================================================================
        # Step 5: Cost Optimization Filtering
        # ========================================================================
        # TODO: Add budget configuration to EngineConfig
        # For now, use a reasonable default (max 10 advanced agents)
        max_advanced_agents = getattr(config.agents, 'max_advanced_agents', 10)
        cost_optimization_result = apply_cost_optimization(
            data_filtered_agents,
            max_agents=max_advanced_agents
        )
        
        selection_decisions['cost_optimization'] = (
            f"Max agents: {max_advanced_agents}, "
            f"Selected: {cost_optimization_result['total_selected']}, "
            f"Skipped: {len(cost_optimization_result['skipped_agents'])}"
        )
        
        # Add cost-optimized agents to active list
        active_agents.extend(cost_optimization_result['selected_agents'])
        
        logger.info(
            f"After cost optimization: {len(active_agents)} total agents "
            f"({len(cost_optimization_result['skipped_agents'])} skipped)"
        )
        
        # ========================================================================
        # Validation
        # ========================================================================
        if len(active_agents) < config.consensus.min_agents_required:
            logger.warning(
                f"Only {len(active_agents)} agents selected, "
                f"but minimum required is {config.consensus.min_agents_required}"
            )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"Agent selection completed in {duration_ms}ms: "
            f"{len(active_agents)} agents selected"
        )
        
        # ========================================================================
        # Return State Update
        # ========================================================================
        return {
            "active_agents": active_agents,
            "audit_log": [AuditEntry(
                stage="dynamic_agent_selection",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "market_type": mbd.event_type,
                    "market_id": getattr(mbd, 'market_id', None) or getattr(mbd, 'condition_id', None),
                    "selected_agents": active_agents,
                    "agent_count": len(active_agents),
                    "mvp_agent_count": len(MVP_AGENTS) if config.agents.enable_mvp_agents else 0,
                    "advanced_agent_count": len(active_agents) - (len(MVP_AGENTS) if config.agents.enable_mvp_agents else 0),
                    "selection_decisions": selection_decisions,
                    "cost_optimization": cost_optimization_result
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Agent selection failed after {duration_ms}ms: {e}", exc_info=True)
        
        # Fallback to MVP agents only
        fallback_agents = []
        if config.agents.enable_mvp_agents:
            fallback_agents = list(MVP_AGENTS)
        
        return {
            "active_agents": fallback_agents,
            "audit_log": [AuditEntry(
                stage="dynamic_agent_selection",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e),
                    "fallback": "mvp_agents_only",
                    "fallback_count": len(fallback_agents)
                }
            )]
        }


def create_dynamic_agent_selection_node(config: EngineConfig):
    """
    Factory function to create dynamic agent selection node with dependencies.
    
    This factory pattern allows the node to be created with the required
    dependencies (config) while maintaining the standard LangGraph node signature.
    
    Args:
        config: Engine configuration
        
    Returns:
        Async function that takes state and returns state update
        
    Examples:
        >>> config = load_config()
        >>> node = create_dynamic_agent_selection_node(config)
        >>> result = await node(state)
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await dynamic_agent_selection_node(state, config)
    
    return node
