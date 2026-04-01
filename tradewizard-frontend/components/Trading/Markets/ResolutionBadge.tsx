"use client";

import { CheckCircle, XCircle, Clock } from "lucide-react";
import { cn } from "@/utils/classNames";
import type { PolymarketMarket } from "@/hooks/useMarkets";
import { getResolutionStatus } from "@/utils/marketResolution";

interface ResolutionBadgeProps {
  market: PolymarketMarket;
  size?: "sm" | "md" | "lg";
  showDetails?: boolean;
}

export default function ResolutionBadge({
  market,
  size = "md",
  showDetails = true,
}: ResolutionBadgeProps) {
  const resolution = getResolutionStatus(market);

  if (resolution.status === 'active') {
    return null;
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

  if (resolution.status === 'resolved' && resolution.outcome) {
    const isYes = resolution.outcome.toLowerCase() === 'yes';
    
    return (
      <div className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium border transition-colors",
        sizeClasses[size],
        isYes 
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
          : "bg-red-500/10 text-red-400 border-red-500/20"
      )}>
        {isYes ? (
          <CheckCircle className={iconSizes[size]} />
        ) : (
          <XCircle className={iconSizes[size]} />
        )}
        <span>
          Resolved: {resolution.outcome}
        </span>
        {showDetails && resolution.resolvedAt && (
          <span className="opacity-70 ml-1">
            ({new Date(resolution.resolvedAt).toLocaleDateString()})
          </span>
        )}
      </div>
    );
  }

  // Closed but not resolved
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-full font-medium border transition-colors",
      sizeClasses[size],
      "bg-gray-500/10 text-gray-400 border-gray-500/20"
    )}>
      <Clock className={iconSizes[size]} />
      <span>Closed</span>
    </div>
  );
}