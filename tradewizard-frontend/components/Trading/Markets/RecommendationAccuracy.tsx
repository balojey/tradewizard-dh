"use client";

import { Target, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { cn } from "@/utils/classNames";
import type { PolymarketMarket } from "@/hooks/useMarkets";
import { getResolutionStatus } from "@/utils/marketResolution";

interface RecommendationAccuracyProps {
  market: PolymarketMarket;
  recommendation?: {
    action: string;
    winProbability: number;
    expectedValue: number;
  } | null;
  size?: "sm" | "md" | "lg";
}

export default function RecommendationAccuracy({
  market,
  recommendation,
  size = "md",
}: RecommendationAccuracyProps) {
  const resolution = getResolutionStatus(market);

  // Only show for resolved markets with recommendations
  if (resolution.status !== 'resolved' || !recommendation || !resolution.outcome) {
    return null;
  }

  // Determine if the AI recommendation was correct
  const recommendedAction = recommendation.action.toLowerCase();
  const actualOutcome = resolution.outcome.toLowerCase();
  
  let isCorrect = false;
  let accuracy = 'unknown';

  if (recommendedAction.includes('buy') || recommendedAction.includes('yes')) {
    isCorrect = actualOutcome === 'yes';
    accuracy = isCorrect ? 'correct' : 'incorrect';
  } else if (recommendedAction.includes('sell') || recommendedAction.includes('no')) {
    isCorrect = actualOutcome === 'no';
    accuracy = isCorrect ? 'correct' : 'incorrect';
  } else if (recommendedAction.includes('avoid') || recommendedAction.includes('hold')) {
    // For avoid/hold recommendations, we consider them "neutral"
    accuracy = 'neutral';
  }

  const sizeClasses = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-1.5",
    lg: "text-base px-4 py-2",
  };

  const iconSizes = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  if (accuracy === 'correct') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border transition-colors",
        sizeClasses[size],
        "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
      )}>
        <Target className={iconSizes[size]} />
        <span>AI Correct</span>
        <span className="opacity-70">
          ({Math.round(recommendation.winProbability * 100)}%)
        </span>
      </div>
    );
  }

  if (accuracy === 'incorrect') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border transition-colors",
        sizeClasses[size],
        "bg-red-500/10 text-red-400 border-red-500/20"
      )}>
        <AlertCircle className={iconSizes[size]} />
        <span>AI Missed</span>
        <span className="opacity-70">
          ({Math.round(recommendation.winProbability * 100)}%)
        </span>
      </div>
    );
  }

  if (accuracy === 'neutral') {
    return (
      <div className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border transition-colors",
        sizeClasses[size],
        "bg-yellow-500/10 text-yellow-400 border-yellow-500/20"
      )}>
        <TrendingUp className={iconSizes[size]} />
        <span>AI Neutral</span>
      </div>
    );
  }

  return null;
}