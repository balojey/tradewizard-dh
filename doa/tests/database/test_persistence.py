"""Basic tests for database persistence layer."""

import pytest
from unittest.mock import Mock, MagicMock
from models.types import (
    MarketBriefingDocument,
    AgentSignal,
    TradeRecommendation,
    StreamlinedEventMetadata,
    TradeExplanation,
    TradeMetadata
)
from database.supabase_client import SupabaseClient, DatabaseConnectionError
from database.persistence import PersistenceLayer
from config import DatabaseConfig


def test_supabase_client_initialization_disabled():
    """Test SupabaseClient initialization with persistence disabled."""
    config = DatabaseConfig(
        supabase_url=None,
        supabase_key=None,
        postgres_connection_string=None,
        enable_persistence=False
    )
    
    client = SupabaseClient(config)
    assert not client.is_connected()


def test_supabase_client_initialization_no_config():
    """Test SupabaseClient initialization without configuration raises error."""
    config = DatabaseConfig(
        supabase_url=None,
        supabase_key=None,
        postgres_connection_string=None,
        enable_persistence=True
    )
    
    with pytest.raises(DatabaseConnectionError):
        SupabaseClient(config)


@pytest.mark.asyncio
async def test_persistence_layer_fallback_mode():
    """Test PersistenceLayer falls back to in-memory storage when database unavailable."""
    # Create a mock client that's not connected
    mock_client = Mock(spec=SupabaseClient)
    mock_client.is_connected.return_value = False
    
    persistence = PersistenceLayer(mock_client)
    
    # Create test market data
    mbd = MarketBriefingDocument(
        market_id="test_market",
        condition_id="test_condition",
        event_type="election",
        question="Test question?",
        resolution_criteria="Test criteria",
        expiry_timestamp=1234567890,
        current_probability=0.5,
        liquidity_score=5.0,
        bid_ask_spread=0.02,
        volatility_regime="medium",
        volume_24h=10000.0,
        metadata=StreamlinedEventMetadata(
            market_id="test_market",
            condition_id="test_condition",
            created_at=1234567890,
            last_updated=1234567890
        )
    )
    
    # Save should succeed with fallback
    result = await persistence.save_market_data(mbd)
    assert result.is_ok()
    assert persistence.is_fallback_mode()
    
    # Verify data is in memory
    assert "test_condition" in persistence._in_memory_markets


@pytest.mark.asyncio
async def test_persistence_layer_save_agent_signals_fallback():
    """Test saving agent signals with fallback to in-memory storage."""
    mock_client = Mock(spec=SupabaseClient)
    mock_client.is_connected.return_value = False
    
    persistence = PersistenceLayer(mock_client)
    
    # Create test signals
    signals = [
        AgentSignal(
            agent_name="test_agent",
            timestamp=1234567890,
            confidence=0.8,
            direction="YES",
            fair_probability=0.6,
            key_drivers=["driver1", "driver2"],
            risk_factors=["risk1"]
        )
    ]
    
    # Save should succeed with fallback (with new signature)
    result = await persistence.save_agent_signals(
        condition_id="test_condition",
        market_id="test_market_uuid",
        recommendation_id=None,
        signals=signals
    )
    assert result.is_ok()
    assert persistence.is_fallback_mode()
    
    # Verify data is in memory
    assert "test_condition" in persistence._in_memory_signals
    assert len(persistence._in_memory_signals["test_condition"]) == 1


@pytest.mark.asyncio
async def test_persistence_layer_get_historical_signals_fallback():
    """Test retrieving historical signals from in-memory storage."""
    mock_client = Mock(spec=SupabaseClient)
    mock_client.is_connected.return_value = False
    
    persistence = PersistenceLayer(mock_client)
    
    # Add signals to in-memory storage
    signals = [
        AgentSignal(
            agent_name="test_agent",
            timestamp=1234567890,
            confidence=0.8,
            direction="YES",
            fair_probability=0.6,
            key_drivers=["driver1"],
            risk_factors=["risk1"]
        ),
        AgentSignal(
            agent_name="test_agent",
            timestamp=1234567891,
            confidence=0.7,
            direction="NO",
            fair_probability=0.4,
            key_drivers=["driver2"],
            risk_factors=["risk2"]
        )
    ]
    
    await persistence.save_agent_signals(
        condition_id="test_condition",
        market_id="test_market_uuid",
        recommendation_id=None,
        signals=signals
    )
    persistence._fallback_mode = True
    
    # Retrieve signals
    result = await persistence.get_historical_signals("test_condition", "test_agent", limit=2)
    assert result.is_ok()
    retrieved_signals = result.unwrap()
    assert len(retrieved_signals) == 2


@pytest.mark.asyncio
async def test_persistence_layer_save_recommendation_fallback():
    """Test saving recommendation with fallback to in-memory storage."""
    mock_client = Mock(spec=SupabaseClient)
    mock_client.is_connected.return_value = False
    
    persistence = PersistenceLayer(mock_client)
    
    # Create test recommendation
    recommendation = TradeRecommendation(
        market_id="test_market",
        condition_id="test_condition",
        action="LONG_YES",
        entry_zone=(0.45, 0.50),
        target_zone=(0.60, 0.65),
        expected_value=15.0,
        win_probability=0.65,
        liquidity_risk="low",
        explanation=TradeExplanation(
            summary="Test summary",
            core_thesis="Test thesis",
            key_catalysts=["catalyst1"],
            failure_scenarios=["scenario1"]
        ),
        metadata=TradeMetadata(
            consensus_probability=0.6,
            market_probability=0.5,
            edge=0.1,
            confidence_band=(0.55, 0.65),
            disagreement_index=0.1,
            regime="high-confidence",
            analysis_timestamp=1234567890,
            agent_count=3
        )
    )
    
    # Save should succeed with fallback (with new signature)
    result = await persistence.save_recommendation(
        recommendation=recommendation,
        market_id="test_market_uuid"
    )
    assert result.is_ok()
    assert persistence.is_fallback_mode()
    
    # Verify data is in memory
    assert "test_condition" in persistence._in_memory_recommendations


def test_persistence_layer_clear_cache():
    """Test clearing in-memory cache."""
    mock_client = Mock(spec=SupabaseClient)
    mock_client.is_connected.return_value = False
    
    persistence = PersistenceLayer(mock_client)
    
    # Add some data
    persistence._in_memory_markets["test"] = Mock()
    persistence._in_memory_signals["test"] = []
    persistence._in_memory_recommendations["test"] = Mock()
    
    # Clear cache
    persistence.clear_in_memory_cache()
    
    # Verify cache is empty
    assert len(persistence._in_memory_markets) == 0
    assert len(persistence._in_memory_signals) == 0
    assert len(persistence._in_memory_recommendations) == 0
