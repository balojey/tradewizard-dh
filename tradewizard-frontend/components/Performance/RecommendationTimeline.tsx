"use client";

import React, { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TrendingUp, TrendingDown, Minus, Clock, Target, DollarSign } from "lucide-react";
import Card from "@/components/shared/Card";
import EmptyState from "@/components/shared/EmptyState";
import { RecommendationWithOutcome } from "@/hooks/useMarketPerformance";

interface RecommendationTimelineProps {
  recommendations: RecommendationWithOutcome[];
  onRecommendationClick?: (recommendationId: string) => void;
  selectedRecommendationId?: string;
  className?: string;
}

/**
 * RecommendationTimeline Component
 * 
 * Displays AI recommendations in chronological order with key metrics.
 * Shows timestamp, type (LONG_YES/LONG_NO/NO_TRADE), confidence, price, and ROI.
 * Highlights selected recommendation and triggers chart highlighting on click.
 * Uses virtual scrolling for performance with long lists.
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 11.4
 * 
 * @param recommendations - Array of recommendations with outcome data
 * @param onRecommendationClick - Callback when a recommendation is clicked
 * @param selectedRecommendationId - ID of currently selected recommendation
 */
export default function RecommendationTimeline({
  recommendations,
  onRecommendationClick,
  selectedRecommendationId,
  className = "",
}: RecommendationTimelineProps) {
  // Sort recommendations chronologically (ascending by timestamp)
  const sortedRecommendations = useMemo(() => {
    if (!recommendations || recommendations.length === 0) return [];
    
    return [...recommendations].sort((a, b) => {
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [recommendations]);

  // Reference to the scrollable container
  const parentRef = useRef<HTMLDivElement>(null);

  // Virtual scrolling configuration
  const virtualizer = useVirtualizer({
    count: sortedRecommendations.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 180, // Estimated row height in pixels
    overscan: 5, // Number of items to render outside visible area
  });

  if (!recommendations || recommendations.length === 0) {
    return (
      <Card className={`p-6 ${className}`}>
        <EmptyState
          icon={Clock}
          title="No Recommendations Available"
          message="This market has no AI recommendations to display. The timeline will show the complete history of recommendations once they are generated."
        />
      </Card>
    );
  }

  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-6">
        <h4 className="text-lg font-bold text-white mb-1">
          Recommendation Timeline
        </h4>
        <p className="text-sm text-gray-400">
          Complete history of AI recommendations in chronological order
          {sortedRecommendations.length > 10 && (
            <span className="ml-2 text-gray-500">
              ({sortedRecommendations.length} recommendations)
            </span>
          )}
        </p>
      </div>

      {/* Virtual scrolling container */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{
          height: sortedRecommendations.length > 5 ? "600px" : "auto",
          maxHeight: "600px",
        }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const recommendation = sortedRecommendations[virtualRow.index];
            const isFirstItem = virtualRow.index === 0;
            
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <div className={isFirstItem ? "" : "mt-3"}>
                  <TimelineItem
                    recommendation={recommendation}
                    index={virtualRow.index}
                    isSelected={recommendation.id === selectedRecommendationId}
                    onClick={() => onRecommendationClick?.(recommendation.id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

interface TimelineItemProps {
  recommendation: RecommendationWithOutcome;
  index: number;
  isSelected: boolean;
  onClick: () => void;
}

function TimelineItem({ recommendation, index, isSelected, onClick }: TimelineItemProps) {
  const isProfitable = recommendation.roiRealized >= 0;
  const isNoTrade = recommendation.direction === "NO_TRADE";

  // Get direction icon and color
  const getDirectionConfig = () => {
    switch (recommendation.direction) {
      case "LONG_YES":
        return {
          icon: TrendingUp,
          label: "LONG YES",
          color: "text-emerald-400",
          bgColor: "bg-emerald-500/10",
          borderColor: "border-emerald-500/30",
        };
      case "LONG_NO":
        return {
          icon: TrendingDown,
          label: "LONG NO",
          color: "text-red-400",
          bgColor: "bg-red-500/10",
          borderColor: "border-red-500/30",
        };
      case "NO_TRADE":
        return {
          icon: Minus,
          label: "NO TRADE",
          color: "text-gray-400",
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-500/30",
        };
      default:
        return {
          icon: Minus,
          label: "UNKNOWN",
          color: "text-gray-400",
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-500/30",
        };
    }
  };

  const directionConfig = getDirectionConfig();
  const DirectionIcon = directionConfig.icon;

  // Get confidence badge styling
  const getConfidenceBadge = () => {
    switch (recommendation.confidence) {
      case "high":
        return {
          label: "HIGH",
          color: "text-emerald-400",
          bgColor: "bg-emerald-500/20",
        };
      case "moderate":
        return {
          label: "MODERATE",
          color: "text-yellow-400",
          bgColor: "bg-yellow-500/20",
        };
      case "low":
        return {
          label: "LOW",
          color: "text-gray-400",
          bgColor: "bg-gray-500/20",
        };
      default:
        return {
          label: "UNKNOWN",
          color: "text-gray-400",
          bgColor: "bg-gray-500/20",
        };
    }
  };

  const confidenceBadge = getConfidenceBadge();

  return (
    <div
      data-testid="timeline-item"
      data-timestamp={recommendation.createdAt}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Recommendation ${index + 1}: ${directionConfig.label}, ${confidenceBadge.label} confidence, ${isProfitable ? 'profitable' : 'unprofitable'}, ROI ${recommendation.roiRealized.toFixed(2)}%. Click to highlight on chart.`}
      className={`
        group relative p-4 rounded-lg border transition-all duration-200 cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0A0A0B]
        ${
          isSelected
            ? "bg-indigo-500/20 border-indigo-500/50 shadow-lg shadow-indigo-500/20"
            : "bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20"
        }
      `}
    >
      {/* Timeline connector line */}
      {index > 0 && (
        <div className="absolute left-8 -top-3 w-0.5 h-3 bg-white/10" aria-hidden="true" />
      )}

      <div className="flex items-start gap-4">
        {/* Direction Icon */}
        <div
          className={`
            flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center border
            ${directionConfig.bgColor} ${directionConfig.borderColor}
          `}
          aria-hidden="true"
        >
          <DirectionIcon className={`w-6 h-6 ${directionConfig.color}`} />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-sm font-bold ${directionConfig.color}`}>
                  {directionConfig.label}
                </span>
                <span
                  className={`
                    text-xs font-medium px-2 py-0.5 rounded-full uppercase tracking-wider
                    ${confidenceBadge.bgColor} ${confidenceBadge.color}
                  `}
                >
                  {confidenceBadge.label}
                </span>
              </div>
              
              {/* Timestamp */}
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <Clock className="w-3.5 h-3.5" />
                <span>
                  {new Date(recommendation.createdAt).toLocaleString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>

            {/* ROI Badge */}
            {!isNoTrade && (
              <div className="flex-shrink-0 text-right">
                <div
                  className={`
                    text-lg font-bold font-mono
                    ${isProfitable ? "text-emerald-400" : "text-red-400"}
                  `}
                >
                  {isProfitable ? "+" : ""}
                  {recommendation.roiRealized.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wider">
                  ROI
                </div>
              </div>
            )}
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Market Price */}
            <div className="flex items-center gap-2">
              <DollarSign className="w-3.5 h-3.5 text-gray-500" />
              <div>
                <span className="text-gray-500">Market Price:</span>
                <span className="ml-1.5 text-white font-mono font-medium">
                  ${recommendation.marketPriceAtRecommendation.toFixed(3)}
                </span>
              </div>
            </div>

            {/* Fair Probability */}
            <div className="flex items-center gap-2">
              <Target className="w-3.5 h-3.5 text-gray-500" />
              <div>
                <span className="text-gray-500">Fair Prob:</span>
                <span className="ml-1.5 text-white font-mono font-medium">
                  {(recommendation.fairProbability * 100).toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Entry Zone */}
            {!isNoTrade && (
              <>
                <div className="col-span-2 flex items-center gap-2">
                  <div className="text-gray-500">Entry Zone:</div>
                  <div className="text-white font-mono text-xs">
                    ${recommendation.entryZoneMin.toFixed(3)} - ${recommendation.entryZoneMax.toFixed(3)}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Explanation Preview */}
          {recommendation.explanation && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">
                {recommendation.explanation}
              </p>
            </div>
          )}

          {/* Outcome Badge */}
          {recommendation.wasCorrect !== undefined && (
            <div className="mt-3 flex items-center gap-2">
              <span
                className={`
                  text-xs font-medium px-2 py-1 rounded-md
                  ${
                    recommendation.wasCorrect
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-red-500/20 text-red-400 border border-red-500/30"
                  }
                `}
              >
                {recommendation.wasCorrect ? "✓ Correct Prediction" : "✗ Incorrect Prediction"}
              </span>
              <span className="text-xs text-gray-500">
                Outcome: <span className="text-white font-medium">{recommendation.actualOutcome}</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Selected Indicator */}
      {isSelected && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-l-lg" />
      )}

      {/* Hover Effect Indicator */}
      <div
        className={`
          absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity
          text-xs text-gray-400
          ${isSelected ? "opacity-0" : ""}
        `}
      >
        Click to highlight on chart →
      </div>
    </div>
  );
}
