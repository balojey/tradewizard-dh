import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

// Type definitions based on the database schema
export type Market = Database['public']['Tables']['markets']['Row'];
export type Recommendation = Database['public']['Tables']['recommendations']['Row'];
export type AgentSignal = Database['public']['Tables']['agent_signals']['Row'];
export type AnalysisHistory = Database['public']['Tables']['analysis_history']['Row'];

export interface RecommendationWithMarket extends Recommendation {
  market: Market;
  agent_signals: AgentSignal[];
  analysis_history: AnalysisHistory[];
}

export interface TradeRecommendationData {
  marketId: string;
  conditionId: string;
  action: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  entryZone: [number, number];
  targetZone: [number, number];
  expectedValue: number;
  winProbability: number;
  liquidityRisk: 'low' | 'medium' | 'high';
  explanation: {
    summary: string;
    coreThesis: string;
    keyCatalysts: string[];
    failureScenarios: string[];
    uncertaintyNote?: string;
    riskPerspectives?: string;
  };
  metadata: {
    consensusProbability: number;
    marketProbability: number;
    edge: number;
    confidenceBand: [number, number];
    disagreementIndex?: number;
    agentCount?: number;
  };
  timestamp: string;
  processingTimeMs?: number;
}

/**
 * Transform database recommendation to frontend format
 */
function transformRecommendation(rec: RecommendationWithMarket): TradeRecommendationData {
  // Parse JSON fields
  const catalysts = rec.catalysts as string[] || [];
  const risks = rec.risks as string[] || [];
  
  // Map database direction to frontend action
  const action = rec.direction as 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  
  // Calculate liquidity risk based on confidence
  const liquidityRisk: 'low' | 'medium' | 'high' = 
    rec.confidence === 'high' ? 'low' :
    rec.confidence === 'moderate' ? 'medium' : 'high';

  return {
    marketId: rec.market_id || '',
    conditionId: rec.market.condition_id,
    action,
    entryZone: [rec.entry_zone_min || 0, rec.entry_zone_max || 0],
    targetZone: [rec.target_zone_min || 0, rec.target_zone_max || 0],
    expectedValue: rec.expected_value || 0,
    winProbability: rec.fair_probability || 0,
    liquidityRisk,
    explanation: {
      summary: rec.explanation || 'No explanation available',
      coreThesis: rec.core_thesis || 'No detailed thesis available',
      keyCatalysts: catalysts,
      failureScenarios: risks,
    },
    metadata: {
      consensusProbability: rec.fair_probability || 0,
      marketProbability: rec.market.market_probability || 0,
      edge: rec.market_edge || 0,
      confidenceBand: [
        (rec.fair_probability || 0) - 0.05,
        (rec.fair_probability || 0) + 0.05
      ],
      agentCount: rec.agent_signals?.length || 0,
    },
    timestamp: rec.created_at || new Date().toISOString(),
  };
}

/**
 * Hook to fetch trade recommendation for a specific condition ID
 */
export function useTradeRecommendation(conditionId: string | null) {
  return useQuery({
    queryKey: ["trade-recommendation", conditionId],
    queryFn: async (): Promise<TradeRecommendationData | null> => {
      if (!conditionId) return null;

      console.log(`[useTradeRecommendation] Fetching recommendation for condition: ${conditionId}`);

      // First, find the market by condition_id
      const { data: market, error: marketError } = await supabase
        .from("markets")
        .select("*")
        .eq("condition_id", conditionId)
        .single();

      if (marketError) {
        if (marketError.code === 'PGRST116') {
          // No market found
          console.log(`[useTradeRecommendation] No market found for condition: ${conditionId}`);
          return null;
        }
        throw new Error(`Failed to fetch market: ${marketError.message}`);
      }

      // Then, fetch the latest recommendation for this market
      const { data: recommendation, error: recError } = await supabase
        .from("recommendations")
        .select(`
          *,
          market:markets(*),
          agent_signals(*),
          analysis_history(*)
        `)
        .eq("market_id", market.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (recError) {
        if (recError.code === 'PGRST116') {
          // No recommendation found
          console.log(`[useTradeRecommendation] No recommendation found for market: ${market.id}`);
          return null;
        }
        throw new Error(`Failed to fetch recommendation: ${recError.message}`);
      }

      if (!recommendation) {
        console.log(`[useTradeRecommendation] No recommendation data returned for market: ${market.id}`);
        return null;
      }

      console.log(`[useTradeRecommendation] Found recommendation:`, recommendation.direction);
      
      // Ensure the recommendation has the expected structure
      const recommendationWithMarket: RecommendationWithMarket = {
        ...recommendation,
        market: Array.isArray(recommendation.market) ? recommendation.market[0] : recommendation.market,
        agent_signals: Array.isArray(recommendation.agent_signals) ? recommendation.agent_signals : [],
        analysis_history: Array.isArray(recommendation.analysis_history) ? recommendation.analysis_history : [],
      };
      
      return transformRecommendation(recommendationWithMarket);
    },
    enabled: !!conditionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to fetch all recent recommendations
 */
export function useRecentRecommendations(limit: number = 10) {
  return useQuery({
    queryKey: ["recent-recommendations", limit],
    queryFn: async (): Promise<TradeRecommendationData[]> => {
      console.log(`[useRecentRecommendations] Fetching ${limit} recent recommendations`);

      const { data: recommendations, error } = await supabase
        .from("recommendations")
        .select(`
          *,
          market:markets(*),
          agent_signals(*),
          analysis_history(*)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch recommendations: ${error.message}`);
      }

      if (!recommendations) {
        return [];
      }

      return recommendations.map(rec => {
        const recommendationWithMarket: RecommendationWithMarket = {
          ...rec,
          market: Array.isArray(rec.market) ? rec.market[0] : rec.market,
          agent_signals: Array.isArray(rec.agent_signals) ? rec.agent_signals : [],
          analysis_history: Array.isArray(rec.analysis_history) ? rec.analysis_history : [],
        };
        return transformRecommendation(recommendationWithMarket);
      });
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch recommendations by market status
 */
export function useRecommendationsByStatus(status: 'active' | 'inactive' | 'resolved' = 'active') {
  return useQuery({
    queryKey: ["recommendations-by-status", status],
    queryFn: async (): Promise<TradeRecommendationData[]> => {
      console.log(`[useRecommendationsByStatus] Fetching recommendations for ${status} markets`);

      const { data: recommendations, error } = await supabase
        .from("recommendations")
        .select(`
          *,
          market:markets!inner(*),
          agent_signals(*),
          analysis_history(*)
        `)
        .eq("market.status", status)
        .order("created_at", { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch recommendations: ${error.message}`);
      }

      if (!recommendations) {
        return [];
      }

      return recommendations.map(rec => {
        const recommendationWithMarket: RecommendationWithMarket = {
          ...rec,
          market: Array.isArray(rec.market) ? rec.market[0] : rec.market,
          agent_signals: Array.isArray(rec.agent_signals) ? rec.agent_signals : [],
          analysis_history: Array.isArray(rec.analysis_history) ? rec.analysis_history : [],
        };
        return transformRecommendation(recommendationWithMarket);
      });
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Hook to check if a recommendation exists for a condition ID
 */
export function useHasRecommendation(conditionId: string | null) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ["has-recommendation", conditionId],
    queryFn: async (): Promise<boolean> => {
      if (!conditionId) return false;

      // First check cache
      const cachedRec = queryClient.getQueryData<TradeRecommendationData | null>([
        "trade-recommendation", 
        conditionId
      ]);
      
      if (cachedRec !== undefined) {
        return cachedRec !== null;
      }

      // Check database
      const { data: market } = await supabase
        .from("markets")
        .select("id")
        .eq("condition_id", conditionId)
        .single();

      if (!market) return false;

      const { data: recommendation } = await supabase
        .from("recommendations")
        .select("id")
        .eq("market_id", market.id)
        .limit(1)
        .single();

      return !!recommendation;
    },
    enabled: !!conditionId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Hook to invalidate recommendation cache
 */
export function useInvalidateRecommendations() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => {
      queryClient.invalidateQueries({
        queryKey: ["trade-recommendation"],
      });
      queryClient.invalidateQueries({
        queryKey: ["recent-recommendations"],
      });
      queryClient.invalidateQueries({
        queryKey: ["recommendations-by-status"],
      });
      queryClient.invalidateQueries({
        queryKey: ["has-recommendation"],
      });
    },
    invalidateCondition: (conditionId: string) => {
      queryClient.invalidateQueries({
        queryKey: ["trade-recommendation", conditionId],
      });
      queryClient.invalidateQueries({
        queryKey: ["has-recommendation", conditionId],
      });
    },
  };
}