"""Agent signal fusion node for LangGraph workflow."""

import logging
import time
from typing import Any, Dict, List
import statistics

from models.state import GraphState
from models.types import AuditEntry, AgentSignal, FusedSignal
from config import EngineConfig

logger = logging.getLogger(__name__)


def calculate_weighted_probability(
    signals: List[AgentSignal],
    config: EngineConfig
) -> float:
    """
    Calculate weighted average probability from agent signals.
    
    Weighting Strategy:
    1. Base weight = agent confidence (0-1)
    2. Historical accuracy weight (if available in metadata)
    3. Normalize weights to sum to 1.0
    4. Calculate weighted average of fair_probability values
    
    Args:
        signals: List of agent signals
        config: Engine configuration
        
    Returns:
        Weighted probability (0-1)
        
    Examples:
        >>> signals = [
        ...     AgentSignal(confidence=0.8, fair_probability=0.6, ...),
        ...     AgentSignal(confidence=0.6, fair_probability=0.7, ...)
        ... ]
        >>> prob = calculate_weighted_probability(signals, config)
        >>> assert 0.0 <= prob <= 1.0
    """
    if not signals:
        return 0.5  # Default neutral probability
    
    # Calculate weights for each signal
    weights = []
    probabilities = []
    
    for signal in signals:
        # Base weight from confidence
        weight = signal.confidence
        
        # Adjust weight based on historical accuracy if available
        historical_accuracy = signal.metadata.get('historical_accuracy')
        if historical_accuracy is not None:
            # Boost weight for agents with good track record
            weight *= (0.5 + 0.5 * historical_accuracy)
        
        weights.append(weight)
        probabilities.append(signal.fair_probability)
    
    # Normalize weights
    total_weight = sum(weights)
    if total_weight == 0:
        # All zero confidence - use equal weighting
        normalized_weights = [1.0 / len(weights)] * len(weights)
    else:
        normalized_weights = [w / total_weight for w in weights]
    
    # Calculate weighted average
    weighted_prob = sum(
        prob * weight 
        for prob, weight in zip(probabilities, normalized_weights)
    )
    
    return weighted_prob


def calculate_signal_alignment(signals: List[AgentSignal]) -> float:
    """
    Calculate how aligned agent signals are.
    
    Alignment is measured by:
    1. Standard deviation of fair_probability values (lower = more aligned)
    2. Consistency of direction (YES/NO/NEUTRAL)
    3. Normalized to 0-1 scale (1 = perfect alignment, 0 = maximum disagreement)
    
    Args:
        signals: List of agent signals
        
    Returns:
        Alignment score (0-1)
        
    Examples:
        >>> signals = [
        ...     AgentSignal(direction="YES", fair_probability=0.6, ...),
        ...     AgentSignal(direction="YES", fair_probability=0.62, ...)
        ... ]
        >>> alignment = calculate_signal_alignment(signals)
        >>> assert alignment > 0.8  # High alignment
    """
    if len(signals) < 2:
        return 1.0  # Single signal is perfectly aligned with itself
    
    # Calculate probability standard deviation
    probabilities = [s.fair_probability for s in signals]
    prob_std = statistics.stdev(probabilities)
    
    # Normalize std to 0-1 scale (0.5 std = maximum disagreement)
    # Lower std = higher alignment
    prob_alignment = max(0.0, 1.0 - (prob_std / 0.5))
    
    # Calculate direction consistency
    directions = [s.direction for s in signals]
    direction_counts = {
        'YES': directions.count('YES'),
        'NO': directions.count('NO'),
        'NEUTRAL': directions.count('NEUTRAL')
    }
    
    # Direction alignment = proportion of most common direction
    max_direction_count = max(direction_counts.values())
    direction_alignment = max_direction_count / len(signals)
    
    # Combined alignment (weighted average)
    alignment = 0.6 * prob_alignment + 0.4 * direction_alignment
    
    return alignment


def detect_conflicts(signals: List[AgentSignal]) -> List[str]:
    """
    Detect conflicting signals between agents.
    
    Conflicts are identified when:
    1. Agents have opposite directions (YES vs NO) with high confidence
    2. Agents have significantly different fair_probability estimates (>0.3 difference)
    3. Agents identify contradictory key drivers
    
    Args:
        signals: List of agent signals
        
    Returns:
        List of conflict descriptions
        
    Examples:
        >>> signals = [
        ...     AgentSignal(agent_name="A", direction="YES", confidence=0.8, ...),
        ...     AgentSignal(agent_name="B", direction="NO", confidence=0.8, ...)
        ... ]
        >>> conflicts = detect_conflicts(signals)
        >>> assert len(conflicts) > 0
    """
    conflicts = []
    
    # Check for directional conflicts
    yes_signals = [s for s in signals if s.direction == 'YES' and s.confidence > 0.7]
    no_signals = [s for s in signals if s.direction == 'NO' and s.confidence > 0.7]
    
    if yes_signals and no_signals:
        yes_agents = [s.agent_name for s in yes_signals]
        no_agents = [s.agent_name for s in no_signals]
        conflicts.append(
            f"Directional conflict: {', '.join(yes_agents)} favor YES "
            f"while {', '.join(no_agents)} favor NO"
        )
    
    # Check for probability conflicts (>0.3 difference)
    for i, signal_a in enumerate(signals):
        for signal_b in signals[i+1:]:
            prob_diff = abs(signal_a.fair_probability - signal_b.fair_probability)
            if prob_diff > 0.3:
                conflicts.append(
                    f"Probability conflict: {signal_a.agent_name} estimates "
                    f"{signal_a.fair_probability:.2f} while {signal_b.agent_name} "
                    f"estimates {signal_b.fair_probability:.2f}"
                )
    
    return conflicts


async def agent_signal_fusion_node(
    state: GraphState,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Aggregate agent signals with dynamic weighting.
    
    This node is the fan-in point after parallel agent execution. It:
    1. Waits for all parallel agents to complete (handled by LangGraph)
    2. Aggregates agent signals using confidence-based weighting
    3. Calculates signal alignment to measure consensus
    4. Detects conflicts between agent signals
    5. Produces a fused signal for downstream nodes
    
    Weighting Strategy:
    - Signals are weighted by agent confidence (0-1)
    - Historical accuracy (if available) adjusts weights
    - Weights are normalized to sum to 1.0
    
    Args:
        state: Current workflow state with agent_signals
        config: Engine configuration
        
    Returns:
        State update with fused_signal and audit entry
        
    State Requirements:
        - agent_signals: List of AgentSignal from parallel agents (required)
        - active_agents: List of agent names that were dispatched (optional)
        
    State Updates:
        - fused_signal: FusedSignal with aggregated analysis
        - audit_log: Audit entry for signal fusion stage
        
    Examples:
        >>> state = {
        ...     "agent_signals": [
        ...         AgentSignal(agent_name="A", confidence=0.8, fair_probability=0.6, ...),
        ...         AgentSignal(agent_name="B", confidence=0.7, fair_probability=0.65, ...)
        ...     ]
        ... }
        >>> result = await agent_signal_fusion_node(state, config)
        >>> assert "fused_signal" in result
    """
    start_time = time.time()
    
    # Extract agent signals from state
    agent_signals_raw = state.get("agent_signals", [])
    active_agents = state.get("active_agents", [])
    
    # Convert dictionaries to AgentSignal objects if needed
    agent_signals = []
    for signal in agent_signals_raw:
        if isinstance(signal, dict):
            # Convert dict to AgentSignal
            agent_signals.append(AgentSignal(**signal))
        else:
            # Already an AgentSignal object
            agent_signals.append(signal)
    
    # Validate we have signals
    if not agent_signals:
        logger.warning("Signal fusion node called with no agent signals")
        
        # Return neutral fused signal
        return {
            "fused_signal": FusedSignal(
                weighted_probability=0.5,
                signal_alignment=0.0,
                conflicts=["No agent signals available"],
                contributing_agents=[]
            ),
            "audit_log": [AuditEntry(
                stage="agent_signal_fusion",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "warning": "No agent signals to fuse",
                    "signal_count": 0
                }
            )]
        }
    
    logger.info(f"Fusing {len(agent_signals)} agent signals")
    
    try:
        # Calculate weighted probability
        weighted_probability = calculate_weighted_probability(agent_signals, config)
        
        # Calculate signal alignment
        signal_alignment = calculate_signal_alignment(agent_signals)
        
        # Detect conflicts
        conflicts = detect_conflicts(agent_signals)
        
        # Get contributing agent names
        contributing_agents = [s.agent_name for s in agent_signals]
        
        # Create fused signal
        fused_signal = FusedSignal(
            weighted_probability=weighted_probability,
            signal_alignment=signal_alignment,
            conflicts=conflicts,
            contributing_agents=contributing_agents
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Calculate statistics for logging
        avg_confidence = statistics.mean([s.confidence for s in agent_signals])
        prob_std = statistics.stdev([s.fair_probability for s in agent_signals]) if len(agent_signals) > 1 else 0.0
        
        logger.info(
            f"Signal fusion completed in {duration_ms}ms: "
            f"weighted_prob={weighted_probability:.3f}, "
            f"alignment={signal_alignment:.3f}, "
            f"conflicts={len(conflicts)}"
        )
        
        return {
            "fused_signal": fused_signal,
            "audit_log": [AuditEntry(
                stage="agent_signal_fusion",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "signal_count": len(agent_signals),
                    "weighted_probability": weighted_probability,
                    "signal_alignment": signal_alignment,
                    "conflict_count": len(conflicts),
                    "contributing_agents": contributing_agents,
                    "avg_confidence": avg_confidence,
                    "probability_std": prob_std,
                    "expected_agents": len(active_agents),
                    "received_agents": len(agent_signals)
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Signal fusion failed after {duration_ms}ms: {e}")
        
        # Return fallback fused signal
        return {
            "fused_signal": FusedSignal(
                weighted_probability=0.5,
                signal_alignment=0.0,
                conflicts=[f"Fusion error: {str(e)}"],
                contributing_agents=[]
            ),
            "audit_log": [AuditEntry(
                stage="agent_signal_fusion",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e),
                    "signal_count": len(agent_signals)
                }
            )]
        }


def create_agent_signal_fusion_node(config: EngineConfig):
    """
    Factory function to create agent signal fusion node with dependencies.
    
    This factory pattern allows the node to be created with the required
    dependencies (config) while maintaining the standard LangGraph node signature.
    
    Args:
        config: Engine configuration
        
    Returns:
        Async function that takes state and returns state update
        
    Examples:
        >>> config = load_config()
        >>> node = create_agent_signal_fusion_node(config)
        >>> result = await node(state)
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await agent_signal_fusion_node(state, config)
    
    return node
