"""Serper API client for web search and webpage scraping."""

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
# Serper API Response Models
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


class SerperSearchResult(BaseModel):
    """Individual search result from Serper API."""
    title: str
    link: str
    snippet: str
    date: Optional[str] = None
    position: int


class SerperSearchResponse(BaseModel):
    """Response from Serper search API."""
    searchParameters: Dict[str, Any]
    organic: List[SerperSearchResult]
    answerBox: Optional[Dict[str, Any]] = None
    knowledgeGraph: Optional[Dict[str, Any]] = None


class SerperScrapeResponse(BaseModel):
    """Response from Serper scrape API."""
    url: Optional[str] = None
    title: Optional[str] = None
    text: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ============================================================================
# Configuration Models
# ============================================================================

@dataclass
class SerperConfig:
    """Serper API client configuration."""
    api_key: str  # Comma-separated keys
    search_url: str = "https://google.serper.dev/search"
    scrape_url: str = "https://scrape.serper.dev"
    timeout: int = 30
    retry_attempts: int = 3
    retry_delay: int = 1


@dataclass
class SerperSearchParams:
    """Parameters for Serper search API."""
    q: str
    num: int = 10
    tbs: Optional[str] = None
    gl: Optional[str] = None
    hl: Optional[str] = None


@dataclass
class SerperScrapeParams:
    """Parameters for Serper scrape API."""
    url: str


# ============================================================================
# Serper Client
# ============================================================================

class SerperClient:
    """Async HTTP client for Serper API with multi-key rotation."""
    
    def __init__(self, config: SerperConfig):
        """
        Initialize Serper client with API key and configuration.
        
        Args:
            config: SerperConfig with API key (or comma-separated list of keys)
            
        Raises:
            ValueError: If no valid API keys are provided
        """
        # Parse comma-separated keys
        self.api_keys: List[str] = [
            key.strip() 
            for key in config.api_key.split(',') 
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
        
        # Store configuration
        self.search_url = config.search_url
        self.scrape_url = config.scrape_url
        self.timeout = config.timeout
        self.retry_attempts = config.retry_attempts
        self.retry_delay = config.retry_delay
    
    def _get_key_id(self, key: str) -> str:
        """Get key identifier (first 8 characters) for logging."""
        return key[:8] if len(key) >= 8 else key
    
    def _is_rate_limit_error(self, response: httpx.Response) -> bool:
        """
        Check if response indicates rate limit error.
        
        Args:
            response: HTTP response from Serper API
            
        Returns:
            True if response indicates rate limit (HTTP 429), False otherwise
        """
        return response.status_code == 429
    
    def _is_blocking_error(self, response: httpx.Response) -> bool:
        """
        Check if response indicates blocking error.
        
        Blocking errors include:
        - 401 Unauthorized: Invalid API key
        - 403 Forbidden: API key blocked
        - 402 Payment Required: Quota exhausted
        - 429 Too Many Requests: Rate limited
        
        Args:
            response: HTTP response from Serper API
            
        Returns:
            True if response indicates blocking error, False otherwise
        """
        return response.status_code in [401, 403, 402, 429]
    
    def _extract_retry_after(self, response: httpx.Response) -> int:
        """
        Extract Retry-After header value in seconds.
        
        Handles both integer seconds format and HTTP date format.
        Defaults to 900 seconds (15 minutes) if header is missing or unparseable.
        
        Args:
            response: HTTP response from Serper API
            
        Returns:
            Number of seconds to wait before retrying (default: 900)
        """
        retry_after = response.headers.get('Retry-After') or response.headers.get('X-RateLimit-Reset')
        
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
                    logger.info(f"Key {key_id} rate limit expired, now available")
            
            if not state.is_rate_limited:
                available.append(key_id)
        
        # Sort by last used (None sorts first, then oldest first)
        available.sort(key=lambda kid: self.key_states[kid].last_used or datetime.min)
        
        return available
    
    def _rotate_api_key(
        self, 
        retry_after_seconds: int,
        context: Optional[Dict[str, Any]] = None
    ) -> Optional[str]:
        """
        Rotate to next available API key.
        
        Marks the current key as rate-limited with an expiry timestamp,
        then selects the next available key using LRU strategy.
        
        Args:
            retry_after_seconds: How long current key should be marked unavailable
            context: Request context for logging (endpoint, statusCode, params)
            
        Returns:
            Next available API key, or None if all keys exhausted
        """
        current_key = self.api_keys[self.current_key_index]
        current_key_id = self._get_key_id(current_key)
        
        # Mark current key as rate-limited
        expiry_time = datetime.now() + timedelta(seconds=retry_after_seconds)
        self.key_states[current_key_id].is_rate_limited = True
        self.key_states[current_key_id].rate_limit_expiry = expiry_time
        
        # Build context string for logging
        context_str = ""
        if context:
            context_parts = []
            if 'endpoint' in context:
                context_parts.append(f"endpoint={context['endpoint']}")
            if 'statusCode' in context:
                context_parts.append(f"status={context['statusCode']}")
            if 'params' in context:
                # Sanitize params (remove sensitive data)
                safe_params = {k: v for k, v in context['params'].items() if k not in ['url', 'q']}
                if safe_params:
                    context_parts.append(f"params={safe_params}")
            if context_parts:
                context_str = f" ({', '.join(context_parts)})"
        
        # Log WARNING when rate limit detected
        logger.warning(
            f"Key {current_key_id} rate-limited, expires at {expiry_time.isoformat()}{context_str}"
        )
        
        # Find next available key
        available_keys = self._get_available_keys()
        
        if not available_keys:
            # All keys exhausted - Log ERROR
            earliest_expiry = min(
                state.rate_limit_expiry 
                for state in self.key_states.values() 
                if state.rate_limit_expiry
            )
            logger.error(
                f"All API keys exhausted or rate-limited. Next available: {earliest_expiry.isoformat()}{context_str}"
            )
            return None
        
        # Select least recently used key
        next_key_id = available_keys[0]
        next_key = self.key_states[next_key_id].key
        
        # Update index
        self.current_key_index = self.api_keys.index(next_key)
        
        # Log rotation (only if multiple keys)
        if len(self.api_keys) > 1:
            logger.info(
                f"Rotated to key {next_key_id}{context_str}"
            )
        
        return next_key
    
    def _get_current_key(self) -> Optional[KeyState]:
        """
        Get current API key state.
        
        Returns the least recently used available key.
        
        Returns:
            KeyState for current key, or None if all keys exhausted
        """
        available_key_ids = self._get_available_keys()
        
        if not available_key_ids:
            return None
        
        # Return LRU key
        key_id = available_key_ids[0]
        return self.key_states.get(key_id)
    
    def _update_key_state_on_success(self, key_id: str) -> None:
        """
        Update key state after successful request.
        
        Args:
            key_id: Key identifier to update
        """
        state = self.key_states.get(key_id)
        if state:
            state.last_used = datetime.now()
            state.total_requests += 1
    
    def get_key_rotation_stats(self) -> Dict[str, Any]:
        """
        Get statistics about API key usage and rotation.
        
        Provides metrics for observability and monitoring integration.
        
        Returns:
            Dictionary containing:
                - total_keys: Number of configured API keys
                - available_keys: Number of currently available keys
                - rate_limited_keys: Number of currently rate-limited keys
                - key_stats: Per-key statistics (requests, last_used, rate_limit_status)
                - earliest_expiry: Earliest rate limit expiry time (if any keys rate-limited)
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
    
    async def search(self, params: SerperSearchParams) -> SerperSearchResponse:
        """
        Execute web search using Serper API.
        
        Args:
            params: Search parameters (query, num results, filters)
            
        Returns:
            SerperSearchResponse with search results
            
        Raises:
            httpx.HTTPError: If API request fails after retries
            ValueError: If response parsing fails
        """
        # Build request body
        body = {
            'q': params.q,
            'num': params.num
        }
        
        if params.tbs:
            body['tbs'] = params.tbs
        if params.gl:
            body['gl'] = params.gl
        if params.hl:
            body['hl'] = params.hl
        
        # Execute request with retry and rotation
        response_data = await self._execute_request(
            url=self.search_url,
            body=body,
            endpoint='search'
        )
        
        # Parse response
        try:
            return SerperSearchResponse(**response_data)
        except Exception as e:
            raise ValueError(f"Failed to parse Serper search response: {str(e)}") from e
    
    async def scrape(self, params: SerperScrapeParams) -> SerperScrapeResponse:
        """
        Scrape webpage content using Serper API.
        
        Args:
            params: Scrape parameters (URL)
            
        Returns:
            SerperScrapeResponse with webpage content
            
        Raises:
            httpx.HTTPError: If API request fails after retries
            ValueError: If response parsing fails
        """
        # Build request body
        body = {
            'url': params.url
        }
        
        # Execute request with retry and rotation
        response_data = await self._execute_request(
            url=self.scrape_url,
            body=body,
            endpoint='scrape'
        )
        
        # Parse response
        try:
            # Add url to response if missing (API doesn't always return it)
            if 'url' not in response_data:
                response_data['url'] = params.url
            return SerperScrapeResponse(**response_data)
        except Exception as e:
            raise ValueError(f"Failed to parse Serper scrape response: {str(e)}") from e
    
    async def _execute_request(
        self,
        url: str,
        body: Dict[str, Any],
        endpoint: str
    ) -> Dict[str, Any]:
        """
        Execute API request with retry and key rotation.
        
        Integrates multi-key rotation logic to handle rate limits transparently.
        When a blocking error is detected (HTTP 429, 401, 403, 402), the method
        automatically rotates to the next available API key and retries the request
        without counting against the retry limit.
        
        Args:
            url: API endpoint URL
            body: Request body (JSON)
            endpoint: Endpoint name for logging ('search' or 'scrape')
            
        Returns:
            Dict containing API response, or graceful degradation response if all keys exhausted
            
        Raises:
            httpx.HTTPError: If API request fails after retries (non-blocking errors)
            ValueError: If response parsing fails
        """
        last_exception = None
        attempt = 0
        
        while attempt < self.retry_attempts:
            try:
                # Get current API key
                current_key_state = self._get_current_key()
                if not current_key_state:
                    # All keys exhausted - graceful degradation
                    logger.warning(f"All API keys exhausted or rate-limited for {endpoint}")
                    return self._get_graceful_degradation_response(endpoint)
                
                current_key = current_key_state.key
                current_key_id = current_key_state.key_id
                
                # Make request
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        url,
                        json=body,
                        headers={
                            'Content-Type': 'application/json',
                            'X-API-KEY': current_key
                        }
                    )
                    
                    # Check for blocking errors (trigger rotation without counting as retry)
                    if self._is_blocking_error(response):
                        retry_after = self._extract_retry_after(response)
                        
                        # Attempt rotation with request context
                        next_key = self._rotate_api_key(
                            retry_after,
                            context={
                                'endpoint': endpoint,
                                'statusCode': response.status_code,
                                'params': body
                            }
                        )
                        
                        if next_key is None:
                            # All keys exhausted - graceful degradation
                            logger.warning(
                                f"All API keys exhausted, returning empty result for {endpoint}"
                            )
                            return self._get_graceful_degradation_response(endpoint)
                        
                        # Retry with new key (doesn't count as retry attempt)
                        continue
                    
                    # Check for success
                    if response.status_code == 200:
                        # Update key state
                        self._update_key_state_on_success(current_key_id)
                        
                        # Parse and return response
                        try:
                            data = response.json()
                            return data
                        except Exception as e:
                            raise ValueError(
                                f"Failed to parse Serper API response: {str(e)}"
                            ) from e
                    
                    # Other errors - retry with backoff
                    last_exception = httpx.HTTPStatusError(
                        f"HTTP {response.status_code}: {response.text}",
                        request=response.request,
                        response=response
                    )
                    attempt += 1
                    
                    if attempt < self.retry_attempts:
                        await asyncio.sleep(self.retry_delay * (2 ** (attempt - 1)))
                    
            except ValueError:
                # Re-raise ValueError immediately without retry
                raise
                
            except httpx.TimeoutException as e:
                last_exception = e
                attempt += 1
                if attempt >= self.retry_attempts:
                    raise httpx.TimeoutException(
                        f"Serper API request timeout after {self.retry_attempts} attempts"
                    ) from e
                await asyncio.sleep(self.retry_delay * (2 ** (attempt - 1)))
                
            except httpx.HTTPStatusError as e:
                last_exception = e
                # Don't retry on client errors (4xx except blocking errors)
                if 400 <= e.response.status_code < 500 and not self._is_blocking_error(e.response):
                    raise
                
                # Retry on server errors (5xx)
                attempt += 1
                if attempt >= self.retry_attempts:
                    raise
                await asyncio.sleep(self.retry_delay * (2 ** (attempt - 1)))
                
            except httpx.RequestError as e:
                last_exception = e
                # Network errors - retry with backoff
                attempt += 1
                if attempt >= self.retry_attempts:
                    raise
                await asyncio.sleep(self.retry_delay * (2 ** (attempt - 1)))
            
            except Exception as e:
                # Catch any other unexpected errors
                last_exception = e
                attempt += 1
                if attempt >= self.retry_attempts:
                    raise RuntimeError(
                        f"Unexpected error in _execute_request: {str(e)}"
                    ) from e
                await asyncio.sleep(self.retry_delay * (2 ** (attempt - 1)))
        
        # If we exhausted retries without returning or raising, raise the last exception
        if last_exception:
            raise RuntimeError(
                f"Request failed after {self.retry_attempts} attempts"
            ) from last_exception
        else:
            raise RuntimeError("Unexpected error: no response after retries")
    
    def _get_graceful_degradation_response(self, endpoint: str) -> Dict[str, Any]:
        """
        Get graceful degradation response when all keys exhausted.
        
        Args:
            endpoint: Endpoint name ('search' or 'scrape')
            
        Returns:
            Empty response structure appropriate for the endpoint
        """
        if endpoint == 'search':
            return {
                'searchParameters': {'q': ''},
                'organic': []
            }
        else:  # scrape
            return {
                'url': '',
                'title': '',
                'text': ''
            }
