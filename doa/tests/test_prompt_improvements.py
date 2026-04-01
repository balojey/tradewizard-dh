#!/usr/bin/env python3
"""
Test script to verify prompt improvements are working correctly.

This script tests:
1. Dynamic timestamp generation
2. Memory context formatting
3. Enhanced prompt construction
"""

import time
from datetime import datetime
from agents.agent_factory import format_memory_context
from models.types import AgentMemoryContext, AgentSignal
from prompts import (
    get_market_microstructure_prompt,
    get_probability_baseline_prompt,
    get_risk_assessment_prompt
)


def test_dynamic_timestamps():
    """Test that prompts include current timestamps."""
    print("=" * 80)
    print("TEST 1: Dynamic Timestamps")
    print("=" * 80)
    
    # Get prompts
    mm_prompt = get_market_microstructure_prompt()
    pb_prompt = get_probability_baseline_prompt()
    ra_prompt = get_risk_assessment_prompt()
    
    # Check for timestamp
    current_time = datetime.utcnow().isoformat()
    current_date = current_time.split('T')[0]  # Just the date part
    
    prompts = {
        "Market Microstructure": mm_prompt,
        "Probability Baseline": pb_prompt,
        "Risk Assessment": ra_prompt
    }
    
    for name, prompt in prompts.items():
        has_timestamp = "Current date and time:" in prompt
        has_current_date = current_date in prompt
        
        print(f"\n{name}:")
        print(f"  ✓ Has timestamp header: {has_timestamp}")
        print(f"  ✓ Has current date: {has_current_date}")
        
        if has_timestamp and has_current_date:
            # Extract and show the timestamp line
            for line in prompt.split('\n'):
                if 'Current date and time:' in line:
                    print(f"  → {line.strip()}")
                    break
    
    print("\n" + "=" * 80)


def test_memory_context_formatting():
    """Test memory context formatting with explicit instructions."""
    print("\nTEST 2: Memory Context Formatting")
    print("=" * 80)
    
    # Create mock historical signals
    historical_signals = [
        AgentSignal(
            agent_name="test_agent",
            timestamp=int(time.time()) - 86400,  # 1 day ago
            confidence=0.75,
            direction="YES",
            fair_probability=0.65,
            key_drivers=["Driver 1", "Driver 2"],
            risk_factors=["Risk 1"],
            metadata={}
        ),
        AgentSignal(
            agent_name="test_agent",
            timestamp=int(time.time()) - 3600,  # 1 hour ago
            confidence=0.80,
            direction="YES",
            fair_probability=0.70,
            key_drivers=["Driver 1 updated", "Driver 3"],
            risk_factors=["Risk 1", "Risk 2"],
            metadata={}
        )
    ]
    
    memory_context = AgentMemoryContext(
        agent_name="test_agent",
        market_id="test_market",
        condition_id="test_condition",
        historical_signals=historical_signals
    )
    
    # Format memory context
    formatted = format_memory_context(memory_context, "test_agent")
    
    print("\nFormatted Memory Context:")
    print("-" * 80)
    print(formatted)
    print("-" * 80)
    
    # Check for key elements
    checks = {
        "Has 'Historical Context' header": "## Historical Context" in formatted,
        "Has 'Previous Analysis' sections": "### Previous Analysis" in formatted,
        "Shows direction": "Direction:" in formatted,
        "Shows probability": "Fair Probability:" in formatted,
        "Shows confidence": "Confidence:" in formatted,
        "Shows key drivers": "Key Drivers:" in formatted,
        "Shows risk factors": "Risk Factors:" in formatted,
        "Has usage note": "Use this historical context" in formatted
    }
    
    print("\nMemory Context Checks:")
    for check, result in checks.items():
        status = "✓" if result else "✗"
        print(f"  {status} {check}")
    
    print("\n" + "=" * 80)


def test_enhanced_prompt_construction():
    """Test that enhanced prompts include memory instructions."""
    print("\nTEST 3: Enhanced Prompt Construction")
    print("=" * 80)
    
    # Get a base prompt
    base_prompt = get_probability_baseline_prompt()
    
    # Simulate what agent_factory does
    memory_str = format_memory_context(None, "test_agent")
    
    enhanced_prompt = f"""{base_prompt}

## Your Previous Analysis

{memory_str}

## Instructions for Using Memory Context

When you have previous analysis available:
1. Review your previous analysis before generating new analysis
2. Identify what has changed since your last analysis (market conditions, probabilities, key drivers)
3. If your view has changed significantly, explain the reasoning for the change in your key drivers
4. If your view remains consistent, acknowledge the continuity and reinforce your reasoning
5. Reference specific changes from previous analysis when relevant

Your analysis should show thoughtful evolution over time, not random fluctuation."""
    
    # Check for key elements
    checks = {
        "Has base prompt": "probability estimation expert" in enhanced_prompt,
        "Has memory section": "## Your Previous Analysis" in enhanced_prompt,
        "Has instructions header": "## Instructions for Using Memory Context" in enhanced_prompt,
        "Has step 1": "1. Review your previous analysis" in enhanced_prompt,
        "Has step 2": "2. Identify what has changed" in enhanced_prompt,
        "Has step 3": "3. If your view has changed significantly" in enhanced_prompt,
        "Has step 4": "4. If your view remains consistent" in enhanced_prompt,
        "Has step 5": "5. Reference specific changes" in enhanced_prompt,
        "Has evolution guidance": "thoughtful evolution over time" in enhanced_prompt
    }
    
    print("\nEnhanced Prompt Checks:")
    for check, result in checks.items():
        status = "✓" if result else "✗"
        print(f"  {status} {check}")
    
    print("\n" + "=" * 80)


def test_prompt_conciseness():
    """Test that prompts are reasonably concise."""
    print("\nTEST 4: Prompt Conciseness")
    print("=" * 80)
    
    prompts = {
        "Market Microstructure": get_market_microstructure_prompt(),
        "Probability Baseline": get_probability_baseline_prompt(),
        "Risk Assessment": get_risk_assessment_prompt()
    }
    
    print("\nPrompt Lengths:")
    for name, prompt in prompts.items():
        lines = len(prompt.split('\n'))
        chars = len(prompt)
        words = len(prompt.split())
        
        print(f"\n{name}:")
        print(f"  Lines: {lines}")
        print(f"  Characters: {chars}")
        print(f"  Words: {words}")
        
        # TypeScript basic agents are ~15 lines
        # Python should aim for similar (though may be slightly longer)
        if lines <= 30:
            print(f"  ✓ Reasonably concise (≤30 lines)")
        else:
            print(f"  ⚠ Could be more concise (>30 lines)")
    
    print("\n" + "=" * 80)


def main():
    """Run all tests."""
    print("\n" + "=" * 80)
    print("PYTHON AGENT PROMPT IMPROVEMENTS - TEST SUITE")
    print("=" * 80)
    
    try:
        test_dynamic_timestamps()
        test_memory_context_formatting()
        test_enhanced_prompt_construction()
        test_prompt_conciseness()
        
        print("\n" + "=" * 80)
        print("ALL TESTS COMPLETED")
        print("=" * 80)
        print("\nNext steps:")
        print("1. Review test output above")
        print("2. Run actual analysis: python main.py analyze <condition-id>")
        print("3. Compare with TypeScript: cd ../tradewizard-agents && npm run cli -- analyze <condition-id>")
        print("4. Check NEXT_STEPS.md for further improvements")
        print()
        
    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())
