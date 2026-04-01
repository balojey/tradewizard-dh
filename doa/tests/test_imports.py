"""Smoke tests to verify all implemented modules can be imported."""

import pytest


def test_models_types_import():
    """Test that models.types can be imported."""
    from models.types import (
        MarketBriefingDocument,
        AgentSignal,
        Thesis,
        DebateRecord,
        ConsensusProbability,
        TradeRecommendation,
        IngestionError,
        AgentError,
        RecommendationError,
    )
    assert MarketBriefingDocument is not None
    assert AgentSignal is not None
    assert Thesis is not None
    assert DebateRecord is not None
    assert ConsensusProbability is not None
    assert TradeRecommendation is not None
    assert IngestionError is not None
    assert AgentError is not None
    assert RecommendationError is not None


def test_models_state_import():
    """Test that models.state can be imported."""
    from models.state import GraphState, EventKeywords
    assert GraphState is not None
    assert EventKeywords is not None


def test_tools_polymarket_client_import():
    """Test that tools.polymarket_client can be imported."""
    from tools.polymarket_client import (
        PolymarketClient,
        PolymarketMarket,
        PolymarketEvent,
        fetch_and_transform_market,
    )
    assert PolymarketClient is not None
    assert PolymarketMarket is not None
    assert PolymarketEvent is not None
    assert fetch_and_transform_market is not None


def test_utils_result_import():
    """Test that utils.result can be imported."""
    from utils.result import Ok, Err, Result
    assert Ok is not None
    assert Err is not None
    assert Result is not None


def test_config_import():
    """Test that config can be imported."""
    from config import (
        PolymarketConfig,
        LLMConfig,
        AgentConfig,
        DatabaseConfig,
        EngineConfig,
        ConfigurationError,
    )
    assert PolymarketConfig is not None
    assert LLMConfig is not None
    assert AgentConfig is not None
    assert DatabaseConfig is not None
    assert EngineConfig is not None
    assert ConfigurationError is not None


def test_pydantic_models_validation():
    """Test that Pydantic models can be instantiated with valid data."""
    from models.types import AgentSignal
    import time
    
    signal = AgentSignal(
        agent_name="test_agent",
        timestamp=int(time.time()),
        confidence=0.8,
        direction="YES",
        fair_probability=0.65,
        key_drivers=["Driver 1", "Driver 2"],
        risk_factors=["Risk 1"],
        metadata={"test": "data"}
    )
    
    assert signal.agent_name == "test_agent"
    assert signal.confidence == 0.8
    assert signal.direction == "YES"
    assert signal.fair_probability == 0.65


def test_result_type_ok():
    """Test that Result type Ok works correctly."""
    from utils.result import Ok
    
    result = Ok(42)
    assert result.is_ok()
    assert not result.is_err()
    assert result.unwrap() == 42


def test_result_type_err():
    """Test that Result type Err works correctly."""
    from utils.result import Err
    
    result = Err("error message")
    assert result.is_err()
    assert not result.is_ok()
    assert result.error == "error message"
