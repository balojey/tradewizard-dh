"""Tests for memory retrieval node."""

import pytest
import time
from unittest.mock import MagicMock, AsyncMock

from nodes.memory_retrieval import (
    memory_retrieval_node,
    create_memory_retrieval_node,
    _get_all_agent_names
)
from models.state import GraphState
from models.types import (
    MarketBriefingDocument,
    StreamlinedEventMetadata,
    AgentSignal,
    AgentMemoryContext
)
from config import (
    EngineConfig,
    MemorySystemConfig,
    AgentConfig,
    PolymarketConfig,
    LangGraphConfig,
    LLMConfig,
    ConsensusConfig,
    DatabaseConfig,
    NewsDataConfig,
    AutonomousAgentConfig,
    OpikConfig
)
from utils.result import Ok


def create_test_config(enable_memory: bool = True) -> EngineConfig:
    """Create test configuration."""
    return EngineConfig(
        polymarket=PolymarketConfig(
            gamma_api_url="https://test.com",
            clob_api_url="https://test.com"
        ),
        langgraph=LangGraphConfig(
            checkpointer_type="memory",
            sqlite_path=None
        ),
        llm=LLMConfig(
            model_name="test-model",
            temperature=0.7,
            max_tokens=2000,
            timeout_ms=30000,
            api_key="test-api-key"
        ),
        agents=AgentConfig(
            timeout_ms=45000,
            max_retries=3,
            enable_mvp_agents=True,
            enable_event_intelligence=True,
            enable_polling_statistical=False,
            enable_sentiment_narrative=False,
            enable_price_action=False,
            enable_event_scenario=False
        ),
        consensus=ConsensusConfig(
            min_agents_required=3,
            disagreement_threshold=0.15,
            confidence_band_multiplier=1.96,
            min_edge_threshold=0.05
        ),
        database=DatabaseConfig(
            supabase_url=None,
            supabase_key=None,
            postgres_connection_string=None,
            enable_persistence=True
        ),
        memory_system=MemorySystemConfig(
            enable_memory=enable_memory,
            max_historical_signals=3,
            memory_timeout_ms=5000
        ),
        newsdata=NewsDataConfig(
            api_key="test-key",
            base_url="https://newsdata.io/api/1",
            timeout=30
        ),
        autonomous_agents=AutonomousAgentConfig(
            max_tool_calls=10,
            timeout_ms=30000,
            cache_enabled=True
        ),
        opik=OpikConfig(
            api_key=None,
            project_name="test-project",
            workspace=None,
            base_url=None,
            track_costs=True
        )
    )


def create_test_mbd() -> MarketBriefingDocument:
    """Create test market briefing document."""
    return MarketBriefingDocument(
        market_id="market-123",
        condition_id="0xabc123",
        event_type="election",
        question="Will candidate win?",
        resolution_criteria="Official results",
        expiry_timestamp=1234567890,
        current_probability=0.5,
        liquidity_score=5.0,
        bid_ask_spread=0.02,
        volatility_regime="medium",
        volume_24h=100000.0,
        metadata=StreamlinedEventMetadata(
            market_id="market-123",
            condition_id="0xabc123",
            created_at=1234567890,
            last_updated=1234567890
        )
    )


@pytest.mark.asyncio
async def test_memory_retrieval_node_success():
    """Test successful memory retrieval."""
    # Create test state
    state: GraphState = {
        "condition_id": "0xabc123",
        "mbd": create_test_mbd(),
        "active_agents": ["market_microstructure", "probability_baseline"]
    }
    
    # Mock persistence layer
    persistence = MagicMock()
    
    # Mock get_historical_signals
    async def mock_get_signals(condition_id, agent_name, limit):
        return Ok([
            AgentSignal(
                agent_name=agent_name,
                timestamp=int(time.time()),
                confidence=0.8,
                direction="YES",
                fair_probability=0.65,
                key_drivers=["Test driver"],
                risk_factors=["Test risk"],
                metadata={}
            )
        ])
    
    persistence.get_historical_signals = mock_get_signals
    
    # Create config
    config = create_test_config(enable_memory=True)
    
    # Execute node
    result = await memory_retrieval_node(state, persistence, config)
    
    # Verify results
    assert "memory_context" in result
    assert "audit_log" in result
    assert len(result["memory_context"]) == 2
    assert "market_microstructure" in result["memory_context"]
    assert "probability_baseline" in result["memory_context"]
    assert len(result["audit_log"]) == 1
    assert result["audit_log"][0].stage == "memory_retrieval"
    assert result["audit_log"][0].status == "completed"


@pytest.mark.asyncio
async def test_memory_retrieval_node_disabled():
    """Test memory retrieval when disabled."""
    # Create test state
    state: GraphState = {
        "condition_id": "0xabc123",
        "mbd": create_test_mbd(),
        "active_agents": ["market_microstructure"]
    }
    
    # Mock persistence layer
    persistence = MagicMock()
    
    # Create config with memory disabled
    config = create_test_config(enable_memory=False)
    
    # Execute node
    result = await memory_retrieval_node(state, persistence, config)
    
    # Verify results
    assert "memory_context" in result
    assert len(result["memory_context"]) == 0
    assert result["audit_log"][0].details["memory_enabled"] is False


@pytest.mark.asyncio
async def test_memory_retrieval_node_missing_condition_id():
    """Test memory retrieval with missing condition_id."""
    # Create test state without condition_id
    state: GraphState = {
        "mbd": create_test_mbd()
    }
    
    # Mock persistence layer
    persistence = MagicMock()
    
    # Create config
    config = create_test_config()
    
    # Execute node
    result = await memory_retrieval_node(state, persistence, config)
    
    # Verify error handling
    assert "memory_context" in result
    assert len(result["memory_context"]) == 0
    assert result["audit_log"][0].status == "failed"
    assert "condition_id" in result["audit_log"][0].details["error"]


@pytest.mark.asyncio
async def test_memory_retrieval_node_missing_mbd():
    """Test memory retrieval with missing MBD."""
    # Create test state without MBD
    state: GraphState = {
        "condition_id": "0xabc123"
    }
    
    # Mock persistence layer
    persistence = MagicMock()
    
    # Create config
    config = create_test_config()
    
    # Execute node
    result = await memory_retrieval_node(state, persistence, config)
    
    # Verify error handling
    assert "memory_context" in result
    assert len(result["memory_context"]) == 0
    assert result["audit_log"][0].status == "failed"


@pytest.mark.asyncio
async def test_memory_retrieval_node_with_exception():
    """Test memory retrieval with exception during query."""
    # Create test state
    state: GraphState = {
        "condition_id": "0xabc123",
        "mbd": create_test_mbd(),
        "active_agents": ["market_microstructure"]
    }
    
    # Mock persistence layer that raises exception
    persistence = MagicMock()
    
    async def mock_get_signals_error(condition_id, agent_name, limit):
        raise Exception("Database error")
    
    persistence.get_historical_signals = mock_get_signals_error
    
    # Create config
    config = create_test_config()
    
    # Execute node
    result = await memory_retrieval_node(state, persistence, config)
    
    # Verify graceful error handling
    assert "memory_context" in result
    assert len(result["memory_context"]) == 1
    assert len(result["memory_context"]["market_microstructure"].historical_signals) == 0
    assert result["audit_log"][0].status == "failed"
    assert "error" in result["audit_log"][0].details


def test_get_all_agent_names():
    """Test getting all agent names from config."""
    config = create_test_config()
    
    agent_names = _get_all_agent_names(config)
    
    # Should include MVP and Event Intelligence agents
    assert "market_microstructure" in agent_names
    assert "probability_baseline" in agent_names
    assert "risk_assessment" in agent_names
    assert "breaking_news" in agent_names
    assert "event_impact" in agent_names
    
    # Should not include disabled agent types
    assert "polling_intelligence" not in agent_names
    assert "media_sentiment" not in agent_names


def test_create_memory_retrieval_node():
    """Test factory function for creating node."""
    persistence = MagicMock()
    config = create_test_config()
    
    node = create_memory_retrieval_node(persistence, config)
    
    # Verify node is callable
    assert callable(node)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
