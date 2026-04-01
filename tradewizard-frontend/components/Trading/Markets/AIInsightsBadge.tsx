"use client";

import { Brain, Sparkles, TrendingUp, Activity } from "lucide-react";
import { useHasMarketInsights } from "@/hooks/useMarketInsights";

interface AIInsightsBadgeProps {
  conditionId: string | null;
  size?: 'sm' | 'md';
  showDetails?: boolean;
}

export default function AIInsightsBadge({ 
  conditionId, 
  size = 'sm',
  showDetails = false 
}: AIInsightsBadgeProps) {
  const { 
    hasInsights, 
    hasRecommendation, 
    hasSentiment, 
    hasPriceHistory, 
    isLoading 
  } = useHasMarketInsights(conditionId);

  if (!conditionId) return null;

  const sizeClasses = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-2 text-sm';

  if (isLoading) {
    return (
      <div className={`flex items-center gap-1.5 bg-indigo-500/20 border border-indigo-500/30 rounded-lg ${sizeClasses}`}>
        <div className="w-3 h-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        <span className="font-medium text-indigo-400">AI</span>
      </div>
    );
  }

  if (!hasInsights) {
    return null; // Don't show badge if no insights available
  }

  const insightCount = [hasRecommendation, hasSentiment, hasPriceHistory].filter(Boolean).length;

  return (
    <div className={`flex items-center gap-1.5 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 rounded-lg ${sizeClasses}`}>
      <div className="relative">
        <Brain className="w-3 h-3 text-indigo-400" />
        {hasRecommendation && (
          <Sparkles className="w-2 h-2 text-purple-400 absolute -top-0.5 -right-0.5" />
        )}
      </div>
      
      <span className="font-medium text-indigo-400">
        {size === 'sm' ? 'AI' : 'AI Insights'}
      </span>
      
      {showDetails && (
        <div className="flex items-center gap-0.5 ml-1">
          {hasRecommendation && <TrendingUp className="w-2.5 h-2.5 text-green-400" />}
          {hasSentiment && <Activity className="w-2.5 h-2.5 text-purple-400" />}
          {hasPriceHistory && <div className="w-2 h-2 bg-indigo-400 rounded-full" />}
        </div>
      )}
      
      {size === 'md' && (
        <span className="text-xs text-indigo-400 bg-indigo-500/20 px-1.5 py-0.5 rounded-full">
          {insightCount}
        </span>
      )}
    </div>
  );
}