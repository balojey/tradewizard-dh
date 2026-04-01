"use client";

import { useState } from "react";
import { useTradeRecommendation } from "@/hooks/useTradeRecommendation";
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Users, 
  Target, 
  Zap,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  BarChart3,
  Lightbulb,
  Shield,
  Activity
} from "lucide-react";
import Card from "@/components/shared/Card";
import { formatNumber } from "@/utils/formatting";

interface AIInsightsPanelProps {
  conditionId: string | null;
  marketPrice: number;
  volume24h?: number;
  liquidity?: number;
}

export default function AIInsightsPanel({ 
  conditionId, 
  marketPrice, 
  volume24h = 0, 
  liquidity = 0 
}: AIInsightsPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));
  const { data: recommendation, isLoading, error } = useTradeRecommendation(conditionId, {
    enabled: !!conditionId,
  });

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  if (!conditionId) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>AI insights not available for this market</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-full animate-spin" />
            <div className="h-6 bg-white/10 rounded w-48" />
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-white/10 rounded w-full" />
            <div className="h-4 bg-white/10 rounded w-3/4" />
            <div className="h-4 bg-white/10 rounded w-1/2" />
          </div>
        </div>
      </Card>
    );
  }

  if (error || !recommendation) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-yellow-400" />
          <p className="font-medium text-white">AI Analysis Unavailable</p>
          <p className="text-sm mt-1">
            {error ? 'Failed to load AI insights' : 'No AI analysis available for this market'}
          </p>
        </div>
      </Card>
    );
  }

  console.log('[AIInsightsPanel] Recommendation data:', {
    keyCatalysts: recommendation.explanation.keyCatalysts,
    failureScenarios: recommendation.explanation.failureScenarios,
  });

  const getActionColor = (action: string) => {
    switch (action) {
      case 'LONG_YES': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'LONG_NO': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'NO_TRADE': return 'text-gray-400 bg-white/5 border-white/10';
      default: return 'text-gray-400 bg-white/5 border-white/10';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'LONG_YES': return <TrendingUp className="w-5 h-5" />;
      case 'LONG_NO': return <TrendingDown className="w-5 h-5" />;
      case 'NO_TRADE': return <Shield className="w-5 h-5" />;
      default: return <Brain className="w-5 h-5" />;
    }
  };

  const getActionText = (action: string) => {
    switch (action) {
      case 'LONG_YES': return 'BUY YES';
      case 'LONG_NO': return 'BUY NO';
      case 'NO_TRADE': return 'NO TRADE';
      default: return 'ANALYZING';
    }
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatPrice = (value: number) => `$${value.toFixed(3)}`;

  // Get the price of the token that the AI recommended
  const getRecommendedTokenPrice = () => {
    if (recommendation.action === 'LONG_YES') {
      return marketPrice; // marketPrice is already the YES token price
    } else if (recommendation.action === 'LONG_NO') {
      return 1 - marketPrice; // NO token price is 1 - YES token price
    }
    return marketPrice; // Default to market price for NO_TRADE
  };

  const recommendedTokenPrice = getRecommendedTokenPrice();
  const edge = recommendation.metadata.edge;
  const edgeColor = edge > 0.05 ? 'text-green-400' : edge < -0.05 ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="space-y-4">
      {/* AI Recommendation Overview */}
      <Card className="overflow-hidden">
        <div 
          className="p-4 cursor-pointer"
          onClick={() => toggleSection('overview')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg border ${getActionColor(recommendation.action)}`}>
                {getActionIcon(recommendation.action)}
              </div>
              <div>
                <h3 className="font-semibold text-lg text-white">AI Recommendation</h3>
                <p className="text-sm text-gray-400">
                  {getActionText(recommendation.action)} • EV: ${recommendation.expectedValue.toFixed(2)}
                </p>
              </div>
            </div>
            {expandedSections.has('overview') ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> : 
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </div>
        </div>

        {expandedSections.has('overview') && (
          <div className="px-4 pb-4 border-t border-white/10 bg-white/5">
            {/* Trade Summary */}
            <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
              <h4 className="font-medium text-sm text-gray-300 mb-2">Trade Summary</h4>
              <p className="text-sm leading-relaxed text-gray-300">{recommendation.explanation.summary}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">AI Fair Price</span>
                  <span className="font-medium text-white">
                    {formatPrice(recommendation.metadata.consensusProbability)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">
                    {recommendation.action === 'LONG_YES' ? 'YES Token Price' : 
                     recommendation.action === 'LONG_NO' ? 'NO Token Price' : 'Market Price'}
                  </span>
                  <span className="font-medium text-white">{formatPrice(recommendedTokenPrice)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Edge</span>
                  <span className={`font-medium ${edgeColor}`}>
                    {edge > 0 ? '+' : ''}{formatPercentage(edge)}
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Win Probability</span>
                  <span className="font-medium text-white">
                    {formatPercentage(recommendation.winProbability)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Liquidity Risk</span>
                  <span className={`font-medium ${
                    recommendation.liquidityRisk === 'low' ? 'text-green-400' :
                    recommendation.liquidityRisk === 'medium' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {recommendation.liquidityRisk.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Agent Consensus</span>
                  <span className="font-medium text-white">
                    {recommendation.metadata.agentCount || 0} agents
                  </span>
                </div>
              </div>
            </div>

            {/* Entry and Target Zones */}
            <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-4 h-4 text-indigo-400" />
                <span className="font-medium text-sm text-white">Trading Zones</span>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-400">Entry Zone:</span>
                  <div className="font-medium text-white">
                    {formatPrice(recommendation.entryZone[0])} - {formatPrice(recommendation.entryZone[1])}
                  </div>
                </div>
                <div>
                  <span className="text-gray-400">Target Zone:</span>
                  <div className="font-medium text-white">
                    {formatPrice(recommendation.targetZone[0])} - {formatPrice(recommendation.targetZone[1])}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Core Thesis */}
      <Card className="overflow-hidden">
        <div 
          className="p-4 cursor-pointer"
          onClick={() => toggleSection('thesis')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Lightbulb className="w-5 h-5 text-yellow-400" />
              <h3 className="font-semibold text-white">Core Thesis</h3>
            </div>
            {expandedSections.has('thesis') ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> : 
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </div>
        </div>

        {expandedSections.has('thesis') && (
          <div className="px-4 pb-4 border-t border-white/10 bg-white/5">
            <div className="mt-4 space-y-4">
              {recommendation.explanation.coreThesis && 
               recommendation.explanation.coreThesis !== recommendation.explanation.summary && 
               recommendation.explanation.coreThesis !== 'No detailed thesis available' ? (
                <div>
                  <p className="text-sm leading-relaxed text-gray-300">{recommendation.explanation.coreThesis}</p>
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400">Detailed thesis matches the trade summary above.</p>
                </div>
              )}

              {recommendation.explanation.uncertaintyNote && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-yellow-300">{recommendation.explanation.uncertaintyNote}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Key Catalysts */}
      {recommendation.explanation.keyCatalysts.length > 0 && (
        <Card className="overflow-hidden">
          <div 
            className="p-4 cursor-pointer"
            onClick={() => toggleSection('catalysts')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-green-400" />
                <h3 className="font-semibold text-white">Key Catalysts</h3>
                <span className="text-sm text-gray-400">
                  ({recommendation.explanation.keyCatalysts.length})
                </span>
              </div>
              {expandedSections.has('catalysts') ? 
                <ChevronUp className="w-5 h-5 text-gray-400" /> : 
                <ChevronDown className="w-5 h-5 text-gray-400" />
              }
            </div>
          </div>

          {expandedSections.has('catalysts') && (
            <div className="px-4 pb-4 border-t border-white/10 bg-white/5">
              <div className="mt-4 space-y-2">
                {recommendation.explanation.keyCatalysts.map((catalyst: string, index: number) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="w-6 h-6 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-medium text-green-400">{index + 1}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-gray-300">{catalyst}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Risk Scenarios */}
      {recommendation.explanation.failureScenarios.length > 0 && (
        <Card className="overflow-hidden">
          <div 
            className="p-4 cursor-pointer"
            onClick={() => toggleSection('risks')}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-red-400" />
                <h3 className="font-semibold text-white">Risk Scenarios</h3>
                <span className="text-sm text-gray-400">
                  ({recommendation.explanation.failureScenarios.length})
                </span>
              </div>
              {expandedSections.has('risks') ? 
                <ChevronUp className="w-5 h-5 text-gray-400" /> : 
                <ChevronDown className="w-5 h-5 text-gray-400" />
              }
            </div>
          </div>

          {expandedSections.has('risks') && (
            <div className="px-4 pb-4 border-t border-white/10 bg-white/5">
              <div className="mt-4 space-y-2">
                {recommendation.explanation.failureScenarios.map((risk: string, index: number) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="w-6 h-6 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                    </div>
                    <p className="text-sm leading-relaxed text-gray-300">{risk}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Market Intelligence */}
      <Card className="overflow-hidden">
        <div 
          className="p-4 cursor-pointer"
          onClick={() => toggleSection('intelligence')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold text-white">Market Intelligence</h3>
            </div>
            {expandedSections.has('intelligence') ? 
              <ChevronUp className="w-5 h-5 text-gray-400" /> : 
              <ChevronDown className="w-5 h-5 text-gray-400" />
            }
          </div>
        </div>

        {expandedSections.has('intelligence') && (
          <div className="px-4 pb-4 border-t border-white/10 bg-white/5">
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Confidence Band</span>
                  <span className="font-medium text-sm text-white">
                    {formatPercentage(recommendation.metadata.confidenceBand[0])} - {formatPercentage(recommendation.metadata.confidenceBand[1])}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">24h Volume</span>
                  <span className="font-medium text-sm text-white">${formatNumber(volume24h)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Liquidity</span>
                  <span className="font-medium text-sm text-white">${formatNumber(liquidity)}</span>
                </div>
              </div>
              <div className="space-y-3">
                {recommendation.metadata.disagreementIndex !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Agent Agreement</span>
                    <span className={`font-medium text-sm ${
                      recommendation.metadata.disagreementIndex < 0.1 ? 'text-green-400' :
                      recommendation.metadata.disagreementIndex < 0.2 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {((1 - recommendation.metadata.disagreementIndex) * 100).toFixed(0)}%
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Last Updated</span>
                  <span className="font-medium text-sm text-white">
                    {new Date(recommendation.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                {recommendation.processingTimeMs && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Analysis Time</span>
                    <span className="font-medium text-sm text-white">
                      {(recommendation.processingTimeMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}