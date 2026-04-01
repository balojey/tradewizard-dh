import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type AnalysisHistoryRow = Database['public']['Tables']['analysis_history']['Row'];

export interface AnalysisHistory {
  id: string;
  marketId: string;
  analysisType: string;
  status: 'completed' | 'failed' | 'running';
  durationMs: number | null;
  costUsd: number | null;
  agentsUsed: string[];
  errorMessage: string | null;
  createdAt: string;
}

interface UseAnalysisHistoryOptions {
  enabled?: boolean;
  staleTime?: number;
  limit?: number;
}

/**
 * Hook to fetch analysis history for a specific market
 */
export function useAnalysisHistory(
  marketId: string | null,
  options: UseAnalysisHistoryOptions = {}
) {
  const { enabled = true, staleTime = 5 * 60 * 1000, limit = 10 } = options;

  return useQuery({
    queryKey: ["analysis-history", marketId, limit],
    queryFn: async (): Promise<AnalysisHistory[]> => {
      if (!marketId) {
        throw new Error("Market ID is required");
      }

      const { data: history, error } = await supabase
        .from('analysis_history')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw new Error(`Failed to fetch analysis history: ${error.message}`);
      }

      return (history || []).map(transformAnalysisHistory);
    },
    enabled: enabled && !!marketId,
    staleTime,
    gcTime: staleTime * 2,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Hook to get analysis performance metrics
 */
export function useAnalysisMetrics(
  marketId: string | null,
  options: UseAnalysisHistoryOptions = {}
) {
  const { data: history, ...queryResult } = useAnalysisHistory(marketId, options);

  const metrics = history?.reduce((acc, analysis) => {
    if (analysis.status === 'completed') {
      acc.completedCount++;
      if (analysis.durationMs) {
        acc.totalDuration += analysis.durationMs;
        acc.avgDuration = acc.totalDuration / acc.completedCount;
      }
      if (analysis.costUsd) {
        acc.totalCost += analysis.costUsd;
      }
    } else if (analysis.status === 'failed') {
      acc.failedCount++;
    }
    return acc;
  }, {
    completedCount: 0,
    failedCount: 0,
    totalDuration: 0,
    avgDuration: 0,
    totalCost: 0,
  });

  return {
    ...queryResult,
    data: history,
    metrics: metrics || {
      completedCount: 0,
      failedCount: 0,
      totalDuration: 0,
      avgDuration: 0,
      totalCost: 0,
    },
  };
}

/**
 * Transform database analysis history to frontend format
 */
function transformAnalysisHistory(history: AnalysisHistoryRow): AnalysisHistory {
  // Parse JSON fields safely
  const agentsUsed = Array.isArray(history.agents_used) 
    ? history.agents_used as string[]
    : [];

  return {
    id: history.id,
    marketId: history.market_id || '',
    analysisType: history.analysis_type,
    status: history.status as 'completed' | 'failed' | 'running',
    durationMs: history.duration_ms,
    costUsd: history.cost_usd,
    agentsUsed,
    errorMessage: history.error_message,
    createdAt: history.created_at || new Date().toISOString(),
  };
}