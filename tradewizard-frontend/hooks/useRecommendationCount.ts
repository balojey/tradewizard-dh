import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

/**
 * Hook to get the count of recommendations for a market
 * Useful for determining whether to show time travel features
 */
export function useRecommendationCount(conditionId: string | null) {
  return useQuery({
    queryKey: ["recommendation-count", conditionId],
    queryFn: async (): Promise<number> => {
      if (!conditionId) return 0;

      // First, find the market by condition_id
      const { data: market, error: marketError } = await supabase
        .from("markets")
        .select("id")
        .eq("condition_id", conditionId)
        .single();

      if (marketError || !market) {
        return 0;
      }

      // Count recommendations for this market
      const { count, error: countError } = await supabase
        .from("recommendations")
        .select("*", { count: 'exact', head: true })
        .eq("market_id", market.id);

      if (countError) {
        console.warn(`Failed to count recommendations: ${countError.message}`);
        return 0;
      }

      return count || 0;
    },
    enabled: !!conditionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}

/**
 * Hook to check if time travel features should be shown
 */
export function useShowTimeTravel(conditionId: string | null) {
  const { data: count = 0 } = useRecommendationCount(conditionId);
  
  return {
    shouldShow: count > 1,
    recommendationCount: count,
    hasRecommendations: count > 0
  };
}