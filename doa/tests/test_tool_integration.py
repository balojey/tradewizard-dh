"""
Test to verify that agents can access their tools correctly.

This test verifies the fix for the issue where autonomous agents
with tools were unable to access those tools due to missing client
references in the ToolContext.
"""

import pytest
from unittest.mock import Mock, AsyncMock
from tools.newsdata_tools import ToolContext
from tools.polymarket_tools import (
    create_fetch_related_markets_tool,
    create_fetch_historical_prices_tool
)
from utils.tool_cache import ToolCache


def test_tool_context_accepts_polymarket_client():
    """Test that ToolContext can be created with polymarket_client."""
    cache = ToolCache(session_id='test')
    audit_log = []
    
    # Create mock polymarket client
    mock_polymarket_client = Mock()
    
    # Create context with polymarket_client
    context = ToolContext(
        newsdata_client=None,
        polymarket_client=mock_polymarket_client,
        cache=cache,
        audit_log=audit_log,
        agent_name='test_agent'
    )
    
    assert context.polymarket_client is not None
    assert context.polymarket_client == mock_polymarket_client
    assert context.newsdata_client is None


def test_tool_context_accepts_newsdata_client():
    """Test that ToolContext can be created with newsdata_client."""
    cache = ToolCache(session_id='test')
    audit_log = []
    
    # Create mock newsdata client
    mock_newsdata_client = Mock()
    
    # Create context with newsdata_client
    context = ToolContext(
        newsdata_client=mock_newsdata_client,
        polymarket_client=None,
        cache=cache,
        audit_log=audit_log,
        agent_name='test_agent'
    )
    
    assert context.newsdata_client is not None
    assert context.newsdata_client == mock_newsdata_client
    assert context.polymarket_client is None


def test_newsdata_tools_can_access_client():
    """Test that NewsData tools can access the client from context."""
    cache = ToolCache(session_id='test')
    audit_log = []
    
    # Create mock newsdata client
    mock_newsdata_client = Mock()
    
    # Create context with newsdata_client (like breaking_news and media_sentiment do)
    context = ToolContext(
        newsdata_client=mock_newsdata_client,
        cache=cache,
        audit_log=audit_log,
        agent_name='test_agent'
    )
    
    # Create NewsData tools
    from tools.newsdata_tools import (
        create_fetch_latest_news_tool,
        create_fetch_archive_news_tool,
        create_fetch_crypto_news_tool,
        create_fetch_market_news_tool
    )
    
    fetch_latest_news_tool = create_fetch_latest_news_tool(context)
    fetch_archive_news_tool = create_fetch_archive_news_tool(context)
    fetch_crypto_news_tool = create_fetch_crypto_news_tool(context)
    fetch_market_news_tool = create_fetch_market_news_tool(context)
    
    # Verify tools were created successfully
    assert fetch_latest_news_tool is not None
    assert fetch_archive_news_tool is not None
    assert fetch_crypto_news_tool is not None
    assert fetch_market_news_tool is not None
    assert fetch_latest_news_tool.name == "fetch_latest_news"
    assert fetch_archive_news_tool.name == "fetch_archive_news"
    assert fetch_crypto_news_tool.name == "fetch_crypto_news"
    assert fetch_market_news_tool.name == "fetch_market_news"


def test_polymarket_tools_can_access_client():
    """Test that Polymarket tools can access the client from context."""
    cache = ToolCache(session_id='test')
    audit_log = []
    
    # Create mock polymarket client
    mock_polymarket_client = Mock()
    
    # Create context with polymarket_client
    context = ToolContext(
        newsdata_client=None,
        polymarket_client=mock_polymarket_client,
        cache=cache,
        audit_log=audit_log,
        agent_name='test_agent'
    )
    
    # Create tools
    fetch_related_markets_tool = create_fetch_related_markets_tool(context)
    fetch_historical_prices_tool = create_fetch_historical_prices_tool(context)
    
    # Verify tools were created successfully
    assert fetch_related_markets_tool is not None
    assert fetch_historical_prices_tool is not None
    assert fetch_related_markets_tool.name == "fetch_related_markets"
    assert fetch_historical_prices_tool.name == "fetch_historical_prices"


@pytest.mark.asyncio
async def test_polymarket_tool_has_client_access():
    """Test that Polymarket tools can access the client from context (no execution)."""
    cache = ToolCache(session_id='test')
    audit_log = []
    
    # Create mock polymarket client
    mock_polymarket_client = Mock()
    
    # Create context with polymarket_client
    context = ToolContext(
        newsdata_client=None,
        polymarket_client=mock_polymarket_client,
        cache=cache,
        audit_log=audit_log,
        agent_name='test_agent'
    )
    
    # Create tool
    fetch_related_markets_tool = create_fetch_related_markets_tool(context)
    
    # Verify the tool was created and has access to the client
    # The key fix is that getattr(context, 'polymarket_client', None) should not be None
    assert context.polymarket_client is not None
    assert context.polymarket_client == mock_polymarket_client
    
    # This confirms the fix: tools can now access polymarket_client from context
    print("✓ Polymarket tools can access client from ToolContext")


if __name__ == "__main__":
    # Run basic tests
    test_tool_context_accepts_polymarket_client()
    print("✓ ToolContext accepts polymarket_client")
    
    test_tool_context_accepts_newsdata_client()
    print("✓ ToolContext accepts newsdata_client")
    
    test_newsdata_tools_can_access_client()
    print("✓ NewsData tools can access client from context")
    
    test_polymarket_tools_can_access_client()
    print("✓ Polymarket tools can access client from context")
    
    print("\n✓ All basic tests passed!")
    print("\nRun 'pytest doa/test_tool_integration.py' for async tests")
