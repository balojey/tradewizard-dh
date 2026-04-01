"""Data persistence layer for TradeWizard DOA."""

import logging
import json
from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import uuid4
from postgrest.exceptions import APIError

from models.types import (
    MarketBriefingDocument,
    AgentSignal,
    TradeRecommendation,
    Thesis,
    DebateRecord,
    ConsensusProbability,
    AuditEntry
)
from database.supabase_client import SupabaseClient
from database.db_types import (
    MarketInsert,
    RecommendationInsert,
    AgentSignalInsert,
    AnalysisHistoryInsert
)
from utils.result import Result, Ok, Err

logger = logging.getLogger(__name__)


class PersistenceLayer:
    """
    Data persistence layer with fallback to in-memory storage.
    
    Implements save/load operations for market data, agent signals,
    and recommendations with graceful degradation on database errors.
    """
    
    def __init__(self, supabase_client: SupabaseClient):
        """
        Initialize persistence layer.
        
        Args:
            supabase_client: Supabase client instance
        """
        self.client = supabase_client
        self._in_memory_markets: Dict[str, MarketBriefingDocument] = {}
        self._in_memory_signals: Dict[str, List[AgentSignal]] = {}
        self._in_memory_recommendations: Dict[str, TradeRecommendation] = {}
        self._fallback_mode = False
    
    async def save_market_data(
        self,
        mbd: MarketBriefingDocument
    ) -> Result[str, str]:
        """
        Save market briefing document to database.
        
        Args:
            mbd: Market briefing document to save
            
        Returns:
            Ok(market_id) on success, Err(message) on failure
        """
        # Check if database is available
        if not self.client.is_connected():
            logger.warning("Database not connected, using in-memory storage")
            self._in_memory_markets[mbd.condition_id] = mbd
            self._fallback_mode = True
            return Ok(mbd.condition_id)
        
        try:
            # Check if market already exists
            existing = self.client.client.table("markets").select("id").eq(
                "condition_id", mbd.condition_id
            ).execute()
            
            if existing.data:
                # Update existing market
                market_id = existing.data[0]["id"]
                update_data = {
                    "question": mbd.question,
                    "description": mbd.event_context.event_description if mbd.event_context else None,
                    "event_type": mbd.event_type,
                    "market_probability": mbd.current_probability,
                    "volume_24h": mbd.volume_24h,
                    "liquidity": mbd.liquidity_score * 100000,  # Convert score to approximate liquidity
                    "updated_at": datetime.now().isoformat()
                }
                
                response = self.client.client.table("markets").update(
                    update_data
                ).eq("id", market_id).execute()
                
                logger.info(f"Updated market data for condition_id: {mbd.condition_id}")
                return Ok(market_id)
            else:
                # Insert new market - use condition_id as the id
                insert_data = {
                    "id": mbd.condition_id,  # Use condition_id as the primary key
                    "condition_id": mbd.condition_id,
                    "question": mbd.question,
                    "event_type": mbd.event_type,
                    "market_probability": mbd.current_probability,
                    "volume_24h": mbd.volume_24h,
                    "liquidity": mbd.liquidity_score * 100000,
                    "status": "active"
                }
                
                # Add optional fields only if they exist
                if mbd.event_context and mbd.event_context.event_description:
                    insert_data["description"] = mbd.event_context.event_description
                
                response = self.client.client.table("markets").insert(
                    insert_data
                ).execute()
                
                market_id = response.data[0]["id"]
                logger.info(f"Saved new market data for condition_id: {mbd.condition_id}")
                return Ok(market_id)
        
        except APIError as e:
            logger.error(f"Database error saving market data: {e}")
            # Fallback to in-memory
            self._in_memory_markets[mbd.condition_id] = mbd
            self._fallback_mode = True
            return Err(f"Database error: {e}")
        
        except Exception as e:
            logger.error(f"Unexpected error saving market data: {e}")
            # Fallback to in-memory
            self._in_memory_markets[mbd.condition_id] = mbd
            self._fallback_mode = True
            return Err(f"Unexpected error: {e}")
    
    async def save_agent_signals(
        self,
        condition_id: str,
        market_id: str,
        recommendation_id: Optional[str],
        signals: List[AgentSignal]
    ) -> Result[None, str]:
        """
        Save agent signals to database.
        
        Args:
            condition_id: Market condition ID (for in-memory fallback)
            market_id: Market UUID from database
            recommendation_id: Recommendation UUID (optional)
            signals: List of agent signals to save
            
        Returns:
            Ok(None) on success, Err(message) on failure
        """
        if not signals:
            return Ok(None)
        
        # Check if database is available
        if not self.client.is_connected():
            logger.warning("Database not connected, using in-memory storage")
            if condition_id not in self._in_memory_signals:
                self._in_memory_signals[condition_id] = []
            self._in_memory_signals[condition_id].extend(signals)
            self._fallback_mode = True
            return Ok(None)
        
        try:
            # Prepare signals for insertion
            signals_data = []
            for signal in signals:
                # Determine agent type from agent name
                agent_type = self._get_agent_type(signal.agent_name)
                
                signal_insert = AgentSignalInsert(
                    market_id=market_id,
                    recommendation_id=recommendation_id,
                    agent_name=signal.agent_name,
                    agent_type=agent_type,
                    fair_probability=signal.fair_probability,
                    confidence=signal.confidence,
                    direction=signal.direction,
                    key_drivers={"drivers": signal.key_drivers, "risks": signal.risk_factors},
                    metadata=signal.metadata
                )
                signals_data.append(signal_insert.model_dump(exclude_none=True, mode='json'))
            
            # Insert all signals
            response = self.client.client.table("agent_signals").insert(
                signals_data
            ).execute()
            
            logger.info(f"Saved {len(signals)} agent signals for market_id: {market_id}")
            return Ok(None)
        
        except APIError as e:
            logger.error(f"Database error saving agent signals: {e}")
            # Fallback to in-memory
            if condition_id not in self._in_memory_signals:
                self._in_memory_signals[condition_id] = []
            self._in_memory_signals[condition_id].extend(signals)
            self._fallback_mode = True
            return Err(f"Database error: {e}")
        
        except Exception as e:
            logger.error(f"Unexpected error saving agent signals: {e}")
            # Fallback to in-memory
            if condition_id not in self._in_memory_signals:
                self._in_memory_signals[condition_id] = []
            self._in_memory_signals[condition_id].extend(signals)
            self._fallback_mode = True
            return Err(f"Unexpected error: {e}")
    
    def _get_agent_type(self, agent_name: str) -> str:
        """Determine agent type from agent name."""
        agent_type_map = {
            "market_microstructure": "mvp",
            "probability_baseline": "mvp",
            "risk_assessment": "mvp",
            "breaking_news": "event_intelligence",
            "event_impact": "event_intelligence",
            "polling_intelligence": "polling_statistical",
            "historical_pattern": "polling_statistical",
            "media_sentiment": "sentiment_narrative",
            "social_sentiment": "sentiment_narrative",
            "narrative_velocity": "sentiment_narrative",
            "momentum": "price_action",
            "mean_reversion": "price_action",
            "catalyst": "event_scenario",
            "tail_risk": "event_scenario"
        }
        return agent_type_map.get(agent_name, "other")
    
    async def save_recommendation(
        self,
        recommendation: TradeRecommendation,
        market_id: str
    ) -> Result[str, str]:
        """
        Save trade recommendation to database.
        
        Args:
            recommendation: Trade recommendation to save
            market_id: Market UUID from database
            
        Returns:
            Ok(recommendation_id) on success, Err(message) on failure
        """
        # Check if database is available
        if not self.client.is_connected():
            logger.warning("Database not connected, using in-memory storage")
            self._in_memory_recommendations[recommendation.condition_id] = recommendation
            self._fallback_mode = True
            return Ok(recommendation.condition_id)
        
        try:
            # Map action to direction
            direction_map = {
                "LONG_YES": "LONG_YES",
                "LONG_NO": "LONG_NO",
                "NO_TRADE": "NO_TRADE"
            }
            
            # Map regime to confidence
            confidence_map = {
                "high-confidence": "high",
                "moderate-confidence": "moderate",
                "high-uncertainty": "low"
            }
            
            # Prepare recommendation for insertion
            rec_insert = RecommendationInsert(
                market_id=market_id,
                direction=direction_map.get(recommendation.action, recommendation.action),
                fair_probability=recommendation.metadata.consensus_probability,
                market_edge=recommendation.metadata.edge,
                expected_value=recommendation.expected_value,
                confidence=confidence_map.get(recommendation.metadata.regime, "moderate"),
                entry_zone_min=recommendation.entry_zone[0],
                entry_zone_max=recommendation.entry_zone[1],
                target_zone_min=recommendation.target_zone[0],
                target_zone_max=recommendation.target_zone[1],
                explanation=recommendation.explanation.summary,
                core_thesis=recommendation.explanation.core_thesis,
                catalysts={"catalysts": recommendation.explanation.key_catalysts},
                risks={"scenarios": recommendation.explanation.failure_scenarios}
            )
            
            # Insert recommendation
            response = self.client.client.table("recommendations").insert(
                rec_insert.model_dump(exclude_none=True, mode='json')
            ).execute()
            
            recommendation_id = response.data[0]["id"]
            logger.info(f"Saved recommendation for condition_id: {recommendation.condition_id}")
            return Ok(recommendation_id)
        
        except APIError as e:
            logger.error(f"Database error saving recommendation: {e}")
            # Fallback to in-memory
            self._in_memory_recommendations[recommendation.condition_id] = recommendation
            self._fallback_mode = True
            return Err(f"Database error: {e}")
        
        except Exception as e:
            logger.error(f"Unexpected error saving recommendation: {e}")
            # Fallback to in-memory
            self._in_memory_recommendations[recommendation.condition_id] = recommendation
            self._fallback_mode = True
            return Err(f"Unexpected error: {e}")

    async def save_analysis_history(
        self,
        condition_id: str,
        market_id: str,
        analysis_timestamp: int,
        agent_count: int,
        consensus: ConsensusProbability,
        recommendation_action: str,
        duration_ms: int,
        cost_usd: float,
        status: str = "success",
        error_message: Optional[str] = None
    ) -> Result[None, str]:
        """
        Save complete analysis history to database.
        
        Args:
            condition_id: Market condition ID (for in-memory fallback)
            market_id: Market UUID from database
            analysis_timestamp: Unix timestamp of analysis
            agent_count: Number of agents that participated
            consensus: Consensus probability result
            recommendation_action: Final recommendation action
            duration_ms: Analysis duration in milliseconds
            cost_usd: Estimated cost in USD
            status: Analysis status (success, failed, partial)
            error_message: Error message if failed
            
        Returns:
            Ok(None) on success, Err(message) on failure
        """
        # Check if database is available
        if not self.client.is_connected():
            logger.warning("Database not connected, skipping analysis history")
            self._fallback_mode = True
            return Ok(None)
        
        try:
            # Prepare history data
            history_insert = AnalysisHistoryInsert(
                market_id=market_id,
                analysis_type="initial",  # Could be parameterized
                status=status,
                duration_ms=duration_ms,
                cost_usd=cost_usd,
                agents_used={
                    "agent_count": agent_count,
                    "consensus_probability": consensus.consensus_probability,
                    "disagreement_index": consensus.disagreement_index,
                    "regime": consensus.regime,
                    "recommendation_action": recommendation_action
                },
                error_message=error_message
            )
            
            # Insert history
            response = self.client.client.table("analysis_history").insert(
                history_insert.model_dump(exclude_none=True, mode='json')
            ).execute()
            
            logger.info(f"Saved analysis history for condition_id: {condition_id}")
            return Ok(None)
        
        except APIError as e:
            logger.error(f"Database error saving analysis history: {e}")
            return Err(f"Database error: {e}")
        
        except Exception as e:
            logger.error(f"Unexpected error saving analysis history: {e}")
            return Err(f"Unexpected error: {e}")
    
    async def get_historical_signals(
        self,
        condition_id: str,
        agent_name: str,
        limit: int = 3
    ) -> Result[List[AgentSignal], str]:
        """
        Retrieve historical agent signals for memory context.
        
        Args:
            condition_id: Market condition ID
            agent_name: Name of the agent
            limit: Maximum number of signals to retrieve
            
        Returns:
            Ok(signals) on success, Err(message) on failure
        """
        # Check in-memory first if in fallback mode
        if self._fallback_mode:
            logger.info("Using in-memory storage for historical signals")
            if condition_id in self._in_memory_signals:
                signals = [
                    s for s in self._in_memory_signals[condition_id]
                    if s.agent_name == agent_name
                ]
                return Ok(signals[-limit:] if len(signals) > limit else signals)
            return Ok([])
        
        # Check if database is available
        if not self.client.is_connected():
            logger.warning("Database not connected, no historical signals available")
            return Ok([])
        
        try:
            # First, get the market_id from condition_id
            market_response = self.client.client.table("markets").select("id").eq(
                "condition_id", condition_id
            ).execute()
            
            if not market_response.data:
                # No market found, return empty list
                logger.info(f"No market found for condition_id: {condition_id}")
                return Ok([])
            
            market_id = market_response.data[0]["id"]
            
            # Query historical signals using market_id
            response = self.client.client.table("agent_signals").select("*").eq(
                "market_id", market_id
            ).eq(
                "agent_name", agent_name
            ).order(
                "created_at", desc=True
            ).limit(limit).execute()
            
            # Convert to AgentSignal objects
            signals = []
            for row in response.data:
                # Extract key_drivers and risk_factors from key_drivers JSON field
                key_drivers_data = row.get("key_drivers", {})
                if isinstance(key_drivers_data, dict):
                    key_drivers = key_drivers_data.get("drivers", [])
                    risk_factors = key_drivers_data.get("risks", [])
                else:
                    key_drivers = []
                    risk_factors = []
                
                signal = AgentSignal(
                    agent_name=row["agent_name"],
                    timestamp=int(row["created_at"].timestamp()) if isinstance(row["created_at"], datetime) else int(datetime.fromisoformat(row["created_at"].replace('Z', '+00:00')).timestamp()),
                    confidence=row["confidence"],
                    direction=row["direction"],
                    fair_probability=row["fair_probability"],
                    key_drivers=key_drivers,
                    risk_factors=risk_factors,
                    metadata=row.get("metadata", {})
                )
                signals.append(signal)
            
            logger.info(f"Retrieved {len(signals)} historical signals for {agent_name}")
            return Ok(signals)
        
        except APIError as e:
            logger.error(f"Database error retrieving historical signals: {e}")
            return Err(f"Database error: {e}")
        
        except Exception as e:
            logger.error(f"Unexpected error retrieving historical signals: {e}")
            return Err(f"Unexpected error: {e}")
    
    async def get_market_data(
        self,
        condition_id: str
    ) -> Result[Optional[MarketBriefingDocument], str]:
        """
        Retrieve market briefing document from database.
        
        Args:
            condition_id: Market condition ID
            
        Returns:
            Ok(mbd) on success, Err(message) on failure
        """
        # Check in-memory first if in fallback mode
        if self._fallback_mode:
            logger.info("Using in-memory storage for market data")
            mbd = self._in_memory_markets.get(condition_id)
            return Ok(mbd)
        
        # Check if database is available
        if not self.client.is_connected():
            logger.warning("Database not connected")
            return Ok(None)
        
        try:
            # Query market data
            response = self.client.client.table("markets").select("*").eq(
                "condition_id", condition_id
            ).execute()
            
            if not response.data:
                return Ok(None)
            
            row = response.data[0]
            
            # Reconstruct MarketBriefingDocument
            from models.types import EventContext, StreamlinedEventMetadata
            
            event_context = None
            if row.get("event_context"):
                event_context = EventContext(**row["event_context"])
            
            metadata = StreamlinedEventMetadata(**row["metadata"])
            
            mbd = MarketBriefingDocument(
                market_id=row["market_id"],
                condition_id=row["condition_id"],
                event_type=row["event_type"],
                question=row["question"],
                resolution_criteria=row["resolution_criteria"],
                expiry_timestamp=row["expiry_timestamp"],
                current_probability=row["current_probability"],
                liquidity_score=row["liquidity_score"],
                bid_ask_spread=row["bid_ask_spread"],
                volatility_regime=row["volatility_regime"],
                volume_24h=row["volume_24h"],
                event_context=event_context,
                keywords=row.get("keywords"),
                metadata=metadata
            )
            
            logger.info(f"Retrieved market data for condition_id: {condition_id}")
            return Ok(mbd)
        
        except APIError as e:
            logger.error(f"Database error retrieving market data: {e}")
            return Err(f"Database error: {e}")
        
        except Exception as e:
            logger.error(f"Unexpected error retrieving market data: {e}")
            return Err(f"Unexpected error: {e}")
    
    def is_fallback_mode(self) -> bool:
        """
        Check if persistence layer is in fallback mode.
        
        Returns:
            True if using in-memory storage, False if using database
        """
        return self._fallback_mode
    
    def clear_in_memory_cache(self) -> None:
        """Clear all in-memory cached data."""
        self._in_memory_markets.clear()
        self._in_memory_signals.clear()
        self._in_memory_recommendations.clear()
        logger.info("Cleared in-memory cache")
