"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  Award, 
  AlertTriangle,
  BarChart3,
  DollarSign,
  Percent,
  Calendar,
  Activity,
  Zap,
  Shield
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
import {
  calculateRecommendationPnL,
  calculatePerformanceMetrics,
  formatPercentageWithSign,
  formatCurrencyWithSign,
  calculateRiskAdjustedReturn,
  getRecommendationQuality,
  calculateMaxDrawdown,
  type RecommendationPerformanceMetrics
} from "@/utils/recommendationAnalysis";

interface RecommendationAnalyticsProps {
  conditionId: string | null;
  currentMarketPrice: number;
  className?: string;
}

export default function RecommendationAnalytics({ 
  conditionId, 
  currentMarketPrice,
  className = "" 
}: RecommendationAnalyticsProps) {
  const { 
    data: recommendations, 
    isLoading, 
    error 
  } = useHistoricalRecommendations(conditionId, { 
    limit: 50, 
    includeAgentSignals: false 
  });

  const { data: pnlData } = usePotentialPnL(conditionId, currentMarketPrice);

  // Calculate comprehensive analytics
  const analytics = useMemo(() => {
    if (!recommendations || !pnlData || recommendations.length === 0) {
      return null;
    }

    const tradableRecommendations = recommendations.filter(r => r.action !== 'NO_TRADE');
    const pnlCalculations = pnlData.filter(p => p.action !== 'NO_TRADE');
    
    const performanceMetrics = calculatePerformanceMetrics(
      pnlCalculations.map(p => ({
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        targetPrice: p.targetPrice,
        potentialReturn: p.potentialReturn,
        potentialReturnPercent: p.potentialReturnPercent,
        wouldHaveProfit: p.wouldHaveProfit,
        daysHeld: p.daysHeld,
        annualizedReturn: p.annualizedReturn
      }))
    );

    const riskAdjustedReturn = calculateRiskAdjustedReturn(
      pnlCalculations.map(p => ({
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        targetPrice: p.targetPrice,
        potentialReturn: p.potentialReturn,
        potentialReturnPercent: p.potentialReturnPercent,
        wouldHaveProfit: p.wouldHaveProfit,
        daysHeld: p.daysHeld,
        annualizedReturn: p.annualizedReturn
      }))
    );

    const maxDrawdown = calculateMaxDrawdown(
      pnlCalculations.map(p => ({
        entryPrice: p.entryPrice,
        currentPrice: p.currentPrice,
        targetPrice: p.targetPrice,
        potentialReturn: p.potentialReturn,
        potentialReturnPercent: p.potentialReturnPercent,
        wouldHaveProfit: p.wouldHaveProfit,
        daysHeld: p.daysHeld,
        annualizedReturn: p.annualizedReturn
      }))
    );

    const quality = getRecommendationQuality(
      performanceMetrics.winRate,
      performanceMetrics.averageReturn,
      riskAdjustedReturn
    );

    // Action distribution
    const actionCounts = recommendations.reduce((acc, rec) => {
      acc[rec.action] = (acc[rec.action] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Confidence distribution
    const confidenceCounts = recommendations.reduce((acc, rec) => {
      acc[rec.liquidityRisk] = (acc[rec.liquidityRisk] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Time-based analysis
    const recentRecommendations = recommendations.slice(0, 5);
    const olderRecommendations = recommendations.slice(5);
    
    const recentPnL = pnlData.slice(0, 5);
    const olderPnL = pnlData.slice(5);

    const recentWinRate = recentPnL.length > 0 
      ? (recentPnL.filter(p => p.wouldHaveProfit).length / recentPnL.length) * 100 
      : 0;
    
    const olderWinRate = olderPnL.length > 0 
      ? (olderPnL.filter(p => p.wouldHaveProfit).length / olderPnL.length) * 100 
      : 0;

    return {
      performanceMetrics,
      riskAdjustedReturn,
      maxDrawdown,
      quality,
      actionCounts,
      confidenceCounts,
      tradableRecommendations: tradableRecommendations.length,
      recentWinRate,
      olderWinRate,
      winRateTrend: recentWinRate - olderWinRate,
      totalRecommendations: recommendations.length,
      avgConfidence: recommendations.reduce((sum, r) => {
        const confidenceScore = r.liquidityRisk === 'low' ? 3 : r.liquidityRisk === 'medium' ? 2 : 1;
        return sum + confidenceScore;
      }, 0) / recommendations.length,
      avgEdge: recommendations.reduce((sum, r) => sum + r.metadata.edge, 0) / recommendations.length,
      consistencyScore: performanceMetrics.winRate > 0 ? 
        (performanceMetrics.averageReturn / Math.abs(performanceMetrics.worstReturn || 1)) * 100 : 0
    };
  }, [recommendations, pnlData, currentMarketPrice]);

  if (isLoading) {
    return (
      <Card className={`p-4 sm:p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm sm:text-base">Recommendation Analytics</h3>
        </div>
        <LoadingState message="Analyzing recommendation performance..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-4 sm:p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm sm:text-base">Recommendation Analytics</h3>
        </div>
        <ErrorState error={error instanceof Error ? error.message : 'Failed to load analytics'} />
      </Card>
    );
  }

  if (!analytics || !recommendations || recommendations.length === 0) {
    return (
      <Card className={`p-4 sm:p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <BarChart3 className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm sm:text-base">Recommendation Analytics</h3>
        </div>
        <div className="text-center py-8 text-gray-400">
          <BarChart3 className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No recommendation data available for analysis</p>
        </div>
      </Card>
    );
  }

  const { performanceMetrics, quality } = analytics;

  return (
    <div className={`space-y-4 sm:space-y-6 ${className}`}>
      {/* Performance Overview */}
      <Card className="p-4 sm:p-6 border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-purple-500/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm sm:text-base">Performance Overview</h3>
              <p className="text-xs sm:text-sm text-gray-400">
                {analytics.totalRecommendations} recommendations analyzed
              </p>
            </div>
          </div>

          <Badge 
            variant="default" 
            className={`${quality.colorClass} border-current/30 bg-current/10 self-start sm:self-center`}
          >
            {quality.quality.toUpperCase()}
          </Badge>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
              <Target className="w-3 h-3" />
              Win Rate
            </div>
            <div className="text-lg sm:text-2xl font-bold text-white mb-1">
              {performanceMetrics.winRate.toFixed(0)}%
            </div>
            {analytics.winRateTrend !== 0 && (
              <div className={`flex items-center gap-1 text-xs ${
                analytics.winRateTrend > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {analytics.winRateTrend > 0 ? (
                  <TrendingUp className="w-3 h-3" />
                ) : (
                  <TrendingDown className="w-3 h-3" />
                )}
                <span className="break-words">{Math.abs(analytics.winRateTrend).toFixed(0)}% vs older</span>
              </div>
            )}
          </div>

          <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
              <DollarSign className="w-3 h-3" />
              Avg Return
            </div>
            <div className={`text-lg sm:text-2xl font-bold mb-1 ${
              performanceMetrics.averageReturn >= 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatPercentageWithSign(performanceMetrics.averageReturn).text}
            </div>
            <div className="text-xs text-gray-400 break-words">
              Best: {formatPercentageWithSign(performanceMetrics.bestReturn).text}
            </div>
          </div>

          <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
              <Shield className="w-3 h-3" />
              Risk Score
            </div>
            <div className="text-lg sm:text-2xl font-bold text-white mb-1">
              {analytics.riskAdjustedReturn.toFixed(1)}
            </div>
            <div className="text-xs text-gray-400">
              Max DD: {analytics.maxDrawdown.toFixed(1)}%
            </div>
          </div>

          <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
              <Calendar className="w-3 h-3" />
              Avg Hold
            </div>
            <div className="text-lg sm:text-2xl font-bold text-white mb-1">
              {performanceMetrics.averageDaysHeld.toFixed(0)}d
            </div>
            <div className="text-xs text-gray-400">
              {analytics.tradableRecommendations} tradable
            </div>
          </div>
        </div>

        {/* Quality Assessment */}
        <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Award className={`w-4 h-4 ${quality.colorClass}`} />
            <span className="text-sm font-medium text-white">Quality Assessment</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-300 break-words">{quality.description}</p>
        </div>
      </Card>

      {/* Action & Confidence Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-2 text-white font-medium mb-4">
            <Activity className="w-4 h-4" />
            <span className="text-sm sm:text-base">Action Distribution</span>
          </div>
          
          <div className="space-y-3">
            {Object.entries(analytics.actionCounts).map(([action, count]) => {
              const percentage = (count / analytics.totalRecommendations) * 100;
              const getActionColor = (action: string) => {
                switch (action) {
                  case 'LONG_YES': return 'bg-green-500';
                  case 'LONG_NO': return 'bg-red-500';
                  case 'NO_TRADE': return 'bg-gray-500';
                  default: return 'bg-blue-500';
                }
              };

              return (
                <div key={action} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-3 h-3 rounded-full ${getActionColor(action)} flex-shrink-0`} />
                    <span className="text-xs sm:text-sm text-gray-300 break-words">{action.replace('_', ' ')}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 sm:w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getActionColor(action)}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-6 sm:w-8 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-2 text-white font-medium mb-4">
            <Zap className="w-4 h-4" />
            <span className="text-sm sm:text-base">Confidence Levels</span>
          </div>
          
          <div className="space-y-3">
            {Object.entries(analytics.confidenceCounts).map(([confidence, count]) => {
              const percentage = (count / analytics.totalRecommendations) * 100;
              const getConfidenceColor = (confidence: string) => {
                switch (confidence) {
                  case 'low': return 'bg-red-500';
                  case 'medium': return 'bg-yellow-500';
                  case 'high': return 'bg-green-500';
                  default: return 'bg-gray-500';
                }
              };

              return (
                <div key={confidence} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-3 h-3 rounded-full ${getConfidenceColor(confidence)} flex-shrink-0`} />
                    <span className="text-xs sm:text-sm text-gray-300 capitalize break-words">{confidence} Risk</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="w-16 sm:w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getConfidenceColor(confidence)}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-6 sm:w-8 text-right">{count}</span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-white/10">
            <div className="flex justify-between text-xs sm:text-sm">
              <span className="text-gray-400">Avg Confidence:</span>
              <span className="text-white font-medium">
                {analytics.avgConfidence.toFixed(1)}/3.0
              </span>
            </div>
            <div className="flex justify-between text-xs sm:text-sm mt-1">
              <span className="text-gray-400">Avg Edge:</span>
              <span className="text-white font-medium">
                {(analytics.avgEdge * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Performance Trend */}
      {analytics.totalRecommendations >= 10 && (
        <Card className="p-4 sm:p-6">
          <div className="flex items-center gap-2 text-white font-medium mb-4">
            <TrendingUp className="w-4 h-4" />
            <span className="text-sm sm:text-base">Performance Trend</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-xs sm:text-sm text-gray-400 mb-2">Recent Performance (Last 5)</div>
              <div className="text-lg sm:text-xl font-bold text-white mb-1">
                {analytics.recentWinRate.toFixed(0)}% Win Rate
              </div>
              <div className="text-xs text-gray-400">
                vs {analytics.olderWinRate.toFixed(0)}% historical
              </div>
            </div>

            <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
              <div className="text-xs sm:text-sm text-gray-400 mb-2">Consistency Score</div>
              <div className="text-lg sm:text-xl font-bold text-white mb-1">
                {analytics.consistencyScore.toFixed(0)}%
              </div>
              <div className="text-xs text-gray-400">
                Risk-adjusted consistency
              </div>
            </div>
          </div>

          {Math.abs(analytics.winRateTrend) > 10 && (
            <div className={`mt-4 p-3 rounded-lg border ${
              analytics.winRateTrend > 0 
                ? 'bg-green-500/10 border-green-500/20' 
                : 'bg-red-500/10 border-red-500/20'
            }`}>
              <div className={`flex items-center gap-2 text-xs sm:text-sm ${
                analytics.winRateTrend > 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {analytics.winRateTrend > 0 ? (
                  <TrendingUp className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <TrendingDown className="w-4 h-4 flex-shrink-0" />
                )}
                <span className="font-medium break-words">
                  {analytics.winRateTrend > 0 ? 'Improving' : 'Declining'} Performance Trend
                </span>
              </div>
              <p className="text-xs text-gray-300 mt-1 break-words">
                Recent recommendations are performing {Math.abs(analytics.winRateTrend).toFixed(0)}% 
                {analytics.winRateTrend > 0 ? ' better' : ' worse'} than historical average
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}