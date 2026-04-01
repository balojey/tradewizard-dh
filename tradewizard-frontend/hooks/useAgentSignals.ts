import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";

type AgentSignalRow = Database['public']['Tables']['agent_signals']['Row'];

export interface AgentSignal {
  id: string;
  agentName: string;
  agentType: string;
  fairProbability: number;
  confidence: number;
  direction: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  keyDrivers: any; // Can be string[] or object with string arrays
  metadata: Record<string, any>;
  createdAt: string;
}

interface UseAgentSignalsOptions {
  enabled?: boolean;
  staleTime?: number;
}

/**
 * Hook to fetch agent signals for a specific market or recommendation
 */
export function useAgentSignals(
  marketId: string | null,
  recommendationId?: string | null,
  options: UseAgentSignalsOptions = {}
) {
  const { enabled = true, staleTime = 5 * 60 * 1000 } = options; // 5 minutes default

  return useQuery({
    queryKey: ["agent-signals", marketId, recommendationId],
    queryFn: async (): Promise<AgentSignal[]> => {
      if (!marketId) {
        throw new Error("Market ID is required");
      }

      let query = supabase
        .from('agent_signals')
        .select('*')
        .eq('market_id', marketId)
        .order('created_at', { ascending: false });

      // If recommendation ID is provided, filter by it
      if (recommendationId) {
        query = query.eq('recommendation_id', recommendationId);
      }

      const { data: signals, error } = await query;

      if (error) {
        throw new Error(`Failed to fetch agent signals: ${error.message}`);
      }

      return (signals || []).map(transformAgentSignal);
    },
    enabled: enabled && !!marketId,
    staleTime,
    gcTime: staleTime * 2,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

/**
 * Transform database agent signal to frontend format
 */
function transformAgentSignal(signal: AgentSignalRow): AgentSignal {
  // Parse JSON fields safely - key_drivers can be array or object
  let keyDrivers: any = null;
  
  if (signal.key_drivers) {
    if (Array.isArray(signal.key_drivers)) {
      // Already an array of strings
      keyDrivers = signal.key_drivers;
    } else if (typeof signal.key_drivers === 'object') {
      // Object with arrays as values - pass through as-is
      keyDrivers = signal.key_drivers;
    }
  }
  
  const metadata = typeof signal.metadata === 'object' && signal.metadata !== null
    ? signal.metadata as Record<string, any>
    : {};

  return {
    id: signal.id,
    agentName: signal.agent_name,
    agentType: signal.agent_type,
    fairProbability: signal.fair_probability || 0,
    confidence: signal.confidence || 0,
    direction: signal.direction as 'LONG_YES' | 'LONG_NO' | 'NO_TRADE',
    keyDrivers,
    metadata,
    createdAt: signal.created_at || new Date().toISOString(),
  };
}

/**
 * Hook to get agent signals grouped by agent type
 */
export function useAgentSignalsGrouped(
  marketId: string | null,
  recommendationId?: string | null,
  options: UseAgentSignalsOptions = {}
) {
  const { data: signals, ...queryResult } = useAgentSignals(marketId, recommendationId, options);

  const groupedSignals = signals?.reduce((acc, signal) => {
    const type = signal.agentType;
    if (!acc[type]) {
      acc[type] = [];
    }
    acc[type].push(signal);
    return acc;
  }, {} as Record<string, AgentSignal[]>);

  return {
    ...queryResult,
    data: signals,
    groupedSignals: groupedSignals || {},
    bullSignals: groupedSignals?.['bull'] || [],
    bearSignals: groupedSignals?.['bear'] || [],
    neutralSignals: groupedSignals?.['neutral'] || [],
  };
}