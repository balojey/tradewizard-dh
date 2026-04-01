"use client";

import { useState } from "react";
import { useTradeRecommendation, useRefreshRecommendation } from "@/hooks/useTradeRecommendation";
import { Brain, Database, TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";

interface RecommendationButtonProps {
  conditionId: string;
  onRecommendationClick?: () => void;
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export default function RecommendationButton({
  conditionId,
  onRecommendationClick,
  className = "",
  variant = 'secondary',
  size = 'md'
}: RecommendationButtonProps) {
  
  const { data: recommendation, isLoading, error } = useTradeRecommendation(conditionId);
  const refreshMutation = useRefreshRecommendation();

  const handleClick = () => {
    onRecommendationClick?.();
  };

  const getVariantClasses = () => {
    switch (variant) {
      case 'primary':
        return 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600';
      case 'secondary':
        return 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300';
      case 'ghost':
        return 'bg-transparent hover:bg-gray-100 text-gray-600 border-transparent';
      default:
        return 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300';
    }
  };

  const getSizeClasses = () => {
    switch (size) {
      case 'sm':
        return 'px-2 py-1 text-xs';
      case 'md':
        return 'px-3 py-2 text-sm';
      case 'lg':
        return 'px-4 py-2 text-base';
      default:
        return 'px-3 py-2 text-sm';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LONG_YES': return <TrendingUp className="w-4 h-4 text-green-600" />;
      case 'LONG_NO': return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'NO_TRADE': return <AlertTriangle className="w-4 h-4 text-gray-600" />;
      default: return <Database className="w-4 h-4" />;
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'LONG_YES': return 'AI: BUY YES';
      case 'LONG_NO': return 'AI: BUY NO';
      case 'NO_TRADE': return 'AI: NO TRADE';
      default: return 'View AI Analysis';
    }
  };

  if (isLoading) {
    return (
      <button
        disabled
        className={`
          flex items-center gap-2 border rounded-lg font-medium transition-all duration-200
          opacity-50 cursor-not-allowed
          ${getVariantClasses()}
          ${getSizeClasses()}
          ${className}
        `}
      >
        <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span>Loading...</span>
      </button>
    );
  }

  if (error) {
    return (
      <button
        onClick={() => refreshMutation.mutate(conditionId)}
        disabled={refreshMutation.isPending}
        className={`
          flex items-center gap-2 border rounded-lg font-medium transition-all duration-200
          border-gray-300 text-gray-500 hover:bg-gray-50
          ${getSizeClasses()}
          ${className}
        `}
      >
        <Brain className="w-4 h-4 opacity-60" />
        <span>No AI Analysis</span>
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={`
        flex items-center gap-2 border rounded-lg font-medium transition-all duration-200
        hover:scale-105 active:scale-95
        ${getVariantClasses()}
        ${getSizeClasses()}
        ${className}
      `}
    >
      {recommendation ? (
        <>
          {getActionIcon(recommendation.action)}
          <span>{getActionText(recommendation.action)}</span>
          {recommendation.action !== 'NO_TRADE' && (
            <span className="text-xs opacity-60">
              EV: ${recommendation.expectedValue.toFixed(1)}
            </span>
          )}
        </>
      ) : (
        <>
          <Brain className="w-4 h-4 opacity-60" />
          <span>No AI Analysis</span>
        </>
      )}
    </button>
  );
}