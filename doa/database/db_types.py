"""
Database types for TradeWizard DOA.

Auto-generated Python types matching the tradewizard-agents Supabase schema.
Based on tradewizard-frontend/lib/database.types.ts
"""

from typing import Optional, Any, Dict, List, Literal
from datetime import datetime
from pydantic import BaseModel, Field
from uuid import UUID


# ============================================================================
# JSON Type Alias
# ============================================================================

Json = Dict[str, Any]


# ============================================================================
# Table Row Types (Read from database)
# ============================================================================

class MarketRow(BaseModel):
    """Markets table row type."""
    id: str  # Changed from UUID to str - stores condition_id (hex string like 0x...)
    condition_id: str
    question: str
    description: Optional[str] = None
    event_type: str
    market_probability: Optional[float] = None
    volume_24h: Optional[float] = None
    liquidity: Optional[float] = None
    status: str = "active"
    resolved_outcome: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_analyzed_at: Optional[datetime] = None
    trending_score: Optional[float] = None


class RecommendationRow(BaseModel):
    """Recommendations table row type."""
    id: UUID
    market_id: Optional[str] = None  # Changed from UUID to str - references markets.id (hex string)
    direction: str
    fair_probability: Optional[float] = None
    market_edge: Optional[float] = None
    expected_value: Optional[float] = None
    confidence: str
    entry_zone_min: Optional[float] = None
    entry_zone_max: Optional[float] = None
    target_zone_min: Optional[float] = None
    target_zone_max: Optional[float] = None
    stop_loss: Optional[float] = None
    explanation: Optional[str] = None
    core_thesis: Optional[str] = None
    catalysts: Optional[Json] = None
    risks: Optional[Json] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AgentSignalRow(BaseModel):
    """Agent signals table row type."""
    id: UUID
    market_id: Optional[str] = None  # Changed from UUID to str - references markets.id (hex string)
    recommendation_id: Optional[UUID] = None
    agent_name: str
    agent_type: str
    fair_probability: Optional[float] = None
    confidence: Optional[float] = None
    direction: str
    key_drivers: Optional[Json] = None
    metadata: Optional[Json] = None
    created_at: Optional[datetime] = None


class AnalysisHistoryRow(BaseModel):
    """Analysis history table row type."""
    id: UUID
    market_id: Optional[str] = None  # Changed from UUID to str - references markets.id (hex string)
    analysis_type: str
    status: str
    duration_ms: Optional[int] = None
    cost_usd: Optional[float] = None
    agents_used: Optional[Json] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None


class LangGraphCheckpointRow(BaseModel):
    """LangGraph checkpoints table row type."""
    thread_id: str
    checkpoint_id: str
    parent_checkpoint_id: Optional[str] = None
    checkpoint: Json
    metadata: Optional[Json] = None
    created_at: Optional[datetime] = None


class RecommendationOutcomeRow(BaseModel):
    """Recommendation outcomes table row type."""
    id: UUID
    recommendation_id: Optional[UUID] = None
    market_id: Optional[str] = None  # Changed from UUID to str - references markets.id (hex string)
    actual_outcome: str
    recommendation_was_correct: bool
    market_probability_at_recommendation: Optional[float] = None
    edge_captured: Optional[float] = None
    roi_realized: Optional[float] = None
    resolution_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SchemaMigrationRow(BaseModel):
    """Schema migrations table row type."""
    id: int
    version: str
    name: str
    applied_at: Optional[datetime] = None
    checksum: Optional[str] = None
    execution_time_ms: Optional[int] = None
    success: bool = True
    error_message: Optional[str] = None


class MigrationLockRow(BaseModel):
    """Migration lock table row type."""
    id: int
    is_locked: bool = False
    locked_at: Optional[datetime] = None
    locked_by: Optional[str] = None


# ============================================================================
# Table Insert Types (Write to database)
# ============================================================================

class MarketInsert(BaseModel):
    """Markets table insert type."""
    id: Optional[str] = None  # Changed from UUID to str - stores condition_id (hex string like 0x...)
    condition_id: str
    question: str
    description: Optional[str] = None
    event_type: str
    market_probability: Optional[float] = None
    volume_24h: Optional[float] = None
    liquidity: Optional[float] = None
    status: str = "active"
    resolved_outcome: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    last_analyzed_at: Optional[datetime] = None
    trending_score: Optional[float] = None


class RecommendationInsert(BaseModel):
    """Recommendations table insert type."""
    id: Optional[UUID] = None
    market_id: Optional[str] = None  # Changed from UUID to str - references markets.id (hex string)
    direction: str
    fair_probability: Optional[float] = None
    market_edge: Optional[float] = None
    expected_value: Optional[float] = None
    confidence: str
    entry_zone_min: Optional[float] = None
    entry_zone_max: Optional[float] = None
    target_zone_min: Optional[float] = None
    target_zone_max: Optional[float] = None
    stop_loss: Optional[float] = None
    explanation: Optional[str] = None
    core_thesis: Optional[str] = None
    catalysts: Optional[Json] = None
    risks: Optional[Json] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class AgentSignalInsert(BaseModel):
    """Agent signals table insert type."""
    id: Optional[UUID] = None
    market_id: Optional[str] = None  # Changed from UUID to str - references markets.id (hex string)
    recommendation_id: Optional[UUID] = None
    agent_name: str
    agent_type: str
    fair_probability: Optional[float] = None
    confidence: Optional[float] = None
    direction: str
    key_drivers: Optional[Json] = None
    metadata: Optional[Json] = None
    created_at: Optional[datetime] = None


class AnalysisHistoryInsert(BaseModel):
    """Analysis history table insert type."""
    id: Optional[UUID] = None
    market_id: Optional[str] = None  # Changed from UUID to str - references markets.id (hex string)
    analysis_type: str
    status: str
    duration_ms: Optional[int] = None
    cost_usd: Optional[float] = None
    agents_used: Optional[Json] = None
    error_message: Optional[str] = None
    created_at: Optional[datetime] = None


class RecommendationOutcomeInsert(BaseModel):
    """Recommendation outcomes table insert type."""
    id: Optional[UUID] = None
    recommendation_id: Optional[UUID] = None
    market_id: Optional[str] = None  # Changed from UUID to str - references markets.id (hex string)
    actual_outcome: str
    recommendation_was_correct: bool
    market_probability_at_recommendation: Optional[float] = None
    edge_captured: Optional[float] = None
    roi_realized: Optional[float] = None
    resolution_date: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


# ============================================================================
# Table Update Types (Partial updates)
# ============================================================================

class MarketUpdate(BaseModel):
    """Markets table update type."""
    condition_id: Optional[str] = None
    question: Optional[str] = None
    description: Optional[str] = None
    event_type: Optional[str] = None
    market_probability: Optional[float] = None
    volume_24h: Optional[float] = None
    liquidity: Optional[float] = None
    status: Optional[str] = None
    resolved_outcome: Optional[str] = None
    last_analyzed_at: Optional[datetime] = None
    trending_score: Optional[float] = None


class RecommendationUpdate(BaseModel):
    """Recommendations table update type."""
    direction: Optional[str] = None
    fair_probability: Optional[float] = None
    market_edge: Optional[float] = None
    expected_value: Optional[float] = None
    confidence: Optional[str] = None
    entry_zone_min: Optional[float] = None
    entry_zone_max: Optional[float] = None
    target_zone_min: Optional[float] = None
    target_zone_max: Optional[float] = None
    stop_loss: Optional[float] = None
    explanation: Optional[str] = None
    core_thesis: Optional[str] = None
    catalysts: Optional[Json] = None
    risks: Optional[Json] = None
