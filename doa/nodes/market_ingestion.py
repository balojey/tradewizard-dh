"""Market ingestion node for LangGraph workflow."""

import logging
import time
from typing import Any, Dict

from models.state import GraphState
from models.types import AuditEntry
from tools.polymarket_client import PolymarketClient
from config import EngineConfig

logger = logging.getLogger(__name__)


async def market_ingestion_node(
    state: GraphState,
    polymarket_client: PolymarketClient,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Fetch market data from Polymarket and create Market Briefing Document.
    
    This node is the entry point of the workflow. It:
    1. Extracts condition_id from state
    2. Fetches market data from Polymarket API
    3. Optionally fetches related event data
    4. Transforms raw API data into MarketBriefingDocument
    5. Handles errors gracefully with structured error types
    
    Args:
        state: Current workflow state with condition_id
        polymarket_client: Polymarket API client instance
        config: Engine configuration
        
    Returns:
        State update with mbd or ingestion_error, plus audit entry
        
    State Requirements:
        - condition_id: Market condition ID (required)
        
    State Updates:
        - mbd: MarketBriefingDocument if successful
        - ingestion_error: IngestionError if failed
        - audit_log: Audit entry for ingestion stage
        
    Examples:
        >>> state = {"condition_id": "0xabc123"}
        >>> result = await market_ingestion_node(state, client, config)
        >>> assert "mbd" in result or "ingestion_error" in result
    """
    start_time = time.time()
    
    # Extract condition_id from state
    condition_id = state.get("condition_id")
    
    # Validate required state
    if not condition_id:
        logger.error("Market ingestion node called without condition_id")
        return {
            "ingestion_error": {
                "type": "VALIDATION_FAILED",
                "message": "Missing condition_id in state",
                "details": {}
            },
            "audit_log": [AuditEntry(
                stage="market_ingestion",
                timestamp=int(time.time()),
                status="failed",
                details={"error": "Missing condition_id"}
            )]
        }
    
    logger.info(f"Fetching market data for condition_id: {condition_id}")
    
    try:
        # Fetch market data
        market_result = await polymarket_client.fetch_market_data(condition_id)
        
        # Handle fetch error
        if market_result.is_err():
            error = market_result.error
            duration_ms = int((time.time() - start_time) * 1000)
            
            logger.error(
                f"Market data fetch failed after {duration_ms}ms: "
                f"{error.type} - {error.message}"
            )
            
            return {
                "ingestion_error": error,
                "audit_log": [AuditEntry(
                    stage="market_ingestion",
                    timestamp=int(time.time()),
                    status="failed",
                    details={
                        "duration_ms": duration_ms,
                        "error_type": error.type,
                        "error_message": error.message,
                        "condition_id": condition_id
                    }
                )]
            }
        
        market = market_result.unwrap()
        logger.info(f"Successfully fetched market: {market.question}")
        
        # Optionally fetch event data for additional context
        event = None
        if market.eventSlug:
            logger.info(f"Fetching event data for slug: {market.eventSlug}")
            event_result = await polymarket_client.fetch_event_data(market.eventSlug)
            
            if event_result.is_ok():
                event = event_result.unwrap()
                logger.info(f"Successfully fetched event: {event.title}")
            else:
                # Log event fetch failure but continue with market data
                event_error = event_result.error
                logger.warning(
                    f"Event data fetch failed (continuing without event context): "
                    f"{event_error.type} - {event_error.message}"
                )
        
        # Transform to Market Briefing Document
        mbd = polymarket_client.transform_to_mbd(market, event)
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"Market ingestion completed in {duration_ms}ms: "
            f"{mbd.question} (type: {mbd.event_type})"
        )
        
        return {
            "mbd": mbd,
            "audit_log": [AuditEntry(
                stage="market_ingestion",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "condition_id": condition_id,
                    "market_id": mbd.market_id,
                    "event_type": mbd.event_type,
                    "question": mbd.question,
                    "has_event_context": mbd.event_context is not None
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Unexpected error in market ingestion after {duration_ms}ms: {e}")
        
        return {
            "ingestion_error": {
                "type": "API_UNAVAILABLE",
                "message": f"Unexpected error during market ingestion: {str(e)}",
                "details": {"condition_id": condition_id, "error": str(e)}
            },
            "audit_log": [AuditEntry(
                stage="market_ingestion",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e),
                    "condition_id": condition_id
                }
            )]
        }


def create_market_ingestion_node(
    polymarket_client: PolymarketClient,
    config: EngineConfig
):
    """
    Factory function to create market ingestion node with dependencies.
    
    This factory pattern allows the node to be created with the required
    dependencies (Polymarket client and config) while maintaining the
    standard LangGraph node signature.
    
    Args:
        polymarket_client: Polymarket API client instance
        config: Engine configuration
        
    Returns:
        Async function that takes state and returns state update
        
    Examples:
        >>> client = PolymarketClient(config.polymarket)
        >>> config = load_config()
        >>> node = create_market_ingestion_node(client, config)
        >>> result = await node(state)
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await market_ingestion_node(state, polymarket_client, config)
    
    return node
