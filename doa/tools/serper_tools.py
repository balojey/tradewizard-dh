"""
Serper Tools Infrastructure

This module provides the tool infrastructure for the Web Research Agent,
including search and scrape tools with caching and audit logging.

Requirements: 3.1-3.9
"""

import json
import logging
import time
from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field, HttpUrl, field_validator

from .serper_client import (
    SerperClient,
    SerperSearchParams,
    SerperScrapeParams,
    SerperSearchResult,
    SerperScrapeResponse,
)

# Configure logger
logger = logging.getLogger(__name__)


# ============================================================================
# Types and Models
# ============================================================================

class ToolContext(BaseModel):
    """
    Tool execution context
    
    Provides access to shared resources needed by all tools:
    - serper_client: For web search and scraping
    - cache: For caching tool results within a session
    - audit_log: For logging all tool calls
    - agent_name: Name of the agent using the tool
    """
    serper_client: SerperClient
    cache: Dict[str, Any]  # Simple dict cache for Python
    audit_log: List[Dict[str, Any]]
    agent_name: str
    
    class Config:
        arbitrary_types_allowed = True


class ToolAuditEntry(BaseModel):
    """
    Tool audit log entry
    
    Records details of each tool invocation for debugging and analysis.
    """
    tool_name: str
    timestamp: float
    params: Dict[str, Any]
    result: Optional[Any] = None
    error: Optional[str] = None
    duration: float
    cache_hit: bool
    result_count: Optional[int] = None


class ToolError(BaseModel):
    """
    Tool error
    
    Structured error object returned when tool execution fails.
    """
    error: bool = True
    message: str
    tool_name: str
    code: Optional[str] = None


# ============================================================================
# Tool Input Models (Pydantic)
# ============================================================================

class SearchWebInput(BaseModel):
    """Input schema for search_web tool"""
    query: str = Field(..., description="Search query string")
    num_results: int = Field(
        10,
        ge=1,
        le=20,
        description="Number of results to return (1-20)"
    )
    time_range: Optional[str] = Field(
        None,
        description="Time range filter: hour, day, week, month, year, or all"
    )
    
    @field_validator('time_range')
    @classmethod
    def validate_time_range(cls, v):
        if v is not None and v not in ['hour', 'day', 'week', 'month', 'year', 'all']:
            raise ValueError(
                "time_range must be one of: hour, day, week, month, year, all"
            )
        return v


class ScrapeWebpageInput(BaseModel):
    """Input schema for scrape_webpage tool"""
    url: str = Field(..., description="URL to scrape")
    
    @field_validator('url')
    @classmethod
    def validate_url(cls, v):
        # Basic URL validation
        if not v.startswith(('http://', 'https://')):
            raise ValueError("URL must start with http:// or https://")
        return v


# ============================================================================
# Tool Execution Wrapper
# ============================================================================

async def execute_tool_with_wrapper(
    tool_name: str,
    params: Union[SearchWebInput, ScrapeWebpageInput],
    context: ToolContext,
    executor
) -> Union[List[SerperSearchResult], SerperScrapeResponse, ToolError]:
    """
    Execute a tool with error handling, caching, and audit logging
    
    This wrapper provides consistent error handling, caching, and audit logging
    for all tool executions.
    
    Args:
        tool_name: Name of the tool being executed
        params: Tool input parameters
        context: Tool execution context
        executor: Tool execution function
        
    Returns:
        Tool result or error
    """
    start_time = time.time()
    cache_hit = False
    
    try:
        # Generate cache key
        cache_key = f"{tool_name}:{json.dumps(params.model_dump(), sort_keys=True)}"
        
        # Check cache first (Requirement 3.8)
        if cache_key in context.cache:
            cached = context.cache[cache_key]
            cache_hit = True
            duration = time.time() - start_time
            
            # Log cache hit to audit trail (Requirement 3.9)
            audit_entry = {
                'tool_name': tool_name,
                'timestamp': time.time(),
                'params': params.model_dump(),
                'result': cached,
                'duration': duration,
                'cache_hit': True,
                'result_count': len(cached) if isinstance(cached, list) else None,
            }
            context.audit_log.append(audit_entry)
            
            logger.debug(
                f"[{context.agent_name}] Tool cache HIT: {tool_name} ({duration*1000:.0f}ms)"
            )
            
            return cached
        
        logger.debug(f"[{context.agent_name}] Tool cache MISS: {tool_name}")
        
        # Execute tool function
        result = await executor(params, context)
        
        # Cache result (Requirement 3.8)
        context.cache[cache_key] = result
        
        # Log successful execution to audit trail (Requirement 3.9)
        duration = time.time() - start_time
        audit_entry = {
            'tool_name': tool_name,
            'timestamp': time.time(),
            'params': params.model_dump(),
            'result': result,
            'duration': duration,
            'cache_hit': False,
            'result_count': len(result) if isinstance(result, list) else None,
        }
        context.audit_log.append(audit_entry)
        
        logger.info(
            f"[{context.agent_name}] Tool executed: {tool_name} ({duration*1000:.0f}ms)"
        )
        
        return result
        
    except Exception as error:
        duration = time.time() - start_time
        
        # Create structured error
        tool_error = ToolError(
            error=True,
            message=str(error),
            tool_name=tool_name,
            code=getattr(error, 'code', None)
        )
        
        # Log error to audit trail (Requirement 3.9)
        audit_entry = {
            'tool_name': tool_name,
            'timestamp': time.time(),
            'params': params.model_dump(),
            'error': tool_error.message,
            'duration': duration,
            'cache_hit': cache_hit,
        }
        context.audit_log.append(audit_entry)
        
        logger.error(
            f"[{context.agent_name}] Tool error: {tool_name} ({duration*1000:.0f}ms) - {tool_error.message}",
            extra={'code': tool_error.code, 'params': params.model_dump()}
        )
        
        return tool_error


def is_tool_error(result: Any) -> bool:
    """Type guard to check if a result is a tool error"""
    return isinstance(result, ToolError)


# ============================================================================
# Utility Functions
# ============================================================================

def get_tool_usage_summary(audit_log: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Get tool usage summary from audit log"""
    tool_breakdown: Dict[str, int] = {}
    total_tool_time = 0.0
    cache_hits = 0
    cache_misses = 0
    errors = 0
    
    for entry in audit_log:
        tool_name = entry['tool_name']
        tool_breakdown[tool_name] = tool_breakdown.get(tool_name, 0) + 1
        total_tool_time += entry['duration']
        
        if entry['cache_hit']:
            cache_hits += 1
        else:
            cache_misses += 1
        
        if entry.get('error'):
            errors += 1
    
    return {
        'tools_called': len(audit_log),
        'total_tool_time': total_tool_time,
        'cache_hits': cache_hits,
        'cache_misses': cache_misses,
        'errors': errors,
        'tool_breakdown': tool_breakdown,
    }


# ============================================================================
# Tool Implementations
# ============================================================================

async def search_web(
    input_data: SearchWebInput,
    context: ToolContext
) -> Union[List[SerperSearchResult], ToolError]:
    """
    search_web Tool
    
    Searches the web using Google search via Serper API.
    
    Requirements: 3.1, 3.3, 3.5, 3.6, 3.8, 3.9
    """
    
    async def executor(params: SearchWebInput, ctx: ToolContext):
        # Clamp num_results to [1, 20] range (Requirement 3.5)
        num_results = max(1, min(20, params.num_results))
        
        # Transform time range to Serper format (Requirement 3.6)
        tbs = None
        if params.time_range:
            time_range_map = {
                'hour': 'qdr:h',
                'day': 'qdr:d',
                'week': 'qdr:w',
                'month': 'qdr:m',
                'year': 'qdr:y',
            }
            tbs = time_range_map.get(params.time_range)
        
        # Call Serper API (Requirement 3.1)
        response = await ctx.serper_client.search(
            SerperSearchParams(
                q=params.query,
                num=num_results,
                tbs=tbs
            )
        )
        
        # Return organic results (Requirement 3.3)
        return response.organic or []
    
    return await execute_tool_with_wrapper(
        'search_web',
        input_data,
        context,
        executor
    )


async def scrape_webpage(
    input_data: ScrapeWebpageInput,
    context: ToolContext
) -> Union[SerperScrapeResponse, ToolError]:
    """
    scrape_webpage Tool
    
    Extracts full content from a webpage URL using Serper scrape endpoint.
    
    Requirements: 3.2, 3.4, 3.7, 3.8, 3.9
    """
    
    async def executor(params: ScrapeWebpageInput, ctx: ToolContext):
        # Call Serper scrape API (Requirement 3.2)
        try:
            response = await ctx.serper_client.scrape(
                SerperScrapeParams(url=params.url)
            )
            return response
            
        except Exception as error:
            # Graceful error handling for scraping failures (Requirement 3.7)
            logger.warning(
                f"[scrape_webpage] Failed to scrape {params.url}: {str(error)}"
            )
            
            # Return partial response with error indication
            return SerperScrapeResponse(
                url=params.url,
                title=None,
                text=None,
                metadata={'error': str(error)}
            )
    
    return await execute_tool_with_wrapper(
        'scrape_webpage',
        input_data,
        context,
        executor
    )


# ============================================================================
# LangChain Tool Factories
# ============================================================================

def create_search_web_tool(context: ToolContext):
    """
    Create LangChain-compatible search_web tool
    
    Requirements: 3.1
    """
    from langchain.tools import StructuredTool
    
    async def tool_func(query: str, num_results: int = 10, time_range: Optional[str] = None) -> str:
        input_data = SearchWebInput(
            query=query,
            num_results=num_results,
            time_range=time_range
        )
        result = await search_web(input_data, context)
        
        if is_tool_error(result):
            return json.dumps({
                'error': True,
                'message': result.message,
            })
        
        return json.dumps({
            'success': True,
            'result_count': len(result),
            'results': [r.model_dump() for r in result],
        })
    
    return StructuredTool(
        name='search_web',
        description="""Search the web for information using Google search.

Use this tool to:
- Find recent news and articles about market subjects
- Gather background information on events, people, or organizations
- Discover current developments and breaking news
- Identify authoritative sources for deeper research

Parameters:
- query: Search query string (required)
- num_results: Number of results (1-20, default: 10)
- time_range: Filter by time - 'hour', 'day', 'week', 'month', 'year', or 'all'

Returns: Array of search results with title, link, snippet, and date.

Example usage:
- Recent news: { query: "Ukraine conflict latest", time_range: "day" }
- Background: { query: "candidate biography policy positions" }
- Breaking news: { query: "Federal Reserve announcement", time_range: "hour" }""",
        func=tool_func,
        args_schema=SearchWebInput,
        coroutine=tool_func,
    )


def create_scrape_webpage_tool(context: ToolContext):
    """
    Create LangChain-compatible scrape_webpage tool
    
    Requirements: 3.2
    """
    from langchain.tools import StructuredTool
    
    async def tool_func(url: str) -> str:
        input_data = ScrapeWebpageInput(url=url)
        result = await scrape_webpage(input_data, context)
        
        if is_tool_error(result):
            return json.dumps({
                'error': True,
                'message': result.message,
            })
        
        return json.dumps({
            'success': True,
            'url': result.url,
            'title': result.title,
            'text_length': len(result.text) if result.text else 0,
            'text': result.text,
            'metadata': result.metadata,
        })
    
    return StructuredTool(
        name='scrape_webpage',
        description="""Extract full content from a webpage URL.

Use this tool to:
- Get complete article text from news URLs
- Extract detailed information from authoritative sources
- Read full policy documents or official statements
- Gather comprehensive context from specific pages

Parameters:
- url: Full URL to scrape (required, must be valid URL)

Returns: Webpage content including title, full text, and metadata.

Example usage:
- News article: { url: "https://example.com/article" }
- Official document: { url: "https://gov.example.com/policy" }
- Research paper: { url: "https://journal.example.com/paper" }

Note: Only scrape URLs from search results or known authoritative sources.""",
        func=tool_func,
        args_schema=ScrapeWebpageInput,
        coroutine=tool_func,
    )
