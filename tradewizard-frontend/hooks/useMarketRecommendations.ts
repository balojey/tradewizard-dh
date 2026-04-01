import { useMultipleRecommendations } from "@/hooks/useTradeRecommendation";
import type { PolymarketMarket } from "@/hooks/useMarkets";

/**
 * Hook to efficiently fetch recommendations for multiple markets
 * This reduces database queries by batching requests
 */
export function useMarketRecommendations(markets: PolymarketMarket[]) {
  // Extract condition IDs from markets
  const conditionIds = markets
    .map(market => market.conditionId)
    .filter((id): id is string => !!id);

  // Fetch all recommendations in a single query
  const { data: recommendations, isLoading, error } = useMultipleRecommendations(conditionIds);

  return {
    recommendations: recommendations || {},
    isLoading,
    error,
    getRecommendation: (conditionId: string | null) => {
      if (!conditionId || !recommendations) return null;
      return recommendations[conditionId] || null;
    },
    hasRecommendation: (conditionId: string | null) => {
      if (!conditionId || !recommendations) return false;
      return !!recommendations[conditionId];
    },
    getRecommendationCount: () => {
      if (!recommendations) return 0;
      return Object.keys(recommendations).length;
    }
  };
}

export default useMarketRecommendations;