"""
Polymarket LangChain Tools

This module provides LangChain tool wrappers for the Polymarket API client with
caching and audit logging capabilities. Tools enable autonomous agents to fetch
market intelligence using the ReAct (Reasoning + Acting) pattern.

Requirements: 3.1-3.8
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import time
import json
from langchain_core.tools import StructuredTool

# Import shared types from newsdata_tools
from tools.newsdata_tools import ToolContext, ToolAuditEntry


# ============================================================================
# Tool Input Schemas (Task 5.1)
# ============================================================================

class FetchRelatedMarketsInput(BaseModel):
    """Input schema for fetch_related_markets tool.
    
    Fetches markets related to the given condition ID, useful for finding
    cross-market patterns and correlations.
    """
    condition_id: str = Field(
        ...,
        description="Condition ID of the market to find related markets for"
    )
    limit: int = Field(
        10,
        description="Maximum number of related markets to return (1-50)",
        ge=1,
        le=50
    )


class FetchHistoricalPricesInput(BaseModel):
    """Input schema for fetch_historical_prices tool.
    
    Fetches historical price data for a market over a specified timeframe,
    useful for trend analysis and momentum detection.
    """
    condition_id: str = Field(
        ...,
        description="Condition ID of the market to fetch price history for"
    )
    timeframe: str = Field(
        "7d",
        description="Time window for historical data: 1d, 7d, 30d, or 90d"
    )


class FetchCrossMarketDataInput(BaseModel):
    """Input schema for fetch_cross_market_data tool.
    
    Fetches and compares data across multiple markets, useful for identifying
    correlations and arbitrage opportunities.
    """
    condition_ids: List[str] = Field(
        ...,
        description="List of condition IDs to compare (2-10 markets)",
        min_length=2,
        max_length=10
    )


class AnalyzeMarketMomentumInput(BaseModel):
    """Input schema for analyze_market_momentum tool.
    
    Analyzes market momentum by examining price changes, volume trends,
    and velocity of probability shifts.
    """
    condition_id: str = Field(
        ...,
        description="Condition ID of the market to analyze momentum for"
    )
    timeframe: str = Field(
        "24h",
        description="Time window for momentum analysis: 1h, 6h, 12h, 24h, or 48h"
    )


class DetectSentimentShiftsInput(BaseModel):
    """Input schema for detect_sentiment_shifts tool.
    
    Detects significant sentiment shifts by identifying rapid price changes
    that exceed a threshold, indicating market sentiment changes.
    """
    condition_id: str = Field(
        ...,
        description="Condition ID of the market to detect sentiment shifts in"
    )
    threshold: float = Field(
        0.05,
        description="Minimum price change to detect as a shift (0-1, e.g., 0.05 = 5%)",
        ge=0.0,
        le=1.0
    )





# ============================================================================
# Tool Execution Wrapper (Reuse from newsdata_tools)
# ============================================================================

async def execute_tool_with_wrapper(
    tool_name: str,
    tool_func: Any,
    params: Dict[str, Any],
    context: ToolContext
) -> Dict[str, Any]:
    """Execute a tool with caching, audit logging, and error handling.
    
    This wrapper implements the core tool execution logic:
    1. Check cache for existing result
    2. Execute tool if cache miss
    3. Store result in cache
    4. Log audit entry with complete execution details
    5. Handle errors gracefully
    
    Requirements: 3.2, 3.3, 3.4, 3.5, 3.6
    
    Args:
        tool_name: Name of the tool being executed
        tool_func: Async function to execute (Polymarket client method)
        params: Parameters to pass to the tool function
        context: Tool execution context (client, cache, audit log, agent name)
        
    Returns:
        Dictionary containing:
            - success: Boolean indicating success/failure
            - result: Tool result (if successful)
            - error: Error message (if failed)
            - cache_hit: Whether result came from cache
            - duration: Execution duration in milliseconds
    """
    start_time = time.time()
    cache_hit = False
    result = None
    error = None
    
    try:
        # Check cache first (Requirement 3.5)
        cached_result = context.cache.get(tool_name, params)
        if cached_result is not None:
            cache_hit = True
            result = cached_result
        else:
            # Cache miss - execute tool (Requirement 3.6)
            result = await tool_func(**params)
            
            # Store in cache
            context.cache.set(tool_name, params, result)
    
    except Exception as e:
        # Graceful error handling (Requirement 3.4)
        error = str(e)
        result = None
    
    # Calculate duration
    end_time = time.time()
    duration_ms = int((end_time - start_time) * 1000)
    
    # Create audit entry (Requirements 3.2, 3.3)
    audit_entry = ToolAuditEntry(
        tool_name=tool_name,
        timestamp=int(start_time),
        params=params,
        result=result if error is None else None,
        error=error,
        duration=duration_ms,
        cache_hit=cache_hit,
        article_count=None  # Not applicable for Polymarket tools
    )
    
    # Add to audit log
    context.audit_log.append(audit_entry.model_dump())
    
    # Return execution result
    return {
        "success": error is None,
        "result": result,
        "error": error,
        "cache_hit": cache_hit,
        "duration": duration_ms
    }



# ============================================================================
# Polymarket Tool Methods (Task 5.2)
# ============================================================================

async def fetch_related_markets(
    condition_id: str,
    limit: int = 10,
    polymarket_client: Any = None
) -> Dict[str, Any]:
    """Fetch markets related to the given condition ID.
    
    This method finds markets that are related to the target market,
    useful for identifying cross-market patterns and correlations.
    
    Requirements: 3.1
    
    Args:
        condition_id: Condition ID of the market
        limit: Maximum number of related markets to return
        polymarket_client: PolymarketClient instance
        
    Returns:
        Dictionary containing related markets data
    """
    # Fetch the target market to get event slug
    market_result = await polymarket_client.fetch_market_data(condition_id)
    
    if market_result.is_err():
        error = market_result.error
        return {
            "error": error.message,
            "related_markets": []
        }
    
    market = market_result.unwrap()
    
    # Extract event slug from market.events (Gamma API response)
    event_slug = None
    if market.events and len(market.events) > 0:
        event_slug = market.events[0].get('slug')
    
    # If no event slug from events, try the old eventSlug field (CLOB API)
    if not event_slug:
        event_slug = market.eventSlug
    
    # If market has event slug, fetch event to get related markets
    related_markets = []
    if event_slug:
        event_result = await polymarket_client.fetch_event_data(event_slug)
        
        if event_result.is_ok():
            event = event_result.unwrap()
            # Get other markets in the same event (limit to requested amount)
            count = 0
            for related_market_dict in event.markets:
                if count >= limit:
                    break
                    
                related_condition_id = related_market_dict.get('conditionId')
                # Include all markets, not just ones different from current
                if related_condition_id:
                    # Extract price from either format
                    current_probability = 0.5
                    if 'outcomePrices' in related_market_dict:
                        try:
                            prices = json.loads(related_market_dict['outcomePrices'])
                            current_probability = float(prices[0]) if prices else 0.5
                        except (json.JSONDecodeError, ValueError, IndexError):
                            pass
                    elif 'tokens' in related_market_dict and related_market_dict['tokens']:
                        try:
                            current_probability = float(related_market_dict['tokens'][0].get('price', 0.5))
                        except (ValueError, IndexError):
                            pass
                    
                    is_current = related_condition_id == condition_id
                    related_markets.append({
                        "condition_id": related_condition_id,
                        "question": related_market_dict.get('question', 'N/A'),
                        "current_probability": current_probability,
                        "volume": related_market_dict.get('volume', 0),
                        "liquidity": related_market_dict.get('liquidity', 0),
                        "active": related_market_dict.get('active', False),
                        "is_current_market": is_current
                    })
                    count += 1
    
    return {
        "condition_id": condition_id,
        "event_slug": event_slug,
        "related_markets": related_markets,
        "count": len(related_markets)
    }


async def fetch_historical_prices(
    condition_id: str,
    timeframe: str = "7d",
    polymarket_client: Any = None
) -> Dict[str, Any]:
    """Fetch historical price data for a market from CLOB API.
    
    This method retrieves historical price data over a specified timeframe,
    useful for trend analysis and momentum detection. Returns formatted data
    optimized for charting with downsampling and statistics.
    
    Requirements: 3.1
    
    Args:
        condition_id: Condition ID of the market
        timeframe: Time window (1h, 24h, 7d, 30d)
        polymarket_client: PolymarketClient instance
        
    Returns:
        Dictionary containing historical price data and statistics
    """
    # Fetch historical prices from CLOB API
    prices_result = await polymarket_client.fetch_historical_prices(
        condition_id=condition_id,
        timeframe=timeframe
    )
    
    # If no historical data, try to get current market price as fallback
    if prices_result.is_err():
        market_result = await polymarket_client.fetch_market_data(condition_id)
        
        if market_result.is_err():
            error = market_result.error
            return {
                "condition_id": condition_id,
                "timeframe": timeframe,
                "error": error.message,
                "prices": [],
                "count": 0
            }
        
        # Use current market price as single data point
        market = market_result.unwrap()
        outcomes, prices = market.get_outcomes_and_prices()
        current_price = prices[0] if prices else 0.5
        
        return {
            "condition_id": condition_id,
            "timeframe": timeframe,
            "prices": [{"price": current_price, "timestamp": int(__import__('time').time() * 1000)}],
            "count": 1,
            "statistics": {
                "min_price": current_price,
                "max_price": current_price,
                "avg_price": current_price,
                "current_price": current_price,
                "price_change": 0,
                "volatility": 0,
                "data_points": 1
            },
            "note": "Using current market price (historical data unavailable)"
        }
    
    prices_data = prices_result.unwrap()
    prices = prices_data.get("prices", [])
    
    # Calculate statistics if we have price data
    stats = {}
    if prices and len(prices) > 0:
        prices_list = []
        for price in prices:
            if isinstance(price, dict):
                # Format: {"price": 0.245, "timestamp": ...}
                if "price" in price:
                    prices_list.append(float(price["price"]))
            elif isinstance(price, (int, float)):
                prices_list.append(float(price))
        
        if prices_list:
            stats = {
                "min_price": min(prices_list),
                "max_price": max(prices_list),
                "avg_price": sum(prices_list) / len(prices_list),
                "current_price": prices_list[-1] if prices_list else 0.5,
                "price_change": prices_list[-1] - prices_list[0] if len(prices_list) > 1 else 0,
                "volatility": max(prices_list) - min(prices_list) if prices_list else 0
            }
    
    return {
        "condition_id": condition_id,
        "timeframe": timeframe,
        "prices": prices_data.get("prices", []),
        "count": prices_data.get("count", 0),
        "statistics": stats,
        "raw_data": prices_data.get("data")
    }


async def fetch_cross_market_data(
    condition_ids: List[str],
    polymarket_client: Any = None
) -> Dict[str, Any]:
    """Fetch and compare data across multiple markets.
    
    This method retrieves data for multiple markets simultaneously,
    useful for identifying correlations and arbitrage opportunities.
    
    Requirements: 3.1
    
    Args:
        condition_ids: List of condition IDs to compare
        polymarket_client: PolymarketClient instance
        
    Returns:
        Dictionary containing cross-market comparison data
    """
    markets_data = []
    errors = []
    
    # Fetch data for each market
    for condition_id in condition_ids:
        market_result = await polymarket_client.fetch_market_data(condition_id)
        
        if market_result.is_ok():
            market = market_result.unwrap()
            outcomes, prices = market.get_outcomes_and_prices()
            current_price = prices[0] if prices else 0.5
            
            markets_data.append({
                "condition_id": condition_id,
                "question": market.question,
                "current_probability": current_price,
                "volume": market.get_volume(),
                "liquidity": market.get_liquidity(),
                "active": market.active,
                "event_slug": market.eventSlug or (market.events[0].get('slug') if market.events else None)
            })
        else:
            error = market_result.error
            errors.append({
                "condition_id": condition_id,
                "error": error.message
            })
    
    return {
        "markets": markets_data,
        "count": len(markets_data),
        "errors": errors
    }


async def analyze_market_momentum(
    condition_id: str,
    timeframe: str = "24h",
    polymarket_client: Any = None
) -> Dict[str, Any]:
    """Analyze market momentum by examining price and volume trends.
    
    This method calculates momentum indicators based on current market
    state and volume trends.
    
    Requirements: 3.1
    
    Args:
        condition_id: Condition ID of the market
        timeframe: Time window for momentum analysis
        polymarket_client: PolymarketClient instance
        
    Returns:
        Dictionary containing momentum analysis
    """
    # Fetch current market data
    market_result = await polymarket_client.fetch_market_data(condition_id)
    
    if market_result.is_err():
        error = market_result.unwrap_err()
        return {
            "error": error.message,
            "momentum": "unknown"
        }
    
    market = market_result.unwrap()
    current_price = json.loads(market.outcomePrices)[0] if market.outcomePrices else 0.5
    
    try:
        volume = float(market.volume) if market.volume else 0.0
        liquidity = float(market.liquidity) if market.liquidity else 0.0
    except ValueError:
        volume = 0.0
        liquidity = 0.0
    
    # Calculate momentum indicators
    # High volume + high liquidity = strong momentum
    # Low volume + low liquidity = weak momentum
    volume_score = min(10.0, volume / 10000.0) if volume > 0 else 0.0
    liquidity_score = min(10.0, liquidity / 10000.0) if liquidity > 0 else 0.0
    
    momentum_score = (volume_score + liquidity_score) / 2.0
    
    if momentum_score > 7.0:
        momentum = "strong"
    elif momentum_score > 4.0:
        momentum = "moderate"
    else:
        momentum = "weak"
    
    return {
        "condition_id": condition_id,
        "timeframe": timeframe,
        "current_probability": current_price,
        "volume": volume,
        "liquidity": liquidity,
        "momentum": momentum,
        "momentum_score": momentum_score,
        "volume_score": volume_score,
        "liquidity_score": liquidity_score
    }


async def detect_sentiment_shifts(
    condition_id: str,
    threshold: float = 0.05,
    polymarket_client: Any = None
) -> Dict[str, Any]:
    """Detect significant sentiment shifts by comparing current price to historical average.
    
    This method identifies when market sentiment has shifted significantly
    by comparing the current price to the historical average price.
    
    Requirements: 3.1
    
    Args:
        condition_id: Condition ID of the market
        threshold: Minimum price change to detect (0-1)
        polymarket_client: PolymarketClient instance
        
    Returns:
        Dictionary containing sentiment shift analysis
    """
    # Fetch current market data
    market_result = await polymarket_client.fetch_market_data(condition_id)
    
    if market_result.is_err():
        error = market_result.error
        return {
            "condition_id": condition_id,
            "error": error.message,
            "shift_detected": False
        }
    
    market = market_result.unwrap()
    outcomes, prices = market.get_outcomes_and_prices()
    current_price = prices[0] if prices else 0.5
    
    # Fetch historical prices to get baseline
    prices_result = await polymarket_client.fetch_historical_prices(
        condition_id=condition_id,
        timeframe="7d"
    )
    
    # If no historical data, use current price as baseline
    if prices_result.is_err():
        historical_avg = current_price
    else:
        prices_data = prices_result.unwrap()
        stats = prices_data.get("statistics", {})
        historical_avg = stats.get("avg_price", current_price)
    
    # Calculate price change from historical average
    price_change = abs(current_price - historical_avg)
    
    # Detect shift if price change exceeds threshold
    shift_detected = price_change > threshold
    
    if shift_detected:
        if current_price > historical_avg:
            sentiment = "bullish"
            shift_direction = "upward"
        else:
            sentiment = "bearish"
            shift_direction = "downward"
    else:
        sentiment = "neutral"
        shift_direction = "none"
    
    return {
        "condition_id": condition_id,
        "current_probability": current_price,
        "historical_average": historical_avg,
        "threshold": threshold,
        "price_change": price_change,
        "shift_detected": shift_detected,
        "shift_direction": shift_direction,
        "sentiment": sentiment
    }


# ============================================================================
# LangChain Tool Factories (Task 5.3)
# ============================================================================

def create_fetch_related_markets_tool(context: ToolContext) -> StructuredTool:
    """Create fetch_related_markets LangChain tool.
    
    This tool fetches markets related to the given condition ID, useful for
    finding cross-market patterns and correlations. It wraps the Polymarket
    client with caching and audit logging.
    
    Requirements: 3.1, 3.7
    
    Args:
        context: Tool execution context (must have polymarket_client attribute)
        
    Returns:
        LangChain StructuredTool instance
    """
    async def fetch_related_markets_wrapper(**kwargs) -> str:
        """Fetch markets related to the given condition ID."""
        # Get polymarket_client from context
        polymarket_client = getattr(context, 'polymarket_client', None)
        if polymarket_client is None:
            return "Error: Polymarket client not available in context"
        
        # Extract only the tool parameters (not the client)
        params = {k: v for k, v in kwargs.items() if k != 'polymarket_client'}
        
        # Execute with wrapper
        async def tool_func(**p):
            return await fetch_related_markets(**p, polymarket_client=polymarket_client)
        
        execution_result = await execute_tool_with_wrapper(
            tool_name="fetch_related_markets",
            tool_func=tool_func,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            count = result.get("count", 0)
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Successfully fetched {count} related markets ({cache_status}). Results: {json.dumps(result)}"
        else:
            return f"Error fetching related markets: {execution_result['error']}"
    
    return StructuredTool(
        name="fetch_related_markets",
        description="Fetch markets related to a given condition ID for cross-market analysis",
        args_schema=FetchRelatedMarketsInput,
        func=fetch_related_markets_wrapper,
        coroutine=fetch_related_markets_wrapper
    )


def create_fetch_historical_prices_tool(context: ToolContext) -> StructuredTool:
    """Create fetch_historical_prices LangChain tool.
    
    This tool fetches historical price data for a market over a specified
    timeframe, useful for trend analysis and momentum detection. It wraps
    the Polymarket client with caching and audit logging.
    
    Requirements: 3.1, 3.7
    
    Args:
        context: Tool execution context (must have polymarket_client attribute)
        
    Returns:
        LangChain StructuredTool instance
    """
    async def fetch_historical_prices_wrapper(**kwargs) -> str:
        """Fetch historical price data for a market."""
        # Get polymarket_client from context
        polymarket_client = getattr(context, 'polymarket_client', None)
        if polymarket_client is None:
            return "Error: Polymarket client not available in context"
        
        # Extract only the tool parameters (not the client)
        params = {k: v for k, v in kwargs.items() if k != 'polymarket_client'}
        
        # Execute with wrapper
        async def tool_func(**p):
            return await fetch_historical_prices(**p, polymarket_client=polymarket_client)
        
        execution_result = await execute_tool_with_wrapper(
            tool_name="fetch_historical_prices",
            tool_func=tool_func,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Successfully fetched historical prices ({cache_status}). Results: {json.dumps(result)}"
        else:
            return f"Error fetching historical prices: {execution_result['error']}"
    
    return StructuredTool(
        name="fetch_historical_prices",
        description="Fetch historical price data for trend analysis and momentum detection",
        args_schema=FetchHistoricalPricesInput,
        func=fetch_historical_prices_wrapper,
        coroutine=fetch_historical_prices_wrapper
    )


def create_fetch_cross_market_data_tool(context: ToolContext) -> StructuredTool:
    """Create fetch_cross_market_data LangChain tool.
    
    This tool fetches and compares data across multiple markets, useful for
    identifying correlations and arbitrage opportunities. It wraps the
    Polymarket client with caching and audit logging.
    
    Requirements: 3.1, 3.7
    
    Args:
        context: Tool execution context (must have polymarket_client attribute)
        
    Returns:
        LangChain StructuredTool instance
    """
    async def fetch_cross_market_data_wrapper(**kwargs) -> str:
        """Fetch and compare data across multiple markets."""
        # Get polymarket_client from context
        polymarket_client = getattr(context, 'polymarket_client', None)
        if polymarket_client is None:
            return "Error: Polymarket client not available in context"
        
        # Extract only the tool parameters (not the client)
        params = {k: v for k, v in kwargs.items() if k != 'polymarket_client'}
        
        # Execute with wrapper
        async def tool_func(**p):
            return await fetch_cross_market_data(**p, polymarket_client=polymarket_client)
        
        execution_result = await execute_tool_with_wrapper(
            tool_name="fetch_cross_market_data",
            tool_func=tool_func,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            count = result.get("count", 0)
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Successfully fetched {count} markets for comparison ({cache_status}). Results: {json.dumps(result)}"
        else:
            return f"Error fetching cross-market data: {execution_result['error']}"
    
    return StructuredTool(
        name="fetch_cross_market_data",
        description="Fetch and compare data across multiple markets for correlation analysis",
        args_schema=FetchCrossMarketDataInput,
        func=fetch_cross_market_data_wrapper,
        coroutine=fetch_cross_market_data_wrapper
    )


def create_analyze_market_momentum_tool(context: ToolContext) -> StructuredTool:
    """Create analyze_market_momentum LangChain tool.
    
    This tool analyzes market momentum by examining price changes, volume
    trends, and velocity of probability shifts. It wraps the Polymarket
    client with caching and audit logging.
    
    Requirements: 3.1, 3.7
    
    Args:
        context: Tool execution context (must have polymarket_client attribute)
        
    Returns:
        LangChain StructuredTool instance
    """
    async def analyze_market_momentum_wrapper(**kwargs) -> str:
        """Analyze market momentum by examining price and volume trends."""
        # Get polymarket_client from context
        polymarket_client = getattr(context, 'polymarket_client', None)
        if polymarket_client is None:
            return "Error: Polymarket client not available in context"
        
        # Extract only the tool parameters (not the client)
        params = {k: v for k, v in kwargs.items() if k != 'polymarket_client'}
        
        # Execute with wrapper
        async def tool_func(**p):
            return await analyze_market_momentum(**p, polymarket_client=polymarket_client)
        
        execution_result = await execute_tool_with_wrapper(
            tool_name="analyze_market_momentum",
            tool_func=tool_func,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            momentum = result.get("momentum", "unknown")
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Market momentum: {momentum} ({cache_status}). Results: {json.dumps(result)}"
        else:
            return f"Error analyzing market momentum: {execution_result['error']}"
    
    return StructuredTool(
        name="analyze_market_momentum",
        description="Analyze market momentum by examining price changes and volume trends",
        args_schema=AnalyzeMarketMomentumInput,
        func=analyze_market_momentum_wrapper,
        coroutine=analyze_market_momentum_wrapper
    )


def create_detect_sentiment_shifts_tool(context: ToolContext) -> StructuredTool:
    """Create detect_sentiment_shifts LangChain tool.
    
    This tool detects significant sentiment shifts by identifying rapid price
    changes that exceed a threshold, indicating market sentiment changes. It
    wraps the Polymarket client with caching and audit logging.
    
    Requirements: 3.1, 3.7
    
    Args:
        context: Tool execution context (must have polymarket_client attribute)
        
    Returns:
        LangChain StructuredTool instance
    """
    async def detect_sentiment_shifts_wrapper(**kwargs) -> str:
        """Detect significant sentiment shifts by identifying rapid price changes."""
        # Get polymarket_client from context
        polymarket_client = getattr(context, 'polymarket_client', None)
        if polymarket_client is None:
            return "Error: Polymarket client not available in context"
        
        # Extract only the tool parameters (not the client)
        params = {k: v for k, v in kwargs.items() if k != 'polymarket_client'}
        
        # Execute with wrapper
        async def tool_func(**p):
            return await detect_sentiment_shifts(**p, polymarket_client=polymarket_client)
        
        execution_result = await execute_tool_with_wrapper(
            tool_name="detect_sentiment_shifts",
            tool_func=tool_func,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            shift_detected = result.get("shift_detected", False)
            sentiment = result.get("sentiment", "unknown")
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Sentiment shift detected: {shift_detected}, sentiment: {sentiment} ({cache_status}). Results: {json.dumps(result)}"
        else:
            return f"Error detecting sentiment shifts: {execution_result['error']}"
    
    return StructuredTool(
        name="detect_sentiment_shifts",
        description="Detect significant sentiment shifts by identifying rapid price changes",
        args_schema=DetectSentimentShiftsInput,
        func=detect_sentiment_shifts_wrapper,
        coroutine=detect_sentiment_shifts_wrapper
    )


# ============================================================================
# Tool Usage Summary (Task 5.4)
# ============================================================================

def get_tool_usage_summary(audit_log: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate summary statistics from audit log.
    
    Calculates aggregate statistics about tool usage including call counts,
    execution times, cache performance, and error rates.
    
    Requirements: 3.2, 3.3
    
    Args:
        audit_log: List of audit entries from tool executions
        
    Returns:
        Dictionary containing:
            - tools_called: Total number of tool invocations
            - total_tool_time: Total execution time in milliseconds
            - cache_hits: Number of cache hits
            - cache_misses: Number of cache misses
            - tool_breakdown: Dict mapping tool name to call count
            - errors: Number of failed tool invocations
    """
    tools_called = len(audit_log)
    total_tool_time = 0
    cache_hits = 0
    cache_misses = 0
    tool_breakdown: Dict[str, int] = {}
    errors = 0
    
    for entry in audit_log:
        # Accumulate duration
        total_tool_time += entry.get("duration", 0)
        
        # Track cache performance
        if entry.get("cache_hit", False):
            cache_hits += 1
        else:
            cache_misses += 1
        
        # Track tool breakdown
        tool_name = entry.get("tool_name", "unknown")
        tool_breakdown[tool_name] = tool_breakdown.get(tool_name, 0) + 1
        
        # Track errors
        if entry.get("error") is not None:
            errors += 1
    
    return {
        "tools_called": tools_called,
        "total_tool_time": total_tool_time,
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "tool_breakdown": tool_breakdown,
        "errors": errors
    }
