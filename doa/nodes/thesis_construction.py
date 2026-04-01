"""Thesis construction node for LangGraph workflow."""

import logging
import time
from typing import Any, Dict, List

from models.state import GraphState
from models.types import AgentSignal, AuditEntry, MarketBriefingDocument, Thesis
from config import EngineConfig

logger = logging.getLogger(__name__)


def aggregate_signals_by_direction(
    signals: List[AgentSignal]
) -> Dict[str, List[AgentSignal]]:
    """
    Group agent signals by their direction (YES/NO/NEUTRAL).
    
    Args:
        signals: List of agent signals
        
    Returns:
        Dictionary mapping direction to list of signals
        
    Examples:
        >>> signals = [
        ...     AgentSignal(direction="YES", ...),
        ...     AgentSignal(direction="NO", ...),
        ...     AgentSignal(direction="YES", ...)
        ... ]
        >>> grouped = aggregate_signals_by_direction(signals)
        >>> assert len(grouped["YES"]) == 2
        >>> assert len(grouped["NO"]) == 1
    """
    grouped = {
        "YES": [],
        "NO": [],
        "NEUTRAL": []
    }
    
    for signal in signals:
        grouped[signal.direction].append(signal)
    
    return grouped


def extract_key_drivers(signals: List[AgentSignal]) -> List[str]:
    """
    Extract and deduplicate key drivers from agent signals.
    
    Args:
        signals: List of agent signals
        
    Returns:
        List of unique key drivers
        
    Examples:
        >>> signals = [
        ...     AgentSignal(key_drivers=["Driver A", "Driver B"], ...),
        ...     AgentSignal(key_drivers=["Driver B", "Driver C"], ...)
        ... ]
        >>> drivers = extract_key_drivers(signals)
        >>> assert "Driver A" in drivers
        >>> assert "Driver B" in drivers
        >>> assert "Driver C" in drivers
    """
    all_drivers = []
    for signal in signals:
        all_drivers.extend(signal.key_drivers)
    
    # Deduplicate while preserving order
    seen = set()
    unique_drivers = []
    for driver in all_drivers:
        if driver not in seen:
            seen.add(driver)
            unique_drivers.append(driver)
    
    return unique_drivers


def extract_catalysts(signals: List[AgentSignal]) -> List[str]:
    """
    Extract potential catalysts from agent signals.
    
    Catalysts are extracted from:
    1. Key drivers that mention specific events or triggers
    2. Metadata fields that contain catalyst information
    
    Args:
        signals: List of agent signals
        
    Returns:
        List of catalyst descriptions
        
    Examples:
        >>> signals = [
        ...     AgentSignal(
        ...         key_drivers=["Upcoming announcement could shift probability"],
        ...         metadata={"catalysts": ["Policy decision next week"]},
        ...         ...
        ...     )
        ... ]
        >>> catalysts = extract_catalysts(signals)
        >>> assert len(catalysts) > 0
    """
    catalysts = []
    
    for signal in signals:
        # Extract from metadata if available
        if "catalysts" in signal.metadata:
            signal_catalysts = signal.metadata["catalysts"]
            if isinstance(signal_catalysts, list):
                catalysts.extend(signal_catalysts)
            elif isinstance(signal_catalysts, str):
                catalysts.append(signal_catalysts)
        
        # Extract from key drivers that mention catalysts
        for driver in signal.key_drivers:
            driver_lower = driver.lower()
            if any(keyword in driver_lower for keyword in [
                "announcement", "deadline", "decision", "event", 
                "catalyst", "trigger", "upcoming", "scheduled"
            ]):
                catalysts.append(driver)
    
    # Deduplicate
    seen = set()
    unique_catalysts = []
    for catalyst in catalysts:
        if catalyst not in seen:
            seen.add(catalyst)
            unique_catalysts.append(catalyst)
    
    return unique_catalysts[:5]  # Limit to top 5


def extract_failure_conditions(signals: List[AgentSignal]) -> List[str]:
    """
    Extract failure conditions from agent signals.
    
    Failure conditions are extracted from:
    1. Risk factors identified by agents
    2. Metadata fields that contain failure scenarios
    
    Args:
        signals: List of agent signals
        
    Returns:
        List of failure condition descriptions
        
    Examples:
        >>> signals = [
        ...     AgentSignal(
        ...         risk_factors=["Low liquidity may cause slippage"],
        ...         metadata={"failure_conditions": ["Unexpected policy change"]},
        ...         ...
        ...     )
        ... ]
        >>> failures = extract_failure_conditions(signals)
        >>> assert len(failures) > 0
    """
    failure_conditions = []
    
    for signal in signals:
        # Extract from metadata if available
        if "failure_conditions" in signal.metadata:
            signal_failures = signal.metadata["failure_conditions"]
            if isinstance(signal_failures, list):
                failure_conditions.extend(signal_failures)
            elif isinstance(signal_failures, str):
                failure_conditions.append(signal_failures)
        
        # Extract from risk factors
        failure_conditions.extend(signal.risk_factors)
    
    # Deduplicate
    seen = set()
    unique_failures = []
    for failure in failure_conditions:
        if failure not in seen:
            seen.add(failure)
            unique_failures.append(failure)
    
    return unique_failures[:5]  # Limit to top 5


def calculate_thesis_probability(
    signals: List[AgentSignal],
    direction: str
) -> float:
    """
    Calculate fair probability for a thesis from supporting signals.
    
    Uses confidence-weighted average of fair_probability values from
    signals that support the given direction.
    
    Args:
        signals: List of agent signals supporting this direction
        direction: "YES" or "NO"
        
    Returns:
        Fair probability estimate (0-1)
        
    Examples:
        >>> signals = [
        ...     AgentSignal(confidence=0.8, fair_probability=0.6, direction="YES", ...),
        ...     AgentSignal(confidence=0.7, fair_probability=0.65, direction="YES", ...)
        ... ]
        >>> prob = calculate_thesis_probability(signals, "YES")
        >>> assert 0.6 <= prob <= 0.65
    """
    if not signals:
        return 0.5  # Neutral default
    
    # Calculate confidence-weighted average
    total_weight = sum(s.confidence for s in signals)
    if total_weight == 0:
        # Equal weighting if all zero confidence
        return sum(s.fair_probability for s in signals) / len(signals)
    
    weighted_prob = sum(
        s.fair_probability * s.confidence 
        for s in signals
    ) / total_weight
    
    return weighted_prob


def build_core_argument(
    signals: List[AgentSignal],
    direction: str,
    key_drivers: List[str]
) -> str:
    """
    Build a core argument synthesizing agent signals.
    
    Args:
        signals: List of agent signals supporting this direction
        direction: "YES" or "NO"
        key_drivers: Key drivers extracted from signals
        
    Returns:
        2-3 sentence core argument
        
    Examples:
        >>> signals = [AgentSignal(agent_name="A", confidence=0.8, ...)]
        >>> drivers = ["Strong momentum", "Positive sentiment"]
        >>> arg = build_core_argument(signals, "YES", drivers)
        >>> assert len(arg) > 50
    """
    if not signals:
        return f"No strong signals support the {direction} outcome."
    
    # Calculate average confidence
    avg_confidence = sum(s.confidence for s in signals) / len(signals)
    
    # Get top drivers (limit to 3 for readability)
    top_drivers = key_drivers[:3]
    
    # Build argument
    if direction == "YES":
        argument = (
            f"The bull case rests on {len(signals)} agent signal(s) with "
            f"{avg_confidence:.0%} average confidence. "
        )
    else:
        argument = (
            f"The bear case rests on {len(signals)} agent signal(s) with "
            f"{avg_confidence:.0%} average confidence. "
        )
    
    if top_drivers:
        drivers_text = ", ".join(top_drivers[:2])
        argument += f"Key factors include: {drivers_text}. "
    
    # Add signal consensus
    if len(signals) >= 3:
        argument += (
            f"Multiple agents ({', '.join([s.agent_name for s in signals[:3]])}) "
            f"converge on this view, suggesting robust analytical support."
        )
    elif len(signals) == 2:
        argument += (
            f"Both {signals[0].agent_name} and {signals[1].agent_name} "
            f"support this position."
        )
    else:
        argument += f"{signals[0].agent_name} provides the primary support for this thesis."
    
    return argument


async def thesis_construction_node(
    state: GraphState,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Build bull and bear theses from agent signals.
    
    This node synthesizes agent signals into structured arguments for both
    YES and NO outcomes. It:
    1. Separates signals by direction (YES/NO/NEUTRAL)
    2. Aggregates supporting signals for each thesis
    3. Extracts key drivers, catalysts, and failure conditions
    4. Calculates fair probability for each thesis
    5. Computes edge (|fair_probability - market_probability|)
    6. Builds core arguments synthesizing agent insights
    
    Args:
        state: Current workflow state with agent signals and MBD
        config: Engine configuration
        
    Returns:
        State update with bull_thesis, bear_thesis, and audit entry
        
    State Requirements:
        - agent_signals: List of AgentSignal from agents (required)
        - mbd: MarketBriefingDocument with current market probability (required)
        
    State Updates:
        - bull_thesis: Thesis for YES outcome
        - bear_thesis: Thesis for NO outcome
        - audit_log: Audit entry for thesis construction stage
        
    Examples:
        >>> state = {
        ...     "agent_signals": [
        ...         AgentSignal(direction="YES", confidence=0.8, fair_probability=0.6, ...),
        ...         AgentSignal(direction="NO", confidence=0.7, fair_probability=0.4, ...)
        ...     ],
        ...     "mbd": MarketBriefingDocument(current_probability=0.5, ...)
        ... }
        >>> result = await thesis_construction_node(state, config)
        >>> assert "bull_thesis" in result
        >>> assert "bear_thesis" in result
    """
    start_time = time.time()
    
    # Extract required data from state
    agent_signals_raw = state.get("agent_signals", [])
    mbd = state.get("mbd")
    
    # Convert dictionaries to AgentSignal objects if needed
    agent_signals = []
    for signal in agent_signals_raw:
        if isinstance(signal, dict):
            agent_signals.append(AgentSignal(**signal))
        else:
            agent_signals.append(signal)
    
    # Validate inputs
    if not agent_signals:
        logger.warning("Thesis construction called with no agent signals")
        return {
            "audit_log": [AuditEntry(
                stage="thesis_construction",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "error": "No agent signals available",
                    "signal_count": 0
                }
            )]
        }
    
    if not mbd:
        logger.error("Thesis construction called without MBD")
        return {
            "audit_log": [AuditEntry(
                stage="thesis_construction",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "error": "Market Briefing Document not available"
                }
            )]
        }
    
    logger.info(f"Constructing theses from {len(agent_signals)} agent signals")
    
    try:
        # Aggregate signals by direction
        signals_by_direction = aggregate_signals_by_direction(agent_signals)
        yes_signals = signals_by_direction["YES"]
        no_signals = signals_by_direction["NO"]
        neutral_signals = signals_by_direction["NEUTRAL"]
        
        logger.info(
            f"Signal distribution: {len(yes_signals)} YES, "
            f"{len(no_signals)} NO, {len(neutral_signals)} NEUTRAL"
        )
        
        # Get market probability
        market_probability = mbd.current_probability
        
        # Build bull thesis (YES)
        bull_key_drivers = extract_key_drivers(yes_signals)
        bull_catalysts = extract_catalysts(yes_signals)
        bull_failures = extract_failure_conditions(no_signals)  # Bear risks are bull failures
        bull_fair_prob = calculate_thesis_probability(yes_signals, "YES")
        bull_edge = abs(bull_fair_prob - market_probability)
        bull_argument = build_core_argument(yes_signals, "YES", bull_key_drivers)
        bull_supporting = [s.agent_name for s in yes_signals]
        
        # Add neutral signals with YES lean to bull thesis
        for signal in neutral_signals:
            if signal.fair_probability > market_probability:
                bull_supporting.append(signal.agent_name)
        
        bull_thesis = Thesis(
            direction="YES",
            fair_probability=bull_fair_prob,
            market_probability=market_probability,
            edge=bull_edge,
            core_argument=bull_argument,
            catalysts=bull_catalysts if bull_catalysts else ["No specific catalysts identified"],
            failure_conditions=bull_failures if bull_failures else ["No specific failure conditions identified"],
            supporting_signals=bull_supporting
        )
        
        # Build bear thesis (NO)
        bear_key_drivers = extract_key_drivers(no_signals)
        bear_catalysts = extract_catalysts(no_signals)
        bear_failures = extract_failure_conditions(yes_signals)  # Bull risks are bear failures
        bear_fair_prob = calculate_thesis_probability(no_signals, "NO")
        bear_edge = abs(bear_fair_prob - market_probability)
        bear_argument = build_core_argument(no_signals, "NO", bear_key_drivers)
        bear_supporting = [s.agent_name for s in no_signals]
        
        # Add neutral signals with NO lean to bear thesis
        for signal in neutral_signals:
            if signal.fair_probability < market_probability:
                bear_supporting.append(signal.agent_name)
        
        bear_thesis = Thesis(
            direction="NO",
            fair_probability=bear_fair_prob,
            market_probability=market_probability,
            edge=bear_edge,
            core_argument=bear_argument,
            catalysts=bear_catalysts if bear_catalysts else ["No specific catalysts identified"],
            failure_conditions=bear_failures if bear_failures else ["No specific failure conditions identified"],
            supporting_signals=bear_supporting
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"Thesis construction completed in {duration_ms}ms: "
            f"bull_edge={bull_edge:.3f}, bear_edge={bear_edge:.3f}"
        )
        
        return {
            "bull_thesis": bull_thesis,
            "bear_thesis": bear_thesis,
            "audit_log": [AuditEntry(
                stage="thesis_construction",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "signal_count": len(agent_signals),
                    "yes_signals": len(yes_signals),
                    "no_signals": len(no_signals),
                    "neutral_signals": len(neutral_signals),
                    "bull_fair_probability": bull_fair_prob,
                    "bull_edge": bull_edge,
                    "bull_supporting_agents": len(bull_supporting),
                    "bear_fair_probability": bear_fair_prob,
                    "bear_edge": bear_edge,
                    "bear_supporting_agents": len(bear_supporting),
                    "market_probability": market_probability
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Thesis construction failed after {duration_ms}ms: {e}")
        
        return {
            "audit_log": [AuditEntry(
                stage="thesis_construction",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e),
                    "signal_count": len(agent_signals)
                }
            )]
        }


def create_thesis_construction_node(config: EngineConfig):
    """
    Factory function to create thesis construction node with dependencies.
    
    Args:
        config: Engine configuration
        
    Returns:
        Async function that takes state and returns state update
        
    Examples:
        >>> config = load_config()
        >>> node = create_thesis_construction_node(config)
        >>> result = await node(state)
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await thesis_construction_node(state, config)
    
    return node
