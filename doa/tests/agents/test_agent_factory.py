"""Unit tests for agent factory."""

import pytest
import time
from unittest.mock import AsyncMock, MagicMock, patch

from agents.agent_factory import (
    create_agent_node,
    format_memory_context,
    format_market_briefing,
    execute_agent_with_timeout,
    retry_with_backoff,
)
from config import EngineConfig, LLMConfig, AgentConfig
from models.types import (
    AgentMemoryContext,
    AgentSignal,
    MarketBriefingDocument,
    StreamlinedEventMetadata,
    EventContext,
)
from models.state import GraphState


@pytest.fixture
def sample_mbd():
    """Create a sample Market Briefing Document."""
    return MarketBriefingDocument(
        market_id="market_123",
        condition_id="condition_456",
        event_type="election",
        question="Will Donald Trump win the 2024 US Presidential Election?",
        resolution_criteria="Resolves YES if Trump wins, NO otherwise",
        expiry_timestamp=int(time.time()) + 86400 * 30,  # 30 days from now
        current_probability=0.52,
        liquidity_score=8.5,
        bid_ask_spread=0.5,
        volatility_regime="medium",
        volume_24h=1500000.0,
        event_context=EventContext(
            event_id="event_789",
            event_title="2024 US Presidential Election",
            event_description="Markets related to the 2024 US Presidential Election",
            related_markets=["market_123", "market_456"],
            tags=["politics", "election", "usa"]
        ),
        keywords=["trump", "election", "2024", "president"],
        metadata=StreamlinedEventMetadata(
            market_id="market_123",
            condition_id="condition_456",
            created_at=int(time.time()) - 86400 * 7,  # 7 days ago
            last_updated=int(time.time()),
            source="polymarket",
            version="1.0"
        )
    )


@pytest.fixture
def sample_memory_context():
    """Create a sample memory context."""
    return AgentMemoryContext(
        agent_name="test_agent",
        market_id="market_123",
        condition_id="condition_456",
        historical_signals=[
            AgentSignal(
                agent_name="test_agent",
                timestamp=int(time.time()) - 86400,  # 1 day ago
                confidence=0.75,
                direction="YES",
                fair_probability=0.55,
                key_drivers=["Strong polling", "Economic indicators"],
                risk_factors=["Volatility", "External events"]
            )
        ]
    )


@pytest.fixture
def mock_config():
    """Create a mock engine configuration."""
    return MagicMock(spec=EngineConfig)


def test_format_memory_context_with_history(sample_memory_context):
    """Test memory context formatting with historical signals."""
    result = format_memory_context(sample_memory_context, "test_agent")
    
    assert "Historical Context" in result
    assert "Previous Analysis 1" in result
    assert "Direction: YES" in result
    assert "Fair Probability: 55.00%" in result
    assert "Confidence: 75.00%" in result
    assert "Strong polling" in result
    assert "Volatility" in result


def test_format_memory_context_without_history():
    """Test memory context formatting without historical signals."""
    result = format_memory_context(None, "test_agent")
    
    assert "Historical Context" in result
    assert "No previous analysis available" in result


def test_format_market_briefing(sample_mbd):
    """Test market briefing formatting."""
    result = format_market_briefing(sample_mbd)
    
    assert "Market Briefing Document" in result
    assert "Will Donald Trump win" in result
    assert "Current Probability: 52.00%" in result
    assert "Liquidity Score: 8.5/10" in result
    assert "Volatility Regime: medium" in result
    assert "Event Context" in result
    assert "2024 US Presidential Election" in result
    assert "Keywords" in result
    assert "trump" in result


@pytest.mark.asyncio
async def test_execute_agent_with_timeout_success():
    """Test successful agent execution within timeout."""
    expected_signal = AgentSignal(
        agent_name="test_agent",
        timestamp=int(time.time()),
        confidence=0.8,
        direction="YES",
        fair_probability=0.6,
        key_drivers=["Test driver"],
        risk_factors=["Test risk"]
    )
    
    async def mock_agent_fn():
        return expected_signal
    
    result = await execute_agent_with_timeout(
        mock_agent_fn,
        "test_agent",
        timeout_ms=5000
    )
    
    assert "agent_signals" in result
    assert len(result["agent_signals"]) == 1
    assert result["agent_signals"][0] == expected_signal


@pytest.mark.asyncio
async def test_execute_agent_with_timeout_timeout():
    """Test agent execution timeout."""
    async def slow_agent_fn():
        import asyncio
        await asyncio.sleep(2)  # Sleep longer than timeout
        return AgentSignal(
            agent_name="test_agent",
            timestamp=int(time.time()),
            confidence=0.8,
            direction="YES",
            fair_probability=0.6,
            key_drivers=["Test"],
            risk_factors=["Test"]
        )
    
    result = await execute_agent_with_timeout(
        slow_agent_fn,
        "test_agent",
        timeout_ms=100  # Very short timeout
    )
    
    assert "agent_errors" in result
    assert len(result["agent_errors"]) == 1
    assert result["agent_errors"][0].type == "TIMEOUT"
    assert result["agent_errors"][0].agent_name == "test_agent"


@pytest.mark.asyncio
async def test_execute_agent_with_timeout_error():
    """Test agent execution error handling."""
    async def failing_agent_fn():
        raise ValueError("Test error")
    
    result = await execute_agent_with_timeout(
        failing_agent_fn,
        "test_agent",
        timeout_ms=5000
    )
    
    assert "agent_errors" in result
    assert len(result["agent_errors"]) == 1
    assert result["agent_errors"][0].type == "EXECUTION_FAILED"
    assert result["agent_errors"][0].agent_name == "test_agent"
    assert "Test error" in result["agent_errors"][0].message


@pytest.mark.asyncio
async def test_retry_with_backoff_success():
    """Test retry logic with successful execution."""
    expected_signal = AgentSignal(
        agent_name="test_agent",
        timestamp=int(time.time()),
        confidence=0.8,
        direction="YES",
        fair_probability=0.6,
        key_drivers=["Test"],
        risk_factors=["Test"]
    )
    
    async def mock_agent_fn():
        return expected_signal
    
    result = await retry_with_backoff(
        mock_agent_fn,
        "test_agent",
        max_retries=3,
        initial_delay=0.01  # Short delay for testing
    )
    
    assert result == expected_signal


@pytest.mark.asyncio
async def test_retry_with_backoff_eventual_success():
    """Test retry logic with eventual success after failures."""
    call_count = 0
    
    async def flaky_agent_fn():
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise ValueError("Temporary error")
        return AgentSignal(
            agent_name="test_agent",
            timestamp=int(time.time()),
            confidence=0.8,
            direction="YES",
            fair_probability=0.6,
            key_drivers=["Test"],
            risk_factors=["Test"]
        )
    
    result = await retry_with_backoff(
        flaky_agent_fn,
        "test_agent",
        max_retries=3,
        initial_delay=0.01
    )
    
    assert call_count == 3
    assert result.agent_name == "test_agent"


@pytest.mark.asyncio
async def test_retry_with_backoff_all_failures():
    """Test retry logic when all attempts fail."""
    async def always_failing_agent_fn():
        raise ValueError("Persistent error")
    
    with pytest.raises(ValueError, match="Persistent error"):
        await retry_with_backoff(
            always_failing_agent_fn,
            "test_agent",
            max_retries=3,
            initial_delay=0.01
        )


@pytest.mark.asyncio
async def test_create_agent_node_missing_mbd(mock_config):
    """Test agent node with missing MBD in state."""
    agent_node = create_agent_node(
        agent_name="test_agent",
        system_prompt="Test prompt",
        config=mock_config
    )
    
    state = GraphState(condition_id="test_123")
    result = await agent_node(state)
    
    assert "agent_errors" in result
    assert len(result["agent_errors"]) == 1
    assert "No Market Briefing Document" in result["agent_errors"][0].message


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

