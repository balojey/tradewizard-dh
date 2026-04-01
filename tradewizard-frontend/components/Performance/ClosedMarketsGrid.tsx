"use client";

import React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ClosedMarketPerformance } from "@/hooks/usePerformanceData";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  XCircle,
  BarChart2,
  Calendar,
  Target,
  Info,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import Card from "@/components/shared/Card";
import LoadingState from "@/components/shared/LoadingState";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import { logError } from "@/utils/errorLogging";

/**
 * Props for ClosedMarketsGrid component
 */
interface ClosedMarketsGridProps {
  /** Array of closed markets with performance data */
  markets: ClosedMarketPerformance[];
  /** Loading state indicator */
  isLoading: boolean;
  /** Optional callback when a market card is clicked */
  onMarketClick?: (marketSlug: string) => void;
  /** Whether there are more pages to load */
  hasNextPage?: boolean;
  /** Whether the next page is currently being fetched */
  isFetchingNextPage?: boolean;
  /** Callback to load more markets */
  onLoadMore?: () => void;
  /** Total number of markets available */
  totalCount?: number;
  /** Current number of markets displayed */
  currentCount?: number;
}

/**
 * ClosedMarketsGrid Component
 * 
 * Displays closed markets in a responsive grid layout using homepage card pattern.
 * Supports pagination with "Load More" functionality and prefetches market data on hover.
 * 
 * Features:
 * - Responsive grid (1 col mobile, 2 col tablet, 3 col desktop)
 * - Loading skeletons during data fetch
 * - Empty state when no markets found
 * - Pagination controls with touch-friendly buttons (min 44px height)
 * - Hover prefetching for improved perceived performance
 * - Visual indicators for markets with/without AI recommendations
 * 
 * Requirements: 1.2, 1.4, 1.5, 1.6, 2.1, 14.1, 14.2, 14.3
 * 
 * @example
 * ```tsx
 * <ClosedMarketsGrid
 *   markets={closedMarkets}
 *   isLoading={isLoading}
 *   hasNextPage={hasNextPage}
 *   onLoadMore={fetchNextPage}
 *   totalCount={100}
 *   currentCount={20}
 * />
 * ```
 */
export default function ClosedMarketsGrid({
  markets,
  isLoading,
  onMarketClick,
  hasNextPage = false,
  isFetchingNextPage = false,
  onLoadMore,
  totalCount,
  currentCount,
}: ClosedMarketsGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <LoadingSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/5">
        <Target className="h-12 w-12 text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-400 mb-2">
          No resolved markets found
        </h3>
        <p className="text-gray-600 text-sm max-w-md mx-auto">
          There are currently no resolved markets matching your filters. Try adjusting your filters or check back later once active markets have resolved.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Markets Grid - Single column on mobile, 2 on tablet, 3 on desktop */}
      <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {markets.map((market) => (
          <ClosedMarketCard
            key={market.market_id}
            market={market}
            onMarketClick={onMarketClick}
          />
        ))}
      </div>

      {/* Pagination Controls - Touch-friendly on mobile */}
      {(hasNextPage || totalCount) && (
        <div className="flex flex-col items-center gap-4 pt-4">
          {/* Count Display */}
          {totalCount && currentCount && (
            <div className="text-xs sm:text-sm text-gray-400 text-center px-4">
              Showing <span className="font-semibold text-gray-300">{currentCount}</span> of{" "}
              <span className="font-semibold text-gray-300">{totalCount}</span> markets
            </div>
          )}

          {/* Load More Button - Min 44px height for touch */}
          {hasNextPage && onLoadMore && (
            <button
              onClick={onLoadMore}
              disabled={isFetchingNextPage}
              aria-label={isFetchingNextPage ? "Loading more markets" : "Load more markets"}
              aria-live="polite"
              aria-busy={isFetchingNextPage}
              className="min-h-[44px] px-6 py-3 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 active:bg-indigo-500/30 border border-indigo-500/30 hover:border-indigo-500/50 text-indigo-400 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 touch-manipulation focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0A0A0B]"
            >
              {isFetchingNextPage ? (
                <>
                  <div className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin" />
                  <span className="text-sm sm:text-base">Loading...</span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-4 h-4" />
                  <span className="text-sm sm:text-base">Load More Markets</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {/* Loading More Skeleton - Responsive grid */}
      {isFetchingNextPage && (
        <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {[...Array(3)].map((_, i) => (
            <LoadingSkeleton key={`loading-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Props for ClosedMarketCard component
 */
interface ClosedMarketCardProps {
  /** Market data with performance metrics */
  market: ClosedMarketPerformance;
  /** Optional callback when card is clicked */
  onMarketClick?: (marketSlug: string) => void;
}

/**
 * ClosedMarketCard Component
 * 
 * Individual market card displaying:
 * - Market title and resolution outcome
 * - AI recommendation status (if available)
 * - ROI and performance metrics
 * - Visual indicators for win/loss
 * - Category badge
 * 
 * Features:
 * - Hover effects with gradient overlay
 * - Prefetches market details from Polymarket on hover
 * - Error boundary for graceful failure handling
 * - Touch-friendly with proper sizing
 * - Responsive layout
 * 
 * @param market - Market data to display
 * @param onMarketClick - Optional click handler
 */
function ClosedMarketCard({ market, onMarketClick }: ClosedMarketCardProps) {
  const queryClient = useQueryClient();
  const hasRecommendations = !!market.recommendation_id;
  const isWin = market.recommendation_was_correct;
  
  // Use Polymarket slug if available, otherwise fall back to market_id
  const marketSlug = market.slug || market.market_id;
  const hasValidSlug = !!market.slug;

  const handleClick = () => {
    if (onMarketClick) {
      onMarketClick(marketSlug);
    }
  };

  /**
   * Prefetch market data on hover
   * - If we have a valid Polymarket slug, prefetch market details
   * - Also prefetch performance data if recommendations exist
   */
  const handleMouseEnter = () => {
    // Prefetch market details from Polymarket if we have a slug
    if (hasValidSlug) {
      queryClient.prefetchQuery({
        queryKey: ["market-by-slug", market.slug],
        queryFn: async () => {
          const response = await fetch(
            `/api/polymarket/market-by-slug?slug=${market.slug}`
          );
          if (!response.ok) {
            throw new Error("Failed to prefetch market details");
          }
          return response.json();
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
      });
    } else if (market.condition_id) {
      // Fallback: prefetch using condition_id
      queryClient.prefetchQuery({
        queryKey: ["market-by-condition", market.condition_id],
        queryFn: async () => {
          const response = await fetch(
            `/api/polymarket/market-by-condition?conditionId=${market.condition_id}`
          );
          if (!response.ok) {
            throw new Error("Failed to prefetch market details");
          }
          return response.json();
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
      });
    }

    // Prefetch performance data if recommendations exist
    if (hasRecommendations) {
      queryClient.prefetchQuery({
        queryKey: ["market-performance", market.market_id],
        queryFn: async () => {
          const response = await fetch(
            `/api/tradewizard/performance/${market.market_id}`
          );
          if (!response.ok) {
            throw new Error("Failed to prefetch market performance");
          }
          return response.json();
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
      });
    }
  };

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case "LONG_YES":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "LONG_NO":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "NO_TRADE":
        return "text-gray-400 bg-gray-500/10 border-gray-500/20";
      default:
        return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "moderate":
        return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "low":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      default:
        return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  return (
    <ErrorBoundary
      fallback={
        <Card className="bg-[#1C1C1E] border-red-500/20">
          <div className="p-4 text-center text-red-400 text-sm">
            Failed to render market card
          </div>
        </Card>
      }
      onError={(error) => {
        logError(error, {
          component: "ClosedMarketCard",
          marketId: market.market_id,
        });
      }}
    >
      <Link 
        href={`/market/${marketSlug}`} 
        onClick={handleClick}
        aria-label={`View details for ${market.question}. ${hasRecommendations ? `AI recommendation: ${market.direction.replace('_', ' ')}, ${market.confidence} confidence, ${isWin ? 'correct prediction' : 'incorrect prediction'}` : 'No AI analysis available'}`}
        className="focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0A0A0B] rounded-lg"
      >
      <Card
        hover
        onMouseEnter={handleMouseEnter}
        className="group relative flex flex-col h-full bg-[#1C1C1E] border-white/5 hover:border-indigo-500/30 transition-all duration-300 hover:shadow-[0_0_30px_-10px_rgba(79,70,229,0.2)] overflow-hidden focus-within:border-indigo-500/50"
        role="article"
        aria-labelledby={`market-title-${market.market_id}`}
      >
        {/* Hover Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-transparent to-purple-500/0 group-hover:from-indigo-500/5 group-hover:to-purple-500/5 transition-colors duration-500 pointer-events-none" />

        <div className="p-4 lg:p-5 flex-1 flex flex-col gap-4 relative z-10">
          {/* Header: Status Icon + Title */}
          <div className="flex items-start gap-3">
            {/* Status Icon */}
            {hasRecommendations ? (
              <div
                className={`mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${
                  isWin
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {isWin ? (
                  <CheckCircle className="w-5 h-5" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
              </div>
            ) : (
              <div className="mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border bg-gray-500/10 border-gray-500/30 text-gray-400">
                <BarChart2 className="w-5 h-5" />
              </div>
            )}

            {/* Title */}
            <div className="flex-1 min-w-0">
              <h4 
                id={`market-title-${market.market_id}`}
                className="font-semibold text-[15px] lg:text-base leading-snug mb-2 text-gray-100 group-hover:text-indigo-400 transition-colors line-clamp-3"
              >
                {market.question}
              </h4>
            </div>
          </div>

          {/* Resolution Outcome Badge */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-bold uppercase border ${
                market.resolved_outcome === "YES"
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-red-500/10 text-red-400 border-red-500/20"
              }`}
            >
              Resolved: {market.resolved_outcome}
            </span>
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {formatDistanceToNow(new Date(market.resolution_date), {
                addSuffix: true,
              })}
            </span>
          </div>

          {/* Recommendation Status or No Analysis Indicator */}
          {hasRecommendations ? (
            <div className="space-y-2">
              {/* Direction and Confidence Badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${getDirectionColor(
                    market.direction
                  )}`}
                >
                  {market.direction.replace("_", " ")}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${getConfidenceColor(
                    market.confidence
                  )}`}
                >
                  {market.confidence}
                </span>
              </div>

              {/* ROI Display — total across all recommendations */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    {market.roi_realized != null && market.roi_realized >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-xs text-gray-400 uppercase font-medium">
                      Total ROI
                    </span>
                  </div>
                  <span className="text-xs text-gray-600 pl-6">
                    {market.correct_count ?? 0}/{market.recommendation_count ?? 1} correct
                  </span>
                </div>
                <div className="text-right">
                  <span
                    className={`text-lg font-bold font-mono ${
                      market.roi_realized != null && market.roi_realized >= 0
                        ? "text-emerald-400"
                        : "text-red-400"
                    }`}
                  >
                    {market.roi_realized != null ? (
                      <>
                        {market.roi_realized >= 0 ? "+" : ""}
                        {market.roi_realized.toFixed(1)}%
                      </>
                    ) : (
                      "N/A"
                    )}
                  </span>
                  {market.recommendation_count > 1 && market.avg_roi != null && (
                    <div className="text-xs text-gray-500 font-mono">
                      avg {market.avg_roi >= 0 ? "+" : ""}{market.avg_roi.toFixed(1)}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-gray-500/5 border border-gray-500/20">
              <Info className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-gray-400">
                  No AI Analysis
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  No recommendations were generated for this market
                </p>
              </div>
            </div>
          )}

          {/* Category Badge */}
          <div className="mt-auto pt-2 border-t border-white/5">
            <span className="px-2 py-0.5 rounded text-xs font-medium text-gray-400 border border-white/10 bg-white/5 uppercase">
              {market.event_type.replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </Card>
    </Link>
    </ErrorBoundary>
  );
}

/**
 * LoadingSkeleton Component
 * 
 * Displays an animated loading placeholder that matches the structure
 * of a ClosedMarketCard. Provides visual feedback during data fetching.
 * 
 * Uses pulse animation and matches card dimensions for smooth transitions.
 */
function LoadingSkeleton() {
  return (
    <Card className="bg-[#1C1C1E] border-white/5">
      <div className="p-4 lg:p-5 flex flex-col gap-4 animate-pulse">
        {/* Header skeleton */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-white/10 rounded w-3/4" />
            <div className="h-4 bg-white/10 rounded w-1/2" />
          </div>
        </div>

        {/* Badge skeleton */}
        <div className="flex gap-2">
          <div className="h-6 bg-white/10 rounded w-24" />
          <div className="h-6 bg-white/10 rounded w-20" />
        </div>

        {/* Content skeleton */}
        <div className="space-y-2">
          <div className="h-8 bg-white/10 rounded" />
          <div className="h-12 bg-white/10 rounded" />
        </div>

        {/* Footer skeleton */}
        <div className="pt-2 border-t border-white/5">
          <div className="h-5 bg-white/10 rounded w-32" />
        </div>
      </div>
    </Card>
  );
}
