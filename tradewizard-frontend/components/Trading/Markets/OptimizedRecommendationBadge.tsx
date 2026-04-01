"use client";

import React, { memo } from "react";
import { Brain, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { cn } from "@/utils/classNames";

interface RecommendationData {
  action: string;
  winProbability: number;
  expectedValue: number;
}

interface OptimizedRecommendationBadgeProps {
  conditionId: string | null;
  recommendation: RecommendationData | null;
  isLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showDetails?: boolean;
  className?: string;
}

const OptimizedRecommendationBadge = memo(function OptimizedRecommendationBadge({
  conditionId,
  recommendation,
  isLoading = false,
  size = 'md',
  showDetails = true,
  className
}: OptimizedRecommendationBadgeProps) {
  if (!conditionId) return null;

  if (isLoading) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 backdrop-blur-sm animate-pulse",
        size === 'sm' ? 'px-2 py-1' : 'px-3 py-1.5',
        className
      )}>
        <Brain className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
        <span className="text-xs font-medium text-indigo-400">Analyzing...</span>
      </div>
    );
  }

  if (!recommendation) return null;

  const variants = {
    LONG_YES: {
      gradient: "from-emerald-500/20 to-teal-500/10",
      border: "border-emerald-500/20",
      text: "text-emerald-400",
      icon: TrendingUp,
      glow: "shadow-[0_0_15px_-3px_rgba(16,185,129,0.2)]",
      label: "STRONG BUY YES"
    },
    LONG_NO: {
      gradient: "from-rose-500/20 to-red-500/10",
      border: "border-rose-500/20",
      text: "text-rose-400",
      icon: TrendingDown,
      glow: "shadow-[0_0_15px_-3px_rgba(244,63,94,0.2)]",
      label: "STRONG BUY NO"
    },
    NO_TRADE: {
      gradient: "from-slate-500/20 to-gray-500/10",
      border: "border-slate-500/20",
      text: "text-slate-400",
      icon: AlertTriangle,
      glow: "",
      label: "NO CLEAR SIGNAL"
    }
  };

  const style = variants[recommendation.action as keyof typeof variants] || variants.NO_TRADE;
  const Icon = style.icon;

  // Size consistency
  const padding = size === 'sm' ? 'px-2 py-1' : size === 'lg' ? 'px-4 py-2' : 'px-3 py-1.5';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const fontSize = size === 'sm' ? 'text-[10px]' : 'text-xs';

  return (
    <div className={cn(
      "relative group flex items-center justify-between gap-3 overflow-hidden rounded-lg border transition-all duration-300 hover:scale-[1.02]",
      "bg-gradient-to-r backdrop-blur-md",
      style.gradient,
      style.border,
      style.glow,
      padding,
      className
    )}>
      {/* Shimmer effect overlay */}
      <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent z-0" />

      {/* Main Content */}
      <div className="flex items-center gap-2 z-10">
        <div className={cn("p-1 rounded-md bg-white/5", style.text)}>
          <Icon className={iconSize} />
        </div>
        <div className="flex flex-col leading-none">
          <span className={cn("font-bold tracking-wider", fontSize, style.text)}>
            {size === 'sm' ? style.label.replace('STRONG ', '') : style.label}
          </span>
          {size === 'lg' && (
            <span className="text-[10px] text-muted-foreground opacity-70 mt-0.5">
              AI Recommendation
            </span>
          )}
        </div>
      </div>

      {/* Metrics */}
      {showDetails && recommendation.action !== 'NO_TRADE' && (
        <div className="flex items-center gap-3 z-10 pl-3 border-l border-white/10">
          <div className="flex flex-col items-end leading-none">
            <div className="flex items-center gap-1">
              <span className="text-[10px] uppercase font-bold text-muted-foreground/70">Win</span>
              <span className={cn("font-mono font-bold", fontSize, style.text)}>
                {(recommendation.winProbability * 100).toFixed(0)}%
              </span>
            </div>
            {size !== 'sm' && (
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground/70">EV</span>
                <span className={cn("font-mono", fontSize, "text-foreground/80")}>
                  ${recommendation.expectedValue.toFixed(2)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decorative pulse for high conviction trades */}
      {recommendation.winProbability > 0.7 && (
        <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-2 w-2">
          <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", style.text.replace('text-', 'bg-'))}></span>
          <span className={cn("relative inline-flex rounded-full h-2 w-2", style.text.replace('text-', 'bg-'))}></span>
        </span>
      )}
    </div>
  );
});

export default OptimizedRecommendationBadge;