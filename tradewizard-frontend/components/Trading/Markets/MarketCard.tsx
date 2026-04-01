import React, { useMemo, memo } from "react";
import type { PolymarketMarket } from "@/hooks/useMarkets";
import Link from "next/link";
import { isMarketEndingSoon } from "@/utils/marketFilters";

import Card from "@/components/shared/Card";
import OutcomeButtons from "@/components/Trading/Markets/OutcomeButtons";
import PercentageGauge from "@/components/shared/PercentageGauge";
import OptimizedRecommendationBadge from "@/components/Trading/Markets/OptimizedRecommendationBadge";
import AIInsightsBadge from "@/components/Trading/Markets/AIInsightsBadge";
import ResolutionBadge from "@/components/Trading/Markets/ResolutionBadge";
import RecommendationAccuracy from "@/components/Trading/Markets/RecommendationAccuracy";

import { formatVolume } from "@/utils/formatting";
import { TrendingUp, BarChart2, Bookmark } from "lucide-react";

interface RecommendationData {
  action: string;
  winProbability: number;
  expectedValue: number;
}

interface MarketCardProps {
  market: PolymarketMarket;
  disabled?: boolean;
  recommendation?: RecommendationData | null | undefined;
  recommendationLoading?: boolean;
  compact?: boolean;
  onOutcomeClick: (
    marketTitle: string,
    outcome: string,
    price: number,
    tokenId: string,
    negRisk: boolean
  ) => void;
}

const MarketCard = memo(function MarketCard({
  market,
  disabled = false,
  recommendation,
  recommendationLoading = false,
  compact = false,
  onOutcomeClick,
}: MarketCardProps) {
  // Memoize expensive calculations
  const marketData = useMemo(() => {
    const volumeUSD = parseFloat(
      String(market.volume24hr || market.volume || "0")
    );
    const liquidityUSD = parseFloat(String(market.liquidity || "0"));
    const isClosed = market.closed;
    const isActive = market.active && !market.closed;
    const isEndingSoon = isActive && isMarketEndingSoon(market);

    return {
      volumeUSD,
      liquidityUSD,
      isClosed,
      isActive,
      isEndingSoon,
    };
  }, [market.volume24hr, market.volume, market.liquidity, market.closed, market.active, market.endDate]);

  // Memoize status badge
  const statusBadge = useMemo(() => {
    if (marketData.isClosed) {
      return { text: "Closed", color: "bg-red-500/10 text-red-500 border-red-500/20" };
    }
    if (marketData.isEndingSoon) {
      return { text: "Ending Soon", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" };
    }
    if (marketData.isActive) {
      return { text: "Active", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" };
    }
    return null;
  }, [marketData.isClosed, marketData.isEndingSoon, marketData.isActive]);

  // Memoize parsed market data
  const parsedMarketData = useMemo(() => {
    const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
    const tokenIds = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [];
    const negRisk = market.negRisk || false;
    
    const outcomePrices = tokenIds.map((tokenId: string) => {
      // First try to get realtime prices (from CLOB client or public API)
      const realtimePrice = market.realtimePrices?.[tokenId]?.bidPrice;
      if (realtimePrice && realtimePrice > 0) {
        return realtimePrice;
      }

      // Fallback to static outcome prices from market data
      if (market.outcomePrices) {
        try {
          const staticPrices = JSON.parse(market.outcomePrices);
          const tokenIndex = tokenIds.indexOf(tokenId);
          if (tokenIndex !== -1 && staticPrices[tokenIndex]) {
            return parseFloat(staticPrices[tokenIndex]);
          }
        } catch (error) {
          console.warn(`Failed to parse static prices for market ${market.id}`);
        }
      }

      return 0;
    });

    // Calculate "Yes" probability for the gauge if 'Yes' outcome exists
    const yesIndex = outcomes.findIndex((o: string) => o.toLowerCase() === "yes");
    const yesPrice = yesIndex !== -1 ? (outcomePrices?.[yesIndex] || 0) : 0;
    const yesChance = Math.round(yesPrice * 100);

    return {
      outcomes,
      tokenIds,
      negRisk,
      outcomePrices,
      yesChance,
    };
  }, [market.outcomes, market.clobTokenIds, market.negRisk, market.realtimePrices, market.outcomePrices, market.id]);

  return (
    <Card hover className={`group relative flex flex-col h-full bg-[#1C1C1E] border-white/5 hover:border-indigo-500/30 transition-all duration-300 hover:shadow-[0_0_30px_-10px_rgba(79,70,229,0.2)] overflow-hidden ${compact ? 'min-h-0' : ''}`}>
      {/* Hover Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 via-transparent to-purple-500/0 group-hover:from-indigo-500/5 group-hover:to-purple-500/5 transition-colors duration-500 pointer-events-none" />

      <div className={`${compact ? 'p-3' : 'p-4 lg:p-5'} flex-1 flex flex-col gap-${compact ? '2' : '4'} relative z-10`}>
        {/* Header: Icon + Title + Gauge - Compact Layout */}
        <div className={`flex items-start gap-${compact ? '2' : '3 lg:gap-4'}`}>
          {/* Market Icon - Consistent sizing */}
          <div className="relative flex-shrink-0">
            {market.icon ? (
              <img
                src={market.icon}
                alt=""
                className={`${compact ? 'w-8 h-8' : 'w-11 h-11 lg:w-12 lg:h-12'} rounded-xl object-cover ring-1 ring-white/10 shadow-lg group-hover:scale-105 transition-transform duration-300`}
                loading="lazy"
              />
            ) : (
              <div className={`${compact ? 'w-8 h-8' : 'w-11 h-11 lg:w-12 lg:h-12'} rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 ring-1 ring-white/10 shadow-lg flex items-center justify-center`}>
                <BarChart2 className={`${compact ? 'w-4 h-4' : 'w-5 h-5 lg:w-6 lg:h-6'} text-gray-600`} />
              </div>
            )}
            {/* Active Indicator Dot */}
            {marketData.isActive && (
              <div className={`absolute -top-1 -right-1 ${compact ? 'w-2 h-2' : 'w-3 h-3'} bg-green-500 rounded-full border-2 border-[#1C1C1E]`} />
            )}
          </div>

          {/* Title and Status - More space for text */}
          <div className="flex-1 min-w-0">
            <Link href={`/market/${market.slug || market.id}`} className="block group/title">
              <h4 className={`font-semibold ${compact ? 'text-sm' : 'text-[15px] lg:text-base'} leading-snug ${compact ? 'mb-1' : 'mb-2'} text-gray-100 group-hover/title:text-indigo-400 transition-colors ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>
                {market.question}
              </h4>
            </Link>

            {/* Status and AI Badges - Compact layout */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Show resolution badge for closed markets, otherwise show regular status badge */}
              {marketData.isClosed ? (
                <ResolutionBadge market={market} size="sm" showDetails={false} />
              ) : (
                statusBadge && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold border ${statusBadge.color}`}>
                    {statusBadge.text}
                  </span>
                )
              )}
              {!compact && (
                <AIInsightsBadge
                  conditionId={market.conditionId || null}
                  size="sm"
                  showDetails={false}
                />
              )}
            </div>
          </div>

          {/* Probability Gauge - Consistent sizing */}
          <div className="flex-shrink-0">
            <PercentageGauge value={parsedMarketData.yesChance} size={compact ? 36 : 46} />
          </div>
        </div>

        {/* AI Recommendation Display - Compact */}
        {!compact && (
          <div className="transform transition-transform duration-300 origin-left">
            {marketData.isClosed ? (
              <RecommendationAccuracy
                market={market}
                recommendation={recommendation}
                size="md"
              />
            ) : (
              <OptimizedRecommendationBadge
                conditionId={market.conditionId || null}
                recommendation={recommendation || null}
                isLoading={recommendationLoading}
                size="md"
                showDetails={true}
              />
            )}
          </div>
        )}

        {/* Outcome Buttons - Maintain horizontal layout */}
        <div className="mt-auto">
          <OutcomeButtons
            outcomes={parsedMarketData.outcomes}
            outcomePrices={parsedMarketData.outcomePrices}
            tokenIds={parsedMarketData.tokenIds}
            isClosed={marketData.isClosed}
            negRisk={parsedMarketData.negRisk}
            marketQuestion={market.question}
            disabled={disabled}
            onOutcomeClick={onOutcomeClick}
            layout="horizontal"
            size={compact ? "sm" : "md"}
          />
        </div>
      </div>

      {/* Footer: Volume + Bookmark - Compact */}
      {!compact && (
        <div className="relative z-10 px-4 lg:px-5 py-2.5 border-t border-white/5 bg-white/[0.02] flex items-center justify-between text-xs text-gray-500 group-hover:text-gray-400 transition-colors">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex items-center gap-1.5 font-medium truncate">
              <BarChart2 className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />
              <span className="truncate">{formatVolume(marketData.volumeUSD)} Vol.</span>
            </span>
            {market.active && (
              <span className="hidden sm:flex items-center gap-1.5 font-medium text-emerald-500/80">
                <TrendingUp className="w-3.5 h-3.5" />
                Live
              </span>
            )}
          </div>

          <button
            className="p-1.5 -mr-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-white transition-all active:scale-95 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Implement bookmarking
            }}
          >
            <Bookmark className="w-4 h-4" />
          </button>
        </div>
      )}
    </Card>
  );
});

export default MarketCard;
