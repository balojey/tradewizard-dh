import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type RecommendationRow = Database['public']['Tables']['recommendations']['Row'];
type MarketRow = Database['public']['Tables']['markets']['Row'];
type AgentSignalRow = Database['public']['Tables']['agent_signals']['Row'];

export interface TradeRecommendation {
  id: string;
  marketId: string;
  action: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  entryZone: [number, number];
  targetZone: [number, number];
  stopLoss: number; // Stop-loss price below entry zone for risk management
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

interface UseTradeRecommendationOptions {
  enabled?: boolean;
  staleTime?: number;
  cacheTime?: number;
}

/**
 * Transform database recommendation to frontend format
 */
function transformRecommendation(
  rec: RecommendationRow,
  market: MarketRow,
  agentSignals: AgentSignalRow[]
): TradeRecommendation {
  // Parse JSON fields - handle both array and null cases
  // Supabase returns JSON columns as parsed objects, so we need to handle that
  let catalysts: string[] = [];
  let risks: string[] = [];
  
  if (rec.catalysts) {
    if (Array.isArray(rec.catalysts)) {
      // Direct array
      catalysts = rec.catalysts as string[];
    } else if (typeof rec.catalysts === 'object') {
      // Nested object with "catalysts" key
      const catalystsObj = rec.catalysts as any;
      if (catalystsObj.catalysts && Array.isArray(catalystsObj.catalysts)) {
        catalysts = catalystsObj.catalysts;
      }
    } else if (typeof rec.catalysts === 'string') {
      try {
        const parsed = JSON.parse(rec.catalysts);
        if (Array.isArray(parsed)) {
          catalysts = parsed;
        } else if (parsed.catalysts && Array.isArray(parsed.catalysts)) {
          catalysts = parsed.catalysts;
        }
      } catch {
        catalysts = [];
      }
    }
  }
  
  if (rec.risks) {
    if (Array.isArray(rec.risks)) {
      // Direct array
      risks = rec.risks as string[];
    } else if (typeof rec.risks === 'object') {
      // Nested object with "scenarios" key
      const risksObj = rec.risks as any;
      if (risksObj.scenarios && Array.isArray(risksObj.scenarios)) {
        risks = risksObj.scenarios;
      } else if (risksObj.risks && Array.isArray(risksObj.risks)) {
        // Fallback to "risks" key
        risks = risksObj.risks;
      }
    } else if (typeof rec.risks === 'string') {
      try {
        const parsed = JSON.parse(rec.risks);
        if (Array.isArray(parsed)) {
          risks = parsed;
        } else if (parsed.scenarios && Array.isArray(parsed.scenarios)) {
          risks = parsed.scenarios;
        } else if (parsed.risks && Array.isArray(parsed.risks)) {
          risks = parsed.risks;
        }
      } catch {
        risks = [];
      }
    }
  }
  
  console.log('[transformRecommendation] Raw data:', { 
    catalysts: rec.catalysts, 
    risks: rec.risks,
    catalystsType: typeof rec.catalysts,
    risksType: typeof rec.risks
  });
  console.log('[transformRecommendation] Parsed:', { catalysts, risks });
  
  // Map database direction to frontend action
  const action = rec.direction as 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  
  // Calculate win probability based on direction and fair probability
  const fairProb = rec.fair_probability || 0;
  const winProbability = action === 'LONG_YES' ? fairProb : (1 - fairProb);
  
  // Determine liquidity risk based on confidence
  const liquidityRisk = rec.confidence === 'high' ? 'low' : 
                       rec.confidence === 'moderate' ? 'medium' : 'high';
  
  // Calculate disagreement index from agent signals
  const agentProbs = agentSignals.map(s => s.fair_probability || 0);
  const avgProb = agentProbs.reduce((sum, p) => sum + p, 0) / agentProbs.length;
  const disagreementIndex = agentProbs.length > 1 ? 
    Math.sqrt(agentProbs.reduce((sum, p) => sum + Math.pow(p - avgProb, 2), 0) / agentProbs.length) : 0;

  return {
    id: rec.id,
    marketId: rec.market_id || '',
    action,
    entryZone: [rec.entry_zone_min || 0, rec.entry_zone_max || 1],
    targetZone: [rec.target_zone_min || 0, rec.target_zone_max || 1],
    stopLoss: rec.stop_loss || Math.max(0.01, (rec.entry_zone_min || 0) - 0.03), // Fallback calculation
    expectedValue: rec.expected_value || 0,
    winProbability,
    liquidityRisk,
    explanation: {
      summary: rec.explanation || 'No explanation available',
      coreThesis: rec.core_thesis || 'No detailed thesis available',
      keyCatalysts: catalysts,
      failureScenarios: risks,
      uncertaintyNote: disagreementIndex > 0.15 ? 
        `High disagreement among agents (${(disagreementIndex * 100).toFixed(1)}%)` : undefined,
    },
    metadata: {
      consensusProbability: rec.fair_probability || 0,
      marketProbability: market.market_probability || 0,
      edge: rec.market_edge || 0,
      confidenceBand: [
        Math.max(0, (rec.fair_probability || 0) - 0.1),
        Math.min(1, (rec.fair_probability || 0) + 0.1)
      ],
      disagreementIndex,
      agentCount: agentSignals.length,
    },
    timestamp: rec.created_at || new Date().toISOString(),
  };
}

/**
 * Hook to fetch AI-powered trade recommendation for a market from Supabase
 */
export function useTradeRecommendation(
  conditionId: string | null,
  options: UseTradeRecommendationOptions = {}
) {
  const {
    enabled = true,
    staleTime = 5 * 60 * 1000, // 5 minutes
    cacheTime = 30 * 60 * 1000, // 30 minutes
  } = options;

  return useQuery({
    queryKey: ["trade-recommendation-supabase", conditionId],
    queryFn: async (): Promise<TradeRecommendation> => {
      if (!conditionId) {
        throw new Error("Condition ID is required");
      }

      console.log(`[useTradeRecommendation] Fetching recommendation for condition: ${conditionId}`);

      // First, find the market by condition_id
      const { data: markets, error: marketError } = await supabase
        .from('markets')
        .select('*')
        .eq('condition_id', conditionId)
        .limit(1);

      if (marketError) {
        throw new Error(`Failed to fetch market: ${marketError.message}`);
      }

      if (!markets || markets.length === 0) {
        throw new Error(`No market found for condition ID: ${conditionId}`);
      }

      const market = markets[0];

      // Fetch the latest recommendation for this market
      const { data: recommendations, error: recError } = await supabase
        .from('recommendations')
        .select('*')
        .eq('market_id', market.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (recError) {
        throw new Error(`Failed to fetch recommendation: ${recError.message}`);
      }

      if (!recommendations || recommendations.length === 0) {
        throw new Error(`No recommendation found for market: ${market.question}`);
      }

      const recommendation = recommendations[0];

      // Fetch agent signals for this recommendation
      const { data: agentSignals, error: signalsError } = await supabase
        .from('agent_signals')
        .select('*')
        .eq('recommendation_id', recommendation.id);

      if (signalsError) {
        console.warn(`Failed to fetch agent signals: ${signalsError.message}`);
      }

      const signals = agentSignals || [];

      console.log(
        `[useTradeRecommendation] Found recommendation: ${recommendation.direction} with ${signals.length} agent signals`
      );

      return transformRecommendation(recommendation, market, signals);
    },
    enabled: enabled && !!conditionId,
    staleTime,
    gcTime: cacheTime,
    retry: (failureCount, error) => {
      // Don't retry on "not found" errors
      if (error.message.includes('No recommendation found') || 
          error.message.includes('No market found')) {
        return false;
      }
      // Retry up to 2 times for other errors
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to manually trigger recommendation refresh
 */
export function useRefreshRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conditionId: string): Promise<void> => {
      // Invalidate the cache to force a fresh fetch
      await queryClient.invalidateQueries({
        queryKey: ["trade-recommendation-supabase", conditionId],
      });
    },
    onSuccess: (_, conditionId) => {
      console.log(`[useRefreshRecommendation] Refreshed recommendation for condition: ${conditionId}`);
    },
    onError: (error, conditionId) => {
      console.error(`[useRefreshRecommendation] Failed to refresh condition ${conditionId}:`, error);
    },
  });
}

/**
 * Hook to check if a recommendation is available in cache
 */
export function useTradeRecommendationCache(conditionId: string | null) {
  const queryClient = useQueryClient();

  if (!conditionId) return null;

  return queryClient.getQueryData<TradeRecommendation>([
    "trade-recommendation-supabase",
    conditionId,
  ]);
}

/**
 * Hook to fetch multiple recommendations for a list of condition IDs
 */
export function useMultipleRecommendations(conditionIds: string[]) {
  return useQuery({
    queryKey: ["multiple-recommendations", conditionIds.sort()],
    queryFn: async (): Promise<Record<string, TradeRecommendation>> => {
      if (conditionIds.length === 0) {
        return {};
      }

      console.log(`[useMultipleRecommendations] Fetching ${conditionIds.length} recommendations`);

      // Fetch all markets for the given condition IDs
      const { data: markets, error: marketError } = await supabase
        .from('markets')
        .select('*')
        .in('condition_id', conditionIds);

      if (marketError) {
        throw new Error(`Failed to fetch markets: ${marketError.message}`);
      }

      if (!markets || markets.length === 0) {
        return {};
      }

      const marketIds = markets.map(m => m.id);

      // Fetch latest recommendations for these markets
      const { data: recommendations, error: recError } = await supabase
        .from('recommendations')
        .select('*')
        .in('market_id', marketIds)
        .order('created_at', { ascending: false });

      if (recError) {
        throw new Error(`Failed to fetch recommendations: ${recError.message}`);
      }

      // Group recommendations by market_id and take the latest for each
      const latestRecs = new Map<string, RecommendationRow>();
      recommendations?.forEach(rec => {
        if (!rec.market_id || !rec.created_at) return; // Skip if null
        
        if (!latestRecs.has(rec.market_id) || 
            new Date(rec.created_at) > new Date(latestRecs.get(rec.market_id)!.created_at || '')) {
          latestRecs.set(rec.market_id, rec);
        }
      });

      // Fetch agent signals for all recommendations
      const recIds = Array.from(latestRecs.values()).map(r => r.id);
      const { data: agentSignals } = await supabase
        .from('agent_signals')
        .select('*')
        .in('recommendation_id', recIds);

      // Build result map
      const result: Record<string, TradeRecommendation> = {};
      
      markets.forEach(market => {
        const rec = latestRecs.get(market.id);
        if (rec) {
          const signals = agentSignals?.filter(s => s.recommendation_id === rec.id) || [];
          result[market.condition_id] = transformRecommendation(rec, market, signals);
        }
      });

      console.log(`[useMultipleRecommendations] Found ${Object.keys(result).length} recommendations`);
      return result;
    },
    enabled: conditionIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  });
}

export default useTradeRecommendation;