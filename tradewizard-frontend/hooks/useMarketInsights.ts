import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type RecommendationRow = Database['public']['Tables']['recommendations']['Row'];
type MarketRow = Database['public']['Tables']['markets']['Row'];
type AgentSignalRow = Database['public']['Tables']['agent_signals']['Row'];

export interface MarketInsights {
  hasRecommendation: boolean;
  recommendation?: {
    id: string;
    action: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
    fairProbability: number;
    expectedValue: number;
    confidence: 'high' | 'moderate' | 'low';
    explanation: string;
    agentCount: number;
  };
  sentiment?: {
    overall: 'bullish' | 'bearish' | 'neutral';
    score: number; // -1 to 1
    confidence: number; // 0 to 1
  };
  priceHistory?: {
    current: number;
    change24h: number;
    volatility: number;
  };
}

interface UseMarketInsightsOptions {
  enabled?: boolean;
  staleTime?: number;
}

/**
 * Hook to fetch comprehensive market insights including AI recommendations,
 * sentiment analysis, and price data
 */
export function useMarketInsights(
  conditionId: string | null,
  options: UseMarketInsightsOptions = {}
) {
  const { enabled = true, staleTime = 5 * 60 * 1000 } = options; // 5 minutes default

  return useQuery({
    queryKey: ["market-insights", conditionId],
    queryFn: async (): Promise<MarketInsights> => {
      if (!conditionId) {
        throw new Error("Condition ID is required");
      }

      // Fetch market data
      const { data: market, error: marketError } = await supabase
        .from('markets')
        .select('*')
        .eq('condition_id', conditionId)
        .single();

      if (marketError && marketError.code !== 'PGRST116') {
        console.warn(`Market not found for condition ${conditionId}:`, marketError);
      }

      // Fetch recommendation
      const { data: recommendations, error: recError } = await supabase
        .from('recommendations')
        .select('*')
        .eq('market_id', market?.id || conditionId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recError) {
        console.warn(`Failed to fetch recommendation: ${recError.message}`);
      }

      const recommendation = recommendations?.[0];
      let agentCount = 0;

      if (recommendation) {
        // Fetch agent signals count
        const { count } = await supabase
          .from('agent_signals')
          .select('*', { count: 'exact', head: true })
          .eq('recommendation_id', recommendation.id);
        
        agentCount = count || 0;
      }

      // Build insights object
      const insights: MarketInsights = {
        hasRecommendation: !!recommendation,
      };

      if (recommendation) {
        insights.recommendation = {
          id: recommendation.id,
          action: recommendation.direction as 'LONG_YES' | 'LONG_NO' | 'NO_TRADE',
          fairProbability: recommendation.fair_probability || 0,
          expectedValue: recommendation.expected_value || 0,
          confidence: recommendation.confidence as 'high' | 'moderate' | 'low',
          explanation: recommendation.explanation || 'No explanation available',
          agentCount,
        };
      }

      // Mock sentiment data (would be replaced with actual sentiment API)
      insights.sentiment = {
        overall: Math.random() > 0.5 ? 'bullish' : 'bearish',
        score: (Math.random() - 0.5) * 2, // -1 to 1
        confidence: 0.6 + Math.random() * 0.3, // 0.6 to 0.9
      };

      // Mock price history data (would be replaced with actual price API)
      insights.priceHistory = {
        current: market?.market_probability || Math.random(),
        change24h: (Math.random() - 0.5) * 0.2, // ±10%
        volatility: Math.random() * 0.1, // 0-10%
      };

      return insights;
    },
    enabled: enabled && !!conditionId,
    staleTime,
    gcTime: staleTime * 2,
    retry: (failureCount, error) => {
      // Don't retry on "not found" errors
      if (error.message.includes('Condition ID is required')) {
        return false;
      }
      // Retry up to 2 times for other errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to check if market insights are available
 */
export function useHasMarketInsights(conditionId: string | null) {
  const { data: insights, isLoading } = useMarketInsights(conditionId, {
    enabled: !!conditionId,
    staleTime: 10 * 60 * 1000, // 10 minutes for availability check
  });

  return {
    hasInsights: !!insights?.hasRecommendation,
    hasRecommendation: !!insights?.recommendation,
    hasSentiment: !!insights?.sentiment,
    hasPriceHistory: !!insights?.priceHistory,
    isLoading,
  };
}