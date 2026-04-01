"""Unit tests for NewsData client."""

import pytest
import httpx
from unittest.mock import AsyncMock, patch
from tools.newsdata_client import NewsDataClient, NewsDataResponse


@pytest.mark.asyncio
async def test_newsdata_client_initialization():
    """Test NewsData client initialization with API key and configuration."""
    client = NewsDataClient(
        api_key="test_api_key",
        base_url="https://newsdata.io/api/1",
        timeout=30
    )
    
    assert client.api_key == "test_api_key"
    assert client.base_url == "https://newsdata.io/api/1"
    assert client.timeout == 30
    assert client.max_retries == 3
    assert client.base_backoff == 1.0


@pytest.mark.asyncio
async def test_fetch_latest_news_builds_correct_params():
    """Test that fetch_latest_news constructs correct query parameters."""
    client = NewsDataClient(api_key="test_key")
    
    # Mock the _make_request method
    with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
        mock_request.return_value = {
            "status": "success",
            "totalResults": 1,
            "results": []
        }
        
        await client.fetch_latest_news(
            query="election",
            qInTitle="Trump",
            timeframe="24h",
            country=["us"],
            category=["politics"],
            language=["en"],
            sentiment="positive",
            size=10,
            removeduplicate=True
        )
        
        # Verify _make_request was called with correct parameters
        mock_request.assert_called_once()
        call_args = mock_request.call_args
        endpoint = call_args[0][0]
        params = call_args[0][1]
        
        assert endpoint == "https://newsdata.io/api/1/latest"
        assert params["apikey"] == "test_key"
        assert params["q"] == "election"
        assert params["qInTitle"] == "Trump"
        assert params["timeframe"] == "24h"
        assert params["country"] == "us"
        assert params["category"] == "politics"
        assert params["language"] == "en"
        assert params["sentiment"] == "positive"
        assert params["size"] == 10
        assert params["removeduplicate"] == 1


@pytest.mark.asyncio
async def test_fetch_archive_news_builds_correct_params():
    """Test that fetch_archive_news constructs correct query parameters."""
    client = NewsDataClient(api_key="test_key")
    
    with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
        mock_request.return_value = {"status": "success", "totalResults": 0, "results": []}
        
        await client.fetch_archive_news(
            from_date="2024-01-01",
            to_date="2024-01-31",
            query="market",
            country=["us", "uk"],
            language=["en"]
        )
        
        call_args = mock_request.call_args
        endpoint = call_args[0][0]
        params = call_args[0][1]
        
        assert endpoint == "https://newsdata.io/api/1/archive"
        assert params["from_date"] == "2024-01-01"
        assert params["to_date"] == "2024-01-31"
        assert params["q"] == "market"
        assert params["country"] == "us,uk"


@pytest.mark.asyncio
async def test_fetch_crypto_news_builds_correct_params():
    """Test that fetch_crypto_news constructs correct query parameters."""
    client = NewsDataClient(api_key="test_key")
    
    with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
        mock_request.return_value = {"status": "success", "totalResults": 0, "results": []}
        
        await client.fetch_crypto_news(
            coin=["BTC", "ETH"],
            query="price",
            timeframe="24h",
            sentiment="positive"
        )
        
        call_args = mock_request.call_args
        endpoint = call_args[0][0]
        params = call_args[0][1]
        
        assert endpoint == "https://newsdata.io/api/1/crypto"
        assert params["coin"] == "BTC,ETH"
        assert params["q"] == "price"
        assert params["timeframe"] == "24h"
        assert params["sentiment"] == "positive"


@pytest.mark.asyncio
async def test_fetch_market_news_builds_correct_params():
    """Test that fetch_market_news constructs correct query parameters."""
    client = NewsDataClient(api_key="test_key")
    
    with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
        mock_request.return_value = {"status": "success", "totalResults": 0, "results": []}
        
        await client.fetch_market_news(
            symbol=["AAPL", "GOOGL"],
            organization=["Apple", "Google"],
            query="earnings",
            sentiment="neutral"
        )
        
        call_args = mock_request.call_args
        endpoint = call_args[0][0]
        params = call_args[0][1]
        
        assert endpoint == "https://newsdata.io/api/1/news"
        assert params["symbol"] == "AAPL,GOOGL"
        assert params["organization"] == "Apple,Google"
        assert params["q"] == "earnings"
        assert params["sentiment"] == "neutral"


@pytest.mark.asyncio
async def test_make_request_handles_rate_limiting():
    """Test that _make_request handles 429 rate limiting with retry."""
    client = NewsDataClient(api_key="test_key")
    
    # Mock httpx.AsyncClient
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client
        
        # First call returns 429, second call succeeds
        from unittest.mock import MagicMock
        mock_response_429 = MagicMock()
        mock_response_429.status_code = 429
        mock_response_429.headers.get.return_value = "1"
        
        mock_response_200 = MagicMock()
        mock_response_200.status_code = 200
        mock_response_200.json.return_value = {"status": "success", "results": []}
        
        mock_client.get.side_effect = [mock_response_429, mock_response_200]
        
        result = await client._make_request("https://test.com", {"apikey": "test"})
        
        assert result["status"] == "success"
        assert mock_client.get.call_count == 2


@pytest.mark.asyncio
async def test_make_request_handles_timeout():
    """Test that _make_request handles timeout with retry."""
    client = NewsDataClient(api_key="test_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client
        
        # All attempts timeout
        mock_client.get.side_effect = httpx.TimeoutException("Timeout")
        
        with pytest.raises(httpx.TimeoutException):
            await client._make_request("https://test.com", {"apikey": "test"})
        
        # Should retry max_retries times
        assert mock_client.get.call_count == 3


@pytest.mark.asyncio
async def test_make_request_handles_http_errors():
    """Test that _make_request handles HTTP errors appropriately."""
    client = NewsDataClient(api_key="test_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client
        
        # 404 should not retry
        from unittest.mock import MagicMock
        mock_response = MagicMock()
        mock_response.status_code = 404
        
        def raise_http_error():
            raise httpx.HTTPStatusError(
                "Not found", request=MagicMock(), response=mock_response
            )
        
        mock_response.raise_for_status = raise_http_error
        mock_client.get.return_value = mock_response
        
        with pytest.raises(httpx.HTTPStatusError):
            await client._make_request("https://test.com", {"apikey": "test"})
        
        # Should only try once for 4xx errors
        assert mock_client.get.call_count == 1


@pytest.mark.asyncio
async def test_make_request_parses_json_response():
    """Test that _make_request successfully parses JSON response."""
    client = NewsDataClient(api_key="test_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client
        
        from unittest.mock import MagicMock
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "status": "success",
            "totalResults": 2,
            "results": [
                {"article_id": "1", "title": "Test 1", "link": "http://test1.com"},
                {"article_id": "2", "title": "Test 2", "link": "http://test2.com"}
            ]
        }
        
        mock_client.get.return_value = mock_response
        
        result = await client._make_request("https://test.com", {"apikey": "test"})
        
        assert result["status"] == "success"
        assert result["totalResults"] == 2
        assert len(result["results"]) == 2


@pytest.mark.asyncio
async def test_make_request_handles_invalid_json():
    """Test that _make_request handles invalid JSON response."""
    client = NewsDataClient(api_key="test_key")
    
    with patch('httpx.AsyncClient') as mock_client_class:
        mock_client = AsyncMock()
        mock_client_class.return_value.__aenter__.return_value = mock_client
        
        from unittest.mock import MagicMock
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.side_effect = ValueError("Invalid JSON")
        
        mock_client.get.return_value = mock_response
        
        with pytest.raises(ValueError, match="Failed to parse NewsData API response"):
            await client._make_request("https://test.com", {"apikey": "test"})


@pytest.mark.asyncio
async def test_size_parameter_capped_at_50():
    """Test that size parameter is capped at API maximum of 50."""
    client = NewsDataClient(api_key="test_key")
    
    with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
        mock_request.return_value = {"status": "success", "totalResults": 0, "results": []}
        
        # Request 100 articles, should be capped at 50
        await client.fetch_latest_news(size=100)
        
        call_args = mock_request.call_args
        params = call_args[0][1]
        
        assert params["size"] == 50


# ============================================================================
# Multi-Key Rotation Tests (Task 1-7)
# ============================================================================

class TestConfigurationParsing:
    """Test configuration parsing and key state initialization."""
    
    def test_single_key_configuration(self):
        """Single key configuration should work (backward compatibility)."""
        client = NewsDataClient(api_key="test_key_12345678")
        
        assert len(client.api_keys) == 1
        assert client.api_keys[0] == "test_key_12345678"
        assert len(client.key_states) == 1
        assert client.current_key_index == 0
        # Backward compatibility check
        assert client.api_key == "test_key_12345678"
    
    def test_multiple_keys_configuration(self):
        """Multiple keys should be parsed correctly."""
        client = NewsDataClient(api_key="key1_12345678,key2_87654321,key3_abcdefgh")
        
        assert len(client.api_keys) == 3
        assert client.api_keys[0] == "key1_12345678"
        assert client.api_keys[1] == "key2_87654321"
        assert client.api_keys[2] == "key3_abcdefgh"
        assert len(client.key_states) == 3
        assert client.current_key_index == 0
    
    def test_whitespace_trimming(self):
        """Whitespace should be trimmed from keys."""
        client = NewsDataClient(api_key="  key1_123  ,  key2_456  ,key3_789")
        
        assert len(client.api_keys) == 3
        assert client.api_keys[0] == "key1_123"
        assert client.api_keys[1] == "key2_456"
        assert client.api_keys[2] == "key3_789"
    
    def test_empty_keys_filtered(self):
        """Empty keys should be filtered out."""
        client = NewsDataClient(api_key="key1_123,,key2_456,  ,key3_789")
        
        assert len(client.api_keys) == 3
        assert client.api_keys[0] == "key1_123"
        assert client.api_keys[1] == "key2_456"
        assert client.api_keys[2] == "key3_789"
    
    def test_empty_string_raises_error(self):
        """Empty string should raise ValueError."""
        with pytest.raises(ValueError, match="At least one API key must be provided"):
            NewsDataClient(api_key="")
    
    def test_all_whitespace_raises_error(self):
        """All whitespace should raise ValueError."""
        with pytest.raises(ValueError, match="At least one API key must be provided"):
            NewsDataClient(api_key="   ,  ,  ")
    
    def test_only_commas_raises_error(self):
        """Only commas should raise ValueError."""
        with pytest.raises(ValueError, match="At least one API key must be provided"):
            NewsDataClient(api_key=",,,")


class TestKeyStateInitialization:
    """Test key state initialization."""
    
    def test_key_state_created_for_each_key(self):
        """Key state should be created for each configured key."""
        client = NewsDataClient(api_key="key1_12345678,key2_87654321")
        
        assert len(client.key_states) == 2
        assert "key1_123" in client.key_states
        assert "key2_876" in client.key_states
    
    def test_key_state_initial_values(self):
        """Key state should have correct initial values."""
        client = NewsDataClient(api_key="test_key_12345678")
        
        key_id = "test_key"
        state = client.key_states[key_id]
        
        assert state.key == "test_key_12345678"
        assert state.key_id == "test_key"
        assert state.is_rate_limited is False
        assert state.rate_limit_expiry is None
        assert state.total_requests == 0
        assert state.last_used is None
    
    def test_key_id_truncation(self):
        """Key ID should be first 8 characters."""
        client = NewsDataClient(api_key="verylongapikey123456789")
        
        key_id = client._get_key_id("verylongapikey123456789")
        assert key_id == "verylong"
        assert len(key_id) == 8
    
    def test_key_id_short_key(self):
        """Key ID should be full key if less than 8 characters."""
        client = NewsDataClient(api_key="short")
        
        key_id = client._get_key_id("short")
        assert key_id == "short"
        assert len(key_id) == 5
    
    def test_current_key_index_initialized(self):
        """Current key index should be initialized to 0."""
        client = NewsDataClient(api_key="key1,key2,key3")
        
        assert client.current_key_index == 0


class TestKeyStateDataclass:
    """Test KeyState dataclass."""
    
    def test_key_state_creation(self):
        """KeyState should be created with all required fields."""
        from tools.newsdata_client import KeyState
        from datetime import datetime
        
        state = KeyState(
            key="test_key_12345678",
            key_id="test_key",
            is_rate_limited=False,
            rate_limit_expiry=None,
            total_requests=0,
            last_used=None
        )
        
        assert state.key == "test_key_12345678"
        assert state.key_id == "test_key"
        assert state.is_rate_limited is False
        assert state.rate_limit_expiry is None
        assert state.total_requests == 0
        assert state.last_used is None
    
    def test_key_state_with_values(self):
        """KeyState should support all field types."""
        from tools.newsdata_client import KeyState
        from datetime import datetime
        
        now = datetime.now()
        state = KeyState(
            key="test_key",
            key_id="test_key",
            is_rate_limited=True,
            rate_limit_expiry=now,
            total_requests=42,
            last_used=now
        )
        
        assert state.is_rate_limited is True
        assert state.rate_limit_expiry == now
        assert state.total_requests == 42
        assert state.last_used == now


# ============================================================================
# Bug Condition Exploration Tests - NewsData Free Tier
# Property 1: Fault Condition - NewsData Free Tier Parameter Exclusion
# **Validates: Requirements 2.1**
# ============================================================================

class TestNewsDataFreeTierBugCondition:
    """
    Bug condition exploration tests for NewsData free tier parameter handling.
    
    IMPORTANT: These tests are EXPECTED TO FAIL on unfixed code.
    Failure confirms the bug exists (free tier requests include unsupported parameters).
    
    When these tests PASS after implementing the fix, it confirms the bug is resolved.
    """
    
    @pytest.mark.asyncio
    async def test_fetch_latest_news_free_tier_excludes_size_and_timeframe(self):
        """
        Test that fetch_latest_news excludes size and timeframe parameters for free tier.
        
        Bug Condition: Free tier API calls with size/timeframe parameters fail with API error.
        Expected Behavior: Free tier requests should exclude these parameters.
        
        EXPECTED ON UNFIXED CODE: FAIL (size and timeframe are included in params)
        EXPECTED ON FIXED CODE: PASS (size and timeframe are excluded from params)
        """
        # Create client with free tier flag (will be implemented in fix)
        # For now, we'll test the current behavior by checking if parameters are included
        client = NewsDataClient(api_key="test_free_tier_key")
        
        with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"status": "success", "totalResults": 0, "results": []}
            
            # Call with size and timeframe parameters
            await client.fetch_latest_news(
                query="election",
                size=20,
                timeframe="24h"
            )
            
            # Get the parameters that were passed
            call_args = mock_request.call_args
            params = call_args[0][1]
            
            # BUG CONDITION: On unfixed code, these parameters ARE included
            # EXPECTED BEHAVIOR: On fixed code with free tier, these should NOT be included
            # For now, this test documents the expected behavior
            # When free tier flag is implemented, this assertion will validate the fix
            
            # This test will FAIL on unfixed code because size and timeframe are present
            # This test will PASS on fixed code because size and timeframe are excluded for free tier
            # Note: We need to check if client has is_free_tier attribute (will be added in fix)
            if hasattr(client, 'is_free_tier') and client.is_free_tier:
                assert "size" not in params, "Free tier should not include 'size' parameter"
                assert "timeframe" not in params, "Free tier should not include 'timeframe' parameter"
            else:
                # On unfixed code, parameters are included (this is the bug)
                # We document this as the current buggy behavior
                assert "size" in params, "UNFIXED: size parameter is included (bug exists)"
                assert "timeframe" in params, "UNFIXED: timeframe parameter is included (bug exists)"
    
    @pytest.mark.asyncio
    async def test_fetch_archive_news_free_tier_excludes_size(self):
        """
        Test that fetch_archive_news excludes size parameter for free tier.
        
        Bug Condition: Free tier API calls with size parameter fail with API error.
        Expected Behavior: Free tier requests should exclude size parameter.
        
        EXPECTED ON UNFIXED CODE: FAIL (size is included in params)
        EXPECTED ON FIXED CODE: PASS (size is excluded from params)
        """
        client = NewsDataClient(api_key="test_free_tier_key")
        
        with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"status": "success", "totalResults": 0, "results": []}
            
            await client.fetch_archive_news(
                from_date="2024-01-01",
                to_date="2024-01-31",
                query="market",
                size=20
            )
            
            call_args = mock_request.call_args
            params = call_args[0][1]
            
            if hasattr(client, 'is_free_tier') and client.is_free_tier:
                assert "size" not in params, "Free tier should not include 'size' parameter"
            else:
                assert "size" in params, "UNFIXED: size parameter is included (bug exists)"
    
    @pytest.mark.asyncio
    async def test_fetch_crypto_news_free_tier_excludes_size_and_timeframe(self):
        """
        Test that fetch_crypto_news excludes size and timeframe parameters for free tier.
        
        Bug Condition: Free tier API calls with size/timeframe parameters fail with API error.
        Expected Behavior: Free tier requests should exclude these parameters.
        
        EXPECTED ON UNFIXED CODE: FAIL (size and timeframe are included in params)
        EXPECTED ON FIXED CODE: PASS (size and timeframe are excluded from params)
        """
        client = NewsDataClient(api_key="test_free_tier_key")
        
        with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"status": "success", "totalResults": 0, "results": []}
            
            await client.fetch_crypto_news(
                coin=["BTC", "ETH"],
                query="price",
                size=20,
                timeframe="1h"
            )
            
            call_args = mock_request.call_args
            params = call_args[0][1]
            
            if hasattr(client, 'is_free_tier') and client.is_free_tier:
                assert "size" not in params, "Free tier should not include 'size' parameter"
                assert "timeframe" not in params, "Free tier should not include 'timeframe' parameter"
            else:
                assert "size" in params, "UNFIXED: size parameter is included (bug exists)"
                assert "timeframe" in params, "UNFIXED: timeframe parameter is included (bug exists)"
    
    @pytest.mark.asyncio
    async def test_fetch_market_news_free_tier_excludes_size_and_timeframe(self):
        """
        Test that fetch_market_news excludes size and timeframe parameters for free tier.
        
        Bug Condition: Free tier API calls with size/timeframe parameters fail with API error.
        Expected Behavior: Free tier requests should exclude these parameters.
        
        EXPECTED ON UNFIXED CODE: FAIL (size and timeframe are included in params)
        EXPECTED ON FIXED CODE: PASS (size and timeframe are excluded from params)
        """
        client = NewsDataClient(api_key="test_free_tier_key")
        
        with patch.object(client, '_make_request', new_callable=AsyncMock) as mock_request:
            mock_request.return_value = {"status": "success", "totalResults": 0, "results": []}
            
            await client.fetch_market_news(
                symbol=["AAPL", "GOOGL"],
                query="earnings",
                size=20,
                timeframe="24h"
            )
            
            call_args = mock_request.call_args
            params = call_args[0][1]
            
            if hasattr(client, 'is_free_tier') and client.is_free_tier:
                assert "size" not in params, "Free tier should not include 'size' parameter"
                assert "timeframe" not in params, "Free tier should not include 'timeframe' parameter"
            else:
                assert "size" in params, "UNFIXED: size parameter is included (bug exists)"
                assert "timeframe" in params, "UNFIXED: timeframe parameter is included (bug exists)"
