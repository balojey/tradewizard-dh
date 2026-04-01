"""Keyword extraction node for LangGraph workflow."""

import logging
import time
from typing import Any, Dict, List, Set

from models.state import GraphState, EventKeywords
from models.types import AuditEntry, MarketBriefingDocument
from config import EngineConfig

logger = logging.getLogger(__name__)


def extract_keywords_from_text(text: str) -> List[str]:
    """
    Extract keywords from text using simple heuristics.
    
    This function extracts meaningful keywords by:
    1. Tokenizing the text
    2. Filtering out common stop words
    3. Extracting capitalized terms (likely proper nouns)
    4. Extracting multi-word phrases
    5. Deduplicating and sorting by relevance
    
    Args:
        text: Input text to extract keywords from
        
    Returns:
        List of extracted keywords
        
    Examples:
        >>> extract_keywords_from_text("Will Donald Trump win the 2024 Election?")
        ['Donald Trump', '2024', 'Election', 'Trump', 'win']
    """
    if not text:
        return []
    
    # Common stop words to filter out
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
        'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
        'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this',
        'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
        'what', 'which', 'who', 'when', 'where', 'why', 'how', 'if', 'than',
        'then', 'so', 'just', 'now', 'very', 'too', 'also', 'only', 'its'
    }
    
    keywords: Set[str] = set()
    
    # Extract multi-word capitalized phrases (likely proper nouns)
    words = text.split()
    i = 0
    while i < len(words):
        # Clean word
        word = words[i].strip('.,!?;:()[]{}"\'-')
        
        # Check if word starts with capital letter
        if word and word[0].isupper() and word.lower() not in stop_words:
            # Try to build multi-word phrase
            phrase_words = [word]
            j = i + 1
            
            while j < len(words):
                next_word = words[j].strip('.,!?;:()[]{}"\'-')
                if next_word and next_word[0].isupper() and next_word.lower() not in stop_words:
                    phrase_words.append(next_word)
                    j += 1
                else:
                    break
            
            # Add phrase if multi-word, otherwise add single word
            if len(phrase_words) > 1:
                keywords.add(' '.join(phrase_words))
                i = j
            else:
                keywords.add(word)
                i += 1
        else:
            i += 1
    
    # Extract individual significant words (numbers, long words)
    for word in words:
        word = word.strip('.,!?;:()[]{}"\'-')
        if word and word.lower() not in stop_words:
            # Add numbers
            if word.isdigit() or (word.replace(',', '').replace('.', '').isdigit()):
                keywords.add(word)
            # Add long words (likely significant)
            elif len(word) > 6 and not word[0].isupper():
                keywords.add(word.lower())
    
    # Convert to list and sort by length (longer phrases first)
    keyword_list = sorted(list(keywords), key=lambda x: (-len(x), x))
    
    # Limit to top 20 keywords
    return keyword_list[:20]


def extract_event_keywords(mbd: MarketBriefingDocument) -> EventKeywords:
    """
    Extract keywords from Market Briefing Document.
    
    This function extracts two levels of keywords:
    1. Event-level: Keywords from event context (title, description, tags)
    2. Market-level: Keywords from market question and resolution criteria
    
    Args:
        mbd: Market Briefing Document
        
    Returns:
        EventKeywords with event_level and market_level keyword lists
        
    Examples:
        >>> mbd = MarketBriefingDocument(...)
        >>> keywords = extract_event_keywords(mbd)
        >>> print(keywords["event_level"])
        ['2024 Presidential Election', 'Donald Trump', 'Joe Biden']
    """
    event_level_keywords: Set[str] = set()
    market_level_keywords: Set[str] = set()
    
    # Extract event-level keywords from event context
    if mbd.event_context:
        # Extract from event title
        if mbd.event_context.event_title:
            event_level_keywords.update(
                extract_keywords_from_text(mbd.event_context.event_title)
            )
        
        # Extract from event description
        if mbd.event_context.event_description:
            event_level_keywords.update(
                extract_keywords_from_text(mbd.event_context.event_description)
            )
        
        # Add tags as keywords
        event_level_keywords.update(mbd.event_context.tags)
    
    # Extract market-level keywords from question
    market_level_keywords.update(
        extract_keywords_from_text(mbd.question)
    )
    
    # Extract from resolution criteria
    if mbd.resolution_criteria:
        market_level_keywords.update(
            extract_keywords_from_text(mbd.resolution_criteria)
        )
    
    # Add event type as keyword
    market_level_keywords.add(mbd.event_type)
    
    # Remove duplicates between levels (prefer event-level)
    market_level_keywords = market_level_keywords - event_level_keywords
    
    return EventKeywords(
        event_level=sorted(list(event_level_keywords))[:15],
        market_level=sorted(list(market_level_keywords))[:15]
    )


async def keyword_extraction_node(
    state: GraphState,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Extract keywords from Market Briefing Document.
    
    This node extracts keywords at two levels:
    1. Event-level: Keywords from the broader event context
    2. Market-level: Keywords specific to this market question
    
    Keywords are used by the dynamic agent selection node to determine
    which specialized agents should be activated for analysis.
    
    Args:
        state: Current workflow state with mbd
        config: Engine configuration
        
    Returns:
        State update with market_keywords and audit entry
        
    State Requirements:
        - mbd: Market Briefing Document (required)
        
    State Updates:
        - market_keywords: EventKeywords with event_level and market_level lists
        - audit_log: Audit entry for keyword extraction stage
        
    Examples:
        >>> state = {"mbd": MarketBriefingDocument(...)}
        >>> result = await keyword_extraction_node(state, config)
        >>> print(result["market_keywords"]["event_level"])
        ['2024 Election', 'Presidential Race']
    """
    start_time = time.time()
    
    # Extract MBD from state
    mbd = state.get("mbd")
    
    # Validate required state
    if not mbd:
        logger.error("Keyword extraction node called without MBD")
        return {
            "market_keywords": EventKeywords(
                event_level=[],
                market_level=[]
            ),
            "audit_log": [AuditEntry(
                stage="keyword_extraction",
                timestamp=int(time.time()),
                status="failed",
                details={"error": "Missing market briefing document"}
            )]
        }
    
    logger.info(f"Extracting keywords from market: {mbd.question}")
    
    try:
        # Extract keywords
        keywords = extract_event_keywords(mbd)
        
        # Update MBD with combined keywords for agent context
        # Combine event and market level keywords
        all_keywords = keywords["event_level"] + keywords["market_level"]
        mbd.keywords = all_keywords[:20]  # Limit to top 20
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"Keyword extraction completed in {duration_ms}ms: "
            f"{len(keywords['event_level'])} event-level, "
            f"{len(keywords['market_level'])} market-level keywords"
        )
        
        return {
            "market_keywords": keywords,
            "mbd": mbd,  # Return updated MBD with keywords
            "audit_log": [AuditEntry(
                stage="keyword_extraction",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "event_level_count": len(keywords["event_level"]),
                    "market_level_count": len(keywords["market_level"]),
                    "event_level_keywords": keywords["event_level"][:5],  # Sample
                    "market_level_keywords": keywords["market_level"][:5]  # Sample
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Keyword extraction failed after {duration_ms}ms: {e}")
        
        # Return empty keywords on failure
        return {
            "market_keywords": EventKeywords(
                event_level=[],
                market_level=[]
            ),
            "audit_log": [AuditEntry(
                stage="keyword_extraction",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e)
                }
            )]
        }


def create_keyword_extraction_node(config: EngineConfig):
    """
    Factory function to create keyword extraction node with dependencies.
    
    This factory pattern allows the node to be created with the required
    dependencies (config) while maintaining the standard LangGraph node signature.
    
    Args:
        config: Engine configuration
        
    Returns:
        Async function that takes state and returns state update
        
    Examples:
        >>> config = load_config()
        >>> node = create_keyword_extraction_node(config)
        >>> result = await node(state)
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await keyword_extraction_node(state, config)
    
    return node
