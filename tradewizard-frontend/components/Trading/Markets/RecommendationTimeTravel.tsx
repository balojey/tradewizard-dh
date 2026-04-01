"use client";

import { useState, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  DollarSign,
  Calendar,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Brain,
  Users,
  Target,
  Info,
  Zap,
  MoreHorizontal
} from "lucide-react";

import Card from "@/components/shared/Card";
import Badge from "@/components/shared/Badge";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import { 
  useHistoricalRecommendations, 
  useRecommendationComparison,
  usePotentialPnL,
  useRecommendationTimeline,
  type HistoricalRecommendation,
  type PotentialPnL
} from "@/hooks/useHistoricalRecommendations";
import RecommendationAnalytics from "@/components/Trading/Markets/RecommendationAnalytics";

interface RecommendationTimeTravelProps {
  conditionId: string | null;
  currentMarketPrice: number;
  yesPrice?: number;
  noPrice?: number;
  className?: string;
}

export default function RecommendationTimeTravel({ 
  conditionId, 
  currentMarketPrice,
  yesPrice,
  noPrice,
  className = "" 
}: RecommendationTimeTravelProps) {
  const [selectedRecommendationIndex, setSelectedRecommendationIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'timeline' | 'comparison' | 'pnl' | 'analytics'>('timeline');
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const { 
    data: recommendations, 
    isLoading, 
    error 
  } = useHistoricalRecommendations(conditionId, { 
    limit: 20, 
    includeAgentSignals: true 
  });

  const { data: timeline } = useRecommendationTimeline(conditionId);
  const { data: pnlData } = usePotentialPnL(conditionId, currentMarketPrice, yesPrice, noPrice);

  const selectedRecommendation = recommendations?.[selectedRecommendationIndex];
  const { data: comparison } = useRecommendationComparison(
    conditionId, 
    selectedRecommendation?.id
  );

  const canGoBack = selectedRecommendationIndex < (recommendations?.length || 0) - 1;
  const canGoForward = selectedRecommendationIndex > 0;

  const handlePrevious = () => {
    if (canGoBack) {
      setSelectedRecommendationIndex(prev => prev + 1);
    }
  };

  const handleNext = () => {
    if (canGoForward) {
      setSelectedRecommendationIndex(prev => prev - 1);
    }
  };

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
  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;

  // View mode options for responsive display
  const viewModeOptions = [
    { id: 'timeline', label: 'Timeline', icon: Calendar, shortLabel: 'Time' },
    { id: 'comparison', label: 'Compare', icon: BarChart3, shortLabel: 'Comp' },
    { id: 'pnl', label: 'P&L', icon: DollarSign, shortLabel: 'P&L' },
    { id: 'analytics', label: 'Analytics', icon: Brain, shortLabel: 'Data' }
  ];

  if (isLoading) {
    return (
      <Card className={`p-4 sm:p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm sm:text-base">Recommendation Time Travel</h3>
        </div>
        <LoadingState message="Loading recommendation history..." />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-4 sm:p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm sm:text-base">Recommendation Time Travel</h3>
        </div>
        <ErrorState error={error instanceof Error ? error.message : 'Failed to load history'} />
      </Card>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <Card className={`p-4 sm:p-6 ${className}`}>
        <div className="flex items-center gap-3 mb-4">
          <Clock className="w-5 h-5 text-indigo-400" />
          <h3 className="font-semibold text-white text-sm sm:text-base">Recommendation Time Travel</h3>
        </div>
        <div className="text-center py-8 text-gray-400">
          <Clock className="w-8 h-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No historical recommendations available</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`${className} border-indigo-500/20 bg-gradient-to-br from-indigo-500/5 to-purple-500/5`}>
      {/* Header */}
      <div className="p-4 sm:p-6 border-b border-white/10 relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm sm:text-base">Recommendation Time Travel</h3>
              <p className="text-xs sm:text-sm text-gray-400">
                {recommendations.length} recommendation{recommendations.length !== 1 ? 's' : ''} found
              </p>
            </div>
          </div>

          {/* Desktop View Mode Toggle */}
          <div className="hidden sm:flex items-center gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
            {viewModeOptions.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setViewMode(id as any)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all
                  ${viewMode === id 
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                    : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                  }
                `}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">{label}</span>
                <span className="lg:hidden">{label.slice(0, 4)}</span>
              </button>
            ))}
          </div>

          {/* Mobile View Mode Toggle */}
          <div className="sm:hidden absolute top-4 right-4">
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
            >
              {(() => {
                const selectedOption = viewModeOptions.find(v => v.id === viewMode);
                const IconComponent = selectedOption?.icon;
                return IconComponent ? <IconComponent className="w-4 h-4" /> : null;
              })()}
              <span className="text-sm">{viewModeOptions.find(v => v.id === viewMode)?.shortLabel}</span>
              <MoreHorizontal className={`w-4 h-4 transition-transform ${showMobileMenu ? 'rotate-90' : ''}`} />
            </button>

            {showMobileMenu && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40 bg-black/20"
                  onClick={() => setShowMobileMenu(false)}
                />
                
                {/* Dropdown Menu */}
                <div className="absolute top-full right-0 mt-2 w-48 bg-gray-800/95 backdrop-blur-sm border border-white/20 rounded-lg shadow-2xl z-50 overflow-hidden">
                  {viewModeOptions.map(({ id, label, icon: Icon }, index) => (
                    <button
                      key={id}
                      onClick={() => {
                        setViewMode(id as any);
                        setShowMobileMenu(false);
                      }}
                      className={`
                        w-full flex items-center gap-3 px-4 py-3 text-sm transition-all text-left
                        ${viewMode === id 
                          ? 'bg-indigo-500/20 text-indigo-300 border-l-2 border-indigo-400' 
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                        }
                        ${index !== viewModeOptions.length - 1 ? 'border-b border-white/10' : ''}
                      `}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{label}</span>
                      {viewMode === id && (
                        <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Navigation Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center justify-center sm:justify-start gap-3">
            <button
              onClick={handlePrevious}
              disabled={!canGoBack}
              className={`
                p-2 rounded-lg border transition-all
                ${canGoBack 
                  ? 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white' 
                  : 'bg-gray-800/50 border-gray-700/50 text-gray-600 cursor-not-allowed'
                }
              `}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-center">
              <div className="text-sm font-medium text-white">
                {format(new Date(selectedRecommendation?.timestamp || ''), 'MMM d, yyyy')}
              </div>
              <div className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(selectedRecommendation?.timestamp || ''), { addSuffix: true })}
              </div>
            </div>

            <button
              onClick={handleNext}
              disabled={!canGoForward}
              className={`
                p-2 rounded-lg border transition-all
                ${canGoForward 
                  ? 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white' 
                  : 'bg-gray-800/50 border-gray-700/50 text-gray-600 cursor-not-allowed'
                }
              `}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-gray-400 text-center sm:text-right">
            {selectedRecommendationIndex + 1} of {recommendations.length}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {viewMode === 'timeline' && selectedRecommendation && (
          <TimelineView 
            recommendation={selectedRecommendation}
            comparison={comparison}
            currentMarketPrice={currentMarketPrice}
          />
        )}

        {viewMode === 'comparison' && comparison && (
          <ComparisonView comparison={comparison} />
        )}

        {viewMode === 'pnl' && pnlData && (
          <PnLView 
            pnlData={pnlData} 
            selectedRecommendation={selectedRecommendation}
            currentMarketPrice={currentMarketPrice}
            yesPrice={yesPrice}
            noPrice={noPrice}
          />
        )}

        {viewMode === 'analytics' && (
          <RecommendationAnalytics
            conditionId={conditionId}
            currentMarketPrice={currentMarketPrice}
          />
        )}
      </div>
    </Card>
  );
}

// Timeline View Component
function TimelineView({ 
  recommendation, 
  comparison, 
  currentMarketPrice 
}: { 
  recommendation: HistoricalRecommendation;
  comparison: any;
  currentMarketPrice: number;
}) {
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Recommendation Summary */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4 p-3 sm:p-4 bg-white/5 rounded-xl border border-white/10">
        <div className={`p-2 rounded-lg border ${getActionColor(recommendation.action)} self-start`}>
          {getActionIcon(recommendation.action)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
            <Badge variant="default" className={`${getActionColor(recommendation.action)} self-start`}>
              {recommendation.action.replace('_', ' ')}
            </Badge>
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 text-xs sm:text-sm text-gray-400">
              <span>Fair Value: {formatPercentage(recommendation.metadata.consensusProbability)}</span>
              <span>Edge: {formatPercentage(recommendation.metadata.edge)}</span>
            </div>
          </div>
          
          <p className="text-sm text-gray-300 leading-relaxed">
            {recommendation.explanation.summary}
          </p>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Target className="w-3 h-3" />
            <span className="hidden sm:inline">Entry Zone</span>
            <span className="sm:hidden">Entry</span>
          </div>
          <div className="text-xs sm:text-sm font-semibold text-white">
            {formatPercentage(recommendation.entryZone[0])} - {formatPercentage(recommendation.entryZone[1])}
          </div>
        </div>

        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <TrendingUp className="w-3 h-3" />
            <span className="hidden sm:inline">Target Zone</span>
            <span className="sm:hidden">Target</span>
          </div>
          <div className="text-xs sm:text-sm font-semibold text-white">
            {formatPercentage(recommendation.targetZone[0])} - {formatPercentage(recommendation.targetZone[1])}
          </div>
        </div>

        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <DollarSign className="w-3 h-3" />
            <span className="hidden sm:inline">Expected Value</span>
            <span className="sm:hidden">EV</span>
          </div>
          <div className="text-xs sm:text-sm font-semibold text-white">
            {formatPercentage(recommendation.expectedValue)}
          </div>
        </div>

        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
            <Users className="w-3 h-3" />
            Agents
          </div>
          <div className="text-xs sm:text-sm font-semibold text-white">
            {recommendation.metadata.agentCount || 0}
          </div>
        </div>
      </div>

      {/* Catalysts and Risks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="p-3 sm:p-4 bg-green-500/5 rounded-lg border border-green-500/20">
          <div className="flex items-center gap-2 text-green-400 text-sm font-medium mb-3">
            <Zap className="w-4 h-4" />
            Key Catalysts
          </div>
          <div className="space-y-2">
            {recommendation.explanation.keyCatalysts.map((catalyst: string, index: number) => (
              <div key={index} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 mt-2 flex-shrink-0" />
                <span className="break-words">{catalyst}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 sm:p-4 bg-red-500/5 rounded-lg border border-red-500/20">
          <div className="flex items-center gap-2 text-red-400 text-sm font-medium mb-3">
            <AlertTriangle className="w-4 h-4" />
            Failure Scenarios
          </div>
          <div className="space-y-2">
            {recommendation.explanation.failureScenarios.map((risk: string, index: number) => (
              <div key={index} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400 mt-2 flex-shrink-0" />
                <span className="break-words">{risk}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Changes from Previous */}
      {comparison && (
        <div className="p-3 sm:p-4 bg-blue-500/5 rounded-lg border border-blue-500/20">
          <div className="flex items-center gap-2 text-blue-400 text-sm font-medium mb-3">
            <BarChart3 className="w-4 h-4" />
            Changes from Previous Recommendation
          </div>
          
          <div className="space-y-2 text-xs sm:text-sm">
            {comparison.changes.actionChanged && (
              <div className="flex items-center gap-2 text-yellow-400">
                <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
                <span className="break-words">Action changed from {comparison.previous.action} to {comparison.current.action}</span>
              </div>
            )}
            
            {Math.abs(comparison.changes.probabilityDelta) > 0.01 && (
              <div className="flex items-center gap-2 text-gray-300">
                {comparison.changes.probabilityDelta > 0 ? (
                  <ArrowUpRight className="w-3 h-3 text-green-400 flex-shrink-0" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-red-400 flex-shrink-0" />
                )}
                <span className="break-words">Fair probability {comparison.changes.probabilityDelta > 0 ? 'increased' : 'decreased'} by {Math.abs(comparison.changes.probabilityDelta * 100).toFixed(1)}%</span>
              </div>
            )}

            {comparison.changes.newCatalysts.length > 0 && (
              <div className="text-gray-300">
                <span className="text-green-400">New catalysts:</span> <span className="break-words">{comparison.changes.newCatalysts.join(', ')}</span>
              </div>
            )}

            {comparison.changes.newRisks.length > 0 && (
              <div className="text-gray-300">
                <span className="text-red-400">New risks:</span> <span className="break-words">{comparison.changes.newRisks.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Comparison View Component
function ComparisonView({ comparison }: { comparison: any }) {
  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Current Recommendation */}
        <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 text-white font-medium mb-3">
            <div className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-sm sm:text-base">Current Recommendation</span>
          </div>
          <div className="space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Action:</span>
              <span className="text-white font-medium break-words text-right">{comparison.current.action}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Fair Value:</span>
              <span className="text-white font-medium">{formatPercentage(comparison.current.metadata.consensusProbability)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Edge:</span>
              <span className="text-white font-medium">{formatPercentage(comparison.current.metadata.edge)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Expected Value:</span>
              <span className="text-white font-medium">{formatPercentage(comparison.current.expectedValue)}</span>
            </div>
          </div>
        </div>

        {/* Previous Recommendation */}
        <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 text-white font-medium mb-3">
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-sm sm:text-base">Previous Recommendation</span>
          </div>
          <div className="space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Action:</span>
              <span className="text-white font-medium break-words text-right">{comparison.previous.action}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Fair Value:</span>
              <span className="text-white font-medium">{formatPercentage(comparison.previous.metadata.consensusProbability)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Edge:</span>
              <span className="text-white font-medium">{formatPercentage(comparison.previous.metadata.edge)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Expected Value:</span>
              <span className="text-white font-medium">{formatPercentage(comparison.previous.expectedValue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Key Changes */}
      <div className="p-3 sm:p-4 bg-indigo-500/5 rounded-lg border border-indigo-500/20">
        <div className="flex items-center gap-2 text-indigo-400 font-medium mb-3">
          <BarChart3 className="w-4 h-4" />
          <span className="text-sm sm:text-base">Key Changes</span>
        </div>
        
        <div className="space-y-3">
          {comparison.changes.actionChanged && (
            <div className="flex items-start gap-2 p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs sm:text-sm text-yellow-300 break-words">
                Action changed from {comparison.previous.action} to {comparison.current.action}
              </span>
            </div>
          )}

          {Math.abs(comparison.changes.probabilityDelta) > 0.01 && (
            <div className={`flex items-start gap-2 p-2 rounded border ${
              comparison.changes.probabilityDelta > 0 
                ? 'bg-green-500/10 border-green-500/20' 
                : 'bg-red-500/10 border-red-500/20'
            }`}>
              {comparison.changes.probabilityDelta > 0 ? (
                <ArrowUpRight className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <span className="text-xs sm:text-sm text-gray-300 break-words">
                Fair probability {comparison.changes.probabilityDelta > 0 ? 'increased' : 'decreased'} by {Math.abs(comparison.changes.probabilityDelta * 100).toFixed(1)}%
              </span>
            </div>
          )}

          {comparison.changes.newCatalysts.length > 0 && (
            <div className="p-2 bg-green-500/10 rounded border border-green-500/20">
              <div className="text-xs sm:text-sm text-green-400 font-medium mb-1">New Catalysts:</div>
              <div className="text-xs sm:text-sm text-gray-300 break-words">
                {comparison.changes.newCatalysts.join(', ')}
              </div>
            </div>
          )}

          {comparison.changes.newRisks.length > 0 && (
            <div className="p-2 bg-red-500/10 rounded border border-red-500/20">
              <div className="text-xs sm:text-sm text-red-400 font-medium mb-1">New Risks:</div>
              <div className="text-xs sm:text-sm text-gray-300 break-words">
                {comparison.changes.newRisks.join(', ')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// P&L View Component
function PnLView({ 
  pnlData, 
  selectedRecommendation,
  currentMarketPrice,
  yesPrice,
  noPrice
}: { 
  pnlData: PotentialPnL[];
  selectedRecommendation?: HistoricalRecommendation;
  currentMarketPrice: number;
  yesPrice?: number;
  noPrice?: number;
}) {
  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatPercentage = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;

  const selectedPnL = selectedRecommendation 
    ? pnlData.find(p => p.recommendationId === selectedRecommendation.id)
    : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Selected Recommendation P&L */}
      {selectedPnL && (
        <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center gap-2 text-white font-medium mb-4">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm sm:text-base">Potential P&L for Selected Recommendation</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Entry Price</div>
              <div className="text-sm sm:text-lg font-semibold text-white">
                {formatPercentage(selectedPnL.entryPrice * 100)}
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Current Price</div>
              <div className="text-sm sm:text-lg font-semibold text-white">
                {formatPercentage(selectedPnL.currentPrice * 100)}
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Return</div>
              <div className={`text-sm sm:text-lg font-semibold ${
                selectedPnL.wouldHaveProfit ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatPercentage(selectedPnL.potentialReturnPercent)}
              </div>
            </div>

            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">Days Held</div>
              <div className="text-sm sm:text-lg font-semibold text-white">
                {selectedPnL.daysHeld}
              </div>
            </div>
          </div>

          {selectedPnL.annualizedReturn && (
            <div className="mt-4 p-3 bg-indigo-500/10 rounded border border-indigo-500/20">
              <div className="text-xs sm:text-sm text-indigo-400 font-medium">
                Annualized Return: {formatPercentage(selectedPnL.annualizedReturn)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All Recommendations P&L Summary */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-white font-medium">
          <BarChart3 className="w-4 h-4" />
          <span className="text-sm sm:text-base">All Recommendations Performance</span>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {pnlData.map((pnl, index) => (
            <div 
              key={pnl.recommendationId}
              className={`
                p-3 rounded-lg border transition-all cursor-pointer
                ${selectedRecommendation?.id === pnl.recommendationId
                  ? 'bg-indigo-500/10 border-indigo-500/30'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
                }
              `}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded border ${
                    pnl.action === 'LONG_YES' 
                      ? 'bg-green-500/10 border-green-500/20 text-green-400'
                      : 'bg-red-500/10 border-red-500/20 text-red-400'
                  }`}>
                    {pnl.action === 'LONG_YES' ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                  </div>
                  
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-medium text-white break-words">
                      {pnl.action.replace('_', ' ')}
                    </div>
                    <div className="text-xs text-gray-400">
                      {format(new Date(pnl.timestamp), 'MMM d, yyyy')}
                    </div>
                  </div>
                </div>

                <div className="text-right flex-shrink-0">
                  <div className={`text-xs sm:text-sm font-semibold ${
                    pnl.wouldHaveProfit ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatPercentage(pnl.potentialReturnPercent)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {pnl.daysHeld}d held
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-4 border-t border-white/10">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Win Rate</div>
            <div className="text-xs sm:text-sm font-semibold text-white">
              {((pnlData.filter(p => p.wouldHaveProfit).length / pnlData.length) * 100).toFixed(0)}%
            </div>
          </div>

          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Avg Return</div>
            <div className="text-xs sm:text-sm font-semibold text-white">
              {formatPercentage(pnlData.reduce((sum, p) => sum + p.potentialReturnPercent, 0) / pnlData.length)}
            </div>
          </div>

          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">Best Return</div>
            <div className="text-xs sm:text-sm font-semibold text-green-400">
              {formatPercentage(Math.max(...pnlData.map(p => p.potentialReturnPercent)))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}