"""LangGraph state definition for TradeWizard DOA replication."""

import operator
from typing import Annotated, Dict, List, Optional, TypedDict

from .types import (
    AgentError,
    AgentMemoryContext,
    AgentSignal,
    AuditEntry,
    ConsensusProbability,
    DebateRecord,
    FusedSignal,
    IngestionError,
    MarketBriefingDocument,
    RecommendationError,
    Thesis,
    TradeRecommendation,
)


class EventKeywords(TypedDict, total=False):
    """Keywords extracted from market/event data."""
    event_level: List[str]
    market_level: List[str]


class GraphState(TypedDict, total=False):
    """
    LangGraph state that flows through the workflow.
    
    Uses TypedDict with total=False to allow partial state updates.
    Annotated fields use reducers to aggregate values from parallel executions.
    """
    
    # ========================================================================
    # Input
    # ========================================================================
    condition_id: str
    
    # ========================================================================
    # Market Data
    # ========================================================================
    mbd: Optional[MarketBriefingDocument]
    market_keywords: Optional[EventKeywords]
    ingestion_error: Optional[IngestionError]
    
    # ========================================================================
    # Agent Context
    # ========================================================================
    memory_context: Dict[str, AgentMemoryContext]
    active_agents: List[str]
    
    # ========================================================================
    # Agent Outputs (with reducers for parallel aggregation)
    # ========================================================================
    # operator.add concatenates lists from parallel agent executions
    agent_signals: Annotated[List[AgentSignal], operator.add]
    agent_errors: Annotated[List[AgentError], operator.add]
    
    # ========================================================================
    # Signal Fusion
    # ========================================================================
    fused_signal: Optional[FusedSignal]
    
    # ========================================================================
    # Debate Protocol
    # ========================================================================
    bull_thesis: Optional[Thesis]
    bear_thesis: Optional[Thesis]
    debate_record: Optional[DebateRecord]
    
    # ========================================================================
    # Consensus
    # ========================================================================
    consensus: Optional[ConsensusProbability]
    
    # ========================================================================
    # Risk Philosophy (optional advanced feature)
    # ========================================================================
    risk_philosophy_signals: Optional[Dict[str, AgentSignal]]
    
    # ========================================================================
    # Output
    # ========================================================================
    recommendation: Optional[TradeRecommendation]
    recommendation_error: Optional[RecommendationError]
    
    # ========================================================================
    # Audit Trail (with reducer for accumulation)
    # ========================================================================
    # operator.add concatenates audit entries from all stages
    audit_log: Annotated[List[AuditEntry], operator.add]


# Type alias for convenience
State = GraphState
