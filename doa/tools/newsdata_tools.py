"""
NewsData LangChain Tools

This module provides LangChain tool wrappers for the NewsData API client with
caching and audit logging capabilities. Tools enable autonomous agents to fetch
news data using the ReAct (Reasoning + Acting) pattern.

Requirements: 2.1-2.8
"""

from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Dict, Any, Union
import ast


def parse_list_field(value: Union[List[str], str, None]) -> Optional[List[str]]:
    """Parse list field that may be provided as string representation.
    
    LangChain sometimes converts list arguments to string representations
    (e.g., "['us', 'uk']" instead of ['us', 'uk']). This function safely
    converts them back to actual lists.
    
    Args:
        value: List, string representation of list, or None
        
    Returns:
        Parsed list or None
    """
    if value is None:
        return None
    
    if isinstance(value, list):
        return value
    
    if isinstance(value, str):
        # Try to parse as Python literal
        try:
            parsed = ast.literal_eval(value)
            if isinstance(parsed, list):
                return parsed
        except (ValueError, SyntaxError):
            pass
        
        # If it's a single value string, wrap it in a list
        return [value]
    
    return None


class FetchLatestNewsInput(BaseModel):
    """Input schema for fetch_latest_news tool.
    
    Fetches latest news from the past 48 hours with various filtering options.
    """
    query: Optional[str] = Field(
        None,
        description="Search query for article content. Searches in title, description, and content."
    )
    qInTitle: Optional[str] = Field(
        None,
        description="Search query for article titles only. More precise than 'query'."
    )
    timeframe: str = Field(
        "24h",
        description="Time window for news: 1h, 6h, 12h, 24h, or 48h"
    )
    country: Optional[List[str]] = Field(
        None,
        description="Country codes as an array (e.g., ['us', 'uk', 'ca']). IMPORTANT: Always provide as an array, even for a single country (e.g., ['us'] not 'us'). Filters by article source country."
    )
    category: Optional[List[str]] = Field(
        None,
        description="News categories. Valid values: business, entertainment, environment, food, health, politics, science, sports, technology, top, tourism, world. Do NOT use 'finance' - use 'business' instead."
    )
    language: List[str] = Field(
        ["en"],
        description="Language codes (e.g., ['en', 'es']). Defaults to English."
    )
    sentiment: Optional[str] = Field(
        None,
        description="Filter by sentiment: 'positive', 'negative', or 'neutral'"
    )
    size: int = Field(
        20,
        description="Number of articles to return (1-50)",
        ge=1,
        le=50
    )
    removeduplicate: bool = Field(
        True,
        description="Remove duplicate articles from results"
    )
    
    @field_validator('country', 'category', 'language', mode='before')
    @classmethod
    def parse_list_fields(cls, v):
        """Parse list fields that may be provided as string representations."""
        return parse_list_field(v)


class FetchArchiveNewsInput(BaseModel):
    """Input schema for fetch_archive_news tool.
    
    Fetches historical news with date range filtering.
    """
    from_date: str = Field(
        ...,
        description="Start date in YYYY-MM-DD format (e.g., '2024-01-01')"
    )
    to_date: str = Field(
        ...,
        description="End date in YYYY-MM-DD format (e.g., '2024-01-31')"
    )
    query: Optional[str] = Field(
        None,
        description="Search query for article content"
    )
    qInTitle: Optional[str] = Field(
        None,
        description="Search query for article titles only"
    )
    country: Optional[List[str]] = Field(
        None,
        description="Country codes as an array (e.g., ['us', 'uk']). IMPORTANT: Always provide as an array, even for a single country (e.g., ['us'] not 'us')."
    )
    category: Optional[List[str]] = Field(
        None,
        description="News categories as an array. Valid values: ['business'], ['entertainment'], ['environment'], ['food'], ['health'], ['politics'], ['science'], ['sports'], ['technology'], ['top'], ['tourism'], ['world']. IMPORTANT: Always provide as an array, even for a single category (e.g., ['politics'] not 'politics'). Do NOT use 'finance' - use 'business' instead."
    )
    language: List[str] = Field(
        ["en"],
        description="Language codes. Defaults to English."
    )
    size: int = Field(
        20,
        description="Number of articles to return (1-50)",
        ge=1,
        le=50
    )
    removeduplicate: bool = Field(
        True,
        description="Remove duplicate articles from results"
    )
    
    @field_validator('country', 'category', 'language', mode='before')
    @classmethod
    def parse_list_fields(cls, v):
        """Parse list fields that may be provided as string representations."""
        return parse_list_field(v)


class FetchCryptoNewsInput(BaseModel):
    """Input schema for fetch_crypto_news tool.
    
    Fetches cryptocurrency-related news with crypto-specific filtering.
    """
    coin: Optional[List[str]] = Field(
        None,
        description="Cryptocurrency symbols (e.g., ['BTC', 'ETH', 'SOL'])"
    )
    query: Optional[str] = Field(
        None,
        description="Search query for article content"
    )
    qInTitle: Optional[str] = Field(
        None,
        description="Search query for article titles only"
    )
    timeframe: Optional[str] = Field(
        None,
        description="Time window: 1h, 6h, 12h, 24h, or 48h"
    )
    from_date: Optional[str] = Field(
        None,
        description="Start date in YYYY-MM-DD format (for historical queries)"
    )
    to_date: Optional[str] = Field(
        None,
        description="End date in YYYY-MM-DD format (for historical queries)"
    )
    sentiment: Optional[str] = Field(
        None,
        description="Filter by sentiment: 'positive', 'negative', or 'neutral'"
    )
    language: List[str] = Field(
        ["en"],
        description="Language codes. Defaults to English."
    )
    size: int = Field(
        20,
        description="Number of articles to return (1-50)",
        ge=1,
        le=50
    )
    removeduplicate: bool = Field(
        True,
        description="Remove duplicate articles from results"
    )
    
    @field_validator('coin', 'language', mode='before')
    @classmethod
    def parse_list_fields(cls, v):
        """Parse list fields that may be provided as string representations."""
        return parse_list_field(v)


class FetchMarketNewsInput(BaseModel):
    """Input schema for fetch_market_news tool.
    
    Fetches financial market and company news with market-specific filtering.
    """
    symbol: Optional[List[str]] = Field(
        None,
        description="Stock symbols (e.g., ['AAPL', 'GOOGL', 'MSFT'])"
    )
    organization: Optional[List[str]] = Field(
        None,
        description="Organization names (e.g., ['Apple', 'Google', 'Microsoft'])"
    )
    query: Optional[str] = Field(
        None,
        description="Search query for article content"
    )
    qInTitle: Optional[str] = Field(
        None,
        description="Search query for article titles only"
    )
    timeframe: Optional[str] = Field(
        None,
        description="Time window: 1h, 6h, 12h, 24h, or 48h"
    )
    from_date: Optional[str] = Field(
        None,
        description="Start date in YYYY-MM-DD format (for historical queries)"
    )
    to_date: Optional[str] = Field(
        None,
        description="End date in YYYY-MM-DD format (for historical queries)"
    )
    sentiment: Optional[str] = Field(
        None,
        description="Filter by sentiment: 'positive', 'negative', or 'neutral'"
    )
    country: Optional[List[str]] = Field(
        None,
        description="Country codes as an array (e.g., ['us', 'uk']). IMPORTANT: Always provide as an array, even for a single country (e.g., ['us'] not 'us')."
    )
    language: List[str] = Field(
        ["en"],
        description="Language codes. Defaults to English."
    )
    size: int = Field(
        20,
        description="Number of articles to return (1-50)",
        ge=1,
        le=50
    )
    removeduplicate: bool = Field(
        True,
        description="Remove duplicate articles from results"
    )
    
    @field_validator('symbol', 'organization', 'country', 'language', mode='before')
    @classmethod
    def parse_list_fields(cls, v):
        """Parse list fields that may be provided as string representations."""
        return parse_list_field(v)


class ToolContext(BaseModel):
    """Context for tool execution.
    
    Provides shared resources for tool execution including API clients,
    caching, and audit logging.
    """
    newsdata_client: Optional[Any] = Field(
        None,
        description="NewsDataClient instance for making API requests"
    )
    polymarket_client: Optional[Any] = Field(
        None,
        description="PolymarketClient instance for making API requests"
    )
    cache: Any = Field(
        ...,
        description="ToolCache instance for caching tool results"
    )
    audit_log: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of audit entries for tool invocations"
    )
    agent_name: str = Field(
        ...,
        description="Name of the agent using the tools"
    )
    
    class Config:
        arbitrary_types_allowed = True


class ToolAuditEntry(BaseModel):
    """Audit log entry for tool invocation.
    
    Captures complete information about tool execution for debugging,
    monitoring, and analysis.
    """
    tool_name: str = Field(
        ...,
        description="Name of the tool that was invoked"
    )
    timestamp: int = Field(
        ...,
        description="Unix timestamp (seconds) when tool was invoked"
    )
    params: Dict[str, Any] = Field(
        ...,
        description="Parameters passed to the tool"
    )
    result: Optional[Any] = Field(
        None,
        description="Result returned by the tool (None if error occurred)"
    )
    error: Optional[str] = Field(
        None,
        description="Error message if tool execution failed"
    )
    duration: int = Field(
        ...,
        description="Execution duration in milliseconds"
    )
    cache_hit: bool = Field(
        ...,
        description="Whether result was retrieved from cache"
    )
    article_count: Optional[int] = Field(
        None,
        description="Number of articles returned (for news tools)"
    )


# ============================================================================
# Tool Execution Wrapper (Task 4.2)
# ============================================================================

import time
from langchain_core.tools import StructuredTool


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
    
    Requirements: 2.2, 2.3, 2.4, 2.5, 2.6
    
    Args:
        tool_name: Name of the tool being executed
        tool_func: Async function to execute (NewsData client method)
        params: Parameters to pass to the tool function
        context: Tool execution context (client, cache, audit log, agent name)
        
    Returns:
        Dictionary containing:
            - success: Boolean indicating success/failure
            - result: Tool result (if successful)
            - error: Error message (if failed)
            - article_count: Number of articles returned (if applicable)
            - cache_hit: Whether result came from cache
            - duration: Execution duration in milliseconds
    """
    start_time = time.time()
    cache_hit = False
    result = None
    error = None
    article_count = None
    
    try:
        # Check cache first (Requirement 2.5)
        cached_result = context.cache.get(tool_name, params)
        if cached_result is not None:
            cache_hit = True
            result = cached_result
            # Extract article count from cached result
            if isinstance(result, dict) and "results" in result:
                article_count = len(result.get("results", []))
        else:
            # Cache miss - execute tool (Requirement 2.6)
            result = await tool_func(**params)
            
            # Store in cache
            context.cache.set(tool_name, params, result)
            
            # Extract article count from result
            if isinstance(result, dict) and "results" in result:
                article_count = len(result.get("results", []))
    
    except Exception as e:
        # Graceful error handling (Requirement 2.4)
        error = str(e)
        result = None
    
    # Calculate duration
    end_time = time.time()
    duration_ms = int((end_time - start_time) * 1000)
    
    # Create audit entry (Requirements 2.2, 2.3)
    audit_entry = ToolAuditEntry(
        tool_name=tool_name,
        timestamp=int(start_time),
        params=params,
        result=result if error is None else None,
        error=error,
        duration=duration_ms,
        cache_hit=cache_hit,
        article_count=article_count
    )
    
    # Add to audit log
    context.audit_log.append(audit_entry.model_dump())
    
    # Return execution result
    return {
        "success": error is None,
        "result": result,
        "error": error,
        "article_count": article_count,
        "cache_hit": cache_hit,
        "duration": duration_ms
    }


# ============================================================================
# LangChain Tool Factories (Task 4.3)
# ============================================================================

def create_fetch_latest_news_tool(context: ToolContext) -> StructuredTool:
    """Create fetch_latest_news LangChain tool.
    
    This tool fetches latest news from the past 48 hours with various
    filtering options. It wraps the NewsData client's fetch_latest_news
    method with caching and audit logging.
    
    Requirements: 2.1, 2.7
    
    Args:
        context: Tool execution context
        
    Returns:
        LangChain StructuredTool instance
    """
    async def fetch_latest_news(
        query: Optional[str] = None,
        qInTitle: Optional[str] = None,
        timeframe: str = "24h",
        country: Optional[List[str]] = None,
        category: Optional[List[str]] = None,
        language: List[str] = ["en"],
        sentiment: Optional[str] = None,
        size: int = 20,
        removeduplicate: bool = True
    ) -> str:
        """Fetch latest news from the past 48 hours."""
        # Build params dict
        params = {
            "query": query,
            "qInTitle": qInTitle,
            "timeframe": timeframe,
            "country": country,
            "category": category,
            "language": language,
            "sentiment": sentiment,
            "size": size,
            "removeduplicate": removeduplicate
        }
        
        # Execute with wrapper
        execution_result = await execute_tool_with_wrapper(
            tool_name="fetch_latest_news",
            tool_func=context.newsdata_client.fetch_latest_news,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            article_count = execution_result.get("article_count", 0)
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Successfully fetched {article_count} articles ({cache_status}). Results: {result}"
        else:
            return f"Error fetching news: {execution_result['error']}"
    
    return StructuredTool(
        name="fetch_latest_news",
        description="Fetch latest news from the past 48 hours with filtering options. Valid categories: ['business'], ['entertainment'], ['environment'], ['food'], ['health'], ['politics'], ['science'], ['sports'], ['technology'], ['top'], ['tourism'], ['world']. IMPORTANT: Always provide category and country as arrays, even for a single value (e.g., category=['politics'], country=['us'] not category='politics', country='us').",
        args_schema=FetchLatestNewsInput,
        func=fetch_latest_news,
        coroutine=fetch_latest_news
    )


def create_fetch_archive_news_tool(context: ToolContext) -> StructuredTool:
    """Create fetch_archive_news LangChain tool.
    
    This tool fetches historical news with date range filtering. It wraps
    the NewsData client's fetch_archive_news method with caching and
    audit logging.
    
    Requirements: 2.1, 2.7
    
    Args:
        context: Tool execution context
        
    Returns:
        LangChain StructuredTool instance
    """
    async def fetch_archive_news(
        from_date: str,
        to_date: str,
        query: Optional[str] = None,
        qInTitle: Optional[str] = None,
        country: Optional[List[str]] = None,
        category: Optional[List[str]] = None,
        language: List[str] = ["en"],
        size: int = 20,
        removeduplicate: bool = True
    ) -> str:
        """Fetch historical news with date range filtering."""
        # Build params dict
        params = {
            "from_date": from_date,
            "to_date": to_date,
            "query": query,
            "qInTitle": qInTitle,
            "country": country,
            "category": category,
            "language": language,
            "size": size,
            "removeduplicate": removeduplicate
        }
        
        # Execute with wrapper
        execution_result = await execute_tool_with_wrapper(
            tool_name="fetch_archive_news",
            tool_func=context.newsdata_client.fetch_archive_news,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            article_count = execution_result.get("article_count", 0)
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Successfully fetched {article_count} archive articles ({cache_status}). Results: {result}"
        else:
            return f"Error fetching archive news: {execution_result['error']}"
    
    return StructuredTool(
        name="fetch_archive_news",
        description="Fetch historical news with date range filtering. Valid categories: ['business'], ['entertainment'], ['environment'], ['food'], ['health'], ['politics'], ['science'], ['sports'], ['technology'], ['top'], ['tourism'], ['world']. IMPORTANT: Always provide category and country as arrays, even for a single value (e.g., category=['politics'], country=['us'] not category='politics', country='us').",
        args_schema=FetchArchiveNewsInput,
        func=fetch_archive_news,
        coroutine=fetch_archive_news
    )


def create_fetch_crypto_news_tool(context: ToolContext) -> StructuredTool:
    """Create fetch_crypto_news LangChain tool.
    
    This tool fetches cryptocurrency-related news with crypto-specific
    filtering. It wraps the NewsData client's fetch_crypto_news method
    with caching and audit logging.
    
    Requirements: 2.1, 2.7
    
    Args:
        context: Tool execution context
        
    Returns:
        LangChain StructuredTool instance
    """
    async def fetch_crypto_news(
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
    ) -> str:
        """Fetch cryptocurrency-related news."""
        # Build params dict
        params = {
            "coin": coin,
            "query": query,
            "qInTitle": qInTitle,
            "timeframe": timeframe,
            "from_date": from_date,
            "to_date": to_date,
            "sentiment": sentiment,
            "language": language,
            "size": size,
            "removeduplicate": removeduplicate
        }
        
        # Execute with wrapper
        execution_result = await execute_tool_with_wrapper(
            tool_name="fetch_crypto_news",
            tool_func=context.newsdata_client.fetch_crypto_news,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            article_count = execution_result.get("article_count", 0)
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Successfully fetched {article_count} crypto articles ({cache_status}). Results: {result}"
        else:
            return f"Error fetching crypto news: {execution_result['error']}"
    
    return StructuredTool(
        name="fetch_crypto_news",
        description="Fetch cryptocurrency-related news with crypto-specific filtering",
        args_schema=FetchCryptoNewsInput,
        func=fetch_crypto_news,
        coroutine=fetch_crypto_news
    )


def create_fetch_market_news_tool(context: ToolContext) -> StructuredTool:
    """Create fetch_market_news LangChain tool.
    
    This tool fetches financial market and company news with market-specific
    filtering. It wraps the NewsData client's fetch_market_news method with
    caching and audit logging.
    
    Requirements: 2.1, 2.7
    
    Args:
        context: Tool execution context
        
    Returns:
        LangChain StructuredTool instance
    """
    async def fetch_market_news(
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
    ) -> str:
        """Fetch financial market and company news."""
        # Build params dict
        params = {
            "symbol": symbol,
            "organization": organization,
            "query": query,
            "qInTitle": qInTitle,
            "timeframe": timeframe,
            "from_date": from_date,
            "to_date": to_date,
            "sentiment": sentiment,
            "country": country,
            "language": language,
            "size": size,
            "removeduplicate": removeduplicate
        }
        
        # Execute with wrapper
        execution_result = await execute_tool_with_wrapper(
            tool_name="fetch_market_news",
            tool_func=context.newsdata_client.fetch_market_news,
            params=params,
            context=context
        )
        
        # Return formatted result
        if execution_result["success"]:
            result = execution_result["result"]
            article_count = execution_result.get("article_count", 0)
            cache_status = "cached" if execution_result["cache_hit"] else "fresh"
            return f"Successfully fetched {article_count} market articles ({cache_status}). Results: {result}"
        else:
            return f"Error fetching market news: {execution_result['error']}"
    
    return StructuredTool(
        name="fetch_market_news",
        description="Fetch financial market and company news with market-specific filtering",
        args_schema=FetchMarketNewsInput,
        func=fetch_market_news,
        coroutine=fetch_market_news
    )


# ============================================================================
# Tool Usage Summary (Task 4.4)
# ============================================================================

def get_tool_usage_summary(audit_log: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Generate summary statistics from audit log.
    
    Calculates aggregate statistics about tool usage including call counts,
    execution times, cache performance, and error rates.
    
    Requirements: 2.2, 2.3
    
    Args:
        audit_log: List of audit entries from tool executions
        
    Returns:
        Dictionary containing:
            - tools_called: Total number of tool invocations
            - total_tool_time: Total execution time in milliseconds
            - cache_hits: Number of cache hits
            - cache_misses: Number of cache misses
            - tool_breakdown: Dict mapping tool name to call count
            - total_articles: Total number of articles fetched
            - errors: Number of failed tool invocations
    """
    tools_called = len(audit_log)
    total_tool_time = 0
    cache_hits = 0
    cache_misses = 0
    tool_breakdown: Dict[str, int] = {}
    total_articles = 0
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
        
        # Track article count
        article_count = entry.get("article_count")
        if article_count is not None:
            total_articles += article_count
        
        # Track errors
        if entry.get("error") is not None:
            errors += 1
    
    return {
        "tools_called": tools_called,
        "total_tool_time": total_tool_time,
        "cache_hits": cache_hits,
        "cache_misses": cache_misses,
        "tool_breakdown": tool_breakdown,
        "total_articles": total_articles,
        "errors": errors
    }
