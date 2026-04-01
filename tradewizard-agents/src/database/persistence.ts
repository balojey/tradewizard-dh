/**
 * Database Persistence Layer
 *
 * This module provides a high-level interface for storing and retrieving
 * market analysis data from Supabase PostgreSQL.
 */

import type { SupabaseClientManager } from './supabase-client.js';
import type { TablesInsert, TablesUpdate, Json } from './types.js';
import type { TradeRecommendation, AgentSignal, MarketId } from '../models/types.js';
import { retryDatabaseOperation } from '../utils/retry-logic.js';

/**
 * Market data for database storage
 */
export interface MarketData {
  conditionId: string;
  question: string;
  description?: string;
  eventType: string;
  marketProbability?: number;
  volume24h?: number;
  liquidity?: number;
  status?: 'active' | 'inactive' | 'resolved';
  resolvedOutcome?: string;
  trendingScore?: number;
}

/**
 * Analysis record for history tracking
 */
export interface AnalysisRecord {
  type: 'initial' | 'update' | 'manual';
  status: 'success' | 'failed' | 'partial';
  durationMs?: number;
  costUsd?: number;
  agentsUsed?: string[];
  errorMessage?: string;
}

/**
 * Database Persistence Interface
 */
export interface DatabasePersistence {
  /**
   * Store or update a market
   * @returns market_id (TEXT - can be string or number converted to string)
   */
  upsertMarket(market: MarketData): Promise<string>;

  /**
   * Store a recommendation
   * @returns recommendation_id (UUID)
   */
  storeRecommendation(marketId: MarketId, recommendation: TradeRecommendation): Promise<string>;

  /**
   * Store agent signals
   */
  storeAgentSignals(
    marketId: MarketId,
    recommendationId: string,
    signals: AgentSignal[]
  ): Promise<void>;

  /**
   * Record analysis history
   */
  recordAnalysis(marketId: MarketId, analysis: AnalysisRecord): Promise<void>;

  /**
   * Get markets needing update
   * @param updateIntervalMs - Minimum time since last analysis in milliseconds
   */
  getMarketsForUpdate(updateIntervalMs: number): Promise<MarketData[]>;

  /**
   * Mark market as resolved
   */
  markMarketResolved(marketId: MarketId, outcome: string): Promise<void>;

  /**
   * Get latest recommendation for a market
   */
  getLatestRecommendation(marketId: MarketId): Promise<TradeRecommendation | null>;
}

/**
 * Database Persistence Implementation
 */
export class DatabasePersistenceImpl implements DatabasePersistence {
  constructor(private clientManager: SupabaseClientManager) {}

  /**
   * Normalize market ID to string for database storage
   */
  private normalizeMarketId(marketId: MarketId): string {
    return String(marketId);
  }

  /**
   * Store or update a market
   */
  async upsertMarket(market: MarketData): Promise<string> {
    return retryDatabaseOperation(async () => {
      try {
        const client = this.clientManager.getClient();

      // Check if market exists
      const { data: existing, error: selectError } = await client
        .from('markets')
        .select('id')
        .eq('condition_id', market.conditionId)
        .maybeSingle();

      if (selectError) {
        console.error('[DatabasePersistence] Error checking existing market:', selectError);
        throw new Error(`Failed to check existing market: ${selectError.message}`);
      }

      if (existing) {
        // Update existing market
        const updateData: TablesUpdate<'markets'> = {
          question: market.question,
          description: market.description,
          event_type: market.eventType,
          market_probability: market.marketProbability,
          volume_24h: market.volume24h,
          liquidity: market.liquidity,
          status: market.status || 'active',
          resolved_outcome: market.resolvedOutcome,
          trending_score: market.trendingScore,
          last_analyzed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { error: updateError } = await client
          .from('markets')
          .update(updateData)
          .eq('id', existing.id);

        if (updateError) {
          console.error('[DatabasePersistence] Error updating market:', updateError);
          throw new Error(`Failed to update market: ${updateError.message}`);
        }

        console.log('[DatabasePersistence] Market updated successfully:', existing.id);
        return existing.id;
      } else {
        // Insert new market - use condition_id as the market ID for consistency
        const marketId = market.conditionId;
        
        const insertData: TablesInsert<'markets'> = {
          id: marketId,
          condition_id: market.conditionId,
          question: market.question,
          description: market.description,
          event_type: market.eventType,
          market_probability: market.marketProbability,
          volume_24h: market.volume24h,
          liquidity: market.liquidity,
          status: market.status || 'active',
          resolved_outcome: market.resolvedOutcome,
          trending_score: market.trendingScore,
          last_analyzed_at: new Date().toISOString(),
        };

        const { data, error: insertError } = await client
          .from('markets')
          .insert(insertData)
          .select('id')
          .single();

        if (insertError || !data) {
          console.error('[DatabasePersistence] Error inserting market:', insertError);
          throw new Error(`Failed to insert market: ${insertError?.message || 'No data returned'}`);
        }

        console.log('[DatabasePersistence] Market inserted successfully:', data.id);
        return data.id;
      }
    } catch (error) {
      console.error('[DatabasePersistence] upsertMarket failed:', error);
      throw error;
    }
    }, 'upsertMarket');
  }

  /**
   * Store a recommendation
   */
  async storeRecommendation(
    marketId: MarketId,
    recommendation: TradeRecommendation
  ): Promise<string> {
    return retryDatabaseOperation(async () => {
      try {
        const client = this.clientManager.getClient();
        const normalizedMarketId = this.normalizeMarketId(marketId);

      const insertData: TablesInsert<'recommendations'> = {
        market_id: normalizedMarketId,
        direction: recommendation.action,
        fair_probability: recommendation.metadata.consensusProbability,
        market_edge: recommendation.metadata.edge,
        expected_value: recommendation.expectedValue,
        confidence: this.mapConfidenceLevel(recommendation.metadata.confidenceBand),
        entry_zone_min: recommendation.entryZone[0],
        entry_zone_max: recommendation.entryZone[1],
        target_zone_min: recommendation.targetZone[0],
        target_zone_max: recommendation.targetZone[1],
        stop_loss: recommendation.stopLoss,
        explanation: recommendation.explanation.summary,
        core_thesis: recommendation.explanation.coreThesis,
        catalysts: recommendation.explanation.keyCatalysts,
        risks: recommendation.explanation.failureScenarios,
      };

      const { data, error } = await client
        .from('recommendations')
        .insert(insertData)
        .select('id')
        .single();

      if (error || !data) {
        console.error('[DatabasePersistence] Error storing recommendation:', error);
        throw new Error(`Failed to store recommendation: ${error?.message || 'No data returned'}`);
      }

      console.log('[DatabasePersistence] Recommendation stored successfully:', data.id);
      return data.id;
    } catch (error) {
      console.error('[DatabasePersistence] storeRecommendation failed:', error);
      throw error;
    }
    }, 'storeRecommendation');
  }

  /**
   * Store agent signals
   */
  async storeAgentSignals(
    marketId: MarketId,
    recommendationId: string,
    signals: AgentSignal[]
  ): Promise<void> {
    return retryDatabaseOperation(async () => {
      try {
        const client = this.clientManager.getClient();
        const normalizedMarketId = this.normalizeMarketId(marketId);

      const insertData: TablesInsert<'agent_signals'>[] = signals.map((signal) => ({
        market_id: normalizedMarketId,
        recommendation_id: recommendationId,
        agent_name: signal.agentName,
        agent_type: this.inferAgentType(signal.agentName),
        fair_probability: signal.fairProbability,
        confidence: signal.confidence,
        direction: signal.direction,
        key_drivers: signal.keyDrivers as Json,
        metadata: signal.metadata as Json,
      }));

      const { error } = await client.from('agent_signals').insert(insertData);

      if (error) {
        console.error('[DatabasePersistence] Error storing agent signals:', error);
        throw new Error(`Failed to store agent signals: ${error.message}`);
      }

      console.log('[DatabasePersistence] Agent signals stored successfully:', signals.length);
    } catch (error) {
      console.error('[DatabasePersistence] storeAgentSignals failed:', error);
      throw error;
    }
    }, 'storeAgentSignals');
  }

  /**
   * Record analysis history
   */
  async recordAnalysis(marketId: MarketId, analysis: AnalysisRecord): Promise<void> {
    return retryDatabaseOperation(async () => {
      try {
        const client = this.clientManager.getClient();
        const normalizedMarketId = this.normalizeMarketId(marketId);

      const insertData: TablesInsert<'analysis_history'> = {
        market_id: normalizedMarketId,
        analysis_type: analysis.type,
        status: analysis.status,
        duration_ms: analysis.durationMs,
        cost_usd: analysis.costUsd,
        agents_used: analysis.agentsUsed,
        error_message: analysis.errorMessage,
      };

      const { error } = await client.from('analysis_history').insert(insertData);

      if (error) {
        console.error('[DatabasePersistence] Error recording analysis:', error);
        throw new Error(`Failed to record analysis: ${error.message}`);
      }

      console.log('[DatabasePersistence] Analysis recorded successfully');
    } catch (error) {
      console.error('[DatabasePersistence] recordAnalysis failed:', error);
      throw error;
    }
    }, 'recordAnalysis');
  }

  /**
   * Get markets needing update
   */
  async getMarketsForUpdate(updateIntervalMs: number): Promise<MarketData[]> {
    return retryDatabaseOperation(async () => {
      try {
        const client = this.clientManager.getClient();

      // Calculate cutoff timestamp
      const cutoffTime = new Date(Date.now() - updateIntervalMs).toISOString();

      const { data, error } = await client
        .from('markets')
        .select('*')
        .eq('status', 'active')
        .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${cutoffTime}`)
        .order('trending_score', { ascending: false, nullsFirst: false })
        .order('last_analyzed_at', { ascending: true, nullsFirst: true });

      if (error) {
        console.error('[DatabasePersistence] Error getting markets for update:', error);
        throw new Error(`Failed to get markets for update: ${error.message}`);
      }

      console.log('[DatabasePersistence] Found markets for update:', data?.length || 0);

      return (data || []).map((row) => ({
        conditionId: row.condition_id,
        question: row.question,
        description: row.description || undefined,
        eventType: row.event_type,
        marketProbability: row.market_probability || undefined,
        volume24h: row.volume_24h || undefined,
        liquidity: row.liquidity || undefined,
        status: row.status as 'active' | 'inactive' | 'resolved',
        resolvedOutcome: row.resolved_outcome || undefined,
        trendingScore: row.trending_score || undefined,
      }));
    } catch (error) {
      console.error('[DatabasePersistence] getMarketsForUpdate failed:', error);
      throw error;
    }
    }, 'getMarketsForUpdate');
  }

  /**
   * Mark market as resolved
   */
  async markMarketResolved(marketId: MarketId, outcome: string): Promise<void> {
    return retryDatabaseOperation(async () => {
      try {
        const client = this.clientManager.getClient();
        const normalizedMarketId = this.normalizeMarketId(marketId);

      const updateData: TablesUpdate<'markets'> = {
        status: 'resolved',
        resolved_outcome: outcome,
        updated_at: new Date().toISOString(),
      };

      const { error } = await client.from('markets').update(updateData).eq('id', normalizedMarketId);

      if (error) {
        console.error('[DatabasePersistence] Error marking market as resolved:', error);
        throw new Error(`Failed to mark market as resolved: ${error.message}`);
      }

      console.log('[DatabasePersistence] Market marked as resolved:', normalizedMarketId);
    } catch (error) {
      console.error('[DatabasePersistence] markMarketResolved failed:', error);
      throw error;
    }
    }, 'markMarketResolved');
  }

  /**
   * Get latest recommendation for a market
   */
  async getLatestRecommendation(marketId: MarketId): Promise<TradeRecommendation | null> {
    return retryDatabaseOperation(async () => {
      try {
        const client = this.clientManager.getClient();
        const normalizedMarketId = this.normalizeMarketId(marketId);

      const { data, error } = await client
        .from('recommendations')
        .select('*')
        .eq('market_id', normalizedMarketId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('[DatabasePersistence] Error getting latest recommendation:', error);
        throw new Error(`Failed to get latest recommendation: ${error.message}`);
      }

      if (!data) {
        console.log('[DatabasePersistence] No recommendation found for market:', normalizedMarketId);
        return null;
      }

      // Get market data for marketId
      const { data: marketData, error: marketError } = await client
        .from('markets')
        .select('condition_id')
        .eq('id', normalizedMarketId)
        .single();

      if (marketError || !marketData) {
        console.error('[DatabasePersistence] Error getting market data:', marketError);
        throw new Error(`Failed to get market data: ${marketError?.message || 'No data returned'}`);
      }

      // Reconstruct TradeRecommendation from database row
      const recommendation: TradeRecommendation = {
        marketId: marketData.condition_id,
        action: data.direction as 'LONG_YES' | 'LONG_NO' | 'NO_TRADE',
        entryZone: [data.entry_zone_min || 0, data.entry_zone_max || 0],
        targetZone: [data.target_zone_min || 0, data.target_zone_max || 0],
        stopLoss: data.stop_loss || Math.max(0.01, (data.entry_zone_min || 0) - 0.03),
        expectedValue: data.expected_value || 0,
        winProbability: data.fair_probability || 0,
        liquidityRisk: 'medium', // Default value, not stored in DB
        explanation: {
          summary: data.explanation || '',
          coreThesis: '', // Not stored separately
          keyCatalysts: (data.catalysts as string[]) || [],
          failureScenarios: (data.risks as string[]) || [],
        },
        metadata: {
          consensusProbability: data.fair_probability || 0,
          marketProbability: 0, // Not stored in recommendations table
          edge: data.market_edge || 0,
          confidenceBand: [0, 1], // Default value, not stored in DB
        },
      };

      console.log('[DatabasePersistence] Latest recommendation retrieved:', data.id);
      return recommendation;
    } catch (error) {
      console.error('[DatabasePersistence] getLatestRecommendation failed:', error);
      throw error;
    }
    }, 'getLatestRecommendation');
  }

  /**
   * Map confidence band to confidence level
   */
  private mapConfidenceLevel(confidenceBand: [number, number]): string {
    const bandWidth = confidenceBand[1] - confidenceBand[0];
    if (bandWidth < 0.1) return 'high';
    if (bandWidth < 0.2) return 'moderate';
    return 'low';
  }

  /**
   * Infer agent type from agent name
   */
  private inferAgentType(agentName: string): string {
    const name = agentName.toLowerCase();
    if (name.includes('news') || name.includes('event')) return 'event_intelligence';
    if (name.includes('polling') || name.includes('historical')) return 'polling_statistical';
    if (name.includes('sentiment') || name.includes('narrative')) return 'sentiment_narrative';
    if (name.includes('momentum') || name.includes('reversion')) return 'price_action';
    if (name.includes('catalyst') || name.includes('tail')) return 'event_scenario';
    if (name.includes('risk')) return 'risk_philosophy';
    return 'mvp';
  }
}

/**
 * Create a database persistence instance
 */
export function createDatabasePersistence(
  clientManager: SupabaseClientManager
): DatabasePersistence {
  return new DatabasePersistenceImpl(clientManager);
}
