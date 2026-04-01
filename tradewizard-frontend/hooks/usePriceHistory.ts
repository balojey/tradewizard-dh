import { useQuery } from "@tanstack/react-query";

export interface PriceHistoryPoint {
  timestamp: string;
  price: number;
  volume?: number;
  high?: number;
  low?: number;
}

export interface PriceHistoryResponse {
  conditionId: string;
  tokenId: string;
  timeRange: string;
  data: PriceHistoryPoint[];
  dataSource: 'real' | 'synthetic';
  points: number;
}

export type TimeRange = '1H' | '4H' | '1D' | '7D' | '30D';

interface UsePriceHistoryOptions {
  enabled?: boolean;
  refetchInterval?: number;
  isClosedMarket?: boolean; // Flag to indicate if this is for a closed market
}

/**
 * Hook to fetch historical price data for a market
 * 
 * @param conditionId - The condition ID of the market
 * @param tokenId - The token ID to fetch prices for
 * @param timeRange - Time range for price history (1H, 4H, 1D, 7D, 30D)
 * @param options - Optional configuration including isClosedMarket flag
 * @returns TanStack Query result with price history data
 * 
 * @example
 * ```tsx
 * // For active markets (default behavior)
 * const { data } = usePriceHistory(conditionId, tokenId, '1D');
 * 
 * // For closed markets (optimized caching)
 * const { data } = usePriceHistory(conditionId, tokenId, '1D', { isClosedMarket: true });
 * ```
 */
export default function usePriceHistory(
  conditionId: string | null,
  tokenId: string | null,
  timeRange: TimeRange = '1D',
  options: UsePriceHistoryOptions = {}
) {
  const { enabled = true, refetchInterval, isClosedMarket = false } = options;

  return useQuery({
    queryKey: ["price-history", conditionId, tokenId, timeRange],
    queryFn: async (): Promise<PriceHistoryResponse> => {
      if (!conditionId || !tokenId) {
        throw new Error("Missing conditionId or tokenId");
      }

      const response = await fetch("/api/polymarket/price-history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conditionId,
          tokenId,
          timeRange,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    },
    enabled: enabled && !!conditionId && !!tokenId,
    // For closed markets: 30 minutes staleTime (data won't change)
    // For active markets: 30 seconds staleTime (data updates frequently)
    staleTime: isClosedMarket ? 30 * 60 * 1000 : 30_000,
    // For closed markets: 30 minutes gcTime
    // For active markets: use default from QueryProvider
    gcTime: isClosedMarket ? 30 * 60 * 1000 : undefined,
    // For closed markets: disable refetch (data is static)
    // For active markets: enable refetch based on timeRange
    refetchInterval: isClosedMarket 
      ? false 
      : (refetchInterval || (timeRange === '1H' ? 30_000 : 60_000)),
    refetchIntervalInBackground: false,
    // For closed markets: disable refetchOnWindowFocus (data won't change)
    // For active markets: enable refetchOnWindowFocus
    refetchOnWindowFocus: !isClosedMarket,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}