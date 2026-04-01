"""
Web Research Agent Node

This module implements an autonomous web research agent that uses
LangChain's tool-calling capabilities to search the web and scrape webpages.
The agent can autonomously decide which tools to use based on market context.

Key Features:
- ReAct (Reasoning + Acting) pattern for autonomous tool selection
- Web search and webpage scraping via Serper API
- Multi-key API rotation for automatic failover on rate limits
- Tool result caching to avoid redundant API calls
- Comprehensive audit logging for debugging and analysis
- Graceful error handling with fallback support

Requirements: 1.1-1.5, 2.1-2.7, 3.1-3.11, 4.1-4.11, 5.1-5.13, 6.1-6.5, 8.1-8.11
"""

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from langgraph.prebuilt import create_react_agent

from config import EngineConfig
from models.state import GraphState
from models.types import AgentSignal
from tools.serper_client import SerperClient, SerperConfig
from tools.serper_tools import (
    ToolContext,
    create_search_web_tool,
    create_scrape_webpage_tool,
    get_tool_usage_summary,
)

# Configure logger
logger = logging.getLogger(__name__)


# ============================================================================
# System Prompt
# ============================================================================

def get_web_research_agent_system_prompt() -> str:
    """
    System prompt for the Web Research Agent
    
    This prompt defines the agent's role, available tools, research strategy,
    and output format requirements. It guides the agent to intelligently select
    tools based on market characteristics and synthesize information from multiple
    sources into a comprehensive research document.
    
    Requirements: 4.1-4.11, 5.1-5.13, 10.2, 10.4
    """
    return f"""Current date and time: {datetime.now().isoformat()}

You are an autonomous web research analyst with the ability to search the web and extract webpage content.

Your role is to gather comprehensive, factual context about prediction markets by researching the web for relevant information about the events, people, organizations, and circumstances that drive market outcomes.

AVAILABLE TOOLS:
You have access to the following tools:

1. search_web: Search the web using Google search with time range filtering
2. scrape_webpage: Extract full content from specific webpage URLs

RESEARCH STRATEGY:
Based on the market question, intelligently formulate search queries and decide which sources to scrape:

QUERY FORMULATION:
- Extract key entities (people, organizations, locations, events) from the market question
- Identify the core event or decision being predicted
- Determine relevant timeframes (election dates, policy deadlines, event dates)
- Formulate 2-3 targeted search queries covering different aspects

SEARCH PRIORITIZATION:
- For geopolitical markets: Search for "conflict status", "diplomatic relations", "recent developments"
- For election markets: Search for "candidate polling", "campaign events", "endorsements"
- For policy markets: Search for "legislative status", "committee votes", "stakeholder positions"
- For company markets: Search for "recent news", "financial performance", "regulatory filings"
- For sports/entertainment: Search for "recent performance", "injury reports", "expert predictions"

SOURCE SELECTION FOR SCRAPING:
- Prioritize authoritative sources: major news outlets, official government sites, research institutions
- Scrape 2-4 highly relevant URLs that provide comprehensive information
- Avoid low-quality sources, social media posts, or opinion blogs
- Focus on recent sources (within relevant timeframe for the market)

TOOL USAGE LIMITS:
- Maximum 8 tool calls total (combining search and scrape operations)
- Typical pattern: 2-3 searches, 2-4 scrapes
- Start with broad search, then scrape most relevant sources
- If initial search yields poor results, reformulate query

RESEARCH DOCUMENT SYNTHESIS:
Your final output MUST be a comprehensive, well-structured research document that synthesizes all gathered information.

CRITICAL REQUIREMENTS:
- DO NOT output raw search results or lists of URLs
- DO NOT output snippets or fragments
- DO synthesize information from multiple sources into a coherent narrative
- DO organize information into clear sections
- DO include inline citations with URLs
- DO assess information recency and flag stale data
- DO identify conflicting information and explain discrepancies

DOCUMENT STRUCTURE:
Your research document should include:

1. Background: Historical context and foundational information
2. Current Status: Present state of affairs as of latest information
3. Key Events: Timeline of significant developments
4. Stakeholders: Relevant people, organizations, and their positions
5. Recent Developments: Latest news and changes (with dates)
6. Information Quality Assessment: Recency, source credibility, conflicts

WRITING STYLE:
- Plain, factual language with no speculation or ambiguous terms
- Highly informative and comprehensive
- Easily readable by other AI agents without domain expertise
- Include specific dates, numbers, and concrete facts
- Cite sources inline: "According to [Source Name](URL), ..."

OUTPUT FORMAT:
Provide your analysis as a structured JSON signal with:
- confidence: Your confidence in research quality (0-1, based on source credibility, recency, comprehensiveness)
- direction: NEUTRAL (research agents don't predict outcomes)
- fairProbability: 0.5 (research agents don't estimate probabilities)
- keyDrivers: Array of 3-7 concise research findings as plain text strings (NOT markdown, NOT a full document). Each finding should be a single sentence summarizing a key insight with inline source citation.
- riskFactors: Array of 3-5 specific research limitations as plain text strings (e.g., "Limited recent sources - most articles from >2 weeks ago", "Conflicting reports on X between Source A and Source B", "Information gap: No data found on critical factor Y")
- metadata: Object with source_count, search_queries_used, urls_scraped, information_recency, research_summary (your comprehensive research document goes here as a single string)

CRITICAL OUTPUT RULES:
1. YOU MUST OUTPUT ONLY VALID JSON - NO MARKDOWN, NO EXPLANATORY TEXT, NO CODE BLOCKS
2. DO NOT wrap your JSON in ```json or ``` code blocks
3. DO NOT add any text before the opening {{ or after the closing }}
4. keyDrivers MUST be an array of SHORT strings (1-2 sentences each), NOT a full document
5. riskFactors MUST be an array of SHORT strings describing specific limitations
6. DO NOT use markdown formatting (no **, no ##, no tables) in keyDrivers or riskFactors arrays
7. Put your comprehensive research document in metadata.research_summary as a plain text string
8. Each keyDriver should cite its source inline: "According to Reuters (URL), ..."
9. Your response must be parseable by JSON.parse() - test it mentally before outputting

EXAMPLE OUTPUT FORMAT:
{{
  "confidence": 0.8,
  "direction": "NEUTRAL",
  "fairProbability": 0.5,
  "keyDrivers": [
    "According to Reuters (https://...), Supreme Leader Khamenei was killed on Feb 28, 2026, creating unprecedented political vacuum",
    "US officials express skepticism about regime change per CIA assessment (https://...), citing IRGC's entrenched control",
    "Institute for War Studies reports (https://...) that no credible IRGC defections have occurred despite strikes"
  ],
  "riskFactors": [
    "Limited information on internal IRGC dynamics - most sources focus on external military actions",
    "Conflicting reports on protest scale between Iranian state media and Western sources",
    "Information recency gap: Most detailed analysis from 2-3 days ago, situation evolving rapidly"
  ],
  "metadata": {{
    "source_count": 8,
    "search_queries_used": ["Iran regime change 2026", "Khamenei death aftermath", "IRGC succession"],
    "urls_scraped": ["https://reuters.com/...", "https://understandingwar.org/..."],
    "information_recency": "Most recent: March 2, 2026",
    "research_summary": "Your comprehensive research document goes here as a single string with all the details, analysis, and synthesis..."
  }}
}}

REMEMBER: Output ONLY the JSON object above. Your entire response should be valid JSON that starts with {{ and ends with }}. Nothing before, nothing after, no markdown code blocks.

Be thorough and document your research process."""


# ============================================================================
# Agent Node Function
# ============================================================================

async def web_research_agent_node(
    state: GraphState,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Web Research Agent node for the workflow
    
    This node creates an autonomous agent that searches the web and scrapes
    webpages to gather comprehensive context about prediction markets.
    
    Requirements: 1.1-1.5, 2.1-2.7, 3.1-3.11, 4.1-4.11, 5.1-5.13, 6.1-6.5, 8.1-8.11
    
    Args:
        state: Current graph state
        config: Engine configuration
        
    Returns:
        State update dictionary with agent signals or errors
    """
    start_time = time.time()
    agent_name = 'web_research'
    
    # Initialize these at the top level so they're available in error handling
    tool_audit_log: List[Dict[str, Any]] = []
    cache: Dict[str, Any] = {}
    
    try:
        # Step 1: Check for MBD availability (Requirement 4.1)
        if not state.get('mbd'):
            error_message = 'No Market Briefing Document available'
            logger.error(f"[{agent_name}] {error_message}")
            
            return {
                'agent_errors': [{
                    'type': 'EXECUTION_FAILED',
                    'agent_name': agent_name,
                    'message': error_message,
                }],
                'audit_log': [{
                    'stage': f'agent_{agent_name}',
                    'timestamp': int(time.time()),
                    'status': 'error',
                    'data': {
                        'agent_name': agent_name,
                        'success': False,
                        'error': error_message,
                        'error_context': 'Missing MBD',
                        'duration': time.time() - start_time,
                    },
                }],
            }
        
        # Step 2: Check for Serper configuration (Requirement 2.7, 8.3)
        if not config.serper or not config.serper.api_key:
            error_message = (
                'Serper configuration not available'
                if not config.serper
                else 'Serper API key not configured'
            )
            logger.warning(
                f"[{agent_name}] {error_message}, returning graceful degradation"
            )
            
            # Return low-confidence neutral signal (Requirement 8.3)
            signal = AgentSignal(
                agent_name=agent_name,
                timestamp=int(time.time()),
                confidence=0.1,
                direction='NEUTRAL',
                fair_probability=0.5,
                key_drivers=[
                    'Web research unavailable: Serper API key not configured',
                    'Unable to gather external context for this market',
                    'Other agents will proceed without web research context',
                ],
                risk_factors=[
                    'No web research performed',
                    'Limited external context available',
                ],
                metadata={
                    'web_research_available': False,
                    'reason': 'API key not configured',
                },
            )
            
            return {
                'agent_signals': [signal.model_dump()],
                'audit_log': [{
                    'stage': f'agent_{agent_name}',
                    'timestamp': int(time.time()),
                    'status': 'success',
                    'data': {
                        'agent_name': agent_name,
                        'success': True,
                        'graceful_degradation': True,
                        'duration': time.time() - start_time,
                    },
                }],
            }
        
        # Step 3: Initialize Serper client (Requirement 2.1)
        serper_client = SerperClient(config.serper)
        
        # Step 4: Create tool cache (Requirement 3.8)
        cache = {}
        
        # Step 5: Create tool audit log (Requirement 3.9)
        tool_audit_log = []
        
        # Step 6: Create tool context
        tool_context = ToolContext(
            serper_client=serper_client,
            cache=cache,
            audit_log=tool_audit_log,
            agent_name=agent_name,
        )
        
        # Step 7: Create web research tools (Requirement 3.1, 3.2)
        tools = [
            create_search_web_tool(tool_context),
            create_scrape_webpage_tool(tool_context),
        ]
        
        # Step 8: Create LLM instance with rotation support (Requirement 4.2)
        # Import here to avoid circular dependency
        from utils.llm_factory import create_llm_instance
        from utils.llm_rotation_manager import LLMRotationManager
        from langchain_core.messages import SystemMessage
        
        # Create rotation manager if multiple models configured
        rotation_manager = None
        if len(config.llm.model_names) > 1:
            # Multiple models configured - create rotation manager
            model_names_str = ",".join(config.llm.model_names)
            rotation_manager = LLMRotationManager(model_names_str)
            logger.info(f"[{agent_name}] Created rotation manager with {len(config.llm.model_names)} models")
        
        llm = create_llm_instance(config.llm, rotation_manager=rotation_manager)
        
        # Step 9: Create ReAct agent with tools and system prompt (Requirement 4.1)
        # Bind the system prompt to the LLM before creating the agent
        system_prompt = get_web_research_agent_system_prompt()
        llm_with_system = llm.bind(system=system_prompt)
        
        agent = create_react_agent(
            model=llm_with_system,
            tools=tools,
        )
        
        # Step 10: Prepare agent input with market data (Requirement 4.1)
        mbd = state['mbd']
        agent_input = {
            'messages': [
                {
                    'role': 'user',
                    'content': f"""Analyze this prediction market and gather comprehensive web research:

Market Question: {mbd.question if hasattr(mbd, 'question') else 'N/A'}
Market Description: {mbd.description if hasattr(mbd, 'description') else 'N/A'}
Market Category: {mbd.category if hasattr(mbd, 'category') else 'N/A'}
Market Tags: {', '.join(mbd.tags) if hasattr(mbd, 'tags') and mbd.tags else 'N/A'}

Please search the web and scrape relevant sources to provide comprehensive context about this market.""",
                }
            ],
        }
        
        # Step 11: Execute agent with timeout and tool limits (Requirement 4.4, 5.12, 8.2)
        max_tool_calls = config.web_research.max_tool_calls if config.web_research else 8
        timeout = config.web_research.timeout if config.web_research else 60
        
        # Set recursion limit high enough for ReAct agent reasoning cycles
        # Each tool call can involve multiple reasoning steps (thought -> action -> observation)
        recursion_limit = max_tool_calls * 5 + 20
        
        try:
            agent_result = await asyncio.wait_for(
                agent.ainvoke(
                    agent_input,
                    config={'recursion_limit': recursion_limit}
                ),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            raise TimeoutError('Agent timeout')
        
        # Step 12: Extract final message
        final_message = agent_result['messages'][-1]
        agent_output = final_message.content
        
        # Step 13: Parse agent output as signal (Requirement 5.12)
        signal_data = None
        
        # Try to extract JSON from the output
        try:
            # First, try direct JSON parse
            signal_data = json.loads(agent_output)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            import re
            json_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', agent_output)
            if json_match:
                try:
                    signal_data = json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass
            
            # Try to find JSON object in the text (look for keyDrivers field as anchor)
            if not signal_data:
                json_match = re.search(r'\{[^{}]*"keyDrivers"[^{}]*\}', agent_output, re.DOTALL | re.IGNORECASE)
                if json_match:
                    try:
                        signal_data = json.loads(json_match.group(0))
                    except json.JSONDecodeError:
                        pass
            
            # Try broader JSON extraction
            if not signal_data:
                json_match = re.search(r'\{[\s\S]*\}', agent_output)
                if json_match:
                    try:
                        signal_data = json.loads(json_match.group(0))
                    except json.JSONDecodeError:
                        pass
        
        # If we successfully parsed JSON, create signal from it
        if signal_data:
            if 'timestamp' not in signal_data:
                signal_data['timestamp'] = int(time.time())
            if 'agent_name' not in signal_data:
                signal_data['agent_name'] = agent_name
            
            # Handle camelCase to snake_case conversion if needed
            if 'keyDrivers' in signal_data and 'key_drivers' not in signal_data:
                signal_data['key_drivers'] = signal_data.pop('keyDrivers')
            if 'riskFactors' in signal_data and 'risk_factors' not in signal_data:
                signal_data['risk_factors'] = signal_data.pop('riskFactors')
            if 'fairProbability' in signal_data and 'fair_probability' not in signal_data:
                signal_data['fair_probability'] = signal_data.pop('fairProbability')
            
            signal = AgentSignal(**signal_data)
        else:
            # Fallback: Extract information from raw text
            logger.warning(f"[{agent_name}] Failed to parse JSON output, extracting from raw text")
            
            # Try to extract key findings from the text
            key_drivers = []
            lines = agent_output.split('\n')
            for line in lines:
                line = line.strip()
                # Look for lines that seem like findings (contain URLs or start with bullets/numbers)
                if line and (
                    'http' in line or 
                    line.startswith('-') or 
                    line.startswith('*') or 
                    line.startswith('•') or
                    (len(line) > 2 and line[0].isdigit() and line[1] in '.)')
                ):
                    # Clean up markdown formatting
                    clean_line = line.lstrip('-*•0123456789.) ').strip()
                    if len(clean_line) > 20:  # Only include substantial findings
                        key_drivers.append(clean_line)
                        if len(key_drivers) >= 5:  # Limit to 5 findings
                            break
            
            # If we didn't find structured findings, split the output into chunks
            if not key_drivers:
                # Split into sentences and take first few
                import re
                sentences = re.split(r'[.!?]+\s+', agent_output)
                key_drivers = [s.strip() for s in sentences[:3] if len(s.strip()) > 20]
            
            # If still empty, use truncated output as last resort
            if not key_drivers:
                key_drivers = [agent_output[:500] + '...' if len(agent_output) > 500 else agent_output]
            
            signal = AgentSignal(
                agent_name=agent_name,
                timestamp=int(time.time()),
                confidence=0.5,
                direction='NEUTRAL',
                fair_probability=0.5,
                key_drivers=key_drivers,
                risk_factors=['Failed to parse structured output - information may be incomplete'],
                metadata={
                    'parse_error': True, 
                    'research_summary_length': len(agent_output),
                    'research_summary': agent_output
                },
            )
        
        # Step 14: Add tool usage metadata (Requirement 5.13)
        tool_usage = get_tool_usage_summary(tool_audit_log)
        signal.metadata = {
            **(signal.metadata or {}),
            'tools_called': tool_usage['tools_called'],
            'total_tool_time': tool_usage['total_tool_time'],
            'cache_hits': tool_usage['cache_hits'],
            'cache_misses': tool_usage['cache_misses'],
            'tool_breakdown': tool_usage['tool_breakdown'],
        }
        
        # Step 15: Return state update (Requirement 6.3, 6.4)
        return {
            'agent_signals': [signal.model_dump()],
            'audit_log': [{
                'stage': f'agent_{agent_name}',
                'timestamp': int(time.time()),
                'status': 'success',
                'data': {
                    'agent_name': agent_name,
                    'success': True,
                    'duration': time.time() - start_time,
                    'tool_usage': tool_usage,
                },
            }],
        }
        
    except Exception as error:
        # Step 16: Error handling (Requirement 8.1-8.11)
        logger.error(f"[{agent_name}] Error: {str(error)}", exc_info=True)
        
        # Check if it's a timeout error (Requirement 8.2)
        is_timeout = isinstance(error, TimeoutError)
        
        return {
            'agent_errors': [{
                'type': 'EXECUTION_FAILED',
                'agent_name': agent_name,
                'message': str(error),
            }],
            'audit_log': [{
                'stage': f'agent_{agent_name}',
                'timestamp': int(time.time()),
                'status': 'error',
                'data': {
                    'agent_name': agent_name,
                    'success': False,
                    'error': str(error),
                    'is_timeout': is_timeout,
                    'duration': time.time() - start_time,
                    'tool_usage': get_tool_usage_summary(tool_audit_log) if tool_audit_log else None,
                },
            }],
        }
