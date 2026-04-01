/**
 * LangGraph State Definition
 *
 * This module defines the shared state that flows through the entire
 * Market Intelligence Engine workflow using LangGraph's Annotation API.
 */

import { Annotation } from '@langchain/langgraph';
import type {
  MarketBriefingDocument,
  AgentSignal,
  Thesis,
  DebateRecord,
  ConsensusProbability,
  TradeRecommendation,
  IngestionError,
  AgentError,
  RecommendationError,
  AuditEntry,
} from './types.js';
import type { AgentMemoryContext } from '../database/memory-retrieval.js';

/**
 * LangGraph State Definition using Annotation API
 *
 * This state object flows through all nodes in the workflow.
 * Each node reads from and writes to this shared state.
 */
export const GraphState = Annotation.Root({
  // ============================================================================
  // Input
  // ============================================================================

  /**
   * Polymarket condition ID to analyze
   */
  conditionId: Annotation<string>,

  // ============================================================================
  // Market Ingestion Output
  // ============================================================================

  /**
   * Market Briefing Document created from Polymarket data
   */
  mbd: Annotation<MarketBriefingDocument | null>,

  /**
   * Keywords extracted from the market and event context
   */
  marketKeywords: Annotation<import('./types.js').EventKeywords | null>,

  /**
   * Error that occurred during market ingestion (if any)
   */
  ingestionError: Annotation<IngestionError | null>,

  // ============================================================================
  // Dynamic Agent Selection (Advanced Agent League)
  // ============================================================================

  /**
   * List of active agent names selected for this market analysis
   */
  activeAgents: Annotation<string[]>,

  // ============================================================================
  // External Data (Advanced Agent League)
  // ============================================================================

  /**
   * External data fetched from news, polling, and social sources
   */
  externalData: Annotation<{
    news?: Array<{
      title: string;
      source: string;
      publishedAt: number;
      url: string;
      summary: string;
      sentiment: 'positive' | 'negative' | 'neutral';
      relevanceScore: number;
    }>;
    polling?: {
      polls: Array<{
        pollster: string;
        date: number;
        sampleSize: number;
        yesPercentage: number;
        noPercentage: number;
        marginOfError: number;
        methodology: string;
      }>;
      aggregatedProbability: number;
      momentum: 'rising' | 'falling' | 'stable';
      biasAdjustment: number;
    };
    social?: {
      platforms: Record<string, {
        volume: number;
        sentiment: number;
        viralScore: number;
        topKeywords: string[];
      }>;
      overallSentiment: number;
      narrativeVelocity: number;
    };
    dataFreshness: Record<string, number>;
  } | null>,

  // ============================================================================
  // Agent Signals Output
  // ============================================================================

  /**
   * Memory context for all agents
   * Maps agent name to their historical signals for this market
   * Requirement 5.1: Add memoryContext field to LangGraph state
   */
  memoryContext: Annotation<Map<string, AgentMemoryContext>>,

  /**
   * Signals from intelligence agents (accumulated via reducer)
   */
  agentSignals: Annotation<AgentSignal[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  /**
   * Errors from agent execution (accumulated via reducer)
   */
  agentErrors: Annotation<AgentError[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),

  // ============================================================================
  // Agent Signal Fusion (Advanced Agent League)
  // ============================================================================

  /**
   * Fused signal combining all agent signals with dynamic weighting
   */
  fusedSignal: Annotation<{
    fairProbability: number;
    confidence: number;
    signalAlignment: number;
    conflictingSignals: Array<{
      agent1: string;
      agent2: string;
      disagreement: number;
    }>;
    contributingAgents: string[];
    weights: Record<string, number>;
    metadata: {
      mvpAgentCount: number;
      advancedAgentCount: number;
      dataQuality: number;
    };
  } | null>,

  // ============================================================================
  // Thesis Construction Output
  // ============================================================================

  /**
   * Bull thesis (arguing for YES outcome)
   */
  bullThesis: Annotation<Thesis | null>,

  /**
   * Bear thesis (arguing for NO outcome)
   */
  bearThesis: Annotation<Thesis | null>,

  // ============================================================================
  // Cross-Examination Output
  // ============================================================================

  /**
   * Debate record from cross-examination
   */
  debateRecord: Annotation<DebateRecord | null>,

  // ============================================================================
  // Consensus Output
  // ============================================================================

  /**
   * Consensus probability estimate
   */
  consensus: Annotation<ConsensusProbability | null>,

  /**
   * Error that occurred during consensus calculation (if any)
   */
  consensusError: Annotation<RecommendationError | null>,

  // ============================================================================
  // Risk Philosophy Signals (Advanced Agent League)
  // ============================================================================

  /**
   * Risk philosophy agent signals (aggressive, conservative, neutral)
   * Uses custom reducer to handle concurrent updates from multiple agents
   */
  riskPhilosophySignals: Annotation<{
    aggressive?: {
      agentName: string;
      timestamp: number;
      confidence: number;
      direction: 'YES' | 'NO' | 'NEUTRAL';
      fairProbability: number;
      keyDrivers: string[];
      riskFactors: string[];
      metadata: {
        recommendedPositionSize: number;
        kellyCriterion: number;
        convictionLevel: 'extreme' | 'high' | 'moderate';
        expectedReturn: number;
        varianceWarning: string;
      };
    };
    conservative?: {
      agentName: string;
      timestamp: number;
      confidence: number;
      direction: 'YES' | 'NO' | 'NEUTRAL';
      fairProbability: number;
      keyDrivers: string[];
      riskFactors: string[];
      metadata: {
        recommendedPositionSize: number;
        hedgingStrategy: string;
        maxDrawdownTolerance: number;
        stopLossLevel: number;
        capitalPreservationScore: number;
      };
    };
    neutral?: {
      agentName: string;
      timestamp: number;
      confidence: number;
      direction: 'YES' | 'NO' | 'NEUTRAL';
      fairProbability: number;
      keyDrivers: string[];
      riskFactors: string[];
      metadata: {
        spreadOpportunities: Array<{
          setup: string;
          expectedReturn: number;
          riskLevel: 'low' | 'medium';
        }>;
        pairedPositions: Array<{
          long: string;
          short: string;
          netExposure: number;
        }>;
        arbitrageSetups: string[];
      };
    };
  }>({
    reducer: (current, update) => {
      // Merge concurrent updates from multiple risk philosophy agents
      // Each agent should only update its own philosophy key (aggressive/conservative/neutral)
      return { ...current, ...update };
    },
    default: () => ({}),
  }),

  // ============================================================================
  // Agent Performance Tracking (Advanced Agent League)
  // ============================================================================

  /**
   * Performance metrics for each agent
   */
  agentPerformance: Annotation<Record<string, {
    agentName: string;
    totalAnalyses: number;
    averageConfidence: number;
    accuracyScore: number;
    averageExecutionTime: number;
    errorRate: number;
    lastUpdated: number;
  }>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),

  // ============================================================================
  // Final Recommendation
  // ============================================================================

  /**
   * Final trade recommendation
   */
  recommendation: Annotation<TradeRecommendation | null>,

  // ============================================================================
  // Audit Trail
  // ============================================================================

  /**
   * Audit log entries (accumulated via reducer)
   */
  auditLog: Annotation<AuditEntry[]>({
    reducer: (current, update) => [...current, ...update],
    default: () => [],
  }),
});

/**
 * TypeScript type for the graph state
 * Use this type for node function signatures
 */
export type GraphStateType = typeof GraphState.State;
