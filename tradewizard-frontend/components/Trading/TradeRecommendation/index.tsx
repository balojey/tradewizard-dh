"use client";

import { useState } from "react";
import { useTradeRecommendation, useRefreshRecommendation } from "@/hooks/useTradeRecommendation";
import type { PolymarketMarket } from "@/hooks/useMarkets";
import Card from "@/components/shared/Card";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import Badge from "@/components/shared/Badge";
import InfoTooltip from "@/components/shared/InfoTooltip";
import PercentageGauge from "@/components/shared/PercentageGauge";
import StatDisplay from "@/components/shared/StatDisplay";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Target, 
  DollarSign,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Info,
  Database
} from "lucide-react";

interface TradeRecommendationProps {
  market: PolymarketMarket;
  className?: string;
}

export default function TradeRecommendation({ market, className = "" }: TradeRecommendationProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  const conditionId = market.conditionId;
  
  if (!conditionId) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="flex items-center gap-2 text-gray-500">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-sm">No condition ID available for AI analysis</span>
        </div>
      </Card>
    );
  }
  
  // Fetch recommendation from Supabase
  const {
    data: recommendation,
    isLoading,
    error,
  } = useTradeRecommendation(conditionId);

  // Manual refresh mutation
  const refreshMutation = useRefreshRecommendation();

  const handleRefresh = () => {
    refreshMutation.mutate(conditionId);
  };

  if (isLoading) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <Brain className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Trade Analysis</h3>
          <Badge variant="default" className="text-xs">
            <Database className="w-3 h-3 mr-1" />
            Loading
          </Badge>
        </div>
        <LoadingState 
          message="Loading AI recommendation from database..." 
        />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">AI Trade Analysis</h3>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-2 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Retry
          </button>
        </div>
        <ErrorState 
          error={error instanceof Error ? error.message : 'Failed to load recommendation'}
        />
      </Card>
    );
  }

  if (!recommendation) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">AI Trade Analysis</h3>
          </div>
        </div>
        <div className="text-center py-8">
          <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-lg font-medium text-gray-900 mb-2">No Analysis Available</h4>
          <p className="text-gray-600 mb-4">
            This market hasn't been analyzed by TradeWizard agents yet.
          </p>
          <p className="text-sm text-gray-500">
            AI recommendations are generated automatically and stored in the database.
            Check back later or contact support if you believe this market should have been analyzed.
          </p>
        </div>
      </Card>
    );
  }

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
      default: return <Info className="w-4 h-4" />;
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-600 bg-green-50';
      case 'medium': return 'text-yellow-600 bg-yellow-50';
      case 'high': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const formatPrice = (price: number) => `$${(price * 100).toFixed(1)}¢`;
  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <Card className={`p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Trade Analysis</h3>
          <Badge variant="default" className="text-xs">
            <Database className="w-3 h-3 mr-1" />
            From Database
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {new Date(recommendation.timestamp).toLocaleString()}
          </span>
          <button
            onClick={handleRefresh}
            disabled={refreshMutation.isPending}
            className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Recommendation */}
      <div className="space-y-4">
        {/* Action & Summary */}
        <div className="flex items-start gap-4">
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${getActionColor(recommendation.action)}`}>
            {getActionIcon(recommendation.action)}
            <span className="font-semibold">
              {recommendation.action === 'LONG_YES' ? 'BUY YES' : 
               recommendation.action === 'LONG_NO' ? 'BUY NO' : 'NO TRADE'}
            </span>
          </div>
          <div className="flex-1">
            <p className="text-gray-700 text-sm leading-relaxed">
              {recommendation.explanation.summary}
            </p>
          </div>
        </div>

        {/* Core Thesis - Prominently displayed */}
        {recommendation.explanation.coreThesis && 
         recommendation.explanation.coreThesis !== 'No detailed thesis available' && (
          <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-blue-600" />
              <h4 className="font-semibold text-blue-900">Core Thesis</h4>
            </div>
            <p className="text-sm text-blue-900 leading-relaxed">
              {recommendation.explanation.coreThesis}
            </p>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatDisplay
            label="Expected Value"
            value={`$${recommendation.expectedValue.toFixed(2)}`}
            highlight={recommendation.expectedValue > 0}
            highlightColor={recommendation.expectedValue > 0 ? 'green' : 'red'}
          />
          <StatDisplay
            label="Win Probability"
            value={formatPercentage(recommendation.winProbability)}
            highlight={true}
            highlightColor="green"
          />
          <StatDisplay
            label="Market Edge"
            value={`${recommendation.metadata.edge > 0 ? '+' : ''}${formatPercentage(recommendation.metadata.edge)}`}
            highlight={Math.abs(recommendation.metadata.edge) > 0.05}
            highlightColor={recommendation.metadata.edge > 0 ? 'green' : 'red'}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-1 mb-1">
              <AlertTriangle className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-medium text-gray-600">Liquidity Risk</span>
            </div>
            <Badge className={`text-xs ${getRiskColor(recommendation.liquidityRisk)}`}>
              {recommendation.liquidityRisk.toUpperCase()}
            </Badge>
          </div>
        </div>

        {/* Entry & Target Zones */}
        {recommendation.action !== 'NO_TRADE' && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-sm font-medium text-gray-700">Entry Zone</span>
                <InfoTooltip text="Recommended price range to enter the position" />
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {formatPrice(recommendation.entryZone[0])} - {formatPrice(recommendation.entryZone[1])}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-sm font-medium text-gray-700">Target Zone</span>
                <InfoTooltip text="Expected price range for profit-taking" />
              </div>
              <div className="text-lg font-semibold text-gray-900">
                {formatPrice(recommendation.targetZone[0])} - {formatPrice(recommendation.targetZone[1])}
              </div>
            </div>
          </div>
        )}

        {/* Probability Comparison */}
        <div className="p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-blue-900">Probability Analysis</span>
            <InfoTooltip text="AI consensus vs market-implied probability" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-blue-700 mb-1">AI Consensus</div>
              <PercentageGauge 
                value={recommendation.metadata.consensusProbability * 100}
                size={60}
                label="chance"
              />
            </div>
            <div>
              <div className="text-xs text-blue-700 mb-1">Market Implied</div>
              <PercentageGauge 
                value={recommendation.metadata.marketProbability * 100}
                size={60}
                label="chance"
              />
            </div>
          </div>
        </div>

        {/* Expandable Details */}
        <div className="border-t pt-4">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-800 w-full"
          >
            {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <span>Detailed Analysis</span>
            {recommendation.metadata.agentCount && (
              <Badge variant="default" className="text-xs ml-auto">
                {recommendation.metadata.agentCount} agents
              </Badge>
            )}
          </button>
          
          {showDetails && (
            <div className="mt-4 space-y-4">
              {/* Key Catalysts */}
              {recommendation.explanation.keyCatalysts.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Key Catalysts</h4>
                  <ul className="space-y-1">
                    {recommendation.explanation.keyCatalysts.map((catalyst, index) => (
                      <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-green-500 mt-1">•</span>
                        <span>{catalyst}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Failure Scenarios */}
              {recommendation.explanation.failureScenarios.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Risk Scenarios</h4>
                  <ul className="space-y-1">
                    {recommendation.explanation.failureScenarios.map((scenario, index) => (
                      <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
                        <span className="text-red-500 mt-1">•</span>
                        <span>{scenario}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Uncertainty Note */}
              {recommendation.explanation.uncertaintyNote && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
                    <div>
                      <div className="text-sm font-medium text-yellow-800 mb-1">High Uncertainty</div>
                      <div className="text-sm text-yellow-700">
                        {recommendation.explanation.uncertaintyNote}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Risk Perspectives */}
              {recommendation.explanation.riskPerspectives && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Risk Perspectives</h4>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {recommendation.explanation.riskPerspectives}
                  </p>
                </div>
              )}

              {/* Technical Metadata */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-900 mb-2">Analysis Metadata</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-600">Confidence Band:</span>
                    <span className="ml-2 font-mono">
                      [{formatPercentage(recommendation.metadata.confidenceBand[0])}, {formatPercentage(recommendation.metadata.confidenceBand[1])}]
                    </span>
                  </div>
                  {recommendation.metadata.disagreementIndex && (
                    <div>
                      <span className="text-gray-600">Disagreement:</span>
                      <span className="ml-2 font-mono">
                        {formatPercentage(recommendation.metadata.disagreementIndex)}
                      </span>
                    </div>
                  )}
                  {recommendation.metadata.agentCount && (
                    <div>
                      <span className="text-gray-600">Agents:</span>
                      <span className="ml-2 font-mono">
                        {recommendation.metadata.agentCount}
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600">Generated:</span>
                    <span className="ml-2 font-mono">
                      {new Date(recommendation.timestamp).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}