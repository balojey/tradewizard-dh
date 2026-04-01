"""Consensus engine node for LangGraph workflow."""

import logging
import time
from typing import Any, Dict, List, Optional
import statistics

from models.state import GraphState
from models.types import (
    AuditEntry,
    AgentSignal,
    ConsensusProbability,
    DebateRecord,
)
from config import EngineConfig

logger = logging.getLogger(__name__)


async def fetch_agent_accuracies(supabase_client: Any) -> Dict[str, float]:
    """
    Fetch agent signal accuracy percentages from the leaderboard view.

    Queries v_performance_by_agent and returns a mapping of agent_name ->
    agent_signal_accuracy_pct (0-100 scale). Returns an empty dict on any
    failure so the caller can fall back gracefully.

    Args:
        supabase_client: SupabaseClient instance

    Returns:
        Dict mapping agent_name to accuracy percentage (0-100)
    """
    try:
        response = (
            supabase_client.client
            .from_("v_performance_by_agent")
            .select("agent_name,agent_signal_accuracy_pct")
            .execute()
        )
        if response.data:
            return {
                row["agent_name"]: float(row["agent_signal_accuracy_pct"])
                for row in response.data
                if row.get("agent_name") and row.get("agent_signal_accuracy_pct") is not None
            }
    except Exception as e:
        logger.warning(f"Could not fetch agent accuracies from leaderboard: {e}")
    return {}


def calculate_signal_weights(
    signals: List[AgentSignal],
    config: EngineConfig,
    leaderboard_accuracies: Optional[Dict[str, float]] = None
) -> List[float]:
    """
    Calculate weights for each agent signal based on confidence and leaderboard accuracy.

    Weighting Strategy:
    1. Base weight = agent confidence (0-1)
    2. Leaderboard accuracy multiplier (continuous, from v_performance_by_agent):
       - accuracy_multiplier = agent_signal_accuracy_pct / 50.0
         (50% accuracy = 1.0x neutral; 100% = 2.0x; 0% = 0.0x)
       - Falls back to 1.0x when no leaderboard data is available for an agent
    3. Normalize weights to sum to 1.0

    Args:
        signals: List of agent signals
        config: Engine configuration
        leaderboard_accuracies: Dict of agent_name -> accuracy pct (0-100) from
            v_performance_by_agent. When None or missing an agent, falls back to 1.0x.

    Returns:
        List of normalized weights (sum to 1.0)
    """
    if not signals:
        return []

    accuracies = leaderboard_accuracies or {}
    weights = []

    for signal in signals:
        # Base weight from self-reported confidence
        weight = signal.confidence

        # Apply continuous accuracy multiplier from the leaderboard
        # 50 % accuracy is the neutral point (1.0x); scale linearly from there.
        accuracy_pct = accuracies.get(signal.agent_name)
        if accuracy_pct is not None:
            accuracy_multiplier = accuracy_pct / 50.0
            weight *= accuracy_multiplier
        # else: no historical data yet — keep weight as-is (1.0x implicit)

        weights.append(weight)

    # Normalize weights to sum to 1.0
    total_weight = sum(weights)
    if total_weight == 0:
        # All zero weights — use equal weighting
        return [1.0 / len(weights)] * len(weights)

    return [w / total_weight for w in weights]


def calculate_weighted_consensus(
    signals: List[AgentSignal],
    weights: List[float]
) -> float:
    """
    Calculate weighted consensus probability from agent signals.
    
    Args:
        signals: List of agent signals
        weights: Normalized weights for each signal
        
    Returns:
        Weighted consensus probability (0-1)
    """
    if not signals or not weights:
        return 0.5  # Default neutral
    
    weighted_prob = sum(
        signal.fair_probability * weight
        for signal, weight in zip(signals, weights)
    )
    
    return weighted_prob


def apply_debate_adjustment(
    consensus: float,
    debate_record: Optional[DebateRecord]
) -> float:
    """
    Apply debate score adjustment to consensus probability.
    
    Debate Influence:
    - If bull_score > bear_score: Shift toward YES (increase probability)
    - If bear_score > bull_score: Shift toward NO (decrease probability)
    - Maximum shift: ±0.10 (10 percentage points)
    - Shift amount: (score_diff) * 0.05
    
    Args:
        consensus: Base consensus probability
        debate_record: Debate record with thesis scores
        
    Returns:
        Adjusted consensus probability (bounded to [0, 1])
    """
    if not debate_record:
        return consensus
    
    score_diff = debate_record.bull_score - debate_record.bear_score
    
    # Calculate shift amount (max ±0.10)
    shift = max(-0.10, min(0.10, score_diff * 0.05))
    
    # Apply shift and bound to [0, 1]
    adjusted = consensus + shift
    adjusted = max(0.0, min(1.0, adjusted))
    
    return adjusted


def calculate_disagreement_index(signals: List[AgentSignal]) -> float:
    """
    Calculate disagreement index from signal variance.
    
    Disagreement Index:
    - Standard deviation of agent fair_probability estimates
    - Normalized to 0-1 scale (std_dev / 0.25, capped at 1.0)
    - Low disagreement: < 0.15
    - Moderate disagreement: 0.15-0.30
    - High disagreement: > 0.30
    
    Args:
        signals: List of agent signals
        
    Returns:
        Disagreement index (0-1)
    """
    if len(signals) < 2:
        return 0.0  # Single signal has no disagreement
    
    probabilities = [s.fair_probability for s in signals]
    std_dev = statistics.stdev(probabilities)
    
    # Normalize to 0-1 scale (0.25 std = max disagreement)
    disagreement_index = min(std_dev / 0.25, 1.0)
    
    return disagreement_index


def generate_confidence_bands(
    consensus: float,
    disagreement_index: float
) -> tuple[float, float]:
    """
    Generate confidence bands around consensus probability.
    
    Band Width Calculation:
    - band_width = disagreement_index * 0.20 (max 20 percentage points)
    - Symmetric bands around consensus
    - Bounded to [0, 1] range
    
    Args:
        consensus: Consensus probability
        disagreement_index: Disagreement index (0-1)
        
    Returns:
        Tuple of (lower_bound, upper_bound)
    """
    # Calculate band width
    band_width = disagreement_index * 0.20
    
    # Generate symmetric bands
    lower_bound = max(0.0, consensus - band_width)
    upper_bound = min(1.0, consensus + band_width)
    
    return (lower_bound, upper_bound)


def classify_regime(
    disagreement_index: float,
    confidence_band: tuple[float, float]
) -> str:
    """
    Classify probability regime based on disagreement and band width.
    
    Regime Classification:
    - "high-confidence": disagreement < 0.15 AND band_width < 0.10
    - "moderate-confidence": disagreement 0.15-0.30 OR band_width 0.10-0.15
    - "high-uncertainty": disagreement > 0.30 OR band_width > 0.15
    
    Args:
        disagreement_index: Disagreement index (0-1)
        confidence_band: Tuple of (lower, upper) bounds
        
    Returns:
        Regime classification string
    """
    band_width = confidence_band[1] - confidence_band[0]
    
    if disagreement_index < 0.15 and band_width < 0.10:
        return "high-confidence"
    elif disagreement_index > 0.30 or band_width > 0.15:
        return "high-uncertainty"
    else:
        return "moderate-confidence"


def get_contributing_signals(
    signals: List[AgentSignal],
    weights: List[float]
) -> List[str]:
    """
    Get list of contributing agent names, ordered by weight.
    
    Args:
        signals: List of agent signals
        weights: Normalized weights for each signal
        
    Returns:
        List of agent names ordered by weight (highest first)
    """
    if not signals or not weights:
        return []
    
    # Create list of (agent_name, weight) tuples
    agent_weights = [
        (signal.agent_name, weight)
        for signal, weight in zip(signals, weights)
    ]
    
    # Sort by weight (descending)
    agent_weights.sort(key=lambda x: x[1], reverse=True)
    
    # Return agent names
    return [name for name, _ in agent_weights]


async def consensus_engine_node(
    state: GraphState,
    config: EngineConfig,
    supabase_client: Optional[Any] = None
) -> Dict[str, Any]:
    """
    Calculate consensus probability from agent signals and debate results.
    
    This node:
    1. Fetches per-agent accuracy from the leaderboard (v_performance_by_agent)
    2. Weights agent signals by confidence × leaderboard accuracy (continuous scale)
    3. Calculates weighted consensus probability
    4. Applies debate score adjustment
    5. Calculates disagreement index from signal variance
    6. Generates confidence bands based on disagreement
    7. Classifies probability regime
    8. Returns ConsensusProbability with all metrics

    Args:
        state: Current workflow state
        config: Engine configuration
        supabase_client: Optional SupabaseClient for fetching leaderboard accuracies

    Returns:
        State update with consensus and audit entry
        
    State Requirements:
        - agent_signals: List of AgentSignal (required)
        - debate_record: DebateRecord (optional)
        
    State Updates:
        - consensus: ConsensusProbability with all metrics
        - audit_log: Audit entry for consensus engine stage
    """
    start_time = time.time()
    
    # Extract required data from state
    agent_signals_raw = state.get("agent_signals", [])
    debate_record = state.get("debate_record")
    
    # Convert dictionaries to AgentSignal objects if needed
    agent_signals = []
    for signal in agent_signals_raw:
        if isinstance(signal, dict):
            agent_signals.append(AgentSignal(**signal))
        else:
            agent_signals.append(signal)
    
    # Validate we have signals
    if not agent_signals:
        logger.warning("Consensus engine called with no agent signals")
        
        # Return neutral consensus
        return {
            "consensus": ConsensusProbability(
                consensus_probability=0.5,
                confidence_band=(0.3, 0.7),
                disagreement_index=1.0,
                regime="high-uncertainty",
                contributing_signals=[]
            ),
            "audit_log": [AuditEntry(
                stage="consensus_engine",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "warning": "No agent signals available",
                    "signal_count": 0
                }
            )]
        }
    
    logger.info(f"Calculating consensus from {len(agent_signals)} agent signals")
    
    try:
        # Step 1: Fetch leaderboard accuracies and calculate signal weights
        leaderboard_accuracies = {}
        if supabase_client is not None:
            leaderboard_accuracies = await fetch_agent_accuracies(supabase_client)
            if leaderboard_accuracies:
                logger.info(
                    f"Loaded leaderboard accuracies for {len(leaderboard_accuracies)} agents"
                )
            else:
                logger.info("No leaderboard accuracy data available, using confidence-only weights")

        weights = calculate_signal_weights(agent_signals, config, leaderboard_accuracies)
        
        # Step 2: Calculate weighted consensus
        base_consensus = calculate_weighted_consensus(agent_signals, weights)
        
        # Step 3: Apply debate adjustment
        adjusted_consensus = apply_debate_adjustment(base_consensus, debate_record)
        
        # Step 4: Calculate disagreement index
        disagreement_index = calculate_disagreement_index(agent_signals)
        
        # Step 5: Generate confidence bands
        confidence_band = generate_confidence_bands(adjusted_consensus, disagreement_index)
        
        # Step 6: Classify regime
        regime = classify_regime(disagreement_index, confidence_band)
        
        # Step 7: Get contributing signals
        contributing_signals = get_contributing_signals(agent_signals, weights)
        
        # Create consensus probability object
        consensus = ConsensusProbability(
            consensus_probability=adjusted_consensus,
            confidence_band=confidence_band,
            disagreement_index=disagreement_index,
            regime=regime,
            contributing_signals=contributing_signals
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        # Calculate statistics for logging
        debate_adjustment = adjusted_consensus - base_consensus if debate_record else 0.0
        avg_confidence = statistics.mean([s.confidence for s in agent_signals])
        prob_std = statistics.stdev([s.fair_probability for s in agent_signals]) if len(agent_signals) > 1 else 0.0
        
        logger.info(
            f"Consensus calculated in {duration_ms}ms: "
            f"probability={adjusted_consensus:.3f}, "
            f"regime={regime}, "
            f"disagreement={disagreement_index:.3f}"
        )
        
        return {
            "consensus": consensus,
            "audit_log": [AuditEntry(
                stage="consensus_engine",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "signal_count": len(agent_signals),
                    "base_consensus": base_consensus,
                    "debate_adjustment": debate_adjustment,
                    "final_consensus": adjusted_consensus,
                    "disagreement_index": disagreement_index,
                    "confidence_band": confidence_band,
                    "regime": regime,
                    "contributing_signals": contributing_signals,
                    "avg_confidence": avg_confidence,
                    "probability_std": prob_std,
                    "debate_applied": debate_record is not None,
                    "leaderboard_agents_loaded": len(leaderboard_accuracies),
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Consensus engine failed after {duration_ms}ms: {e}")
        
        # Return fallback consensus
        return {
            "consensus": ConsensusProbability(
                consensus_probability=0.5,
                confidence_band=(0.3, 0.7),
                disagreement_index=1.0,
                regime="high-uncertainty",
                contributing_signals=[]
            ),
            "audit_log": [AuditEntry(
                stage="consensus_engine",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e),
                    "signal_count": len(agent_signals)
                }
            )]
        }


def create_consensus_engine_node(config: EngineConfig, supabase_client: Optional[Any] = None):
    """
    Factory function to create consensus engine node with dependencies.

    Args:
        config: Engine configuration
        supabase_client: Optional SupabaseClient for fetching leaderboard accuracies

    Returns:
        Async function that takes state and returns state update
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await consensus_engine_node(state, config, supabase_client)

    return node
