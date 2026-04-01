"""
Preservation property tests for NewsData paid tier functionality.

These tests verify that paid tier functionality remains unchanged after the free tier fix.
IMPORTANT: These tests should PASS on both unfixed and fixed code.

Preservation Requirements (from design.md):
    - Paid tier API requests must continue to pass `size` and `timeframe` parameters as configured
    - NewsData API key rotation logic must continue to work exactly as before
    - Successful API responses must continue to be parsed and returned correctly
"""

import pytest
from hypothesis import given, strategies as st, settings
from unittest.mock import AsyncMock, patch, MagicMock
import httpx
from tools.newsdata_client import NewsDataClient


# ============================================================================
# Preservation: Paid Tier Parameters Included (Expected Behavior)
# ============================================================================

@pytest.mark.asyncio
async def test_fetch_latest_news_paid_tier_includes_size_and_timeframe():
    """
    Test that paid tier requests continue to include size and timeframe parameters.
    
    This preservation test ensures the fix doesn't break paid tier functionality.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test PASSES (parameters included)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (parameters still included for paid tier)
    """
    # Create client without free tier flag (paid tier is default)
    client = NewsDataClient(api_key="test_paid_tier_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        # Paid tier: API should succeed with size and timeframe
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 20,
            'results': []
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        # Fetch with size and timeframe
        result = await client.fetch_latest_news(
            query="test",
            size=20,
            timeframe="24h"
        )
        
        # Verify request was made
        assert mock_client.get.called
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        
        # Preservation: size and timeframe MUST be included for paid tier
        assert 'size' in params, "Preservation violated: size parameter missing for paid tier"
        assert params['size'] == 20, "Preservation violated: size value incorrect"
        assert 'timeframe' in params, "Preservation violated: timeframe parameter missing for paid tier"
        assert params['timeframe'] == "24h", "Preservation violated: timeframe value incorrect"
        
        # Verify API call succeeded
        assert result['status'] == 'ok'
        assert result['totalResults'] == 20


@pytest.mark.asyncio
async def test_fetch_archive_news_paid_tier_includes_size():
    """
    Test that archive news requests continue to include size parameter for paid tier.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    """
    client = NewsDataClient(api_key="test_paid_tier_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 15,
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
            size=15
        )
        
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        
        assert 'size' in params, "Preservation violated: size parameter missing for paid tier"
        assert params['size'] == 15
        assert result['status'] == 'ok'


@pytest.mark.asyncio
async def test_fetch_crypto_news_paid_tier_includes_size_and_timeframe():
    """
    Test that crypto news requests continue to include size and timeframe for paid tier.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    """
    client = NewsDataClient(api_key="test_paid_tier_key")
    
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
            size=10,
            timeframe="1h"
        )
        
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        
        assert 'size' in params, "Preservation violated: size parameter missing for paid tier"
        assert 'timeframe' in params, "Preservation violated: timeframe parameter missing for paid tier"
        assert result['status'] == 'ok'


@pytest.mark.asyncio
async def test_fetch_market_news_paid_tier_includes_size_and_timeframe():
    """
    Test that market news requests continue to include size and timeframe for paid tier.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    """
    client = NewsDataClient(api_key="test_paid_tier_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 25,
            'results': []
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        result = await client.fetch_market_news(
            symbol=["AAPL"],
            size=25,
            timeframe="24h"
        )
        
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        
        assert 'size' in params, "Preservation violated: size parameter missing for paid tier"
        assert 'timeframe' in params, "Preservation violated: timeframe parameter missing for paid tier"
        assert result['status'] == 'ok'


# ============================================================================
# Preservation: API Key Rotation Still Works
# ============================================================================

@pytest.mark.asyncio
async def test_api_key_rotation_still_works():
    """
    Test that API key rotation logic continues to work after the fix.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    """
    # Create client with multiple keys
    client = NewsDataClient(api_key="key1,key2,key3")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        
        # First call: rate limit on key1
        mock_response_1 = MagicMock()
        mock_response_1.status_code = 429
        mock_response_1.json.return_value = {
            'status': 'error',
            'results': {'message': 'rate limit exceeded'}
        }
        mock_response_1.headers = {'Retry-After': '900'}
        
        # Second call: success on key2
        mock_response_2 = MagicMock()
        mock_response_2.status_code = 200
        mock_response_2.json.return_value = {
            'status': 'ok',
            'totalResults': 10,
            'results': []
        }
        mock_response_2.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(side_effect=[mock_response_1, mock_response_2])
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        # Make request - should rotate from key1 to key2
        result = await client.fetch_latest_news(query="test")
        
        # Verify rotation occurred
        assert mock_client.get.call_count == 2, "Key rotation should have occurred"
        assert result['status'] == 'ok', "Request should succeed after rotation"
        
        # Verify key1 is marked as rate limited
        key1_state = client.key_states['key1']
        assert key1_state.is_rate_limited, "Key1 should be marked as rate limited"
        assert key1_state.rate_limit_expiry is not None


# ============================================================================
# Preservation: Response Parsing Still Works
# ============================================================================

@pytest.mark.asyncio
async def test_response_parsing_still_works():
    """
    Test that API response parsing continues to work correctly.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    """
    client = NewsDataClient(api_key="test_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        # Mock realistic API response
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': 2,
            'results': [
                {
                    'article_id': 'abc123',
                    'title': 'Test Article 1',
                    'link': 'https://example.com/1',
                    'description': 'Test description',
                    'pubDate': '2024-01-15 10:00:00'
                },
                {
                    'article_id': 'def456',
                    'title': 'Test Article 2',
                    'link': 'https://example.com/2',
                    'description': 'Another test',
                    'pubDate': '2024-01-15 11:00:00'
                }
            ],
            'nextPage': 'page2token'
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        result = await client.fetch_latest_news(query="test")
        
        # Verify response structure is preserved
        assert result['status'] == 'ok'
        assert result['totalResults'] == 2
        assert len(result['results']) == 2
        assert result['results'][0]['article_id'] == 'abc123'
        assert result['results'][1]['title'] == 'Test Article 2'
        assert result['nextPage'] == 'page2token'


# ============================================================================
# Property-Based Test: Paid Tier Always Includes Parameters
# ============================================================================

@given(
    size=st.integers(min_value=1, max_value=50),
    timeframe=st.sampled_from(["1h", "6h", "12h", "24h", "48h"])
)
@settings(max_examples=20, deadline=None)
@pytest.mark.asyncio
@pytest.mark.property
async def test_property_paid_tier_always_includes_parameters(size, timeframe):
    """
    Property: For ANY paid tier request, size and timeframe parameters
    MUST be included in the API request.
    
    This property-based test ensures preservation across the entire input domain.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    """
    # Paid tier client (default behavior)
    client = NewsDataClient(api_key="test_paid_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_response = MagicMock()
        
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'ok',
            'totalResults': size,
            'results': []
        }
        mock_response.raise_for_status = MagicMock()
        
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)
        mock_client_class.return_value = mock_client
        
        result = await client.fetch_latest_news(
            query="test",
            size=size,
            timeframe=timeframe
        )
        
        call_args = mock_client.get.call_args
        params = call_args.kwargs['params']
        
        # Property: Paid tier MUST include size and timeframe
        assert 'size' in params, f"Preservation violated: size={size} missing for paid tier"
        assert params['size'] == size, f"Preservation violated: size value mismatch"
        assert 'timeframe' in params, f"Preservation violated: timeframe={timeframe} missing for paid tier"
        assert params['timeframe'] == timeframe, f"Preservation violated: timeframe value mismatch"
        
        assert result['status'] == 'ok'
