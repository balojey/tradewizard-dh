"""Database persistence layer for TradeWizard DOA replication."""

from database.supabase_client import SupabaseClient, DatabaseConnectionError
from database.persistence import PersistenceLayer
from database.db_types import (
    MarketRow,
    RecommendationRow,
    AgentSignalRow,
    AnalysisHistoryRow,
    MarketInsert,
    RecommendationInsert,
    AgentSignalInsert,
    AnalysisHistoryInsert,
    MarketUpdate,
    RecommendationUpdate,
)

__all__ = [
    "SupabaseClient",
    "DatabaseConnectionError",
    "PersistenceLayer",
    "MarketRow",
    "RecommendationRow",
    "AgentSignalRow",
    "AnalysisHistoryRow",
    "MarketInsert",
    "RecommendationInsert",
    "AgentSignalInsert",
    "AnalysisHistoryInsert",
    "MarketUpdate",
    "RecommendationUpdate",
]
