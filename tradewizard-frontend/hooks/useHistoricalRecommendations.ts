import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type RecommendationRow = Database['public']['Tables']['recommendations']['Row'];
type MarketRow = Database['public']['Tables']['markets']['Row'];
type AgentSignalRow = Database['public']['Tables']['agent_signals']['Row'];

export interface HistoricalRecommendation {
  id: string;
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
  // Additional fields for historical analysis
  marketPriceAtTime: number;
  volumeAtTime: number;
  liquidityAtTime: number;
  agentSignals: AgentSignalRow[];
}

export interface RecommendationComparison {
  current: HistoricalRecommendation;
  previous: HistoricalRecommendation;
  changes: {
    actionChanged: boolean;
    probabilityDelta: number;
    edgeDelta: number;
    confidenceChanged: boolean;
    newCatalysts: string[];
    removedCatalysts: string[];
    newRisks: string[];
    removedRisks: string[];
  };
}

export interface PotentialPnL {
  recommendationId: string;
  timestamp: string;
  action: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  potentialReturn: number;
  potentialReturnPercent: number;
  wouldHaveProfit: boolean;
  daysHeld: number;
  annualizedReturn?: number;
}

interface UseHistoricalRecommendationsOptions {
  enabled?: boolean;
  limit?: number;
  includeAgentSignals?: boolean;
}

/**
 * Hook to fetch all historical recommendations for a market
 */
export function useHistoricalRecommendations(
  conditionId: string | null,
  options: UseHistoricalRecommendationsOptions = {}
) {
  const { enabled = true, limit = 50, includeAgentSignals = true } = options;

  return useQuery({
    queryKey: ["historical-recommendations", conditionId, limit, includeAgentSignals],
    queryFn: async (): Promise<HistoricalRecommendation[]> => {
      if (!conditionId) {
        throw new Error("Condition ID is required");
      }

      // First, find the market by condition_id
      const { data: market, error: marketError } = await supabase
        .from("markets")
        .select("*")
        .eq("condition_id", conditionId)
        .single();

      if (marketError) {
        if (marketError.code === 'PGRST116') {
          return [];
        }
        throw new Error(`Failed to fetch market: ${marketError.message}`);
      }

      // Build the query for recommendations
      let query = supabase
        .from("recommendations")
        .select(`
          *,
          market:markets(*)
          ${includeAgentSignals ? ',agent_signals(*)' : ''}
        `)
        .eq("market_id", market.id)
        .order("created_at", { ascending: false });

      if (limit > 0) {
        query = query.limit(limit);
      }

      const { data: recommendations, error: recError } = await query;

      if (recError) {
        throw new Error(`Failed to fetch recommendations: ${recError.message}`);
      }

      if (!recommendations || recommendations.length === 0) {
        return [];
      }

      return recommendations.map(rec => transformHistoricalRecommendation(rec, market));
    },
    enabled: enabled && !!conditionId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to get recommendation comparison between current and previous
 */
export function useRecommendationComparison(
  conditionId: string | null,
  currentRecommendationId?: string
) {
  const { data: recommendations } = useHistoricalRecommendations(conditionId, {
    limit: 10,
    includeAgentSignals: false
  });

  return useQuery({
    queryKey: ["recommendation-comparison", conditionId, currentRecommendationId],
    queryFn: async (): Promise<RecommendationComparison | null> => {
      if (!recommendations || recommendations.length < 2) {
        return null;
      }

      const current = currentRecommendationId 
        ? recommendations.find(r => r.id === currentRecommendationId) || recommendations[0]
        : recommendations[0];
      
      const previous = recommendations[1];

      if (!current || !previous) {
        return null;
      }

      return {
        current,
        previous,
        changes: calculateRecommendationChanges(current, previous)
      };
    },
    enabled: !!recommendations && recommendations.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hook to calculate potential P&L for historical recommendations
 */
export function usePotentialPnL(
  conditionId: string | null,
  currentMarketPrice: number,
  yesPrice?: number,
  noPrice?: number
) {
  const { data: recommendations } = useHistoricalRecommendations(conditionId, {
    includeAgentSignals: false
  });

  return useQuery({
    queryKey: ["potential-pnl", conditionId, currentMarketPrice, yesPrice, noPrice, recommendations?.length],
    queryFn: async (): Promise<PotentialPnL[]> => {
      if (!recommendations || recommendations.length === 0) {
        return [];
      }

      // Calculate effective Yes and No prices
      const effectiveYesPrice = yesPrice || currentMarketPrice;
      const effectiveNoPrice = noPrice || (1 - effectiveYesPrice);

      return recommendations
        .filter(rec => rec.action !== 'NO_TRADE')
        .map(rec => calculatePotentialPnL(rec, effectiveYesPrice, effectiveNoPrice));
    },
    enabled: !!recommendations && recommendations.length > 0 && currentMarketPrice > 0,
    staleTime: 30 * 1000, // 30 seconds (price sensitive)
  });
}

/**
 * Hook to get recommendation timeline with key events
 */
export function useRecommendationTimeline(conditionId: string | null) {
  const { data: recommendations } = useHistoricalRecommendations(conditionId);

  return useQuery({
    queryKey: ["recommendation-timeline", conditionId, recommendations?.length],
    queryFn: async (): Promise<TimelineEvent[]> => {
      if (!recommendations || recommendations.length === 0) {
        return [];
      }

      const events: TimelineEvent[] = [];

      // Add recommendation events
      recommendations.forEach((rec, index) => {
        const isFirst = index === recommendations.length - 1;
        const previousRec = index < recommendations.length - 1 ? recommendations[index + 1] : null;

        events.push({
          id: rec.id,
          type: isFirst ? 'initial_recommendation' : 'recommendation_update',
          timestamp: rec.timestamp,
          title: isFirst ? 'Initial Recommendation' : 'Recommendation Updated',
          description: `${rec.action} at ${(rec.metadata.consensusProbability * 100).toFixed(1)}% fair value`,
          recommendation: rec,
          changes: previousRec ? calculateRecommendationChanges(rec, previousRec) : undefined
        });
      });

      // Sort by timestamp (newest first)
      return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    enabled: !!recommendations && recommendations.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

// Helper types and functions

interface TimelineEvent {
  id: string;
  type: 'initial_recommendation' | 'recommendation_update' | 'market_event';
  timestamp: string;
  title: string;
  description: string;
  recommendation?: HistoricalRecommendation;
  changes?: RecommendationComparison['changes'];
}

function transformHistoricalRecommendation(
  rec: any,
  market: MarketRow
): HistoricalRecommendation {
  // Parse JSON fields - handle nested object structure
  let catalysts: string[] = [];
  let risks: string[] = [];
  
  if (rec.catalysts) {
    if (Array.isArray(rec.catalysts)) {
      catalysts = rec.catalysts as string[];
    } else if (typeof rec.catalysts === 'object') {
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
      risks = rec.risks as string[];
    } else if (typeof rec.risks === 'object') {
      const risksObj = rec.risks as any;
      if (risksObj.scenarios && Array.isArray(risksObj.scenarios)) {
        risks = risksObj.scenarios;
      } else if (risksObj.risks && Array.isArray(risksObj.risks)) {
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
  
  const action = rec.direction as 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  const agentSignals = Array.isArray(rec.agent_signals) ? rec.agent_signals : [];

  // Calculate disagreement index from agent signals
  const agentProbs = agentSignals.map((s: AgentSignalRow) => s.fair_probability || 0);
  const avgProb = agentProbs.reduce((sum: number, p: number) => sum + p, 0) / agentProbs.length;
  const disagreementIndex = agentProbs.length > 1 ? 
    Math.sqrt(agentProbs.reduce((sum: number, p: number) => sum + Math.pow(p - avgProb, 2), 0) / agentProbs.length) : 0;

  return {
    id: rec.id,
    marketId: rec.market_id,
    conditionId: market.condition_id,
    action,
    entryZone: [rec.entry_zone_min || 0, rec.entry_zone_max || 1],
    targetZone: [rec.target_zone_min || 0, rec.target_zone_max || 1],
    expectedValue: rec.expected_value || 0,
    winProbability: rec.fair_probability || 0,
    liquidityRisk: rec.confidence === 'high' ? 'low' : rec.confidence === 'moderate' ? 'medium' : 'high',
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
    timestamp: rec.created_at,
    marketPriceAtTime: market.market_probability || 0,
    volumeAtTime: market.volume_24h || 0,
    liquidityAtTime: market.liquidity || 0,
    agentSignals
  };
}

function calculateRecommendationChanges(
  current: HistoricalRecommendation,
  previous: HistoricalRecommendation
): RecommendationComparison['changes'] {
  const currentCatalysts = current.explanation.keyCatalysts;
  const previousCatalysts = previous.explanation.keyCatalysts;
  const currentRisks = current.explanation.failureScenarios;
  const previousRisks = previous.explanation.failureScenarios;

  return {
    actionChanged: current.action !== previous.action,
    probabilityDelta: current.metadata.consensusProbability - previous.metadata.consensusProbability,
    edgeDelta: current.metadata.edge - previous.metadata.edge,
    confidenceChanged: current.liquidityRisk !== previous.liquidityRisk,
    newCatalysts: currentCatalysts.filter(c => !previousCatalysts.includes(c)),
    removedCatalysts: previousCatalysts.filter(c => !currentCatalysts.includes(c)),
    newRisks: currentRisks.filter(r => !previousRisks.includes(r)),
    removedRisks: previousRisks.filter(r => !currentRisks.includes(r))
  };
}

function calculatePotentialPnL(
  recommendation: HistoricalRecommendation,
  yesPrice: number,
  noPrice: number
): PotentialPnL {
  // Zones are stored in token space:
  //   LONG_YES → YES-token prices, LONG_NO → NO-token prices (1 - YES price)
  // So currentPrice in token space is:
  const currentPrice = recommendation.action === 'LONG_YES' ? yesPrice : noPrice;

  // Entry midpoint — mirrors gradeByResolution in [marketId]/route.ts
  const entryAvg = (recommendation.entryZone[0] + recommendation.entryZone[1]) / 2;

  // Target midpoint and stop loss (in token space)
  const targetAvg = (recommendation.targetZone[0] + recommendation.targetZone[1]) / 2;
  // stopLoss is not stored on HistoricalRecommendation — use entryZone[0] as proxy
  // (zones are entry[0]=min, entry[1]=max; target[0]=min, target[1]=max)

  // ROI formula: (exitPrice - entryAvg) / entryAvg * 100
  // For an active market we don't know the exit yet, so we use current price as the
  // unrealised exit — same as computeLivePnL in performanceHelpers.ts
  const potentialReturn = currentPrice - entryAvg;
  const potentialReturnPercent = entryAvg > 0 ? (potentialReturn / entryAvg) * 100 : 0;

  const daysHeld = Math.max(1, Math.floor(
    (new Date().getTime() - new Date(recommendation.timestamp).getTime()) / (1000 * 60 * 60 * 24)
  ));

  const annualizedReturn = daysHeld > 0 ? (potentialReturnPercent * 365) / daysHeld : undefined;

  return {
    recommendationId: recommendation.id,
    timestamp: recommendation.timestamp,
    action: recommendation.action,
    entryPrice: entryAvg,
    currentPrice,
    targetPrice: targetAvg,
    potentialReturn,
    potentialReturnPercent,
    wouldHaveProfit: potentialReturn > 0,
    daysHeld,
    annualizedReturn
  };
}