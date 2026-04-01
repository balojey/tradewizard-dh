/**
 * Dynamic Agent Selection Node
 *
 * This LangGraph node determines which agents to activate based on:
 * - Market type (election, court, policy, etc.)
 * - Data availability (external data sources)
 * - Configuration (enabled/disabled agent groups)
 * - Cost optimization (budget constraints)
 */

import type { GraphStateType } from '../models/state.js';
import type { EngineConfig } from '../config/index.js';
import type { DataIntegrationLayer } from '../utils/data-integration.js';
import type { EventType } from '../models/types.js';
import {
  applyCostOptimization,
  createCostOptimizationAuditEntry,
} from '../utils/cost-optimization.js';

/**
 * Agent name constants
 */
export const MVP_AGENTS = [
  'market_microstructure',
  'probability_baseline',
  'risk_assessment',
] as const;

export const EVENT_INTELLIGENCE_AGENTS = ['breaking_news', 'event_impact'] as const;

export const POLLING_STATISTICAL_AGENTS = [
  'polling_intelligence',
  'historical_pattern',
] as const;

export const SENTIMENT_NARRATIVE_AGENTS = [
  'media_sentiment',
  'social_sentiment',
  'narrative_velocity',
] as const;

export const PRICE_ACTION_AGENTS = ['momentum', 'mean_reversion'] as const;

export const EVENT_SCENARIO_AGENTS = ['catalyst', 'tail_risk'] as const;

export const RISK_PHILOSOPHY_AGENTS = ['aggressive', 'conservative', 'neutral'] as const;

/**
 * Dynamic Agent Selection Node
 *
 * Selects which agents to activate based on market context and configuration.
 *
 * @param state - Current graph state
 * @param config - Engine configuration
 * @param dataLayer - Data integration layer for availability checks
 * @returns Partial state update with activeAgents and audit log
 */
export async function dynamicAgentSelectionNode(
  state: GraphStateType,
  config: EngineConfig,
  dataLayer: DataIntegrationLayer
): Promise<Partial<GraphStateType>> {
  const startTime = Date.now();
  const { mbd } = state;

  // If no MBD, cannot select agents
  if (!mbd) {
    return {
      activeAgents: [],
      auditLog: [
        {
          stage: 'dynamic_agent_selection',
          timestamp: Date.now(),
          data: {
            success: false,
            reason: 'No Market Briefing Document available',
            duration: Date.now() - startTime,
          },
        },
      ],
    };
  }

  // Start with MVP agents (always active)
  const activeAgents: string[] = [...MVP_AGENTS];

  // Track selection decisions for audit log
  const selectionDecisions: Record<string, string> = {
    mvp_agents: 'Always active',
  };

  // ============================================================================
  // Step 1: Market Type-Based Agent Selection
  // ============================================================================

  const marketTypeAgents = selectAgentsByMarketType(mbd.eventType);
  selectionDecisions.market_type = `Market type: ${mbd.eventType}, suggested agents: ${marketTypeAgents.join(', ')}`;

  // ============================================================================
  // Step 2: Configuration-Based Filtering
  // ============================================================================

  const configFilteredAgents = applyConfigurationFilters(marketTypeAgents, config);
  selectionDecisions.configuration_filter = `After config filter: ${configFilteredAgents.join(', ')}`;

  // ============================================================================
  // Step 3: Data Availability Filtering
  // ============================================================================

  const dataAvailableAgents = await filterByDataAvailability(
    configFilteredAgents,
    dataLayer,
    mbd
  );
  selectionDecisions.data_availability = `After data availability check: ${dataAvailableAgents.join(', ')}`;

  // ============================================================================
  // Step 4: Cost Optimization Filtering
  // ============================================================================

  const costOptimizationResult = applyCostOptimization(dataAvailableAgents, config);
  
  selectionDecisions.cost_optimization = 
    `Budget: $${costOptimizationResult.maxCost.toFixed(2)}, ` +
    `Estimated: $${costOptimizationResult.estimatedCost.toFixed(2)}, ` +
    `Selected: ${costOptimizationResult.selectedAgents.length}, ` +
    `Skipped: ${costOptimizationResult.skippedAgents.length}`;

  // Add cost-optimized agents to active list
  activeAgents.push(...costOptimizationResult.selectedAgents);

  // ============================================================================
  // Return State Update
  // ============================================================================

  return {
    activeAgents,
    auditLog: [
      {
        stage: 'dynamic_agent_selection',
        timestamp: Date.now(),
        data: {
          success: true,
          marketType: mbd.eventType,
          marketId: mbd.marketId,
          selectedAgents: activeAgents,
          agentCount: activeAgents.length,
          mvpAgentCount: MVP_AGENTS.length,
          advancedAgentCount: activeAgents.length - MVP_AGENTS.length,
          selectionDecisions,
          costOptimization: createCostOptimizationAuditEntry(costOptimizationResult),
          duration: Date.now() - startTime,
        },
      },
    ],
  };
}

/**
 * Select agents based on market type
 *
 * Different market types benefit from different agent specializations:
 * - Election: Polling, sentiment, narrative agents
 * - Court: Event intelligence, polling, historical pattern agents
 * - Policy: Event intelligence, polling, sentiment, catalyst agents
 * - Economic: Event intelligence, polling, historical pattern agents
 * - Geopolitical: Event intelligence, polling, sentiment, catalyst agents
 * - Other: All available agents
 *
 * Note: Polling intelligence is valuable for all market types as it provides
 * insights into public opinion, statistical patterns, and historical trends.
 *
 * @param eventType - Market event type
 * @returns Array of agent names appropriate for this market type
 */
function selectAgentsByMarketType(eventType: EventType): string[] {
  const agents: string[] = [];

  switch (eventType) {
    case 'election':
      // Elections benefit from polling data and sentiment analysis
      agents.push(
        ...POLLING_STATISTICAL_AGENTS,
        ...SENTIMENT_NARRATIVE_AGENTS,
        ...EVENT_INTELLIGENCE_AGENTS
      );
      break;

    case 'court':
      // Court cases benefit from event intelligence and historical patterns
      agents.push(...EVENT_INTELLIGENCE_AGENTS, ...POLLING_STATISTICAL_AGENTS);
      break;

    case 'policy':
      // Policy markets benefit from event intelligence, polling, sentiment, and catalysts
      agents.push(
        ...EVENT_INTELLIGENCE_AGENTS,
        ...POLLING_STATISTICAL_AGENTS,
        ...SENTIMENT_NARRATIVE_AGENTS,
        ...EVENT_SCENARIO_AGENTS
      );
      break;

    case 'economic':
      // Economic markets benefit from event intelligence and historical patterns
      agents.push(...EVENT_INTELLIGENCE_AGENTS, ...POLLING_STATISTICAL_AGENTS);
      break;

    case 'geopolitical':
      // Geopolitical markets benefit from event intelligence, polling, sentiment, and catalysts
      agents.push(
        ...EVENT_INTELLIGENCE_AGENTS,
        ...POLLING_STATISTICAL_AGENTS,
        ...SENTIMENT_NARRATIVE_AGENTS,
        ...EVENT_SCENARIO_AGENTS
      );
      break;

    case 'other':
    default:
      // Unknown market types get all available agents
      agents.push(
        ...EVENT_INTELLIGENCE_AGENTS,
        ...POLLING_STATISTICAL_AGENTS,
        ...SENTIMENT_NARRATIVE_AGENTS,
        ...PRICE_ACTION_AGENTS,
        ...EVENT_SCENARIO_AGENTS
      );
      break;
  }

  // Always consider event scenario agents
  if (!agents.includes('catalyst')) {
    agents.push(...EVENT_SCENARIO_AGENTS);
  }

  return agents;
}

/**
 * Apply configuration-based filtering
 *
 * Removes agents that are disabled in configuration.
 *
 * @param agents - Candidate agent names
 * @param config - Engine configuration
 * @returns Filtered agent names
 */
function applyConfigurationFilters(agents: string[], config: EngineConfig): string[] {
  const filtered: string[] = [];

  for (const agent of agents) {
    // Check if agent's group is enabled
    if (EVENT_INTELLIGENCE_AGENTS.includes(agent as any)) {
      if (!config.advancedAgents.eventIntelligence.enabled) continue;
      if (agent === 'breaking_news' && !config.advancedAgents.eventIntelligence.breakingNews)
        continue;
      if (agent === 'event_impact' && !config.advancedAgents.eventIntelligence.eventImpact)
        continue;
    } else if (POLLING_STATISTICAL_AGENTS.includes(agent as any)) {
      if (!config.advancedAgents.pollingStatistical.enabled) continue;
      if (
        agent === 'polling_intelligence' &&
        !config.advancedAgents.pollingStatistical.pollingIntelligence
      )
        continue;
      if (
        agent === 'historical_pattern' &&
        !config.advancedAgents.pollingStatistical.historicalPattern
      )
        continue;
    } else if (SENTIMENT_NARRATIVE_AGENTS.includes(agent as any)) {
      if (!config.advancedAgents.sentimentNarrative.enabled) continue;
      if (agent === 'media_sentiment' && !config.advancedAgents.sentimentNarrative.mediaSentiment)
        continue;
      if (
        agent === 'social_sentiment' &&
        !config.advancedAgents.sentimentNarrative.socialSentiment
      )
        continue;
      if (
        agent === 'narrative_velocity' &&
        !config.advancedAgents.sentimentNarrative.narrativeVelocity
      )
        continue;
    } else if (PRICE_ACTION_AGENTS.includes(agent as any)) {
      if (!config.advancedAgents.priceAction.enabled) continue;
      if (agent === 'momentum' && !config.advancedAgents.priceAction.momentum) continue;
      if (agent === 'mean_reversion' && !config.advancedAgents.priceAction.meanReversion)
        continue;
    } else if (EVENT_SCENARIO_AGENTS.includes(agent as any)) {
      if (!config.advancedAgents.eventScenario.enabled) continue;
      if (agent === 'catalyst' && !config.advancedAgents.eventScenario.catalyst) continue;
      if (agent === 'tail_risk' && !config.advancedAgents.eventScenario.tailRisk) continue;
    }

    filtered.push(agent);
  }

  return filtered;
}

/**
 * Filter agents by data availability
 *
 * Removes agents whose required data sources are unavailable.
 *
 * @param agents - Candidate agent names
 * @param dataLayer - Data integration layer
 * @param mbd - Market briefing document
 * @returns Filtered agent names
 */
async function filterByDataAvailability(
  agents: string[],
  dataLayer: DataIntegrationLayer,
  mbd: any
): Promise<string[]> {
  const filtered: string[] = [];

  // Check data availability
  const newsAvailable = await dataLayer.checkDataAvailability('news');
  const pollingAvailable = await dataLayer.checkDataAvailability('polling');
  const socialAvailable = await dataLayer.checkDataAvailability('social');

  for (const agent of agents) {
    let shouldInclude = true;

    // Event intelligence agents require news data
    if (EVENT_INTELLIGENCE_AGENTS.includes(agent as any)) {
      if (!newsAvailable) {
        shouldInclude = false;
      }
    }

    // Polling intelligence agent is autonomous and fetches its own data
    // No longer filtered by external polling data availability
    // (kept for historical_pattern which may still need pre-fetched data)
    if (agent === 'historical_pattern') {
      if (!pollingAvailable) {
        shouldInclude = false;
      }
    }

    // Sentiment agents require news or social data
    if (SENTIMENT_NARRATIVE_AGENTS.includes(agent as any)) {
      if (!newsAvailable && !socialAvailable) {
        shouldInclude = false;
      }
    }

    // Price action agents require sufficient trading history
    if (PRICE_ACTION_AGENTS.includes(agent as any)) {
      // Check if market has sufficient volume and history
      if (mbd.volume24h < 1000) {
        shouldInclude = false;
      }
    }

    if (shouldInclude) {
      filtered.push(agent);
    }
  }

  return filtered;
}

/**
 * Create a dynamic agent selection node with bound dependencies
 *
 * This factory function creates a node function that can be added to the LangGraph.
 *
 * @param config - Engine configuration
 * @param dataLayer - Data integration layer
 * @returns Node function for LangGraph
 */
export function createDynamicAgentSelectionNode(
  config: EngineConfig,
  dataLayer: DataIntegrationLayer
) {
  return async (state: GraphStateType): Promise<Partial<GraphStateType>> => {
    return dynamicAgentSelectionNode(state, config, dataLayer);
  };
}
