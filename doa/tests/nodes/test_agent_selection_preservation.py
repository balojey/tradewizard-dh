"""
Preservation property tests for agent selection functionality.

These tests verify that agent selection behavior remains unchanged after the polling agent fix.
IMPORTANT: These tests should PASS on both unfixed and fixed code.

Preservation Requirements (from bugfix.md):
    3.4 - All other agents continue to be selected appropriately for each market type
    3.5 - Agent execution continues to produce individual agent signals with confidence scores
    3.6 - Consensus engine continues to calculate unified probability estimates correctly

This file focuses on 3.4 - verifying agent selection patterns remain unchanged.
"""

import pytest
from hypothesis import given, strategies as st, settings, assume
from typing import List, Set

from nodes.dynamic_agent_selection import (
    select_agents_by_market_type,
    MVP_AGENTS,
    EVENT_INTELLIGENCE_AGENTS,
    POLLING_STATISTICAL_AGENTS,
    SENTIMENT_NARRATIVE_AGENTS,
    PRICE_ACTION_AGENTS,
    EVENT_SCENARIO_AGENTS,
)


# ============================================================================
# Preservation: Election Markets Include Polling Agent (Baseline Behavior)
# ============================================================================

def test_election_markets_include_polling_agent():
    """
    Test that election markets continue to include polling_intelligence agent.
    
    This is EXISTING correct behavior that must be preserved.
    
    EXPECTED OUTCOME ON UNFIXED CODE: Test PASSES (polling agent included)
    EXPECTED OUTCOME ON FIXED CODE: Test PASSES (polling agent still included)
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('election')
    
    # Preservation: Election markets MUST include polling agent
    assert 'polling_intelligence' in agents, (
        "Preservation violated: polling_intelligence missing from election markets"
    )
    assert 'historical_pattern' in agents, (
        "Preservation violated: historical_pattern missing from election markets"
    )


def test_court_markets_include_polling_agent():
    """
    Test that court markets continue to include polling_intelligence agent.
    
    This is EXISTING correct behavior that must be preserved.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('court')
    
    # Preservation: Court markets MUST include polling agent
    assert 'polling_intelligence' in agents, (
        "Preservation violated: polling_intelligence missing from court markets"
    )


def test_economic_markets_include_polling_agent():
    """
    Test that economic markets continue to include polling_intelligence agent.
    
    This is EXISTING correct behavior that must be preserved.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('economic')
    
    # Preservation: Economic markets MUST include polling agent
    assert 'polling_intelligence' in agents, (
        "Preservation violated: polling_intelligence missing from economic markets"
    )


def test_other_markets_include_polling_agent():
    """
    Test that 'other' market type continues to include polling_intelligence agent.
    
    This is EXISTING correct behavior that must be preserved.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('other')
    
    # Preservation: Other markets MUST include polling agent
    assert 'polling_intelligence' in agents, (
        "Preservation violated: polling_intelligence missing from other markets"
    )


# ============================================================================
# Preservation: Event Intelligence Agents Always Included
# ============================================================================

def test_election_markets_include_event_intelligence():
    """
    Test that election markets continue to include event intelligence agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('election')
    
    # Preservation: Event intelligence agents MUST be included
    assert 'breaking_news' in agents, (
        "Preservation violated: breaking_news missing from election markets"
    )
    assert 'event_impact' in agents, (
        "Preservation violated: event_impact missing from election markets"
    )


def test_policy_markets_include_event_intelligence():
    """
    Test that policy markets continue to include event intelligence agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('policy')
    
    # Preservation: Event intelligence agents MUST be included
    assert 'breaking_news' in agents, (
        "Preservation violated: breaking_news missing from policy markets"
    )
    assert 'event_impact' in agents, (
        "Preservation violated: event_impact missing from policy markets"
    )


def test_geopolitical_markets_include_event_intelligence():
    """
    Test that geopolitical markets continue to include event intelligence agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('geopolitical')
    
    # Preservation: Event intelligence agents MUST be included
    assert 'breaking_news' in agents, (
        "Preservation violated: breaking_news missing from geopolitical markets"
    )
    assert 'event_impact' in agents, (
        "Preservation violated: event_impact missing from geopolitical markets"
    )


def test_court_markets_include_event_intelligence():
    """
    Test that court markets continue to include event intelligence agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('court')
    
    # Preservation: Event intelligence agents MUST be included
    assert 'breaking_news' in agents, (
        "Preservation violated: breaking_news missing from court markets"
    )
    assert 'event_impact' in agents, (
        "Preservation violated: event_impact missing from court markets"
    )


# ============================================================================
# Preservation: Sentiment Agents Included for Appropriate Markets
# ============================================================================

def test_election_markets_include_sentiment_agents():
    """
    Test that election markets continue to include sentiment/narrative agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('election')
    
    # Preservation: Sentiment agents MUST be included for elections
    assert 'media_sentiment' in agents, (
        "Preservation violated: media_sentiment missing from election markets"
    )
    assert 'social_sentiment' in agents, (
        "Preservation violated: social_sentiment missing from election markets"
    )
    assert 'narrative_velocity' in agents, (
        "Preservation violated: narrative_velocity missing from election markets"
    )


def test_policy_markets_include_sentiment_agents():
    """
    Test that policy markets continue to include sentiment/narrative agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('policy')
    
    # Preservation: Sentiment agents MUST be included for policy
    assert 'media_sentiment' in agents, (
        "Preservation violated: media_sentiment missing from policy markets"
    )
    assert 'social_sentiment' in agents, (
        "Preservation violated: social_sentiment missing from policy markets"
    )
    assert 'narrative_velocity' in agents, (
        "Preservation violated: narrative_velocity missing from policy markets"
    )


def test_geopolitical_markets_include_sentiment_agents():
    """
    Test that geopolitical markets continue to include sentiment/narrative agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('geopolitical')
    
    # Preservation: Sentiment agents MUST be included for geopolitical
    assert 'media_sentiment' in agents, (
        "Preservation violated: media_sentiment missing from geopolitical markets"
    )
    assert 'social_sentiment' in agents, (
        "Preservation violated: social_sentiment missing from geopolitical markets"
    )
    assert 'narrative_velocity' in agents, (
        "Preservation violated: narrative_velocity missing from geopolitical markets"
    )


# ============================================================================
# Preservation: Event Scenario Agents Included
# ============================================================================

def test_policy_markets_include_event_scenario_agents():
    """
    Test that policy markets continue to include event scenario agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('policy')
    
    # Preservation: Event scenario agents MUST be included
    assert 'catalyst' in agents, (
        "Preservation violated: catalyst missing from policy markets"
    )
    assert 'tail_risk' in agents, (
        "Preservation violated: tail_risk missing from policy markets"
    )


def test_geopolitical_markets_include_event_scenario_agents():
    """
    Test that geopolitical markets continue to include event scenario agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('geopolitical')
    
    # Preservation: Event scenario agents MUST be included
    assert 'catalyst' in agents, (
        "Preservation violated: catalyst missing from geopolitical markets"
    )
    assert 'tail_risk' in agents, (
        "Preservation violated: tail_risk missing from geopolitical markets"
    )


def test_other_markets_include_event_scenario_agents():
    """
    Test that 'other' markets continue to include event scenario agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('other')
    
    # Preservation: Event scenario agents MUST be included
    assert 'catalyst' in agents, (
        "Preservation violated: catalyst missing from other markets"
    )
    assert 'tail_risk' in agents, (
        "Preservation violated: tail_risk missing from other markets"
    )


# ============================================================================
# Preservation: No Duplicate Agents
# ============================================================================

def test_no_duplicate_agents_in_election_markets():
    """
    Test that election markets don't have duplicate agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('election')
    
    # Preservation: No duplicates allowed
    assert len(agents) == len(set(agents)), (
        f"Preservation violated: duplicate agents found in election markets: {agents}"
    )


def test_no_duplicate_agents_in_policy_markets():
    """
    Test that policy markets don't have duplicate agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('policy')
    
    # Preservation: No duplicates allowed
    assert len(agents) == len(set(agents)), (
        f"Preservation violated: duplicate agents found in policy markets: {agents}"
    )


def test_no_duplicate_agents_in_geopolitical_markets():
    """
    Test that geopolitical markets don't have duplicate agents.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type('geopolitical')
    
    # Preservation: No duplicates allowed
    assert len(agents) == len(set(agents)), (
        f"Preservation violated: duplicate agents found in geopolitical markets: {agents}"
    )


# ============================================================================
# Property-Based Test: All Market Types Return Valid Agent Lists
# ============================================================================

@given(
    market_type=st.sampled_from([
        'election', 'court', 'policy', 'economic', 'geopolitical', 'other'
    ])
)
@settings(max_examples=30, deadline=None)
@pytest.mark.property
def test_property_all_market_types_return_valid_agents(market_type):
    """
    Property: For ANY market type, the agent selection function MUST return
    a valid list of agent names with no duplicates.
    
    This property-based test ensures preservation across all market types.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type(market_type)
    
    # Property 1: Must return a list
    assert isinstance(agents, list), (
        f"Preservation violated: agents is not a list for {market_type}"
    )
    
    # Property 2: Must not be empty
    assert len(agents) > 0, (
        f"Preservation violated: no agents selected for {market_type}"
    )
    
    # Property 3: All agents must be strings
    assert all(isinstance(agent, str) for agent in agents), (
        f"Preservation violated: non-string agent found for {market_type}"
    )
    
    # Property 4: No duplicates
    assert len(agents) == len(set(agents)), (
        f"Preservation violated: duplicate agents found for {market_type}: {agents}"
    )
    
    # Property 5: All agents must be from known agent groups
    all_known_agents = set(
        EVENT_INTELLIGENCE_AGENTS +
        POLLING_STATISTICAL_AGENTS +
        SENTIMENT_NARRATIVE_AGENTS +
        PRICE_ACTION_AGENTS +
        EVENT_SCENARIO_AGENTS
    )
    
    for agent in agents:
        assert agent in all_known_agents, (
            f"Preservation violated: unknown agent '{agent}' for {market_type}"
        )


# ============================================================================
# Property-Based Test: Event Intelligence Always Included
# ============================================================================

@given(
    market_type=st.sampled_from([
        'election', 'court', 'policy', 'economic', 'geopolitical', 'other'
    ])
)
@settings(max_examples=30, deadline=None)
@pytest.mark.property
def test_property_event_intelligence_always_included(market_type):
    """
    Property: For ANY market type, event intelligence agents (breaking_news, event_impact)
    MUST be included in the selected agent list.
    
    This is a core preservation requirement - all markets benefit from event intelligence.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type(market_type)
    
    # Property: Event intelligence agents MUST always be included
    assert 'breaking_news' in agents, (
        f"Preservation violated: breaking_news missing from {market_type} markets"
    )
    assert 'event_impact' in agents, (
        f"Preservation violated: event_impact missing from {market_type} markets"
    )


# ============================================================================
# Property-Based Test: Catalyst Always Included (from code observation)
# ============================================================================

@given(
    market_type=st.sampled_from([
        'election', 'court', 'policy', 'economic', 'geopolitical', 'other'
    ])
)
@settings(max_examples=30, deadline=None)
@pytest.mark.property
def test_property_catalyst_always_included(market_type):
    """
    Property: For ANY market type, catalyst agent MUST be included.
    
    Observation from unfixed code: The function has logic to ensure catalyst
    is always included if not already present.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type(market_type)
    
    # Property: Catalyst MUST always be included (from code observation)
    assert 'catalyst' in agents, (
        f"Preservation violated: catalyst missing from {market_type} markets"
    )


# ============================================================================
# Property-Based Test: Specific Market Type Patterns
# ============================================================================

@given(
    # Generate election-like market types
    market_type=st.just('election')
)
@settings(max_examples=10, deadline=None)
@pytest.mark.property
def test_property_election_markets_have_polling_and_sentiment(market_type):
    """
    Property: Election markets MUST include both polling and sentiment agents.
    
    This is a critical preservation requirement for election market analysis.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type(market_type)
    
    # Property: Election markets MUST have polling agents
    assert 'polling_intelligence' in agents, (
        "Preservation violated: polling_intelligence missing from election markets"
    )
    assert 'historical_pattern' in agents, (
        "Preservation violated: historical_pattern missing from election markets"
    )
    
    # Property: Election markets MUST have sentiment agents
    assert 'media_sentiment' in agents, (
        "Preservation violated: media_sentiment missing from election markets"
    )
    assert 'social_sentiment' in agents, (
        "Preservation violated: social_sentiment missing from election markets"
    )
    assert 'narrative_velocity' in agents, (
        "Preservation violated: narrative_velocity missing from election markets"
    )


@given(
    market_type=st.sampled_from(['policy', 'geopolitical'])
)
@settings(max_examples=20, deadline=None)
@pytest.mark.property
def test_property_policy_geopolitical_have_sentiment_and_scenario(market_type):
    """
    Property: Policy and geopolitical markets MUST include sentiment and scenario agents.
    
    This is existing behavior that must be preserved.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type(market_type)
    
    # Property: Must have sentiment agents
    assert 'media_sentiment' in agents, (
        f"Preservation violated: media_sentiment missing from {market_type} markets"
    )
    assert 'social_sentiment' in agents, (
        f"Preservation violated: social_sentiment missing from {market_type} markets"
    )
    assert 'narrative_velocity' in agents, (
        f"Preservation violated: narrative_velocity missing from {market_type} markets"
    )
    
    # Property: Must have event scenario agents
    assert 'catalyst' in agents, (
        f"Preservation violated: catalyst missing from {market_type} markets"
    )
    assert 'tail_risk' in agents, (
        f"Preservation violated: tail_risk missing from {market_type} markets"
    )


# ============================================================================
# Property-Based Test: Agent Count Consistency
# ============================================================================

@given(
    market_type=st.sampled_from([
        'election', 'court', 'policy', 'economic', 'geopolitical', 'other'
    ])
)
@settings(max_examples=30, deadline=None)
@pytest.mark.property
def test_property_agent_count_reasonable(market_type):
    """
    Property: For ANY market type, the number of selected agents MUST be
    within a reasonable range (at least 3, at most 15).
    
    This ensures the fix doesn't accidentally break agent selection logic.
    
    EXPECTED OUTCOME: Test PASSES on both unfixed and fixed code
    
    **Validates: Requirements 3.4**
    """
    agents = select_agents_by_market_type(market_type)
    
    # Property: Reasonable agent count
    assert len(agents) >= 3, (
        f"Preservation violated: too few agents ({len(agents)}) for {market_type}"
    )
    assert len(agents) <= 15, (
        f"Preservation violated: too many agents ({len(agents)}) for {market_type}"
    )


# ============================================================================
# Observation Test: Document Current Behavior for All Market Types
# ============================================================================

def test_observe_all_market_type_behaviors():
    """
    Observation test: Document the exact agent selection for each market type
    on UNFIXED code. This serves as a baseline for preservation.
    
    EXPECTED OUTCOME: Test PASSES on unfixed code, documents baseline behavior
    
    **Validates: Requirements 3.4**
    """
    market_types = ['election', 'court', 'policy', 'economic', 'geopolitical', 'other']
    
    observations = {}
    for market_type in market_types:
        agents = select_agents_by_market_type(market_type)
        observations[market_type] = sorted(agents)
    
    # Document observations (these should remain consistent after fix)
    print("\n=== BASELINE AGENT SELECTION OBSERVATIONS ===")
    for market_type, agents in observations.items():
        print(f"\n{market_type.upper()} markets ({len(agents)} agents):")
        for agent in agents:
            print(f"  - {agent}")
    
    # Basic assertions to ensure test passes
    for market_type, agents in observations.items():
        assert len(agents) > 0, f"No agents selected for {market_type}"
        assert 'breaking_news' in agents, f"breaking_news missing from {market_type}"
        assert 'event_impact' in agents, f"event_impact missing from {market_type}"
