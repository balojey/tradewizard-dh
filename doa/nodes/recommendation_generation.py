"""Recommendation generation node for LangGraph workflow."""

import json
import logging
import time
from typing import Any, Dict, Optional, Tuple

from models.state import GraphState
from models.types import (
    AgentSignal,
    AuditEntry,
    ConsensusProbability,
    MarketBriefingDocument,
    TradeExplanation,
    TradeMetadata,
    TradeRecommendation,
    RecommendationError,
)
from config import EngineConfig
from utils.llm_factory import create_llm_instance

logger = logging.getLogger(__name__)


def calculate_edge(
    consensus_probability: float,
    market_probability: float
) -> float:
    """
    Calculate edge (absolute difference between consensus and market).
    
    Args:
        consensus_probability: Consensus probability from agents
        market_probability: Current market probability
        
    Returns:
        Edge as absolute difference
    """
    return abs(consensus_probability - market_probability)


def determine_action(
    consensus_probability: float,
    market_probability: float,
    edge: float,
    min_edge_threshold: float
) -> str:
    """
    Determine trade action based on edge and probability comparison.
    
    Args:
        consensus_probability: Consensus probability from agents
        market_probability: Current market probability
        edge: Calculated edge
        min_edge_threshold: Minimum edge required for trade
        
    Returns:
        Action: "LONG_YES", "LONG_NO", or "NO_TRADE"
    """
    # Insufficient edge
    if edge < min_edge_threshold:
        return "NO_TRADE"
    
    # Market underpricing YES
    if consensus_probability > market_probability + min_edge_threshold:
        return "LONG_YES"
    
    # Market overpricing YES (underpricing NO)
    if consensus_probability < market_probability - min_edge_threshold:
        return "LONG_NO"
    
    return "NO_TRADE"


def calculate_entry_zone(
    action: str,
    market_probability: float,
    liquidity_score: float
) -> Tuple[float, float]:
    """
    Calculate entry zone for trade.
    
    Args:
        action: Trade action
        market_probability: Current market probability
        liquidity_score: Market liquidity score (0-10)
        
    Returns:
        Tuple of (min_entry, max_entry)
    """
    if action == "NO_TRADE":
        return (0.0, 0.0)
    
    # Base spread: 2 cents
    base_spread = 0.02
    
    # Adjust for liquidity (lower liquidity = wider spread)
    if liquidity_score < 4.0:
        spread = base_spread * 1.5  # 3 cents for low liquidity
    elif liquidity_score < 7.0:
        spread = base_spread * 1.2  # 2.4 cents for medium liquidity
    else:
        spread = base_spread  # 2 cents for high liquidity
    
    if action == "LONG_YES":
        min_entry = market_probability - spread
        max_entry = market_probability + spread
    else:  # LONG_NO
        no_price = 1.0 - market_probability
        min_entry = no_price - spread
        max_entry = no_price + spread
    
    # Bound to [0.01, 0.99]
    min_entry = max(0.01, min(0.99, min_entry))
    max_entry = max(0.01, min(0.99, max_entry))
    
    return (min_entry, max_entry)


def calculate_stop_loss(
    entry_zone: Tuple[float, float],
    liquidity_score: float
) -> float:
    """
    Calculate stop-loss price (below entry zone for risk management).
    
    Args:
        entry_zone: Entry price range
        liquidity_score: Market liquidity score (0-10)
        
    Returns:
        Stop-loss price below entry zone minimum
    """
    entry_min = entry_zone[0]
    
    # Base stop-loss: 3% below entry minimum
    base_distance = 0.03
    
    # Adjust for liquidity (lower liquidity = tighter stop-loss to limit slippage)
    if liquidity_score < 4.0:
        stop_loss_distance = 0.025  # 2.5% for low liquidity
    elif liquidity_score < 7.0:
        stop_loss_distance = 0.03  # 3% for medium liquidity
    else:
        stop_loss_distance = 0.035  # 3.5% for high liquidity
    
    stop_loss = entry_min - stop_loss_distance
    
    # Bound to [0.01, entry minimum)
    return max(0.01, min(entry_min - 0.01, stop_loss))


def calculate_target_zone(
    action: str,
    consensus_probability: float,
    disagreement_index: float
) -> Tuple[float, float]:
    """
    Calculate target zone for trade exit.
    
    Args:
        action: Trade action
        consensus_probability: Consensus probability
        disagreement_index: Disagreement index (0-1)
        
    Returns:
        Tuple of (min_target, max_target)
    """
    if action == "NO_TRADE":
        return (0.0, 0.0)
    
    # Base spread: 3 cents
    base_spread = 0.03
    
    # Adjust for disagreement (higher disagreement = wider target)
    if disagreement_index > 0.30:
        spread = base_spread * 1.5  # 4.5 cents for high uncertainty
    elif disagreement_index > 0.15:
        spread = base_spread * 1.2  # 3.6 cents for moderate uncertainty
    else:
        spread = base_spread  # 3 cents for low uncertainty
    
    if action == "LONG_YES":
        min_target = consensus_probability - spread
        max_target = consensus_probability + spread
    else:  # LONG_NO
        no_consensus = 1.0 - consensus_probability
        min_target = no_consensus - spread
        max_target = no_consensus + spread
    
    # Bound to [0.01, 0.99]
    min_target = max(0.01, min(0.99, min_target))
    max_target = max(0.01, min(0.99, max_target))
    
    return (min_target, max_target)


def calculate_expected_value(
    action: str,
    entry_zone: Tuple[float, float],
    target_zone: Tuple[float, float],
    consensus_probability: float,
    bid_ask_spread: float
) -> float:
    """
    Calculate expected value (profit per $100 invested).
    
    Args:
        action: Trade action
        entry_zone: Entry price range
        target_zone: Target price range
        consensus_probability: Consensus probability
        bid_ask_spread: Market bid-ask spread in cents
        
    Returns:
        Expected value in dollars per $100 invested
    """
    if action == "NO_TRADE":
        return 0.0
    
    # Calculate average prices
    entry_price = (entry_zone[0] + entry_zone[1]) / 2
    target_price = (target_zone[0] + target_zone[1]) / 2
    
    # Shares per $100 invested
    shares_per_100 = 100.0 / entry_price
    
    # Profit if target reached
    profit_if_target = shares_per_100 * (target_price - entry_price)
    
    # Account for transaction costs (spread)
    transaction_cost = shares_per_100 * (bid_ask_spread / 100.0)
    profit_if_target -= transaction_cost
    
    # Expected value based on win probability
    if action == "LONG_YES":
        win_prob = consensus_probability
    else:  # LONG_NO
        win_prob = 1.0 - consensus_probability
    
    expected_value = profit_if_target * win_prob
    
    return expected_value


def calculate_win_probability(
    action: str,
    consensus_probability: float,
    disagreement_index: float,
    time_to_resolution_days: float
) -> float:
    """
    Calculate probability of profitable exit.
    
    Args:
        action: Trade action
        consensus_probability: Consensus probability
        disagreement_index: Disagreement index (0-1)
        time_to_resolution_days: Days until market resolution
        
    Returns:
        Win probability (0-1)
    """
    if action == "NO_TRADE":
        return 0.0
    
    # Base win probability from consensus
    if action == "LONG_YES":
        base_win_prob = consensus_probability
    else:  # LONG_NO
        base_win_prob = 1.0 - consensus_probability
    
    # Adjust for disagreement (higher disagreement = lower confidence)
    disagreement_penalty = disagreement_index * 0.5
    adjusted_win_prob = base_win_prob * (1.0 - disagreement_penalty)
    
    # Adjust for time to resolution (more time = higher probability of reaching target)
    if time_to_resolution_days > 30:
        time_bonus = 1.1  # 10% bonus for long time horizon
    elif time_to_resolution_days > 7:
        time_bonus = 1.05  # 5% bonus for medium time horizon
    else:
        time_bonus = 0.95  # 5% penalty for short time horizon
    
    adjusted_win_prob *= time_bonus
    
    # Bound to [0.0, 1.0]
    adjusted_win_prob = max(0.0, min(1.0, adjusted_win_prob))
    
    return adjusted_win_prob


def assess_liquidity_risk(
    liquidity_score: float,
    volume_24h: float
) -> str:
    """
    Assess liquidity risk for trade execution.
    
    Args:
        liquidity_score: Market liquidity score (0-10)
        volume_24h: 24-hour trading volume in dollars
        
    Returns:
        Liquidity risk: "low", "medium", or "high"
    """
    # Low risk: High liquidity and volume
    if liquidity_score >= 7.0 and volume_24h >= 50000:
        return "low"
    
    # High risk: Low liquidity or volume
    if liquidity_score < 4.0 or volume_24h < 10000:
        return "high"
    
    # Medium risk: Everything else
    return "medium"


def generate_explanation(
    action: str,
    edge: float,
    consensus_probability: float,
    market_probability: float,
    disagreement_index: float,
    regime: str,
    state: GraphState,
    config: EngineConfig
) -> TradeExplanation:
    """
    Generate trade explanation using LLM for rich, contextual summaries.
    
    Args:
        action: Trade action
        edge: Calculated edge
        consensus_probability: Consensus probability
        market_probability: Market probability
        disagreement_index: Disagreement index
        regime: Probability regime
        state: Current workflow state
        config: Engine configuration
        
    Returns:
        TradeExplanation object
    """
    agent_signals_raw = state.get("agent_signals", [])
    debate_record = state.get("debate_record")
    bull_thesis = state.get("bull_thesis")
    bear_thesis = state.get("bear_thesis")
    mbd = state.get("mbd")
    
    # Convert dictionaries to AgentSignal objects if needed
    agent_signals = []
    for signal in agent_signals_raw:
        if isinstance(signal, dict):
            agent_signals.append(AgentSignal(**signal))
        else:
            agent_signals.append(signal)
    
    # Generate summary for NO_TRADE
    if action == "NO_TRADE":
        summary = (
            f"No trade recommended. Market fairly priced with {edge:.1%} edge, "
            f"below minimum threshold. "
        )
        if disagreement_index > 0.30:
            summary += f"High disagreement among agents (disagreement index {disagreement_index:.2f}) suggests genuine uncertainty."
        else:
            summary += "Insufficient edge to justify transaction costs and risk."
        
        return TradeExplanation(
            summary=summary,
            core_thesis="Market is efficiently priced relative to consensus probability. No significant mispricing detected.",
            key_catalysts=[],
            failure_scenarios=[]
        )
    
    # Use LLM to generate rich explanation for trades
    try:
        # Determine which thesis to use based on action
        primary_thesis = bull_thesis if action == "LONG_YES" else bear_thesis
        secondary_thesis = bear_thesis if action == "LONG_YES" else bull_thesis
        
        # Build context for LLM
        context = {
            "market": {
                "question": mbd.question if mbd else "Unknown market",
                "currentProbability": market_probability,
                "liquidityScore": mbd.liquidity_score if mbd else 0,
            },
            "recommendation": {
                "action": action,
                "edge": edge,
                "consensusProbability": consensus_probability,
                "disagreementIndex": disagreement_index,
            },
            "primaryThesis": {
                "direction": primary_thesis.direction if primary_thesis else ("YES" if action == "LONG_YES" else "NO"),
                "coreArgument": primary_thesis.core_argument if primary_thesis else "",
                "catalysts": primary_thesis.catalysts if primary_thesis else [],
                "failureConditions": primary_thesis.failure_conditions if primary_thesis else [],
            } if primary_thesis else None,
            "secondaryThesis": {
                "direction": secondary_thesis.direction if secondary_thesis else ("NO" if action == "LONG_YES" else "YES"),
                "coreArgument": secondary_thesis.core_argument if secondary_thesis else "",
            } if secondary_thesis else None,
        }
        
        # Create LLM prompt
        prompt = f"""You are a trade recommendation explainer for prediction markets.

Generate a clear, concise explanation for this trade recommendation.

Context:
{json.dumps(context, indent=2)}

Your explanation should:
1. Provide a 2-3 sentence summary explaining the core thesis and why this trade makes sense
2. Extract the core thesis argument from the primary thesis (or synthesize from context if missing)
3. Include key catalysts from the thesis (specific events or developments that would drive the outcome)
4. Include failure scenarios from the thesis (specific conditions that would invalidate the trade)
5. {'Acknowledge the uncertainty due to agent disagreement' if disagreement_index > 0.15 else 'Omit uncertainty note (low disagreement)'}

IMPORTANT: 
- Be specific and concrete in catalysts and failure scenarios
- Avoid generic statements like "No specific catalysts identified" or "No strong signals"
- If the thesis is weak, synthesize from the market context and probability edge
- Make the summary compelling and actionable

Respond in JSON format with these fields:
{{
  "summary": "2-3 sentence plain language explanation with specific details about the edge and thesis",
  "coreThesis": "The core argument explaining why this outcome is more likely than the market believes",
  "keyCatalysts": ["specific catalyst 1", "specific catalyst 2", "specific catalyst 3"],
  "failureScenarios": ["specific scenario 1", "specific scenario 2", "specific scenario 3"]
}}"""

        # Create LLM instance with rotation support
        from utils.llm_rotation_manager import LLMRotationManager
        
        rotation_manager = None
        if len(config.llm.model_names) > 1:
            model_names_str = ",".join(config.llm.model_names)
            rotation_manager = LLMRotationManager(model_names_str)
            logger.info(f"[recommendation_generation] Created rotation manager with {len(config.llm.model_names)} models")
        
        llm = create_llm_instance(config.llm, rotation_manager=rotation_manager)
        
        # Invoke LLM
        from langchain_core.messages import SystemMessage, HumanMessage
        messages = [
            SystemMessage(content="You are a helpful assistant that generates trade explanations in JSON format. Always provide specific, actionable insights."),
            HumanMessage(content=prompt)
        ]
        
        response = llm.invoke(messages)
        
        # Parse LLM response
        content = response.content if hasattr(response, 'content') else str(response)
        
        # Try to extract JSON from the response
        try:
            # Try direct parse first
            parsed = json.loads(content)
        except json.JSONDecodeError:
            # Try to extract JSON from markdown code blocks
            import re
            json_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', content)
            if json_match:
                parsed = json.loads(json_match.group(1))
            else:
                # Try to find JSON object in the text
                object_match = re.search(r'\{[\s\S]*\}', content)
                if object_match:
                    parsed = json.loads(object_match.group(0))
                else:
                    raise ValueError('Could not parse LLM response as JSON')
        
        return TradeExplanation(
            summary=parsed.get("summary", ""),
            core_thesis=parsed.get("coreThesis", primary_thesis.core_argument if primary_thesis else ""),
            key_catalysts=parsed.get("keyCatalysts", primary_thesis.catalysts if primary_thesis else []),
            failure_scenarios=parsed.get("failureScenarios", primary_thesis.failure_conditions if primary_thesis else [])
        )
        
    except Exception as e:
        logger.warning(f"LLM explanation generation failed: {e}. Falling back to template-based generation.")
        
        # Fallback to template-based generation
        direction = "YES" if action == "LONG_YES" else "NO"
        summary = (
            f"{action.replace('_', ' ')} with {edge:.1%} edge. "
            f"Consensus at {consensus_probability:.0%} vs market {market_probability:.0%}. "
        )
        
        if disagreement_index < 0.15:
            summary += f"Strong agent alignment (disagreement {disagreement_index:.2f}) "
        elif disagreement_index < 0.30:
            summary += f"Moderate agent alignment (disagreement {disagreement_index:.2f}) "
        else:
            summary += f"Significant agent disagreement (disagreement {disagreement_index:.2f}) "
        
        if debate_record:
            if action == "LONG_YES":
                summary += f"and positive debate score (+{debate_record.bull_score:.1f}) "
            else:
                summary += f"and positive debate score (+{debate_record.bear_score:.1f}) "
        
        summary += f"support {direction} position."
        
        # Use thesis if available, otherwise synthesize
        if action == "LONG_YES" and bull_thesis:
            core_thesis = bull_thesis.core_argument
            key_catalysts = bull_thesis.catalysts
            failure_scenarios = bull_thesis.failure_conditions
        elif action == "LONG_NO" and bear_thesis:
            core_thesis = bear_thesis.core_argument
            key_catalysts = bear_thesis.catalysts
            failure_scenarios = bear_thesis.failure_conditions
        else:
            # Synthesize from agent signals
            yes_signals = [s for s in agent_signals if s.direction == "YES"]
            no_signals = [s for s in agent_signals if s.direction == "NO"]
            
            if action == "LONG_YES":
                key_drivers = []
                for signal in yes_signals[:3]:
                    key_drivers.extend(signal.key_drivers[:2])
                core_thesis = f"Market is underpricing YES outcome. Key factors: {', '.join(key_drivers[:5])}." if key_drivers else "Market probability appears lower than fundamental analysis suggests."
                key_catalysts = key_drivers[:5] if key_drivers else ["Market repricing toward consensus probability"]
            else:
                key_drivers = []
                for signal in no_signals[:3]:
                    key_drivers.extend(signal.key_drivers[:2])
                core_thesis = f"Market is overpricing YES outcome. Key factors: {', '.join(key_drivers[:5])}." if key_drivers else "Market probability appears higher than fundamental analysis suggests."
                key_catalysts = key_drivers[:5] if key_drivers else ["Market repricing toward consensus probability"]
            
            # Extract failure scenarios from risk factors
            failure_scenarios = []
            for signal in agent_signals[:3]:
                failure_scenarios.extend(signal.risk_factors[:2])
            failure_scenarios = failure_scenarios[:5] if failure_scenarios else ["Unexpected market developments", "New information contradicting current analysis"]
        
        return TradeExplanation(
            summary=summary,
            core_thesis=core_thesis,
            key_catalysts=key_catalysts,
            failure_scenarios=failure_scenarios
        )


async def recommendation_generation_node(
    state: GraphState,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Generate trade recommendation from consensus and market data.
    
    This node:
    1. Calculates edge between consensus and market probability
    2. Determines action (LONG_YES, LONG_NO, NO_TRADE) based on edge threshold
    3. Calculates entry zone and target zone for trades
    4. Calculates expected value and win probability
    5. Assesses liquidity risk from market data
    6. Generates explanation with summary, thesis, catalysts, and failure scenarios
    7. Includes metadata with consensus, market probability, edge, and confidence bands
    8. Returns TradeRecommendation with all fields
    
    Args:
        state: Current workflow state
        config: Engine configuration
        
    Returns:
        State update with recommendation and audit entry
        
    State Requirements:
        - consensus: ConsensusProbability (required)
        - mbd: MarketBriefingDocument (required)
        - bull_thesis: Thesis (optional)
        - bear_thesis: Thesis (optional)
        - debate_record: DebateRecord (optional)
        - agent_signals: List[AgentSignal] (optional)
        
    State Updates:
        - recommendation: TradeRecommendation with action and details
        - recommendation_error: RecommendationError if generation fails
        - audit_log: Audit entry for recommendation generation stage
    """
    start_time = time.time()
    
    # Extract required data from state
    consensus = state.get("consensus")
    mbd = state.get("mbd")
    
    # Validate required inputs
    if not consensus:
        logger.error("Recommendation generation called without consensus")
        return {
            "recommendation_error": RecommendationError(
                type="CONSENSUS_FAILED",
                message="No consensus probability available",
                details={}
            ),
            "audit_log": [AuditEntry(
                stage="recommendation_generation",
                timestamp=int(time.time()),
                status="failed",
                details={"error": "No consensus probability"}
            )]
        }
    
    if not mbd:
        logger.error("Recommendation generation called without market data")
        return {
            "recommendation_error": RecommendationError(
                type="INSUFFICIENT_DATA",
                message="No market briefing document available",
                details={}
            ),
            "audit_log": [AuditEntry(
                stage="recommendation_generation",
                timestamp=int(time.time()),
                status="failed",
                details={"error": "No market data"}
            )]
        }
    
    logger.info(
        f"Generating recommendation for market {mbd.market_id}: "
        f"consensus={consensus.consensus_probability:.3f}, "
        f"market={mbd.current_probability:.3f}"
    )
    
    try:
        # Step 1: Calculate edge
        edge = calculate_edge(
            consensus.consensus_probability,
            mbd.current_probability
        )
        
        # Step 2: Determine action
        action = determine_action(
            consensus.consensus_probability,
            mbd.current_probability,
            edge,
            config.consensus.min_edge_threshold
        )
        
        # Step 3: Calculate entry zone
        entry_zone = calculate_entry_zone(
            action,
            mbd.current_probability,
            mbd.liquidity_score
        )
        
        # Step 4: Calculate target zone
        target_zone = calculate_target_zone(
            action,
            consensus.consensus_probability,
            consensus.disagreement_index
        )
        
        # Step 4.5: Calculate stop-loss price
        stop_loss = calculate_stop_loss(
            entry_zone,
            mbd.liquidity_score
        )
        
        # Step 5: Calculate time to resolution
        current_time = int(time.time())
        time_to_resolution_seconds = mbd.expiry_timestamp - current_time
        time_to_resolution_days = time_to_resolution_seconds / 86400.0
        
        # Step 6: Calculate expected value
        expected_value = calculate_expected_value(
            action,
            entry_zone,
            target_zone,
            consensus.consensus_probability,
            mbd.bid_ask_spread
        )
        
        # Step 7: Calculate win probability
        win_probability = calculate_win_probability(
            action,
            consensus.consensus_probability,
            consensus.disagreement_index,
            time_to_resolution_days
        )
        
        # Step 8: Assess liquidity risk
        liquidity_risk = assess_liquidity_risk(
            mbd.liquidity_score,
            mbd.volume_24h
        )
        
        # Step 9: Generate explanation (with LLM)
        explanation = generate_explanation(
            action,
            edge,
            consensus.consensus_probability,
            mbd.current_probability,
            consensus.disagreement_index,
            consensus.regime,
            state,
            config  # Pass config for LLM creation
        )
        
        # Step 10: Create metadata
        metadata = TradeMetadata(
            consensus_probability=consensus.consensus_probability,
            market_probability=mbd.current_probability,
            edge=edge,
            confidence_band=consensus.confidence_band,
            disagreement_index=consensus.disagreement_index,
            regime=consensus.regime,
            analysis_timestamp=current_time,
            agent_count=len(consensus.contributing_signals)
        )
        
        # Step 11: Create recommendation
        recommendation = TradeRecommendation(
            market_id=mbd.market_id,
            condition_id=mbd.condition_id,
            action=action,
            entry_zone=entry_zone,
            target_zone=target_zone,
            stop_loss=stop_loss,
            expected_value=expected_value,
            win_probability=win_probability,
            liquidity_risk=liquidity_risk,
            explanation=explanation,
            metadata=metadata
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"Recommendation generated in {duration_ms}ms: "
            f"action={action}, edge={edge:.3f}, ev=${expected_value:.2f}"
        )
        
        # Check for NO_EDGE error
        if action == "NO_TRADE" and edge < config.consensus.min_edge_threshold:
            return {
                "recommendation": recommendation,
                "recommendation_error": RecommendationError(
                    type="NO_EDGE",
                    message=f"Insufficient edge: {edge:.3f} < {config.consensus.min_edge_threshold:.3f}",
                    details={
                        "edge": edge,
                        "threshold": config.consensus.min_edge_threshold,
                        "consensus_probability": consensus.consensus_probability,
                        "market_probability": mbd.current_probability
                    }
                ),
                "audit_log": [AuditEntry(
                    stage="recommendation_generation",
                    timestamp=int(time.time()),
                    status="completed",
                    details={
                        "duration_ms": duration_ms,
                        "action": action,
                        "edge": edge,
                        "expected_value": expected_value,
                        "win_probability": win_probability,
                        "liquidity_risk": liquidity_risk,
                        "regime": consensus.regime,
                        "no_edge": True
                    }
                )]
            }
        
        return {
            "recommendation": recommendation,
            "audit_log": [AuditEntry(
                stage="recommendation_generation",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "action": action,
                    "edge": edge,
                    "expected_value": expected_value,
                    "win_probability": win_probability,
                    "liquidity_risk": liquidity_risk,
                    "entry_zone": entry_zone,
                    "target_zone": target_zone,
                    "regime": consensus.regime,
                    "time_to_resolution_days": time_to_resolution_days
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Recommendation generation failed after {duration_ms}ms: {e}")
        
        return {
            "recommendation_error": RecommendationError(
                type="INSUFFICIENT_DATA",
                message=f"Failed to generate recommendation: {str(e)}",
                details={"error": str(e)}
            ),
            "audit_log": [AuditEntry(
                stage="recommendation_generation",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e)
                }
            )]
        }


def create_recommendation_generation_node(config: EngineConfig):
    """
    Factory function to create recommendation generation node with dependencies.
    
    Args:
        config: Engine configuration
        
    Returns:
        Async function that takes state and returns state update
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await recommendation_generation_node(state, config)
    
    return node
