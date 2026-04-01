"use client";

import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { 
  History, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Clock,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle
} from "lucide-react";

import Card from "@/components/shared/Card";
import Badge from "@/components/shared/Badge";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import { 
  useHistoricalRecommendations,
  usePotentialPnL,
  type HistoricalRecommendation 
} from "@/hooks/useHistoricalRecommendations";

interface RecommendationHistoryProps {
  conditionId: string | null;
  currentMarketPrice: number;
  className?: string;
}

export default function RecommendationHistory({ 
  conditionId, 
  currentMarketPrice,
  className = "" 
}: RecommendationHistoryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<string | null>(null);

  const { 
    data: recommendations, 
    isLoading, 
    error 
  } = useHistoricalRecommendations(conditionId, { 
    limit: 10, 
    includeAgentSignals: false 
  });

  const { data: pnlData } = usePotentialPnL(conditionId, currentMarketPrice);

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LONG_YES': return <TrendingUp className="w-4 h-4" />;
      case 'LONG_NO': return <TrendingDown className="w-4 h-4" />;
      case 'NO_TRADE': return <Minus className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'LONG_YES': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'LONG_NO': return 'text-red-400 bg-red-500/10 border-red-500/20';
      case 'NO_TRADE': return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
      default: return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
    }
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatPnL = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

  const getPnLForRecommendation = (recommendationId: string) => {
    return pnlData?.find(p => p.recommendationId === recommendationId);
  };

  if (isLoading) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-indigo-400" />
          <h4 className="font-medium text-white">Recommendation History</h4>
        </div>
        <LoadingState message="Loading history..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-indigo-400" />
          <h4 className="font-medium text-white">Recommendation History</h4>
        </div>
        <ErrorState error={error instanceof Error ? error.message : 'Failed to load history'} />
      </Card>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center gap-2 mb-3">
          <History className="w-4 h-4 text-indigo-400" />
          <h4 className="font-medium text-white">Recommendation History</h4>
        </div>
        <div className="text-center py-4 text-gray-400 text-sm">
          No historical recommendations available
        </div>
      </Card>
    );
  }

  const displayedRecommendations = isExpanded ? recommendations : recommendations.slice(0, 3);
  const hasMore = recommendations.length > 3;

  return (
    <Card className={`${className} border-indigo-500/20`}>
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-400" />
            <h4 className="font-medium text-white">Recommendation History</h4>
            <Badge variant="default" className="text-xs">
              {recommendations.length}
            </Badge>
          </div>

          {hasMore && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 transition-colors"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show All
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {displayedRecommendations.map((recommendation, index) => {
          const pnl = getPnLForRecommendation(recommendation.id);
          const isLatest = index === 0;
          const isSelected = selectedRecommendation === recommendation.id;

          return (
            <div
              key={recommendation.id}
              className={`
                p-3 rounded-lg border transition-all cursor-pointer
                ${isSelected 
                  ? 'bg-indigo-500/10 border-indigo-500/30' 
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
                }
              `}
              onClick={() => setSelectedRecommendation(
                isSelected ? null : recommendation.id
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded border ${getActionColor(recommendation.action)}`}>
                    {getActionIcon(recommendation.action)}
                  </div>
                  
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {recommendation.action.replace('_', ' ')}
                      </span>
                      {isLatest && (
                        <Badge variant="default" className="text-xs text-green-400 border-green-500/30">
                          Latest
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(recommendation.timestamp), { addSuffix: true })}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm font-medium text-white">
                    {formatPercentage(recommendation.metadata.consensusProbability)}
                  </div>
                  {pnl && (
                    <div className={`text-xs ${
                      pnl.wouldHaveProfit ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatPnL(pnl.potentialReturnPercent)}
                    </div>
                  )}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>Edge: {formatPercentage(recommendation.metadata.edge)}</span>
                <span>EV: {formatPercentage(recommendation.expectedValue)}</span>
                {recommendation.metadata.agentCount && (
                  <span>{recommendation.metadata.agentCount} agents</span>
                )}
              </div>

              {/* Expanded Details */}
              {isSelected && (
                <div className="mt-4 pt-3 border-t border-white/10 space-y-3">
                  {/* Entry and Target Zones */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2 bg-white/5 rounded border border-white/10">
                      <div className="text-xs text-gray-400 mb-1">Entry Zone</div>
                      <div className="text-sm font-medium text-white">
                        {formatPercentage(recommendation.entryZone[0])} - {formatPercentage(recommendation.entryZone[1])}
                      </div>
                    </div>
                    <div className="p-2 bg-white/5 rounded border border-white/10">
                      <div className="text-xs text-gray-400 mb-1">Target Zone</div>
                      <div className="text-sm font-medium text-white">
                        {formatPercentage(recommendation.targetZone[0])} - {formatPercentage(recommendation.targetZone[1])}
                      </div>
                    </div>
                  </div>

                  {/* P&L Details */}
                  {pnl && (
                    <div className="p-3 bg-indigo-500/5 rounded border border-indigo-500/20">
                      <div className="flex items-center gap-2 text-indigo-400 text-xs font-medium mb-2">
                        <DollarSign className="w-3 h-3" />
                        Potential P&L Analysis
                      </div>
                      
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div>
                          <div className="text-gray-400 mb-1">Entry Price</div>
                          <div className="text-white font-medium">
                            {formatPercentage(pnl.entryPrice * 100)}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400 mb-1">Current Price</div>
                          <div className="text-white font-medium">
                            {formatPercentage(pnl.currentPrice * 100)}
                          </div>
                        </div>
                        <div>
                          <div className="text-gray-400 mb-1">Days Held</div>
                          <div className="text-white font-medium">
                            {pnl.daysHeld}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 pt-2 border-t border-indigo-500/20">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Total Return:</span>
                          <span className={`text-sm font-semibold ${
                            pnl.wouldHaveProfit ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {formatPnL(pnl.potentialReturnPercent)}
                          </span>
                        </div>
                        {pnl.annualizedReturn && (
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-400">Annualized:</span>
                            <span className="text-xs text-gray-300">
                              {formatPnL(pnl.annualizedReturn)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Key Catalysts */}
                  {recommendation.explanation.keyCatalysts.length > 0 && (
                    <div className="p-3 bg-green-500/5 rounded border border-green-500/20">
                      <div className="text-xs text-green-400 font-medium mb-2">Key Catalysts</div>
                      <div className="space-y-1">
                        {recommendation.explanation.keyCatalysts.slice(0, 2).map((catalyst, idx) => (
                          <div key={idx} className="text-xs text-gray-300 flex items-start gap-2">
                            <div className="w-1 h-1 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                            {catalyst}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Comparison with Previous */}
                  {index < recommendations.length - 1 && (() => {
                    const previous = recommendations[index + 1];
                    const actionChanged = recommendation.action !== previous.action;
                    const probDelta = recommendation.metadata.consensusProbability - previous.metadata.consensusProbability;
                    
                    return (actionChanged || Math.abs(probDelta) > 0.01) && (
                      <div className="p-3 bg-yellow-500/5 rounded border border-yellow-500/20">
                        <div className="text-xs text-yellow-400 font-medium mb-2">Changes from Previous</div>
                        <div className="space-y-1 text-xs">
                          {actionChanged && (
                            <div className="flex items-center gap-2 text-yellow-300">
                              <ArrowUpRight className="w-3 h-3" />
                              Action changed from {previous.action} to {recommendation.action}
                            </div>
                          )}
                          {Math.abs(probDelta) > 0.01 && (
                            <div className="flex items-center gap-2 text-gray-300">
                              {probDelta > 0 ? (
                                <ArrowUpRight className="w-3 h-3 text-green-400" />
                              ) : (
                                <ArrowDownRight className="w-3 h-3 text-red-400" />
                              )}
                              Fair probability {probDelta > 0 ? 'increased' : 'decreased'} by {Math.abs(probDelta * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}

        {/* Summary Stats */}
        {pnlData && pnlData.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/10">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                <div className="text-sm font-semibold text-white">
                  {((pnlData.filter(p => p.wouldHaveProfit).length / pnlData.length) * 100).toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Avg Return</div>
                <div className="text-sm font-semibold text-white">
                  {formatPnL(pnlData.reduce((sum, p) => sum + p.potentialReturnPercent, 0) / pnlData.length)}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Best Return</div>
                <div className="text-sm font-semibold text-green-400">
                  {formatPnL(Math.max(...pnlData.map(p => p.potentialReturnPercent)))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}