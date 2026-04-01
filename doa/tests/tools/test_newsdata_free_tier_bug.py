"""
Bug condition exploration test for NewsData free tier parameter issue.

This test demonstrates Bug 1: NewsData API Free Tier Parameters
IMPORTANT: This test is expected to FAIL on unfixed code - failure confirms the bug exists.

Bug Condition (from design.md):
    WHEN the NewsData client makes API requests with free tier credentials
    THEN the system passes `size` and `timeframe` parameters that are not supported by the free tier plan
    AND the API returns errors for unsupported parameters

Expected Behavior (after fix):
    WHEN the NewsData client makes API requests with free tier credentials
    THEN the system SHALL exclude the `size` and `timeframe` parameters from the request
    AND the API call SHALL succeed and return up to 10 articles per credit
"""

import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from tools.newsdata_client import NewsDataClient


# ============================================================================
# Bug Condition: Free Tier Parameters Included (Current Behavior)
# ============================================================================

@pytest.mark.asyncio
async def test_fetch_latest_news_free_tier_includes_unsupported_params():
    """
    Test that free tier requests exclude unsupported size and timeframe parameters.
    
    This test demonstrates the fix by showing that the NewsData client excludes
    size and timeframe parameters for free tier accounts, allowing API calls to succeed.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (API returns error for unsupported parameters)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (parameters excluded, API succeeds)
    """
    # Create client with free tier flag
    client = NewsDataClient(api_key="test_free_tier_key", is_free_tier=True)
    
    # Mock the HTTP request to capture parameters
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        # After fix: API should succeed because parameters are excluded
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 10,
            'results': []
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        # Attempt to fetch news with size and timeframe parameters
        result = await client.fetch_latest_news(
            query="test",
            size=20,
            timeframe="24h"
        )
        
        # Verify the API call succeeded
        assert result['status'] == 'ok'
        
        # Verify that size and timeframe were NOT passed in the request
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        
        # FIX VERIFIED: These parameters should NOT be included for free tier
        assert 'size' not in params, "Fix verified: size parameter excluded for free tier"
        assert 'timeframe' not in params, "Fix verified: timeframe parameter excluded for free tier"


@pytest.mark.asyncio
async def test_fetch_archive_news_free_tier_includes_size():
    """
    Test that archive news requests exclude size parameter for free tier.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (size parameter included)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (size parameter excluded)
    """
    client = NewsDataClient(api_key="test_free_tier_key", is_free_tier=True)
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 10,
            'results': []
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        result = await client.fetch_archive_news(
            from_date="2024-01-01",
            to_date="2024-01-31",
            size=20
        )
        
        assert result['status'] == 'ok'
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        assert 'size' not in params, "Fix verified: size parameter excluded for free tier"


@pytest.mark.asyncio
async def test_fetch_crypto_news_free_tier_includes_unsupported_params():
    """
    Test that crypto news requests exclude size and timeframe for free tier.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (parameters included)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (parameters excluded)
    """
    client = NewsDataClient(api_key="test_free_tier_key", is_free_tier=True)
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 10,
            'results': []
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        result = await client.fetch_crypto_news(
            coin=["BTC"],
            size=20,
            timeframe="1h"
        )
        
        assert result['status'] == 'ok'
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        assert 'size' not in params, "Fix verified: size parameter excluded for free tier"
        assert 'timeframe' not in params, "Fix verified: timeframe parameter excluded for free tier"


@pytest.mark.asyncio
async def test_fetch_market_news_free_tier_includes_unsupported_params():
    """
    Test that market news requests exclude size and timeframe for free tier.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (parameters included)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (parameters excluded)
    """
    client = NewsDataClient(api_key="test_free_tier_key", is_free_tier=True)
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        # After fix: API should succeed because parameters are excluded
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 10,
            'results': []
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        result = await client.fetch_market_news(
            symbol=["AAPL"],
            size=20,
            timeframe="24h"
        )
        
        # Verify the API call succeeded
        assert result['status'] == 'ok'
        
        # Verify that size and timeframe were NOT passed in the request
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        
        # FIX VERIFIED: These parameters should NOT be included for free tier
        assert 'size' not in params, "Fix verified: size parameter excluded for free tier"
        assert 'timeframe' not in params, "Fix verified: timeframe parameter excluded for free tier"


# ============================================================================
# Property-Based Test: Free Tier Parameter Exclusion
# ============================================================================

@given(
    size=st.integers(min_value=1, max_value=50),
    timeframe=st.sampled_from(["1h", "6h", "12h", "24h", "48h"])
)
@settings(max_examples=20, deadline=None)
@pytest.mark.asyncio
@pytest.mark.property
async def test_property_free_tier_excludes_size_and_timeframe(size, timeframe):
    """
    Property: For ANY free tier request with size and timeframe parameters,
    the fixed client SHALL exclude these parameters from the API request.
    
    This property-based test generates various combinations of size and timeframe
    values to ensure the fix works correctly across the entire input domain.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test FAILS (parameters included)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (parameters excluded)
    """
    client = NewsDataClient(api_key="test_free_tier_key", is_free_tier=True)
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        # After fix: API should succeed because parameters are excluded
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 10,
            'results': []
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        # Attempt to fetch with size and timeframe
        result = await client.fetch_latest_news(
            query="test",
            size=size,
            timeframe=timeframe
        )
        
        # Verify request was made
        assert mock_client.get.called
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        
        # Property: size and timeframe should NOT be in params for free tier
        assert 'size' not in params, f"Property violated: size={size} should be excluded for free tier"
        assert 'timeframe' not in params, f"Property violated: timeframe={timeframe} should be excluded for free tier"
        
        # Verify API call succeeded
        assert result['status'] == 'ok'
