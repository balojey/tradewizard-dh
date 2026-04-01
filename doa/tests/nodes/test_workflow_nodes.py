"""Tests for workflow nodes."""

import pytest
from unittest.mock import AsyncMock, MagicMock
from models.types import (
    MarketBriefingDocument,
    EventContext,
    StreamlinedEventMetadata,
    AgentSignal,
    IngestionError
)
from models.state import EventKeywords
from config import EngineConfig, PolymarketConfig, AgentConfig, ConsensusConfig
from utils.result import Ok, Err
from nodes.market_ingestion import market_ingestion_node
from nodes.keyword_extraction import keyword_extraction_node, extract_keywords_from_text
from nodes.dynamic_agent_selection import dynamic_agent_selection_node
from nodes.agent_signal_fusion import agent_signal_fusion_node


@pytest.fixture
def mock_config():
    """Create mock configuration."""
    return MagicMock(spec=EngineConfig)


@pytest.fixture
def sample_mbd():
    """Create sample Market Briefing Document."""
    return MarketBriefingDocument(
        market_id="market_123",
        condition_id="0xabc123",
        event_type="election",
        question="Will Donald Trump win the 2024 Presidential Election?",
        resolution_criteria="Market resolves YES if Trump wins",
        expiry_timestamp=1735689600,
        current_probability=0.52,
        liquidity_score=8.5,
        bid_ask_spread=0.5,
        volatility_regime="medium",
        volume_24h=1500000.0,
        event_context=EventContext(
            event_id="event_123",
            event_title="2024 US Presidential Election",
            event_description="Markets related to the 2024 election",
            related_markets=["market_456", "market_789"],
            tags=["Politics", "Election"]
        ),
        metadata=StreamlinedEventMetadata(
            market_id="market_123",
            condition_id="0xabc123",
            created_at=1700000000,
            last_updated=1700000000,
            source="polymarket",
            version="1.0"
        )
    )


@pytest.mark.asyncio
async def test_market_ingestion_success(mock_config):
    """Test successful market ingestion."""
    # Create mock Polymarket client
    mock_client = MagicMock()
    mock_market = MagicMock()
    mock_market.question = "Test question"
    mock_market.eventSlug = None
    
    # Mock the async method to return Ok result
    async def mock_fetch(condition_id):
        return Ok(mock_market)
    
    mock_client.fetch_market_data = mock_fetch
    mock_client.transform_to_mbd = MagicMock(return_value=MarketBriefingDocument(
        market_id="test_123",
        condition_id="0xtest",
        event_type="other",
        question="Test question",
        resolution_criteria="Test criteria",
        expiry_timestamp=1735689600,
        current_probability=0.5,
        liquidity_score=5.0,
        bid_ask_spread=1.0,
        volatility_regime="medium",
        volume_24h=100000.0,
        metadata=StreamlinedEventMetadata(
            market_id="test_123",
            condition_id="0xtest",
            created_at=1700000000,
            last_updated=1700000000,
            source="polymarket",
            version="1.0"
        )
    ))
    
    # Test node
    state = {"condition_id": "0xtest"}
    result = await market_ingestion_node(state, mock_client, mock_config)
    
    assert "mbd" in result
    assert result["mbd"].question == "Test question"
    assert "audit_log" in result


@pytest.mark.asyncio
async def test_market_ingestion_error(mock_config):
    """Test market ingestion with API error."""
    # Create mock client that returns error
    mock_client = MagicMock()
    
    # Mock the async method to return Err result
    async def mock_fetch(condition_id):
        return Err(IngestionError(
            type="INVALID_MARKET_ID",
            message="Market not found"
        ))
    
    mock_client.fetch_market_data = mock_fetch
    
    # Test node
    state = {"condition_id": "0xinvalid"}
    result = await market_ingestion_node(state, mock_client, mock_config)
    
    assert "ingestion_error" in result
    assert result["ingestion_error"].type == "INVALID_MARKET_ID"
    assert "audit_log" in result


def test_extract_keywords_from_text():
    """Test keyword extraction from text."""
    text = "Will Donald Trump win the 2024 Presidential Election?"
    keywords = extract_keywords_from_text(text)
    
    assert "Donald Trump" in keywords
    assert "2024" in keywords
    assert "Presidential Election" in keywords or "Election" in keywords


@pytest.mark.asyncio
async def test_keyword_extraction_node(sample_mbd, mock_config):
    """Test keyword extraction node."""
    state = {"mbd": sample_mbd}
    result = await keyword_extraction_node(state, mock_config)
    
    assert "market_keywords" in result
    assert "event_level" in result["market_keywords"]
    assert "market_level" in result["market_keywords"]
    assert len(result["market_keywords"]["event_level"]) > 0
    assert "audit_log" in result


@pytest.mark.asyncio
async def test_dynamic_agent_selection_mvp_only(sample_mbd):
    """Test agent selection with MVP agents only."""
    config = MagicMock(spec=EngineConfig)
    config.agents = MagicMock(spec=AgentConfig)
    config.agents.enable_mvp_agents = True
    config.agents.enable_event_intelligence = False
    config.agents.enable_polling_statistical = False
    config.agents.enable_sentiment_narrative = False
    config.agents.enable_price_action = False
    config.agents.enable_event_scenario = False
    config.consensus = MagicMock(spec=ConsensusConfig)
    config.consensus.min_agents_required = 3
    
    state = {
        "mbd": sample_mbd,
        "market_keywords": EventKeywords(event_level=[], market_level=[])
    }
    
    result = await dynamic_agent_selection_node(state, config)
    
    assert "active_agents" in result
    assert len(result["active_agents"]) == 3
    assert "market_microstructure" in result["active_agents"]
    assert "probability_baseline" in result["active_agents"]
    assert "risk_assessment" in result["active_agents"]


@pytest.mark.asyncio
async def test_dynamic_agent_selection_with_keywords(sample_mbd):
    """Test agent selection with keywords triggering advanced agents."""
    config = MagicMock(spec=EngineConfig)
    config.agents = MagicMock(spec=AgentConfig)
    config.agents.enable_mvp_agents = True
    config.agents.enable_event_intelligence = False
    config.agents.enable_polling_statistical = True
    config.agents.enable_sentiment_narrative = False
    config.agents.enable_price_action = False
    config.agents.enable_event_scenario = False
    config.consensus = MagicMock(spec=ConsensusConfig)
    config.consensus.min_agents_required = 3
    
    state = {
        "mbd": sample_mbd,
        "market_keywords": EventKeywords(
            event_level=["Election", "Poll"],
            market_level=["Vote"]
        )
    }
    
    result = await dynamic_agent_selection_node(state, config)
    
    assert "active_agents" in result
    assert len(result["active_agents"]) > 3  # MVP + polling agents
    assert "polling_intelligence" in result["active_agents"]
    assert "historical_pattern" in result["active_agents"]


@pytest.mark.asyncio
async def test_agent_signal_fusion(mock_config):
    """Test agent signal fusion."""
    signals = [
        AgentSignal(
            agent_name="agent_a",
            timestamp=1700000000,
            confidence=0.8,
            direction="YES",
            fair_probability=0.6,
            key_drivers=["Driver 1"],
            risk_factors=["Risk 1"],
            metadata={}
        ),
        AgentSignal(
            agent_name="agent_b",
            timestamp=1700000000,
            confidence=0.7,
            direction="YES",
            fair_probability=0.65,
            key_drivers=["Driver 2"],
            risk_factors=["Risk 2"],
            metadata={}
        )
    ]
    
    state = {
        "agent_signals": signals,
        "active_agents": ["agent_a", "agent_b"]
    }
    
    result = await agent_signal_fusion_node(state, mock_config)
    
    assert "fused_signal" in result
    assert 0.0 <= result["fused_signal"].weighted_probability <= 1.0
    assert 0.0 <= result["fused_signal"].signal_alignment <= 1.0
    assert len(result["fused_signal"].contributing_agents) == 2
    assert "audit_log" in result


@pytest.mark.asyncio
async def test_agent_signal_fusion_with_conflicts(mock_config):
    """Test agent signal fusion with conflicting signals."""
    signals = [
        AgentSignal(
            agent_name="agent_a",
            timestamp=1700000000,
            confidence=0.8,
            direction="YES",
            fair_probability=0.7,
            key_drivers=["Driver 1"],
            risk_factors=["Risk 1"],
            metadata={}
        ),
        AgentSignal(
            agent_name="agent_b",
            timestamp=1700000000,
            confidence=0.8,
            direction="NO",
            fair_probability=0.3,
            key_drivers=["Driver 2"],
            risk_factors=["Risk 2"],
            metadata={}
        )
    ]
    
    state = {
        "agent_signals": signals,
        "active_agents": ["agent_a", "agent_b"]
    }
    
    result = await agent_signal_fusion_node(state, mock_config)
    
    assert "fused_signal" in result
    assert len(result["fused_signal"].conflicts) > 0
    assert result["fused_signal"].signal_alignment < 0.8  # Low alignment due to conflict
