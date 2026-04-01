"""Cross-examination node for LangGraph workflow."""

import logging
import time
from typing import Any, Dict, List, Literal

from models.state import GraphState
from models.types import (
    AuditEntry,
    DebateRecord,
    DebateTest,
    MarketBriefingDocument,
    Thesis,
)
from config import EngineConfig
from utils.llm_factory import create_llm_instance
from prompts import CROSS_EXAMINATION_PROMPT

logger = logging.getLogger(__name__)


# Type for test outcomes
TestOutcome = Literal["survived", "weakened", "refuted"]


def outcome_to_score(outcome: TestOutcome) -> float:
    """
    Convert test outcome to numerical score.
    
    Args:
        outcome: Test outcome (survived/weakened/refuted)
        
    Returns:
        Score: +1.0 for survived, 0.0 for weakened, -1.0 for refuted
        
    Examples:
        >>> outcome_to_score("survived")
        1.0
        >>> outcome_to_score("weakened")
        0.0
        >>> outcome_to_score("refuted")
        -1.0
    """
    score_map = {
        "survived": 1.0,
        "weakened": 0.0,
        "refuted": -1.0
    }
    return score_map.get(outcome, 0.0)


def calculate_thesis_score(tests: List[DebateTest]) -> float:
    """
    Calculate overall thesis score from test results.
    
    Score is the average of all test scores.
    
    Args:
        tests: List of debate tests for a thesis
        
    Returns:
        Overall score (-1.0 to +1.0)
        
    Examples:
        >>> tests = [
        ...     DebateTest(outcome="survived", score=1.0, ...),
        ...     DebateTest(outcome="weakened", score=0.0, ...),
        ...     DebateTest(outcome="survived", score=1.0, ...)
        ... ]
        >>> score = calculate_thesis_score(tests)
        >>> assert score == (1.0 + 0.0 + 1.0) / 3
    """
    if not tests:
        return 0.0
    
    total_score = sum(test.score for test in tests)
    return total_score / len(tests)


def create_test_for_thesis(
    thesis: Thesis,
    test_type: Literal["evidence", "causality", "timing", "liquidity", "tail-risk"],
    mbd: MarketBriefingDocument
) -> Dict[str, Any]:
    """
    Create a test context for a specific thesis and test type.
    
    Args:
        thesis: The thesis to test
        test_type: Type of test to perform
        mbd: Market Briefing Document for context
        
    Returns:
        Dictionary with test context
        
    Examples:
        >>> thesis = Thesis(
        ...     direction="YES",
        ...     core_argument="Strong evidence supports YES",
        ...     catalysts=["Catalyst A"],
        ...     ...
        ... )
        >>> test = create_test_for_thesis(thesis, "evidence", mbd)
        >>> assert test["test_type"] == "evidence"
    """
    return {
        "test_type": test_type,
        "thesis_direction": thesis.direction,
        "core_argument": thesis.core_argument,
        "catalysts": thesis.catalysts,
        "failure_conditions": thesis.failure_conditions,
        "fair_probability": thesis.fair_probability,
        "market_probability": thesis.market_probability,
        "edge": thesis.edge,
        "supporting_signals": thesis.supporting_signals,
        "market_question": mbd.question,
        "event_type": mbd.event_type,
        "time_to_resolution": mbd.expiry_timestamp - int(time.time()),
        "liquidity_score": mbd.liquidity_score,
        "volatility_regime": mbd.volatility_regime
    }


def identify_key_disagreements(
    bull_thesis: Thesis,
    bear_thesis: Thesis,
    bull_tests: List[DebateTest],
    bear_tests: List[DebateTest]
) -> List[str]:
    """
    Identify key disagreements between bull and bear theses.
    
    Disagreements are identified from:
    1. Contradictory claims in core arguments
    2. Different catalyst interpretations
    3. Conflicting failure conditions
    4. Test outcomes that diverge significantly
    
    Args:
        bull_thesis: Bull thesis
        bear_thesis: Bear thesis
        bull_tests: Test results for bull thesis
        bear_tests: Test results for bear thesis
        
    Returns:
        List of key disagreement descriptions
        
    Examples:
        >>> bull = Thesis(direction="YES", core_argument="X will happen", ...)
        >>> bear = Thesis(direction="NO", core_argument="X will not happen", ...)
        >>> disagreements = identify_key_disagreements(bull, bear, [], [])
        >>> assert len(disagreements) > 0
    """
    disagreements = []
    
    # Fundamental directional disagreement
    prob_diff = abs(bull_thesis.fair_probability - bear_thesis.fair_probability)
    if prob_diff > 0.2:
        disagreements.append(
            f"Fundamental probability disagreement: Bull thesis estimates "
            f"{bull_thesis.fair_probability:.1%} while bear thesis estimates "
            f"{bear_thesis.fair_probability:.1%} (difference: {prob_diff:.1%})"
        )
    
    # Catalyst disagreements
    bull_catalysts_set = set(bull_thesis.catalysts)
    bear_catalysts_set = set(bear_thesis.catalysts)
    
    # Check if bear catalysts contradict bull catalysts
    if bull_catalysts_set and bear_catalysts_set:
        disagreements.append(
            f"Catalyst interpretation differs: Bull thesis emphasizes "
            f"{bull_thesis.catalysts[0]}, while bear thesis focuses on "
            f"{bear_thesis.catalysts[0]}"
        )
    
    # Test outcome disagreements
    for bull_test, bear_test in zip(bull_tests, bear_tests):
        if bull_test.test_type == bear_test.test_type:
            score_diff = abs(bull_test.score - bear_test.score)
            if score_diff >= 1.5:  # Significant divergence
                disagreements.append(
                    f"{bull_test.test_type.capitalize()} test shows divergence: "
                    f"Bull thesis {bull_test.outcome}, bear thesis {bear_test.outcome}"
                )
    
    # Edge disagreements
    if bull_thesis.edge > 0.1 and bear_thesis.edge > 0.1:
        disagreements.append(
            f"Both theses claim significant edge: Bull edge {bull_thesis.edge:.1%}, "
            f"bear edge {bear_thesis.edge:.1%}, suggesting market mispricing from both perspectives"
        )
    
    # Limit to top 5 most important disagreements
    return disagreements[:5]


async def cross_examination_node(
    state: GraphState,
    config: EngineConfig
) -> Dict[str, Any]:
    """
    Execute cross-examination tests on bull and bear theses.
    
    This node performs adversarial testing of both theses through five
    structured tests:
    1. Evidence test - quality and verification of supporting evidence
    2. Causality test - soundness of causal logic and reasoning
    3. Timing test - realism of timing and sequencing assumptions
    4. Liquidity test - feasibility of execution in practice
    5. Tail risk test - robustness to extreme scenarios
    
    Each thesis is scored based on how well it withstands these challenges.
    
    Args:
        state: Current workflow state with theses and MBD
        config: Engine configuration
        
    Returns:
        State update with debate_record and audit entry
        
    State Requirements:
        - bull_thesis: Thesis for YES outcome (required)
        - bear_thesis: Thesis for NO outcome (required)
        - mbd: MarketBriefingDocument for context (required)
        
    State Updates:
        - debate_record: DebateRecord with test results and scores
        - audit_log: Audit entry for cross-examination stage
        
    Examples:
        >>> state = {
        ...     "bull_thesis": Thesis(direction="YES", ...),
        ...     "bear_thesis": Thesis(direction="NO", ...),
        ...     "mbd": MarketBriefingDocument(...)
        ... }
        >>> result = await cross_examination_node(state, config)
        >>> assert "debate_record" in result
    """
    start_time = time.time()
    
    # Extract required data from state
    bull_thesis = state.get("bull_thesis")
    bear_thesis = state.get("bear_thesis")
    mbd = state.get("mbd")
    
    # Validate inputs
    if not bull_thesis or not bear_thesis:
        logger.warning("Cross-examination called without both theses")
        return {
            "audit_log": [AuditEntry(
                stage="cross_examination",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "error": "Both bull and bear theses required",
                    "has_bull": bull_thesis is not None,
                    "has_bear": bear_thesis is not None
                }
            )]
        }
    
    if not mbd:
        logger.error("Cross-examination called without MBD")
        return {
            "audit_log": [AuditEntry(
                stage="cross_examination",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "error": "Market Briefing Document not available"
                }
            )]
        }
    
    logger.info("Executing cross-examination of bull and bear theses")
    
    try:
        # Define structured output schema for debate record
        from pydantic import BaseModel, Field
        from typing import List as TypingList
        
        class DebateTestOutput(BaseModel):
            test_type: Literal["evidence", "causality", "timing", "liquidity", "tail-risk"]
            claim: str
            challenge: str
            outcome: Literal["survived", "weakened", "refuted"]
            score: float = Field(ge=-1.0, le=1.0)
        
        class CrossExaminationOutput(BaseModel):
            bull_tests: TypingList[DebateTestOutput] = Field(min_length=5, max_length=5)
            bear_tests: TypingList[DebateTestOutput] = Field(min_length=5, max_length=5)
            bull_score: float = Field(ge=-1.0, le=1.0)
            bear_score: float = Field(ge=-1.0, le=1.0)
            key_disagreements: TypingList[str] = Field(min_length=1, max_length=5)
        
        # Create LLM instance with rotation support and structured output for cross-examination
        from utils.llm_rotation_manager import LLMRotationManager
        
        rotation_manager = None
        if len(config.llm.model_names) > 1:
            model_names_str = ",".join(config.llm.model_names)
            rotation_manager = LLMRotationManager(model_names_str)
            logger.info(f"[cross_examination] Created rotation manager with {len(config.llm.model_names)} models")
        
        llm = create_llm_instance(
            config.llm, 
            rotation_manager=rotation_manager,
            structured_output_model=CrossExaminationOutput
        )
        
        # Define test types
        test_types: List[Literal["evidence", "causality", "timing", "liquidity", "tail-risk"]] = [
            "evidence",
            "causality",
            "timing",
            "liquidity",
            "tail-risk"
        ]
        
        # Prepare context for LLM
        bull_context = create_test_for_thesis(bull_thesis, "evidence", mbd)
        bear_context = create_test_for_thesis(bear_thesis, "evidence", mbd)
        
        # Format prompt with thesis information
        prompt_context = f"""
BULL THESIS (YES):
Direction: {bull_thesis.direction}
Fair Probability: {bull_thesis.fair_probability:.1%}
Market Probability: {bull_thesis.market_probability:.1%}
Edge: {bull_thesis.edge:.1%}
Core Argument: {bull_thesis.core_argument}
Catalysts: {', '.join(bull_thesis.catalysts)}
Failure Conditions: {', '.join(bull_thesis.failure_conditions)}
Supporting Signals: {', '.join(bull_thesis.supporting_signals)}

BEAR THESIS (NO):
Direction: {bear_thesis.direction}
Fair Probability: {bear_thesis.fair_probability:.1%}
Market Probability: {bear_thesis.market_probability:.1%}
Edge: {bear_thesis.edge:.1%}
Core Argument: {bear_thesis.core_argument}
Catalysts: {', '.join(bear_thesis.catalysts)}
Failure Conditions: {', '.join(bear_thesis.failure_conditions)}
Supporting Signals: {', '.join(bear_thesis.supporting_signals)}

MARKET CONTEXT:
Question: {mbd.question}
Event Type: {mbd.event_type}
Current Probability: {mbd.current_probability:.1%}
Liquidity Score: {mbd.liquidity_score}/10
Volatility Regime: {mbd.volatility_regime}
Time to Resolution: {(mbd.expiry_timestamp - int(time.time())) / 86400:.1f} days

Execute all 5 cross-examination tests (evidence, causality, timing, liquidity, tail-risk) for BOTH theses.
For each test, provide: claim, challenge, outcome (survived/weakened/refuted), and score (-1.0/0.0/+1.0).
Then calculate overall scores for each thesis and identify key disagreements.
"""
        
        # Invoke LLM with structured output
        messages = [
            {"role": "system", "content": CROSS_EXAMINATION_PROMPT},
            {"role": "user", "content": prompt_context}
        ]
        
        logger.info("Invoking LLM for cross-examination analysis")
        result = await llm.ainvoke(messages)
        
        # Convert to DebateTest objects
        bull_tests = [
            DebateTest(
                test_type=test.test_type,
                claim=test.claim,
                challenge=test.challenge,
                outcome=test.outcome,
                score=test.score
            )
            for test in result.bull_tests
        ]
        
        bear_tests = [
            DebateTest(
                test_type=test.test_type,
                claim=test.claim,
                challenge=test.challenge,
                outcome=test.outcome,
                score=test.score
            )
            for test in result.bear_tests
        ]
        
        # Combine all tests
        all_tests = bull_tests + bear_tests
        
        # Use LLM-provided scores or calculate if needed
        bull_score = result.bull_score
        bear_score = result.bear_score
        
        # Use LLM-provided disagreements or generate if needed
        key_disagreements = result.key_disagreements
        if not key_disagreements:
            key_disagreements = identify_key_disagreements(
                bull_thesis, bear_thesis, bull_tests, bear_tests
            )
        
        # Create debate record
        debate_record = DebateRecord(
            tests=all_tests,
            bull_score=bull_score,
            bear_score=bear_score,
            key_disagreements=key_disagreements
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        logger.info(
            f"Cross-examination completed in {duration_ms}ms: "
            f"bull_score={bull_score:.2f}, bear_score={bear_score:.2f}, "
            f"disagreements={len(key_disagreements)}"
        )
        
        return {
            "debate_record": debate_record,
            "audit_log": [AuditEntry(
                stage="cross_examination",
                timestamp=int(time.time()),
                status="completed",
                details={
                    "duration_ms": duration_ms,
                    "bull_score": bull_score,
                    "bear_score": bear_score,
                    "bull_tests_passed": sum(1 for t in bull_tests if t.outcome == "survived"),
                    "bear_tests_passed": sum(1 for t in bear_tests if t.outcome == "survived"),
                    "total_tests": len(all_tests),
                    "disagreement_count": len(key_disagreements),
                    "score_difference": abs(bull_score - bear_score)
                }
            )]
        }
    
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"Cross-examination failed after {duration_ms}ms: {e}")
        
        # Create fallback debate record with neutral scores
        fallback_tests = []
        for test_type in test_types:
            # Create neutral test for bull thesis
            fallback_tests.append(DebateTest(
                test_type=test_type,
                claim=f"Bull thesis claim for {test_type}",
                challenge=f"Unable to execute {test_type} test due to error",
                outcome="weakened",
                score=0.0
            ))
            # Create neutral test for bear thesis
            fallback_tests.append(DebateTest(
                test_type=test_type,
                claim=f"Bear thesis claim for {test_type}",
                challenge=f"Unable to execute {test_type} test due to error",
                outcome="weakened",
                score=0.0
            ))
        
        fallback_record = DebateRecord(
            tests=fallback_tests,
            bull_score=0.0,
            bear_score=0.0,
            key_disagreements=[f"Cross-examination error: {str(e)}"]
        )
        
        return {
            "debate_record": fallback_record,
            "audit_log": [AuditEntry(
                stage="cross_examination",
                timestamp=int(time.time()),
                status="failed",
                details={
                    "duration_ms": duration_ms,
                    "error": str(e),
                    "fallback_used": True
                }
            )]
        }


def create_cross_examination_node(config: EngineConfig):
    """
    Factory function to create cross-examination node with dependencies.
    
    Args:
        config: Engine configuration
        
    Returns:
        Async function that takes state and returns state update
        
    Examples:
        >>> config = load_config()
        >>> node = create_cross_examination_node(config)
        >>> result = await node(state)
    """
    async def node(state: GraphState) -> Dict[str, Any]:
        return await cross_examination_node(state, config)
    
    return node
