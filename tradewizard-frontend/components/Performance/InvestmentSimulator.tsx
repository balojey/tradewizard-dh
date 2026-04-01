"use client";

import React, { useState, useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { DollarSign, TrendingUp, TrendingDown, Target, ChevronDown, ChevronUp } from "lucide-react";
import Card from "@/components/shared/Card";
import EmptyState from "@/components/shared/EmptyState";
import WarningBanner from "@/components/shared/WarningBanner";
import { RecommendationWithOutcome } from "@/hooks/useMarketPerformance";
import { SimulatedTrade } from "@/lib/performance-calculations";
import { useSimulatedPortfolio } from "@/hooks/useSimulatedPortfolio";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { filterCompleteRecommendations, getDataCompletenessSummary } from "@/lib/data-validation";

interface InvestmentSimulatorProps {
  recommendations: RecommendationWithOutcome[];
  marketResolution: string;
}

export default function InvestmentSimulator({
  recommendations,
  marketResolution,
}: InvestmentSimulatorProps) {
  // Detect mobile device for responsive optimizations
  const isMobile = useIsMobile();
  
  const [investmentAmount, setInvestmentAmount] = useState<number>(100);
  const [expandedTrades, setExpandedTrades] = useState<boolean>(false);

  // Check data completeness
  const dataCompleteness = useMemo(() => {
    return getDataCompletenessSummary(recommendations, []);
  }, [recommendations]);

  // Filter to only complete recommendations for calculations
  const completeRecommendations = useMemo(() => {
    return filterCompleteRecommendations(recommendations, "InvestmentSimulator");
  }, [recommendations]);

  // Calculate simulated portfolio using the custom hook with complete recommendations
  const portfolio = useSimulatedPortfolio(completeRecommendations, investmentAmount);

  // Handle investment amount change - memoized to avoid re-creating on every render
  const handleInvestmentChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      setInvestmentAmount(value);
    }
  }, []);

  // Format chart data for Recharts
  const chartData = useMemo(() => {
    return portfolio.cumulative.map((point, index) => ({
      index: index + 1,
      cumulativePL: point.cumulativePL,
      timestamp: new Date(point.timestamp).toLocaleDateString(),
    }));
  }, [portfolio.cumulative]);

  if (!recommendations || recommendations.length === 0) {
    return (
      <Card className="p-6">
        <EmptyState
          icon={Target}
          title="No Recommendations Available"
          message="This market has no AI recommendations to simulate. Investment simulation requires at least one recommendation with entry and exit data."
        />
      </Card>
    );
  }

  // Show warning if some recommendations are incomplete
  const hasIncompleteData = dataCompleteness.invalidRecommendations > 0;

  const { summary, trades } = portfolio;
  const isProfitable = summary.totalPL >= 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Warning banner for incomplete data */}
      {hasIncompleteData && (
        <WarningBanner
          type="warning"
          title="Incomplete Recommendation Data"
          message={`${dataCompleteness.invalidRecommendations} of ${dataCompleteness.totalRecommendations} recommendations excluded from profit/loss calculations due to missing entry or exit data.`}
          details={[
            `${dataCompleteness.validRecommendations} complete recommendations included in calculations`,
            "Incomplete recommendations are not displayed in the results below",
          ]}
        />
      )}

      {/* Investment Amount Input - Responsive layout */}
      <Card className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white mb-1">Investment Simulator</h3>
            <p className="text-xs sm:text-sm text-gray-400">
              Simulate profit/loss from following AI recommendations
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
            <label 
              htmlFor="investment-amount" 
              className="text-xs sm:text-sm font-medium text-gray-300"
            >
              Investment per trade:
            </label>
            <div className="relative w-full sm:w-auto">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" aria-hidden="true" />
              <input
                id="investment-amount"
                type="number"
                min="1"
                step="10"
                value={investmentAmount}
                onChange={handleInvestmentChange}
                aria-label="Investment amount per trade in dollars"
                aria-describedby="investment-description"
                className="w-full sm:w-32 min-h-[44px] pl-9 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white font-mono text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent touch-manipulation"
              />
              <span id="investment-description" className="sr-only">
                Enter the amount you want to simulate investing per trade. This will calculate profit and loss across all recommendations.
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Summary Metrics - Single column on mobile, 3 columns on larger screens */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4" role="region" aria-label="Investment simulation summary metrics">
        <Card className="p-4 sm:p-5" role="article" aria-labelledby="total-pl-label">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${isProfitable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`} aria-hidden="true">
              {isProfitable ? <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /> : <TrendingDown className="w-4 h-4 sm:w-5 sm:h-5" />}
            </div>
            <span id="total-pl-label" className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">Total P/L</span>
          </div>
          <div className={`text-2xl sm:text-3xl font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`} aria-label={`Total profit and loss: ${isProfitable ? 'positive' : 'negative'} $${Math.abs(summary.totalPL).toFixed(2)}`}>
            {isProfitable ? '+' : ''}${summary.totalPL.toFixed(2)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Across {trades.length} trade{trades.length !== 1 ? 's' : ''}
          </div>
        </Card>

        <Card className="p-4 sm:p-5" role="article" aria-labelledby="total-roi-label">
          <div className="flex items-center gap-3 mb-2">
            <div className={`p-2 rounded-lg ${summary.totalROI >= 0 ? 'bg-blue-500/10 text-blue-400' : 'bg-red-500/10 text-red-400'}`} aria-hidden="true">
              <Target className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span id="total-roi-label" className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">Total ROI</span>
          </div>
          <div className={`text-2xl sm:text-3xl font-bold font-mono ${summary.totalROI >= 0 ? 'text-blue-400' : 'text-red-400'}`} aria-label={`Total return on investment: ${summary.totalROI >= 0 ? 'positive' : 'negative'} ${Math.abs(summary.totalROI).toFixed(2)} percent`}>
            {summary.totalROI >= 0 ? '+' : ''}{summary.totalROI.toFixed(2)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            Return on investment
          </div>
        </Card>

        <Card className="p-4 sm:p-5" role="article" aria-labelledby="win-rate-label">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400" aria-hidden="true">
              <Target className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span id="win-rate-label" className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">Win Rate</span>
          </div>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-purple-400" aria-label={`Win rate: ${summary.winRate.toFixed(1)} percent`}>
            {summary.winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {trades.filter(t => t.netProfitLoss > 0).length} wins / {trades.length} trades
          </div>
        </Card>
      </div>

      {/* Cumulative P/L Chart - Responsive: 250px mobile, 350px desktop */}
      <Card className="p-4 sm:p-6">
        <h4 className="text-base sm:text-lg font-bold text-white mb-4">Cumulative Profit/Loss</h4>
        {chartData.length > 0 ? (
          <div className="w-full">
            {/* Mobile Chart - Smaller height, simplified labels */}
            <div className="block md:hidden">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis
                    dataKey="index"
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    label={{ value: 'Trade #', position: 'insideBottom', offset: -5, fill: '#9ca3af', fontSize: 11 }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 10 }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      fontSize: '12px',
                    }}
                    labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '2px', fontSize: '11px' }}
                    itemStyle={{ color: '#10b981', fontSize: '11px' }}
                    formatter={(value: number | undefined) => value !== undefined ? [`$${value.toFixed(2)}`, 'P/L'] : ['N/A', 'P/L']}
                    labelFormatter={(label) => `#${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativePL"
                    stroke={isProfitable ? '#10b981' : '#ef4444'}
                    strokeWidth={2}
                    dot={{ fill: isProfitable ? '#10b981' : '#ef4444', r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            {/* Desktop Chart - Full height and detailed labels */}
            <div className="hidden md:block">
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                  <XAxis
                    dataKey="index"
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    label={{ value: 'Trade Number', position: 'insideBottom', offset: -5, fill: '#9ca3af' }}
                  />
                  <YAxis
                    stroke="#9ca3af"
                    tick={{ fill: '#9ca3af', fontSize: 12 }}
                    label={{ value: 'Cumulative P/L ($)', angle: -90, position: 'insideLeft', fill: '#9ca3af' }}
                    tickFormatter={(value) => `$${value.toFixed(0)}`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.9)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                    }}
                    labelStyle={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}
                    itemStyle={{ color: '#10b981' }}
                    formatter={(value: number | undefined) => value !== undefined ? [`$${value.toFixed(2)}`, 'Cumulative P/L'] : ['N/A', 'Cumulative P/L']}
                    labelFormatter={(label) => `Trade ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativePL"
                    stroke={isProfitable ? '#10b981' : '#ef4444'}
                    strokeWidth={2}
                    dot={{ fill: isProfitable ? '#10b981' : '#ef4444', r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="h-[250px] md:h-[350px] flex items-center justify-center text-gray-400">
            No trade data available
          </div>
        )}
      </Card>

      {/* Per-Recommendation Results - Touch-friendly button */}
      <Card className="p-4 sm:p-6">
        <button
          onClick={() => setExpandedTrades(!expandedTrades)}
          aria-expanded={expandedTrades}
          aria-controls="trade-results-list"
          aria-label={expandedTrades ? "Collapse per-recommendation results" : "Expand per-recommendation results"}
          className="w-full min-h-[44px] flex items-center justify-between text-left mb-4 hover:opacity-80 transition-opacity touch-manipulation focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0A0A0B] rounded-lg"
        >
          <h4 className="text-base sm:text-lg font-bold text-white">Per-Recommendation Results</h4>
          {expandedTrades ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {expandedTrades && (
          <div id="trade-results-list" className="space-y-3" role="list" aria-label="Individual trade results">
            {trades.map((trade, index) => (
              <TradeResultCard key={trade.recommendationId} trade={trade} index={index + 1} />
            ))}
          </div>
        )}

        {!expandedTrades && (
          <p className="text-sm text-gray-400">
            Click to view detailed results for each recommendation
          </p>
        )}
      </Card>
    </div>
  );
}

interface TradeResultCardProps {
  trade: SimulatedTrade;
  index: number;
}

function TradeResultCard({ trade, index }: TradeResultCardProps) {
  const isProfitable = trade.netProfitLoss >= 0;

  return (
    <div className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
            isProfitable ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {index}
          </div>
          <div>
            <div className="text-sm font-medium text-white">
              Trade #{index}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(trade.timestamp).toLocaleDateString()}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-base sm:text-lg font-bold font-mono ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfitable ? '+' : ''}${trade.netProfitLoss.toFixed(2)}
          </div>
          <div className={`text-xs font-medium ${isProfitable ? 'text-emerald-400/70' : 'text-red-400/70'}`}>
            {trade.roi >= 0 ? '+' : ''}{trade.roi.toFixed(2)}% ROI
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-gray-500">Entry Price:</span>
          <span className="ml-2 text-white font-mono">${trade.entryPrice.toFixed(3)}</span>
        </div>
        <div>
          <span className="text-gray-500">Exit Price:</span>
          <span className="ml-2 text-white font-mono">${trade.exitPrice.toFixed(3)}</span>
        </div>
        <div>
          <span className="text-gray-500">Shares:</span>
          <span className="ml-2 text-white font-mono">{trade.shares.toFixed(2)}</span>
        </div>
        <div>
          <span className="text-gray-500">Fees:</span>
          <span className="ml-2 text-white font-mono">${trade.exitFee.toFixed(2)}</span>
        </div>
      </div>

      {trade.exitFee > 0 && (
        <div className="mt-2 pt-2 border-t border-white/10">
          <div className="text-xs text-gray-500">
            Gross P/L: <span className="text-white font-mono">${trade.grossProfitLoss.toFixed(2)}</span>
            {' '}- Fees: <span className="text-white font-mono">${trade.exitFee.toFixed(2)}</span>
            {' '}= Net P/L: <span className={isProfitable ? 'text-emerald-400' : 'text-red-400'}>${trade.netProfitLoss.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
