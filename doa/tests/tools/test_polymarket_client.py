"""Unit tests for Polymarket client CLOB API integration."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from tools.polymarket_client import PolymarketClient, PolymarketMarket
from config import PolymarketConfig
from utils.result import Ok, Err


@pytest.mark.asyncio
async def test_fetch_market_data_uses_clob_api():
    """Test that fetch_market_data uses CLOB API endpoint with condition_id in URL path."""
    config = PolymarketConfig(
        gamma_api_url="https://gamma-api.polymarket.com",
        clob_api_url="https://clob.polymarket.com",
        api_key="test_key"
    )
    client = PolymarketClient(config)
    
    condition_id = "0x1234567890abcdef"
    expected_url = f"{config.clob_api_url}/markets/{condition_id}"
    
    # Mock httpx.AsyncClient
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "question": "Will this test pass?",
        "condition_id": condition_id,
        "tokens": [
            {"outcome": "Yes", "price": 0.65},
            {"outcome": "No", "price": 0.35}
        ],
        "description": "Test market",
        "end_date_iso": "2025-12-31T23:59:59Z",
        "active": True,
        "closed": False
    }
    
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_response
        mock_client_class.return_value = mock_client
        
        result = await client.fetch_market_data(condition_id)
        
        # Verify CLOB API URL was used (not Gamma API)
        mock_client.get.assert_called_once()
        call_args = mock_client.get.call_args
        assert call_args[0][0] == expected_url
        
        # Verify result is successful
        assert result.is_ok()
        market = result.unwrap()
        assert isinstance(market, PolymarketMarket)
        assert market.question == "Will this test pass?"


@pytest.mark.asyncio
async def test_polymarket_market_handles_clob_format():
    """Test that PolymarketMarket model correctly parses CLOB API format."""
    clob_data = {
        "question": "Test question",
        "condition_id": "0xabc123",
        "market_slug": "test-market",
        "tokens": [
            {"outcome": "Yes", "price": 0.52, "token_id": "token1"},
            {"outcome": "No", "price": 0.48, "token_id": "token2"}
        ],
        "end_date_iso": "2025-12-31T23:59:59Z",
        "description": "Test description",
        "active": True,
        "closed": False
    }
    
    market = PolymarketMarket(**clob_data)
    
    # Test normalized properties
    assert market.normalized_condition_id == "0xabc123"
    assert market.normalized_market_id == "test-market"
    assert market.normalized_end_date == "2025-12-31T23:59:59Z"
    
    # Test outcomes and prices extraction
    outcomes, prices = market.get_outcomes_and_prices()
    assert outcomes == ["Yes", "No"]
    assert prices == [0.52, 0.48]


@pytest.mark.asyncio
async def test_polymarket_market_handles_gamma_format():
    """Test that PolymarketMarket model correctly parses Gamma API format."""
    gamma_data = {
        "id": "market123",
        "question": "Test question",
        "conditionId": "0xabc123",
        "outcomes": '["Yes", "No"]',
        "outcomePrices": '["0.52", "0.48"]',
        "endDate": "2025-12-31T23:59:59Z",
        "description": "Test description",
        "volume": "10000",
        "liquidity": "5000",
        "active": True,
        "closed": False
    }
    
    market = PolymarketMarket(**gamma_data)
    
    # Test normalized properties
    assert market.normalized_condition_id == "0xabc123"
    assert market.normalized_market_id == "market123"
    assert market.normalized_end_date == "2025-12-31T23:59:59Z"
    
    # Test outcomes and prices extraction
    outcomes, prices = market.get_outcomes_and_prices()
    assert outcomes == ["Yes", "No"]
    assert prices == [0.52, 0.48]


@pytest.mark.asyncio
async def test_fetch_market_data_handles_404():
    """Test that fetch_market_data handles 404 errors correctly."""
    config = PolymarketConfig(
        gamma_api_url="https://gamma-api.polymarket.com",
        clob_api_url="https://clob.polymarket.com",
        api_key="test_key"
    )
    client = PolymarketClient(config)
    
    condition_id = "0xnonexistent"
    
    # Mock httpx.AsyncClient to return 404
    mock_response = MagicMock()
    mock_response.status_code = 404
    
    with patch("httpx.AsyncClient") as mock_client_class:
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.get.return_value = mock_response
        mock_client_class.return_value = mock_client
        
        result = await client.fetch_market_data(condition_id)
        
        # Verify error is returned
        assert result.is_err()
        error = result.error
        assert error.type == "INVALID_MARKET_ID"
        assert condition_id in error.message
