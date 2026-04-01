"""Tests for memory retrieval service."""

import pytest
import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

from database.memory_retrieval import (
    query_agent_memory,
    format_memory_context,
    query_all_agent_memories,
    format_memory_for_prompt
)
from models.types import AgentSignal, AgentMemoryContext
from utils.result import Ok, Err


@pytest.mark.asyncio
async def test_query_agent_memory_success():
    """Test successful memory query."""
    # Mock persistence layer
    persistence = MagicMock()
    
    # Create test signals
    test_signals = [
        AgentSignal(
            agent_name="market_microstructure",
            timestamp=1234567890,
            confidence=0.8,
            direction="YES",
            fair_probability=0.65,
            key_drivers=["Strong order flow"],
            risk_factors=["Low liquidity"],
            metadata={}
        )
    ]
    
    # Mock the get_historical_signals method
    async def mock_get_signals(condition_id, agent_name, limit):
        return Ok(test_signals)
    
    persistence.get_historical_signals = mock_get_signals
    
    # Query memory
    result = await query_agent_memory(
        persistence,
        "0xabc123",
        "market_microstructure",
        max_signals=3,
        timeout_ms=5000
    )
    
    assert result.is_ok()
    signals = result.unwrap()
    assert len(signals) == 1
    assert signals[0].agent_name == "market_microstructure"


@pytest.mark.asyncio
async def test_query_agent_memory_timeout():
    """Test memory query timeout handling."""
    # Mock persistence layer
    persistence = MagicMock()
    
    # Mock slow query that times out
    async def slow_query(condition_id, agent_name, limit):
        await asyncio.sleep(10)  # Longer than timeout
        return Ok([])
    
    persistence.get_historical_signals = slow_query
    
    # Query memory with short timeout
    result = await query_agent_memory(
        persistence,
        "0xabc123",
        "market_microstructure",
        max_signals=3,
        timeout_ms=100  # 100ms timeout
    )
    
    assert result.is_err()
    error = result.error
    assert "timeout" in error.lower()


def test_format_memory_context():
    """Test memory context formatting."""
    signals = [
        AgentSignal(
            agent_name="market_microstructure",
            timestamp=1234567890,
            confidence=0.8,
            direction="YES",
            fair_probability=0.65,
            key_drivers=["Strong order flow"],
            risk_factors=["Low liquidity"],
            metadata={}
        )
    ]
    
    context = format_memory_context(
        "market_microstructure",
        "0xabc123",
        "market-123",
        signals
    )
    
    assert context.agent_name == "market_microstructure"
    assert context.condition_id == "0xabc123"
    assert context.market_id == "market-123"
    assert len(context.historical_signals) == 1


@pytest.mark.asyncio
async def test_query_all_agent_memories():
    """Test querying memory for multiple agents."""
    # Mock persistence layer
    persistence = MagicMock()
    
    # Mock the get_historical_signals method
    async def mock_get_signals(condition_id, agent_name, limit):
        return Ok([
            AgentSignal(
                agent_name=agent_name,
                timestamp=1234567890,
                confidence=0.8,
                direction="YES",
                fair_probability=0.65,
                key_drivers=["Test driver"],
                risk_factors=["Test risk"],
                metadata={}
            )
        ])
    
    persistence.get_historical_signals = mock_get_signals
    
    # Query memory for multiple agents
    memory_contexts = await query_all_agent_memories(
        persistence,
        "0xabc123",
        "market-123",
        ["market_microstructure", "probability_baseline"],
        max_signals=3,
        timeout_ms=5000
    )
    
    assert len(memory_contexts) == 2
    assert "market_microstructure" in memory_contexts
    assert "probability_baseline" in memory_contexts
    assert len(memory_contexts["market_microstructure"].historical_signals) == 1


def test_format_memory_for_prompt_with_signals():
    """Test formatting memory context for prompt with signals."""
    context = AgentMemoryContext(
        agent_name="market_microstructure",
        historical_signals=[
            AgentSignal(
                agent_name="market_microstructure",
                timestamp=1234567890,
                confidence=0.8,
                direction="YES",
                fair_probability=0.65,
                key_drivers=["Strong order flow"],
                risk_factors=["Low liquidity"],
                metadata={}
            )
        ],
        market_id="market-123",
        condition_id="0xabc123"
    )
    
    prompt = format_memory_for_prompt(context)
    
    assert "Previous analysis" in prompt
    assert "market_microstructure" in prompt
    assert "YES" in prompt
    assert "65.00%" in prompt
    assert "Strong order flow" in prompt


def test_format_memory_for_prompt_empty():
    """Test formatting memory context for prompt with no signals."""
    context = AgentMemoryContext(
        agent_name="market_microstructure",
        historical_signals=[],
        market_id="market-123",
        condition_id="0xabc123"
    )
    
    prompt = format_memory_for_prompt(context)
    
    assert "No previous analysis" in prompt


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
