"""Polymarket API client for fetching market and event data.

IMPORTANT: This client uses a two-step approach to fetch complete market data:
1. CLOB API: Fetch market by condition_id to get market_slug
   - Endpoint: {clob_api_url}/markets/{condition_id}
   - Returns: Market data with market_slug, tokens (outcomes/prices), and tags
   
2. Gamma API: Fetch market by slug to get full details including events
   - Endpoint: {gamma_api_url}/markets/slug/{market_slug}
   - Returns: Complete market data with events array containing event details

This two-step process ensures we get both the market data and associated event
information needed for comprehensive market analysis.

The client supports both Gamma API and CLOB API response formats through
flexible model definitions with normalized property accessors.
"""

import asyncio
import time
from typing import Any, Dict, List, Optional, Union
import httpx
from pydantic import BaseModel

from config import PolymarketConfig
from models.types import (
    MarketBriefingDocument,
    EventContext,
    StreamlinedEventMetadata,
    IngestionError
)
from utils.result import Ok, Err, Result


# ============================================================================
# Polymarket API Response Models
# ============================================================================

class PolymarketMarket(BaseModel):
    """Raw market data from Polymarket API (supports both Gamma and CLOB formats)."""
    model_config = {"extra": "allow"}  # Allow extra fields from API responses
    
    # Core fields (present in both APIs)
    id: Optional[str] = None
    question: str
    conditionId: Optional[str] = None
    condition_id: Optional[str] = None  # CLOB API uses snake_case
    
    # Gamma API format (JSON strings)
    outcomes: Optional[str] = None  # JSON string like '["Yes", "No"]'
    outcomePrices: Optional[str] = None  # JSON string like "[0.52, 0.48]"
    
    # CLOB API format (tokens array)
    tokens: Optional[List[Dict[str, Any]]] = None  # CLOB API: [{"outcome": "Yes", "price": 0.52, ...}]
    
    # Common fields - support both string and numeric formats
    volume: Optional[Union[str, float]] = None
    liquidity: Optional[Union[str, float]] = None
    active: Optional[bool] = None
    closed: Optional[bool] = None
    description: Optional[str] = None
    endDate: Optional[str] = None
    end_date_iso: Optional[str] = None  # CLOB API uses snake_case
    startDate: Optional[str] = None
    image: Optional[str] = None
    icon: Optional[str] = None
    eventSlug: Optional[str] = None
    market_slug: Optional[str] = None  # CLOB API uses snake_case
    slug: Optional[str] = None  # Gamma API uses slug
    groupItemTitle: Optional[str] = None
    groupItemThreshold: Optional[str] = None
    spread: Optional[Union[str, int, float]] = None  # Can be string, int, or float
    
    # Gamma API numeric fields
    volumeNum: Optional[float] = None
    liquidityNum: Optional[float] = None
    volume24hr: Optional[float] = None
    volume1wk: Optional[float] = None
    volume1mo: Optional[float] = None
    volume1yr: Optional[float] = None
    
    # Gamma API events array
    events: Optional[List[Dict[str, Any]]] = None  # Gamma API includes events array
    
    @property
    def normalized_condition_id(self) -> str:
        """Get condition ID regardless of API format."""
        return self.conditionId or self.condition_id or ""
    
    @property
    def normalized_market_id(self) -> str:
        """Get market ID/slug regardless of API format."""
        return self.id or self.market_slug or self.slug or ""
    
    @property
    def normalized_end_date(self) -> Optional[str]:
        """Get end date regardless of API format."""
        return self.endDate or self.end_date_iso
    
    @property
    def normalized_market_slug(self) -> Optional[str]:
        """Get market slug regardless of API format."""
        return self.market_slug or self.slug
    
    def get_volume(self) -> float:
        """Get volume as float, handling both string and numeric formats."""
        if self.volumeNum is not None:
            return float(self.volumeNum)
        if self.volume24hr is not None:
            return float(self.volume24hr)
        if self.volume is not None:
            try:
                return float(self.volume)
            except (ValueError, TypeError):
                pass
        return 0.0
    
    def get_liquidity(self) -> float:
        """Get liquidity as float, handling both string and numeric formats."""
        if self.liquidityNum is not None:
            return float(self.liquidityNum)
        if self.liquidity is not None:
            try:
                return float(self.liquidity)
            except (ValueError, TypeError):
                pass
        return 0.0
    
    def get_outcomes_and_prices(self) -> tuple[List[str], List[float]]:
        """
        Extract outcomes and prices from either API format.
        
        Returns:
            Tuple of (outcomes list, prices list)
        """
        import json
        
        # Try Gamma API format first (JSON strings)
        if self.outcomes and self.outcomePrices:
            try:
                outcomes = json.loads(self.outcomes)
                prices_str = json.loads(self.outcomePrices)
                prices = [float(p) for p in prices_str]
                return outcomes, prices
            except (json.JSONDecodeError, ValueError):
                pass
        
        # Try CLOB API format (tokens array)
        if self.tokens:
            try:
                outcomes = [token.get("outcome", "") for token in self.tokens]
                prices = [float(token.get("price", 0)) for token in self.tokens]
                return outcomes, prices
            except (ValueError, TypeError):
                pass
        
        # Default fallback
        return ["Yes", "No"], [0.5, 0.5]


class PolymarketEvent(BaseModel):
    """Raw event data from Polymarket API."""
    model_config = {"extra": "allow"}  # Allow extra fields from API responses
    
    id: str
    title: str
    description: Optional[str] = None
    slug: str
    markets: Optional[List[Dict[str, Any]]] = []  # Store as raw dicts, not PolymarketMarket objects
    tags: Optional[List[Dict[str, Any]]] = []
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


# ============================================================================
# Polymarket Client
# ============================================================================

class PolymarketClient:
    """Client for interacting with Polymarket APIs."""
    
    def __init__(self, config: PolymarketConfig):
        """
        Initialize Polymarket client.
        
        Args:
            config: Polymarket configuration with API URLs
        """
        self.gamma_api_url = config.gamma_api_url
        self.clob_api_url = config.clob_api_url
        self.api_key = config.api_key
        self.max_retries = 3
        self.base_backoff = 1.0  # seconds
    
    async def fetch_market_data(
        self, 
        condition_id: str
    ) -> Result[PolymarketMarket, IngestionError]:
        """
        Fetch market data from Polymarket APIs using condition ID.
        
        Two-step process:
        1. Fetch from CLOB API using condition_id to get market_slug
        2. Fetch from Gamma API using market_slug to get full market details including events
        
        Args:
            condition_id: Polymarket condition ID
            
        Returns:
            Result containing PolymarketMarket or IngestionError
        """
        # Step 1: Fetch from CLOB API to get market_slug
        clob_url = f"{self.clob_api_url}/markets/{condition_id}"
        clob_data = None
        
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(clob_url)
                    
                    # Handle rate limiting
                    if response.status_code == 429:
                        retry_after = int(response.headers.get("Retry-After", self.base_backoff * (2 ** attempt)))
                        await asyncio.sleep(retry_after)
                        continue
                    
                    # Handle not found
                    if response.status_code == 404:
                        return Err(IngestionError(
                            type="INVALID_MARKET_ID",
                            message=f"Market not found for condition_id: {condition_id}",
                            details={"condition_id": condition_id}
                        ))
                    
                    # Raise for other HTTP errors
                    response.raise_for_status()
                    
                    # Parse response
                    clob_data = response.json()
                    
                    # Handle empty results
                    if not clob_data:
                        return Err(IngestionError(
                            type="INVALID_MARKET_ID",
                            message=f"No market data found for condition_id: {condition_id}",
                            details={"condition_id": condition_id}
                        ))
                    
                    break  # Success, exit retry loop
                    
            except httpx.TimeoutException:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"Request timeout after {self.max_retries} attempts",
                        details={"condition_id": condition_id}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except httpx.HTTPStatusError as e:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"HTTP error: {e.response.status_code} - {str(e)}",
                        details={"condition_id": condition_id, "status_code": e.response.status_code}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except Exception as e:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"Unexpected error: {str(e)}",
                        details={"condition_id": condition_id, "error": str(e)}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
        
        if not clob_data:
            return Err(IngestionError(
                type="API_UNAVAILABLE",
                message="Max retries exceeded",
                details={"condition_id": condition_id}
            ))
        
        # Extract market_slug from CLOB response
        market_slug = clob_data.get("market_slug")
        if not market_slug:
            return Err(IngestionError(
                type="VALIDATION_FAILED",
                message=f"No market_slug found in CLOB API response",
                details={"condition_id": condition_id}
            ))
        
        # Step 2: Fetch from Gamma API using market_slug to get full details including events
        gamma_url = f"{self.gamma_api_url}/markets/slug/{market_slug}"
        
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(gamma_url)
                    
                    # Handle rate limiting
                    if response.status_code == 429:
                        retry_after = int(response.headers.get("Retry-After", self.base_backoff * (2 ** attempt)))
                        await asyncio.sleep(retry_after)
                        continue
                    
                    # Handle not found
                    if response.status_code == 404:
                        return Err(IngestionError(
                            type="INVALID_MARKET_ID",
                            message=f"Market not found in Gamma API for slug: {market_slug}",
                            details={"market_slug": market_slug, "condition_id": condition_id}
                        ))
                    
                    # Raise for other HTTP errors
                    response.raise_for_status()
                    
                    # Parse response
                    gamma_data = response.json()
                    
                    # Handle empty results
                    if not gamma_data:
                        return Err(IngestionError(
                            type="INVALID_MARKET_ID",
                            message=f"No market data found in Gamma API for slug: {market_slug}",
                            details={"market_slug": market_slug, "condition_id": condition_id}
                        ))
                    
                    # Validate and parse market data
                    try:
                        market = PolymarketMarket(**gamma_data)
                        return Ok(market)
                    except Exception as e:
                        return Err(IngestionError(
                            type="VALIDATION_FAILED",
                            message=f"Failed to validate market data: {str(e)}",
                            details={"market_slug": market_slug, "condition_id": condition_id, "error": str(e)}
                        ))
                    
            except httpx.TimeoutException:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"Request timeout after {self.max_retries} attempts",
                        details={"market_slug": market_slug, "condition_id": condition_id}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except httpx.HTTPStatusError as e:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"HTTP error: {e.response.status_code} - {str(e)}",
                        details={"market_slug": market_slug, "condition_id": condition_id, "status_code": e.response.status_code}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except Exception as e:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"Unexpected error: {str(e)}",
                        details={"market_slug": market_slug, "condition_id": condition_id, "error": str(e)}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
        
        # Should not reach here, but handle it
        return Err(IngestionError(
            type="API_UNAVAILABLE",
            message="Max retries exceeded",
            details={"market_slug": market_slug, "condition_id": condition_id}
        ))
    
    async def fetch_historical_prices(
        self,
        condition_id: str,
        timeframe: str = "7d"
    ) -> Result[Dict[str, Any], IngestionError]:
        """
        Fetch historical price data from CLOB API.
        
        The CLOB API provides price history through the /prices endpoint.
        
        Args:
            condition_id: Polymarket condition ID
            timeframe: Time period (24h, 7d, 30d)
            
        Returns:
            Result containing historical price data or IngestionError
        """
        # Map timeframe to seconds
        timeframe_seconds = {
            "1h": 3600,
            "24h": 86400,
            "7d": 604800,
            "30d": 2592000,
        }
        
        seconds = timeframe_seconds.get(timeframe, 604800)  # Default to 7d
        
        # CLOB API endpoint for price history
        url = f"{self.clob_api_url}/prices/{condition_id}"
        
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    # Add query parameters for time range
                    params = {
                        "seconds": seconds,
                        "limit": 1000  # Max data points
                    }
                    
                    response = await client.get(url, params=params)
                    
                    # Handle rate limiting
                    if response.status_code == 429:
                        retry_after = int(response.headers.get("Retry-After", self.base_backoff * (2 ** attempt)))
                        await asyncio.sleep(retry_after)
                        continue
                    
                    # Handle not found
                    if response.status_code == 404:
                        return Err(IngestionError(
                            type="INVALID_MARKET_ID",
                            message=f"Price history not found for condition_id: {condition_id}",
                            details={"condition_id": condition_id}
                        ))
                    
                    # Raise for other HTTP errors
                    response.raise_for_status()
                    
                    # Parse response
                    data = response.json()
                    
                    # Handle empty results
                    if not data:
                        return Ok({
                            "condition_id": condition_id,
                            "timeframe": timeframe,
                            "prices": [],
                            "count": 0,
                            "note": "No historical price data available"
                        })
                    
                    # Process price data
                    prices = []
                    if isinstance(data, list):
                        prices = data
                    elif isinstance(data, dict) and "prices" in data:
                        prices = data["prices"]
                    
                    return Ok({
                        "condition_id": condition_id,
                        "timeframe": timeframe,
                        "prices": prices,
                        "count": len(prices),
                        "data": data if isinstance(data, dict) else None
                    })
                    
            except httpx.TimeoutException:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"Request timeout after {self.max_retries} attempts",
                        details={"condition_id": condition_id}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except httpx.HTTPStatusError as e:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"HTTP error: {e.response.status_code} - {str(e)}",
                        details={"condition_id": condition_id, "status_code": e.response.status_code}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except Exception as e:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"Unexpected error: {str(e)}",
                        details={"condition_id": condition_id, "error": str(e)}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
        
        # Should not reach here, but handle it
        return Err(IngestionError(
            type="API_UNAVAILABLE",
            message="Max retries exceeded",
            details={"condition_id": condition_id}
        ))
    
    async def fetch_event_data(
        self, 
        event_slug: str
    ) -> Result[PolymarketEvent, IngestionError]:
        """
        Fetch event data from Polymarket API.
        
        Args:
            event_slug: Polymarket event slug
            
        Returns:
            Result containing PolymarketEvent or IngestionError
        """
        url = f"{self.gamma_api_url}/events/slug/{event_slug}"
        
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.get(url)
                    
                    # Handle rate limiting
                    if response.status_code == 429:
                        retry_after = int(response.headers.get("Retry-After", self.base_backoff * (2 ** attempt)))
                        await asyncio.sleep(retry_after)
                        continue
                    
                    # Handle not found
                    if response.status_code == 404:
                        return Err(IngestionError(
                            type="INVALID_EVENT_ID",
                            message=f"Event not found for slug: {event_slug}",
                            details={"event_slug": event_slug}
                        ))
                    
                    # Raise for other HTTP errors
                    response.raise_for_status()
                    
                    # Parse response
                    data = response.json()
                    
                    # Validate and parse event data
                    try:
                        event = PolymarketEvent(**data)
                        return Ok(event)
                    except Exception as e:
                        return Err(IngestionError(
                            type="VALIDATION_FAILED",
                            message=f"Failed to validate event data: {str(e)}",
                            details={"event_slug": event_slug, "error": str(e)}
                        ))
                    
            except httpx.TimeoutException:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"Request timeout after {self.max_retries} attempts",
                        details={"event_slug": event_slug}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except httpx.HTTPStatusError as e:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"HTTP error: {e.response.status_code} - {str(e)}",
                        details={"event_slug": event_slug, "status_code": e.response.status_code}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
                
            except Exception as e:
                if attempt == self.max_retries - 1:
                    return Err(IngestionError(
                        type="API_UNAVAILABLE",
                        message=f"Unexpected error: {str(e)}",
                        details={"event_slug": event_slug, "error": str(e)}
                    ))
                await asyncio.sleep(self.base_backoff * (2 ** attempt))
        
        # Should not reach here, but handle it
        return Err(IngestionError(
            type="API_UNAVAILABLE",
            message="Max retries exceeded",
            details={"event_slug": event_slug}
        ))
    
    def transform_to_mbd(
        self,
        market: PolymarketMarket,
        event: Optional[PolymarketEvent] = None
    ) -> MarketBriefingDocument:
        """
        Transform Polymarket data to Market Briefing Document format.
        Supports both Gamma API and CLOB API response formats.
        
        Args:
            market: Polymarket market data (from either Gamma or CLOB API)
            event: Optional event data for additional context (deprecated, use market.events instead)
            
        Returns:
            MarketBriefingDocument with all required fields
        """
        # Extract event from market.events if available (Gamma API format)
        if not event and market.events and len(market.events) > 0:
            event_data = market.events[0]
            try:
                event = PolymarketEvent(**event_data)
            except Exception:
                # If parsing fails, continue without event
                event = None
        
        # Parse outcomes and prices using the normalized method
        outcomes, prices = market.get_outcomes_and_prices()
        current_probability = prices[0] if prices else 0.5
        
        # Get volume and liquidity using helper methods
        volume_24h = market.get_volume()
        liquidity = market.get_liquidity()
        
        # Calculate liquidity score (0-10 scale)
        # Simple heuristic: log scale based on liquidity amount
        if liquidity > 0:
            import math
            liquidity_score = min(10.0, max(0.0, math.log10(liquidity + 1)))
        else:
            liquidity_score = 0.0
        
        # Calculate bid-ask spread
        try:
            spread = float(market.spread) if market.spread else 0.01
        except ValueError:
            spread = 0.01
        bid_ask_spread = spread * 100  # Convert to cents
        
        # Determine volatility regime based on spread and liquidity
        if bid_ask_spread < 1.0 and liquidity_score > 7.0:
            volatility_regime = "low"
        elif bid_ask_spread > 3.0 or liquidity_score < 3.0:
            volatility_regime = "high"
        else:
            volatility_regime = "medium"
        
        # Determine event type from tags or description
        event_type = "other"
        if event and event.tags:
            tag_labels = [tag.get("label", "").lower() for tag in event.tags]
            if any(t in tag_labels for t in ["politics", "election"]):
                event_type = "election"
            elif any(t in tag_labels for t in ["policy", "legislation"]):
                event_type = "policy"
            elif any(t in tag_labels for t in ["court", "legal"]):
                event_type = "court"
            elif any(t in tag_labels for t in ["geopolitics", "international"]):
                event_type = "geopolitical"
            elif any(t in tag_labels for t in ["economy", "economics"]):
                event_type = "economic"
        
        # Parse expiry timestamp using normalized end date
        expiry_timestamp = int(time.time()) + (30 * 24 * 60 * 60)  # Default 30 days
        end_date = market.normalized_end_date
        if end_date:
            try:
                from datetime import datetime
                expiry_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                expiry_timestamp = int(expiry_dt.timestamp())
            except (ValueError, AttributeError):
                pass
        
        # Build event context if available
        event_context = None
        if event and event.markets:
            # Extract market IDs from the markets list (which are now dicts)
            related_markets = []
            for m in event.markets:
                if isinstance(m, dict):
                    m_id = m.get("id")
                else:
                    m_id = getattr(m, "id", None)
                
                if m_id and m_id != market.id:
                    related_markets.append(m_id)
            
            event_context = EventContext(
                event_id=event.id,
                event_title=event.title,
                event_description=event.description or "",
                related_markets=related_markets[:5],  # Limit to 5
                tags=[tag.get("label", "") for tag in event.tags] if event.tags else []
            )
        
        # Build metadata using normalized IDs
        metadata = StreamlinedEventMetadata(
            market_id=market.normalized_market_id,
            condition_id=market.normalized_condition_id,
            created_at=int(time.time()),
            last_updated=int(time.time()),
            source="polymarket",
            version="1.0"
        )
        
        # Create MBD using normalized IDs
        mbd = MarketBriefingDocument(
            market_id=market.normalized_market_id,
            condition_id=market.normalized_condition_id,
            event_type=event_type,
            question=market.question,
            resolution_criteria=market.description or "Market will resolve based on official sources.",
            expiry_timestamp=expiry_timestamp,
            current_probability=current_probability,
            liquidity_score=liquidity_score,
            bid_ask_spread=bid_ask_spread,
            volatility_regime=volatility_regime,
            volume_24h=volume_24h,
            event_context=event_context,
            keywords=None,  # Will be populated by keyword extraction node
            metadata=metadata
        )
        
        return mbd


# ============================================================================
# Convenience Functions
# ============================================================================

async def fetch_and_transform_market(
    condition_id: str,
    config: PolymarketConfig
) -> Result[MarketBriefingDocument, IngestionError]:
    """
    Fetch market data and transform to MBD in one call.
    
    The fetch_market_data function now handles both CLOB and Gamma API calls,
    so event data is automatically included in the market response.
    
    However, the events array from Gamma API has an empty markets list.
    To get all related markets, we also fetch the event by slug.
    
    Args:
        condition_id: Polymarket condition ID
        config: Polymarket configuration
        
    Returns:
        Result containing MarketBriefingDocument or IngestionError
    """
    client = PolymarketClient(config)
    
    # Fetch market data (includes event data from Gamma API)
    market_result = await client.fetch_market_data(condition_id)
    if market_result.is_err():
        return market_result
    
    market = market_result.unwrap()
    
    # Fetch event by slug to get all related markets
    if market.events and len(market.events) > 0:
        event_slug = market.events[0].get('slug')
        if event_slug:
            event_result = await client.fetch_event_data(event_slug)
            if event_result.is_ok():
                event = event_result.unwrap()
                # Update market.events with the full event data including markets
                market.events[0] = {
                    'id': event.id,
                    'title': event.title,
                    'slug': event.slug,
                    'description': event.description,
                    'markets': event.markets,
                    'tags': event.tags,
                    'createdAt': event.createdAt,
                    'updatedAt': event.updatedAt,
                }
    
    # Transform to MBD (event data is extracted from market.events if available)
    mbd = client.transform_to_mbd(market)
    return Ok(mbd)
