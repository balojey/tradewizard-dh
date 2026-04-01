"""Tests for dynamic agent selection node."""

import pytest
from unittest.mock import Mock
from typing import Dict, Any

from nodes.dynamic_agent_selection import (
    select_agents_by_market_type,
    apply_configuration_filters,
    filter_by_data_availability,
    apply_cost_optimization,
    dynamic_agent_selection_node,
    MVP_AGENTS,
    EVENT_INTELLIGENCE_AGENTS,
    POLLING_STATISTICAL_AGENTS,
    SENTIMENT_NARRATIVE_AGENTS,
    PRICE_ACTION_AGENTS,
    EVENT_SCENARIO_AGENTS,
)
from models.types import MarketBriefingDocument
from config import EngineConfig, AgentConfig, ConsensusConfig


class TestSelectAgentsByMarketType:
    """Test market type-based agent selection."""
    
    def test_election_market_type(self):
        """Election markets should get polling, sentiment, and event intelligence agents."""
        agents = select_agents_by_market_type('election')
        
        # Should include polling agents
        assert 'polling_intelligence' in agents
        assert 'historical_pattern' in agents
        
        # Should include sentiment agents
        assert 'media_sentiment' in agents
        assert 'social_sentiment' in agents
        assert 'narrative_velocity' in agents
        
        # Should include event intelligence agents
        assert 'breaking_news' in agents
        assert 'event_impact' in agents
    
    def test_policy_market_includes_polling_agent(self):
        """
        Bug Condition Exploration Test - Property 1: Fault Condition
        
        **Validates: Requirements 2.3**
        
        IMPORTANT: This test encodes the EXPECTED behavior (polling agent should be included).
        On UNFIXED code, this test will FAIL because polling_intelligence is excluded.
        After the fix is implemented, this test will PASS.
        
        Test that policy markets include polling_intelligence agent.
        Polling data provides valuable insights for policy markets (public opinion, approval ratings).
        """
        agents = select_agents_by_market_type('policy')
        
        # EXPECTED: polling_intelligence should be included for policy markets
        # ACTUAL (unfixed): polling_intelligence is NOT in the agent list
        assert 'polling_intelligence' in agents, (
            f"Bug confirmed: polling_intelligence not in policy market agents. "
            f"Agents returned: {agents}"
        )
    
    def test_geopolitical_market_includes_polling_agent(self):
        """
        Bug Condition Exploration Test - Property 1: Fault Condition
        
        **Validates: Requirements 2.3**
        
        IMPORTANT: This test encodes the EXPECTED behavior (polling agent should be included).
        On UNFIXED code, this test will FAIL because polling_intelligence is excluded.
        After the fix is implemented, this test will PASS.
        
        Test that geopolitical markets include polling_intelligence agent.
        Polling data provides valuable insights for geopolitical markets (public sentiment, international opinion).
        """
        agents = select_agents_by_market_type('geopolitical')
        
        # EXPECTED: polling_intelligence should be included for geopolitical markets
        # ACTUAL (unfixed): polling_intelligence is NOT in the agent list
        assert 'polling_intelligence' in agents, (
            f"Bug confirmed: polling_intelligence not in geopolitical market agents. "
            f"Agents returned: {agents}"
        )
    
    def test_court_market_type(self):
        """Court markets should get event intelligence and historical pattern agents."""
        agents = select_agents_by_market_type('court')
        
        assert 'breaking_news' in agents
        assert 'event_impact' in agents
        assert 'polling_intelligence' in agents
        assert 'historical_pattern' in agents
    
    def test_policy_market_type(self):
        """Policy markets should get event intelligence, sentiment, and catalyst agents."""
        agents = select_agents_by_market_type('policy')
        
        assert 'breaking_news' in agents
        assert 'event_impact' in agents
        assert 'media_sentiment' in agents
        assert 'catalyst' in agents
        assert 'tail_risk' in agents
    
    def test_other_market_type(self):
        """Unknown market types should get all available agents."""
        agents = select_agents_by_market_type('other')
        
        # Should include agents from all categories
        assert len(agents) > 10
        assert 'breaking_news' in agents
        assert 'polling_intelligence' in agents
        assert 'media_sentiment' in agents
        assert 'momentum' in agents
        assert 'catalyst' in agents


class TestApplyConfigurationFilters:
    """Test configuration-based filtering."""
    
    def test_all_enabled(self):
        """When all agent groups are enabled, no filtering should occur."""
        config = AgentConfig(
            timeout_ms=30000,
            max_retries=3,
            enable_mvp_agents=True,
            enable_event_intelligence=True,
            enable_polling_statistical=True,
            enable_sentiment_narrative=True,
            enable_price_action=True,
            enable_event_scenario=True,
        )
        
        agents = list(EVENT_INTELLIGENCE_AGENTS) + list(POLLING_STATISTICAL_AGENTS)
        filtered = apply_configuration_filters(agents, config)
        
        assert len(filtered) == len(agents)
        assert set(filtered) == set(agents)
    
    def test_event_intelligence_disabled(self):
        """When event intelligence is disabled, those agents should be filtered out."""
        config = AgentConfig(
            timeout_ms=30000,
            max_retries=3,
            enable_mvp_agents=True,
            enable_event_intelligence=False,
            enable_polling_statistical=True,
            enable_sentiment_narrative=True,
            enable_price_action=True,
            enable_event_scenario=True,
        )
        
        agents = ['breaking_news', 'event_impact', 'polling_intelligence']
        filtered = apply_configuration_filters(agents, config)
        
        assert 'breaking_news' not in filtered
        assert 'event_impact' not in filtered
        assert 'polling_intelligence' in filtered
    
    def test_multiple_groups_disabled(self):
        """When multiple groups are disabled, all should be filtered."""
        config = AgentConfig(
            timeout_ms=30000,
            max_retries=3,
            enable_mvp_agents=True,
            enable_event_intelligence=False,
            enable_polling_statistical=False,
            enable_sentiment_narrative=True,
            enable_price_action=True,
            enable_event_scenario=True,
        )
        
        agents = [
            'breaking_news',
            'polling_intelligence',
            'media_sentiment',
            'momentum'
        ]
        filtered = apply_configuration_filters(agents, config)
        
        assert 'breaking_news' not in filtered
        assert 'polling_intelligence' not in filtered
        assert 'media_sentiment' in filtered
        assert 'momentum' in filtered


class TestFilterByDataAvailability:
    """Test data availability filtering."""
    
    def test_news_available(self):
        """When news is available, event intelligence agents should be included."""
        mbd = Mock(spec=MarketBriefingDocument)
        mbd.volume_24h = 10000
        
        agents = ['breaking_news', 'event_impact', 'polling_intelligence', 'historical_pattern']
        filtered = filter_by_data_availability(
            agents, mbd, news_available=True, polling_available=False
        )
        
        assert 'breaking_news' in filtered
        assert 'event_impact' in filtered
        # polling_intelligence is autonomous and should be included even without polling data
        assert 'polling_intelligence' in filtered
        # historical_pattern requires pre-fetched polling data
        assert 'historical_pattern' not in filtered
    
    def test_news_unavailable(self):
        """When news is unavailable, event intelligence agents should be filtered."""
        mbd = Mock(spec=MarketBriefingDocument)
        mbd.volume_24h = 10000
        
        agents = ['breaking_news', 'event_impact', 'momentum']
        filtered = filter_by_data_availability(
            agents, mbd, news_available=False
        )
        
        assert 'breaking_news' not in filtered
        assert 'event_impact' not in filtered
        assert 'momentum' in filtered
    
    def test_low_volume_filters_price_action(self):
        """Low volume markets should filter out price action agents."""
        mbd = Mock(spec=MarketBriefingDocument)
        mbd.volume_24h = 500  # Below 1000 threshold
        
        agents = ['momentum', 'mean_reversion', 'breaking_news']
        filtered = filter_by_data_availability(
            agents, mbd, news_available=True
        )
        
        assert 'momentum' not in filtered
        assert 'mean_reversion' not in filtered
        assert 'breaking_news' in filtered


class TestApplyCostOptimization:
    """Test cost optimization filtering."""
    
    def test_no_limit(self):
        """When no limit is set, all agents should be selected."""
        agents = ['agent1', 'agent2', 'agent3']
        result = apply_cost_optimization(agents, max_agents=None)
        
        assert result['selected_agents'] == agents
        assert result['skipped_agents'] == []
        assert result['optimization_applied'] is False
    
    def test_under_limit(self):
        """When under limit, all agents should be selected."""
        agents = ['agent1', 'agent2']
        result = apply_cost_optimization(agents, max_agents=5)
        
        assert result['selected_agents'] == agents
        assert result['skipped_agents'] == []
        assert result['optimization_applied'] is False
    
    def test_over_limit(self):
        """When over limit, agents should be prioritized."""
        agents = [
            'breaking_news',  # Event intelligence (high priority)
            'polling_intelligence',  # Polling (medium priority)
            'momentum',  # Price action (low priority)
            'media_sentiment',  # Sentiment (medium priority)
        ]
        result = apply_cost_optimization(agents, max_agents=2)
        
        assert len(result['selected_agents']) == 2
        assert len(result['skipped_agents']) == 2
        assert result['optimization_applied'] is True
        
        # Event intelligence should be prioritized
        assert 'breaking_news' in result['selected_agents']


@pytest.mark.asyncio
class TestDynamicAgentSelectionNode:
    """Test the main dynamic agent selection node."""
    
    async def test_successful_selection(self):
        """Test successful agent selection with all steps."""
        # Create mock MBD
        mbd = Mock(spec=MarketBriefingDocument)
        mbd.question = "Will Trump win 2024?"
        mbd.event_type = "election"
        mbd.volume_24h = 50000
        
        # Create config
        config = Mock(spec=EngineConfig)
        config.agents = AgentConfig(
            timeout_ms=30000,
            max_retries=3,
            enable_mvp_agents=True,
            enable_event_intelligence=True,
            enable_polling_statistical=True,
            enable_sentiment_narrative=True,
            enable_price_action=True,
            enable_event_scenario=True,
        )
        config.agents.max_advanced_agents = 10
        config.consensus = ConsensusConfig(
            min_agents_required=3,
            min_edge_threshold=0.05,
            disagreement_threshold=0.15,
            confidence_band_multiplier=1.5,
        )
        
        # Create state
        state = {"mbd": mbd}
        
        # Execute node
        result = await dynamic_agent_selection_node(state, config)
        
        # Verify results
        assert "active_agents" in result
        assert "audit_log" in result
        assert len(result["active_agents"]) >= 3
        
        # MVP agents should be included
        assert 'market_microstructure' in result["active_agents"]
        assert 'probability_baseline' in result["active_agents"]
        assert 'risk_assessment' in result["active_agents"]
        
        # Audit log should be present
        assert len(result["audit_log"]) == 1
        assert result["audit_log"][0].stage == "dynamic_agent_selection"
        assert result["audit_log"][0].status == "completed"
    
    async def test_missing_mbd(self):
        """Test handling of missing MBD."""
        config = Mock(spec=EngineConfig)
        state = {}  # No MBD
        
        result = await dynamic_agent_selection_node(state, config)
        
        assert result["active_agents"] == []
        assert result["audit_log"][0].status == "failed"
        assert "Missing market briefing document" in result["audit_log"][0].details["error"]
    
    async def test_fallback_on_error(self):
        """Test fallback to MVP agents on error."""
        # Create config that will cause an error
        config = Mock(spec=EngineConfig)
        config.agents = AgentConfig(
            timeout_ms=30000,
            max_retries=3,
            enable_mvp_agents=True,
            enable_event_intelligence=True,
            enable_polling_statistical=True,
            enable_sentiment_narrative=True,
            enable_price_action=True,
            enable_event_scenario=True,
        )
        config.consensus = Mock()
        config.consensus.min_agents_required = 3
        
        # Create MBD with invalid attribute access to trigger exception
        mbd = Mock(spec=MarketBriefingDocument)
        # Make event_type raise an exception when accessed
        type(mbd).event_type = property(lambda self: (_ for _ in ()).throw(ValueError("Test error")))
        mbd.question = "Test"
        
        state = {"mbd": mbd}
        
        # Execute node - should not raise exception
        result = await dynamic_agent_selection_node(state, config)
        
        # Should fallback to MVP agents
        assert len(result["active_agents"]) == 3
        assert set(result["active_agents"]) == set(MVP_AGENTS)
        assert result["audit_log"][0].status == "failed"
