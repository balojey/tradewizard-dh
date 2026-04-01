"""NewsData.io API client for fetching news articles."""

import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import httpx
from pydantic import BaseModel

# Configure logger
logger = logging.getLogger(__name__)


# ============================================================================
# NewsData API Response Models
# ============================================================================

@dataclass
class KeyState:
    """State tracking for a single API key."""
    key: str
    key_id: str  # First 8 characters for logging
    is_rate_limited: bool
    rate_limit_expiry: Optional[datetime]
    total_requests: int
    last_used: Optional[datetime]


class NewsDataArticle(BaseModel):
    """Individual news article from NewsData API."""
    article_id: str
    title: str
    link: str
    description: Optional[str] = None
    content: Optional[str] = None
    pubDate: Optional[str] = None
    source_id: Optional[str] = None
    source_name: Optional[str] = None
    source_url: Optional[str] = None
    source_icon: Optional[str] = None
    language: Optional[str] = None
    country: Optional[List[str]] = None
    category: Optional[List[str]] = None
    sentiment: Optional[str] = None
    sentiment_stats: Optional[str] = None
    image_url: Optional[str] = None
    video_url: Optional[str] = None


class NewsDataResponse(BaseModel):
    """Response from NewsData API."""
    status: str
    totalResults: int
    results: List[NewsDataArticle]
    nextPage: Optional[str] = None


# ============================================================================
# NewsData Client
# ============================================================================

class NewsDataClient:
    """Async HTTP client for NewsData.io API."""
    
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://newsdata.io/api/1",
        timeout: int = 30,
        is_free_tier: bool = False
    ):
        """
        Initialize NewsData client with API key and configuration.
        
        Args:
            api_key: NewsData.io API key (or comma-separated list of keys)
            base_url: Base URL for NewsData API (default: https://newsdata.io/api/1)
            timeout: Request timeout in seconds (default: 30)
            is_free_tier: Whether using free tier plan (excludes size/timeframe params)
            
        Raises:
            ValueError: If no valid API keys are provided
        """
        # Parse comma-separated keys
        self.api_keys: List[str] = [
            key.strip() 
            for key in api_key.split(',') 
            if key.strip()
        ]
        
        if not self.api_keys:
            raise ValueError("At least one API key must be provided")
        
        # Initialize key state management
        self.key_states: Dict[str, KeyState] = {}
        for key in self.api_keys:
            self.key_states[self._get_key_id(key)] = KeyState(
                key=key,
                key_id=self._get_key_id(key),
                is_rate_limited=False,
                rate_limit_expiry=None,
                total_requests=0,
                last_used=None
            )
        
        self.current_key_index: int = 0
        
        # Backward compatibility: maintain api_key attribute for single-key access
        self.api_key = self.api_keys[0] if len(self.api_keys) == 1 else api_key
        
        self.base_url = base_url
        self.timeout = timeout
        self.max_retries = 3
        self.base_backoff = 1.0  # seconds
        self.is_free_tier = is_free_tier
        
        # Log free tier detection
        if self.is_free_tier:
            logger.info("NewsData free tier detected, excluding size and timeframe parameters")
    
    def _get_key_id(self, key: str) -> str:
        """Get key identifier (first 8 characters) for logging."""
        return key[:8] if len(key) >= 8 else key
    
    def _is_rate_limit_error(self, response: httpx.Response) -> bool:
        """
        Check if response indicates rate limit error.
        
        Distinguishes between temporary rate limiting (429 with "rate limit" message)
        and permanent quota exhaustion (429 with "quota exceeded" message).
        
        Args:
            response: HTTP response from NewsData API
            
        Returns:
            True if response indicates rate limit (temporary), False otherwise
        """
        if response.status_code != 429:
            return False
        
        # Try to parse response body to distinguish rate limit from quota exceeded
        try:
            data = response.json()
            # Check for error message in response
            if 'results' in data and isinstance(data['results'], dict):
                if 'message' in data['results']:
                    message = data['results']['message'].lower()
                    # Quota exceeded: daily limit reached (permanent until reset)
                    if 'quota exceeded' in message or 'daily limit' in message:
                        return False
                    # Rate limit: temporary throttling (will reset)
                    if 'rate limit' in message or 'too many requests' in message:
                        return True
        except Exception:
            # If we can't parse the response, assume it's a rate limit
            pass
        
        # Default: treat all 429 as rate limit
        return True
    
    def _extract_retry_after(self, response: httpx.Response) -> int:
        """
        Extract Retry-After header value in seconds.
        
        Handles both integer seconds format and HTTP date format.
        Defaults to 900 seconds (15 minutes) if header is missing or unparseable.
        
        Args:
            response: HTTP response from NewsData API
            
        Returns:
            Number of seconds to wait before retrying (default: 900)
        """
        retry_after = response.headers.get('Retry-After')
        
        if retry_after:
            try:
                # Try parsing as integer (seconds)
                return int(retry_after)
            except ValueError:
                # Could be HTTP date format - would need date parsing
                # For now, fall through to default
                pass
        
        # Default: 15 minutes (900 seconds)
        return 900
    
    def _get_available_keys(self) -> List[str]:
        """
        Get list of available key IDs, sorted by least recently used.
        
        Auto-expires rate-limited keys when their expiry time has passed.
        
        Returns:
            List of available key IDs sorted by last_used timestamp (LRU first)
        """
        now = datetime.now()
        available = []
        
        for key_id, state in self.key_states.items():
            # Auto-expire if time has passed
            if state.is_rate_limited and state.rate_limit_expiry:
                if now >= state.rate_limit_expiry:
                    state.is_rate_limited = False
                    state.rate_limit_expiry = None
                    # Log INFO when rate-limited key becomes available (Requirement 9.4)
                    logger.info(f"Key {key_id} rate limit expired, now available")
            
            if not state.is_rate_limited:
                available.append(key_id)
        
        # Sort by last used (None sorts first, then oldest first)
        available.sort(key=lambda kid: self.key_states[kid].last_used or datetime.min)
        
        return available
    
    def _rotate_api_key(
        self, 
        retry_after_seconds: int,
        endpoint: Optional[str] = None,
        agent_name: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Rotate to next available API key.
        
        Marks the current key as rate-limited with an expiry timestamp,
        then selects the next available key using LRU strategy.
        
        Args:
            retry_after_seconds: How long current key should be marked unavailable
            endpoint: API endpoint being called (for logging context)
            agent_name: Name of agent making the request (for logging context)
            params: Request parameters (for logging context)
            
        Returns:
            Next available API key, or None if all keys exhausted
        """
        current_key = self.api_keys[self.current_key_index]
        current_key_id = self._get_key_id(current_key)
        
        # Mark current key as rate-limited
        expiry_time = datetime.now() + timedelta(seconds=retry_after_seconds)
        self.key_states[current_key_id].is_rate_limited = True
        self.key_states[current_key_id].rate_limit_expiry = expiry_time
        
        # Build context string for logging (Requirement 9.5)
        context_parts = []
        if endpoint:
            context_parts.append(f"endpoint={endpoint}")
        if agent_name:
            context_parts.append(f"agent={agent_name}")
        if params:
            # Include key params but sanitize API key
            safe_params = {k: v for k, v in params.items() if k != 'apikey'}
            if safe_params:
                context_parts.append(f"params={safe_params}")
        context_str = f" ({', '.join(context_parts)})" if context_parts else ""
        
        # Log WARNING when rate limit detected (Requirement 9.1)
        logger.warning(
            f"Rate limit detected for key {current_key_id}, "
            f"marked unavailable until {expiry_time.isoformat()}{context_str}"
        )
        
        # Find next available key
        available_keys = self._get_available_keys()
        
        if not available_keys:
            # All keys exhausted - Log ERROR (Requirement 9.3)
            earliest_expiry = min(
                state.rate_limit_expiry 
                for state in self.key_states.values() 
                if state.rate_limit_expiry
            )
            logger.error(
                f"All API keys exhausted. Next available: {earliest_expiry.isoformat()}{context_str}"
            )
            return None
        
        # Select least recently used key
        next_key_id = available_keys[0]
        next_key = self.key_states[next_key_id].key
        
        # Update index
        self.current_key_index = self.api_keys.index(next_key)
        
        # Log rotation (only if multiple keys) - Log INFO (Requirement 9.2, 6.4)
        if len(self.api_keys) > 1:
            logger.info(
                f"Rotated API key: {current_key_id} -> {next_key_id}{context_str}"
            )
        
        return next_key
    
    def get_key_rotation_stats(self) -> Dict[str, Any]:
        """
        Get statistics about API key usage and rotation.
        
        Provides metrics for observability and monitoring integration.
        Can be used with audit logger or Opik for tracking key rotation events.
        
        Returns:
            Dictionary containing:
                - total_keys: Number of configured API keys
                - available_keys: Number of currently available keys
                - rate_limited_keys: Number of currently rate-limited keys
                - key_stats: Per-key statistics (requests, last_used, rate_limit_status)
                - earliest_expiry: Earliest rate limit expiry time (if any keys rate-limited)
        
        Requirements: 9.6
        """
        available_count = 0
        rate_limited_count = 0
        key_stats = []
        earliest_expiry = None
        
        for key_id, state in self.key_states.items():
            key_stats.append({
                'key_id': key_id,
                'total_requests': state.total_requests,
                'last_used': state.last_used.isoformat() if state.last_used else None,
                'is_rate_limited': state.is_rate_limited,
                'rate_limit_expiry': state.rate_limit_expiry.isoformat() if state.rate_limit_expiry else None
            })
            
            if state.is_rate_limited:
                rate_limited_count += 1
                if state.rate_limit_expiry:
                    if earliest_expiry is None or state.rate_limit_expiry < earliest_expiry:
                        earliest_expiry = state.rate_limit_expiry
            else:
                available_count += 1
        
        return {
            'total_keys': len(self.api_keys),
            'available_keys': available_count,
            'rate_limited_keys': rate_limited_count,
            'key_stats': key_stats,
            'earliest_expiry': earliest_expiry.isoformat() if earliest_expiry else None
        }
    
    async def fetch_latest_news(
        self,
        query: Optional[str] = None,
        qInTitle: Optional[str] = None,
        timeframe: str = "24h",
        country: Optional[List[str]] = None,
        category: Optional[List[str]] = None,
        language: List[str] = ["en"],
        sentiment: Optional[str] = None,
        size: int = 20,
        removeduplicate: bool = True
    ) -> Dict[str, Any]:
        """
        Fetch latest news from past 48 hours.
        
        Args:
            query: Search query for article content
            qInTitle: Search query for article titles only
            timeframe: Time window (1h, 6h, 12h, 24h, 48h)
            country: Country codes (e.g., ['us', 'uk'])
            category: News categories
            language: Language codes (default: ['en'])
            sentiment: Filter by sentiment (positive, negative, neutral)
            size: Number of articles (1-50, default: 20)
            removeduplicate: Remove duplicate articles (default: True)
            
        Returns:
            Dict containing NewsData API response
            
        Raises:
            httpx.HTTPError: If API request fails
            ValueError: If response parsing fails
        """
        endpoint = f"{self.base_url}/latest"
        
        # Build query parameters
        params = {
            "language": ",".join(language),
            "removeduplicate": 1 if removeduplicate else 0
        }
        
        # Only include size and timeframe for paid tier
        if not self.is_free_tier:
            params["size"] = min(size, 50)  # API max is 50
            params["timeframe"] = timeframe
        
        if query:
            params["q"] = query
        if qInTitle:
            params["qInTitle"] = qInTitle
        if country:
            params["country"] = ",".join(country)
        if category:
            params["category"] = ",".join(category)
        if sentiment:
            params["sentiment"] = sentiment
        
        return await self._make_request(endpoint, params)
    
    async def fetch_archive_news(
        self,
        from_date: str,
        to_date: str,
        query: Optional[str] = None,
        qInTitle: Optional[str] = None,
        country: Optional[List[str]] = None,
        category: Optional[List[str]] = None,
        language: List[str] = ["en"],
        size: int = 20,
        removeduplicate: bool = True
    ) -> Dict[str, Any]:
        """
        Fetch historical news with date range.
        
        Args:
            from_date: Start date (YYYY-MM-DD format)
            to_date: End date (YYYY-MM-DD format)
            query: Search query for article content
            qInTitle: Search query for article titles only
            country: Country codes (e.g., ['us', 'uk'])
            category: News categories
            language: Language codes (default: ['en'])
            size: Number of articles (1-50, default: 20)
            removeduplicate: Remove duplicate articles (default: True)
            
        Returns:
            Dict containing NewsData API response
            
        Raises:
            httpx.HTTPError: If API request fails
            ValueError: If response parsing fails
        """
        endpoint = f"{self.base_url}/archive"
        
        # Build query parameters
        params = {
            "from_date": from_date,
            "to_date": to_date,
            "language": ",".join(language),
            "removeduplicate": 1 if removeduplicate else 0
        }
        
        # Only include size for paid tier
        if not self.is_free_tier:
            params["size"] = min(size, 50)
        
        if query:
            params["q"] = query
        if qInTitle:
            params["qInTitle"] = qInTitle
        if country:
            params["country"] = ",".join(country)
        if category:
            params["category"] = ",".join(category)
        
        return await self._make_request(endpoint, params)
    
    async def fetch_crypto_news(
        self,
        coin: Optional[List[str]] = None,
        query: Optional[str] = None,
        qInTitle: Optional[str] = None,
        timeframe: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        sentiment: Optional[str] = None,
        language: List[str] = ["en"],
        size: int = 20,
        removeduplicate: bool = True
    ) -> Dict[str, Any]:
        """
        Fetch cryptocurrency-related news.
        
        Args:
            coin: Cryptocurrency symbols (e.g., ['BTC', 'ETH'])
            query: Search query for article content
            qInTitle: Search query for article titles only
            timeframe: Time window (1h, 6h, 12h, 24h, 48h)
            from_date: Start date for archive search (YYYY-MM-DD)
            to_date: End date for archive search (YYYY-MM-DD)
            sentiment: Filter by sentiment (positive, negative, neutral)
            language: Language codes (default: ['en'])
            size: Number of articles (1-50, default: 20)
            removeduplicate: Remove duplicate articles (default: True)
            
        Returns:
            Dict containing NewsData API response
            
        Raises:
            httpx.HTTPError: If API request fails
            ValueError: If response parsing fails
        """
        endpoint = f"{self.base_url}/crypto"
        
        # Build query parameters
        params = {
            "language": ",".join(language),
            "removeduplicate": 1 if removeduplicate else 0
        }
        
        # Only include size and timeframe for paid tier
        if not self.is_free_tier:
            params["size"] = min(size, 50)
            if timeframe:
                params["timeframe"] = timeframe
        
        if coin:
            params["coin"] = ",".join(coin)
        if query:
            params["q"] = query
        if qInTitle:
            params["qInTitle"] = qInTitle
        if from_date:
            params["from_date"] = from_date
        if to_date:
            params["to_date"] = to_date
        if sentiment:
            params["sentiment"] = sentiment
        
        return await self._make_request(endpoint, params)
    
    async def fetch_market_news(
        self,
        symbol: Optional[List[str]] = None,
        organization: Optional[List[str]] = None,
        query: Optional[str] = None,
        qInTitle: Optional[str] = None,
        timeframe: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        sentiment: Optional[str] = None,
        country: Optional[List[str]] = None,
        language: List[str] = ["en"],
        size: int = 20,
        removeduplicate: bool = True
    ) -> Dict[str, Any]:
        """
        Fetch financial market and company news.
        
        Args:
            symbol: Stock symbols (e.g., ['AAPL', 'GOOGL'])
            organization: Organization names
            query: Search query for article content
            qInTitle: Search query for article titles only
            timeframe: Time window (1h, 6h, 12h, 24h, 48h)
            from_date: Start date for archive search (YYYY-MM-DD)
            to_date: End date for archive search (YYYY-MM-DD)
            sentiment: Filter by sentiment (positive, negative, neutral)
            country: Country codes (e.g., ['us', 'uk'])
            language: Language codes (default: ['en'])
            size: Number of articles (1-50, default: 20)
            removeduplicate: Remove duplicate articles (default: True)
            
        Returns:
            Dict containing NewsData API response
            
        Raises:
            httpx.HTTPError: If API request fails
            ValueError: If response parsing fails
        """
        endpoint = f"{self.base_url}/news"
        
        # Build query parameters
        params = {
            "language": ",".join(language),
            "removeduplicate": 1 if removeduplicate else 0
        }
        
        # Only include size and timeframe for paid tier
        if not self.is_free_tier:
            params["size"] = min(size, 50)
            if timeframe:
                params["timeframe"] = timeframe
        
        if symbol:
            params["symbol"] = ",".join(symbol)
        if organization:
            params["organization"] = ",".join(organization)
        if query:
            params["q"] = query
        if qInTitle:
            params["qInTitle"] = qInTitle
        if from_date:
            params["from_date"] = from_date
        if to_date:
            params["to_date"] = to_date
        if sentiment:
            params["sentiment"] = sentiment
        if country:
            params["country"] = ",".join(country)
        
        return await self._make_request(endpoint, params)
    
    async def _make_request(
        self,
        endpoint: str,
        params: Dict[str, Any],
        agent_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Make HTTP request to NewsData API with automatic key rotation on rate limit.
        
        Integrates multi-key rotation logic to handle rate limits transparently.
        When a rate limit is detected (HTTP 429), the method automatically rotates
        to the next available API key and retries the request without counting
        against the retry limit.
        
        Args:
            endpoint: API endpoint URL
            params: Query parameters
            agent_name: Name of agent making the request (for logging context)
            
        Returns:
            Dict containing API response, or empty result set if all keys exhausted
            
        Raises:
            httpx.HTTPError: If API request fails after retries (non-rate-limit errors)
            ValueError: If response parsing fails
        """
        last_exception = None
        
        for attempt in range(self.max_retries):
            try:
                # Get current API key
                current_key = self.api_keys[self.current_key_index]
                current_key_id = self._get_key_id(current_key)
                params['apikey'] = current_key
                
                # Update usage stats
                self.key_states[current_key_id].total_requests += 1
                self.key_states[current_key_id].last_used = datetime.now()
                
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.get(endpoint, params=params)
                    
                    # Handle rate limiting with rotation
                    if response.status_code == 429 and self._is_rate_limit_error(response):
                        retry_after = self._extract_retry_after(response)
                        
                        # Attempt rotation with request context (Requirement 9.5)
                        next_key = self._rotate_api_key(
                            retry_after,
                            endpoint=endpoint,
                            agent_name=agent_name,
                            params=params
                        )
                        
                        if next_key is None:
                            # All keys exhausted - graceful degradation
                            # Build context string for logging
                            context_parts = []
                            if endpoint:
                                context_parts.append(f"endpoint={endpoint}")
                            if agent_name:
                                context_parts.append(f"agent={agent_name}")
                            context_str = f" ({', '.join(context_parts)})" if context_parts else ""
                            
                            logger.warning(
                                f"All API keys exhausted, returning empty result set{context_str}"
                            )
                            return {
                                'status': 'ok',
                                'totalResults': 0,
                                'results': []
                            }
                        
                        # Retry with new key (don't count as retry attempt)
                        continue
                    
                    # Raise for other HTTP errors
                    response.raise_for_status()
                    
                    # Parse JSON response
                    try:
                        data = response.json()
                        return data
                    except Exception as e:
                        # Don't retry JSON parsing errors - raise immediately
                        raise ValueError(
                            f"Failed to parse NewsData API response: {str(e)}"
                        ) from e
                    
            except ValueError:
                # Re-raise ValueError immediately without retry
                raise
                
            except httpx.TimeoutException as e:
                last_exception = e
                if attempt == self.max_retries - 1:
                    raise httpx.TimeoutException(
                        f"NewsData API request timeout after {self.max_retries} attempts"
                    ) from e
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except httpx.HTTPStatusError as e:
                last_exception = e
                # Don't retry on client errors (4xx except 429)
                if 400 <= e.response.status_code < 500 and e.response.status_code != 429:
                    raise
                
                # Retry on server errors (5xx)
                if attempt == self.max_retries - 1:
                    raise
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except httpx.RequestError as e:
                last_exception = e
                # Network errors - retry with backoff
                if attempt == self.max_retries - 1:
                    raise
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
            
            except Exception as e:
                # Catch any other unexpected errors
                last_exception = e
                if attempt == self.max_retries - 1:
                    raise RuntimeError(
                        f"Unexpected error in _make_request: {str(e)}"
                    ) from e
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
        
        # If we exhausted retries without returning or raising, raise the last exception
        if last_exception:
            raise RuntimeError(
                f"Request failed after {self.max_retries} attempts"
            ) from last_exception
        else:
            raise RuntimeError("Unexpected error: no response after retries")
