"use client";

import { useRecentRecommendations, useRecommendationsByStatus } from "@/hooks/useTradeRecommendations";
import Card from "@/components/shared/Card";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import Badge from "@/components/shared/Badge";
import StatDisplay from "@/components/shared/StatDisplay";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Target, 
  DollarSign,
  Database,
  Clock,
  Activity
} from "lucide-react";

interface RecommendationsDashboardProps {
  className?: string;
}

export default function RecommendationsDashboard({ className = "" }: RecommendationsDashboardProps) {
  const { 
    data: recentRecommendations, 
    isLoading: loadingRecent, 
    error: errorRecent 
  } = useRecentRecommendations(5);

  const { 
    data: activeRecommendations, 
    isLoading: loadingActive 
  } = useRecommendationsByStatus('active');

  const getActionColor = (action: string) => {
    switch (action) {
      case 'LONG_YES': return 'text-green-600 bg-green-50 border-green-200';
      case 'LONG_NO': return 'text-red-600 bg-red-50 border-red-200';
      case 'NO_TRADE': return 'text-gray-600 bg-gray-50 border-gray-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LONG_YES': return <TrendingUp className="w-4 h-4" />;
      case 'LONG_NO': return <TrendingDown className="w-4 h-4" />;
      case 'NO_TRADE': return <AlertTriangle className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  if (loadingRecent) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Recommendations Dashboard</h3>
        </div>
        <LoadingState message="Loading recent recommendations..." />
      </Card>
    );
  }

  if (errorRecent) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Recommendations Dashboard</h3>
        </div>
        <ErrorState 
          error={errorRecent instanceof Error ? errorRecent.message : 'Failed to load recommendations'}
        />
      </Card>
    );
  }

  // Calculate summary stats
  const totalRecommendations = activeRecommendations?.length || 0;
  const buyRecommendations = activeRecommendations?.filter(r => r.action === 'LONG_YES').length || 0;
  const sellRecommendations = activeRecommendations?.filter(r => r.action === 'LONG_NO').length || 0;
  const noTradeRecommendations = activeRecommendations?.filter(r => r.action === 'NO_TRADE').length || 0;
  const avgExpectedValue = activeRecommendations?.length 
    ? activeRecommendations.reduce((sum, r) => sum + r.expectedValue, 0) / activeRecommendations.length 
    : 0;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Brain className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">AI Recommendations Dashboard</h2>
        <Badge variant="default" className="text-xs">
          <Database className="w-3 h-3 mr-1" />
          Live from Database
        </Badge>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatDisplay
          label="Total Active"
          value={totalRecommendations.toString()}
        />
        <StatDisplay
          label="Buy Signals"
          value={buyRecommendations.toString()}
          highlight={buyRecommendations > 0}
          highlightColor="green"
        />
        <StatDisplay
          label="Sell Signals"
          value={sellRecommendations.toString()}
          highlight={sellRecommendations > 0}
          highlightColor="red"
        />
        <StatDisplay
          label="Avg Expected Value"
          value={`$${avgExpectedValue.toFixed(2)}`}
          highlight={Math.abs(avgExpectedValue) > 0}
          highlightColor={avgExpectedValue > 0 ? 'green' : 'red'}
        />
      </div>

      {/* Recent Recommendations */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-5 h-5 text-gray-600" />
          <h3 className="font-semibold text-gray-900">Recent Recommendations</h3>
        </div>

        {!recentRecommendations || recentRecommendations.length === 0 ? (
          <div className="text-center py-8">
            <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No Recommendations Yet</h4>
            <p className="text-gray-600">
              TradeWizard agents haven't generated any recommendations yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentRecommendations.map((recommendation, index) => (
              <div 
                key={`${recommendation.conditionId}-${index}`}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center gap-4 flex-1">
                  {/* Action Badge */}
                  <div className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-sm font-medium ${getActionColor(recommendation.action)}`}>
                    {getActionIcon(recommendation.action)}
                    <span>
                      {recommendation.action === 'LONG_YES' ? 'BUY YES' : 
                       recommendation.action === 'LONG_NO' ? 'BUY NO' : 'NO TRADE'}
                    </span>
                  </div>

                  {/* Market Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      Market ID: {recommendation.conditionId}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(recommendation.timestamp).toLocaleString()}
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-gray-600">Expected Value</div>
                      <div className={`font-semibold ${recommendation.expectedValue > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${recommendation.expectedValue.toFixed(2)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600">Win Probability</div>
                      <div className="font-semibold text-blue-600">
                        {formatPercentage(recommendation.winProbability)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-gray-600">Edge</div>
                      <div className={`font-semibold ${recommendation.metadata.edge > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {recommendation.metadata.edge > 0 ? '+' : ''}{formatPercentage(recommendation.metadata.edge)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}