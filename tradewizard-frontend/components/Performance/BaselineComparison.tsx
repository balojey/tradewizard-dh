"use client";

import React, { useMemo } from "react";
import Card from "@/components/shared/Card";
import { BaselineComparison as BaselineComparisonType } from "@/lib/performance-calculations";
import { TrendingUp, Target, Shuffle, Info, CheckCircle2 } from "lucide-react";

interface BaselineComparisonProps {
  comparison: BaselineComparisonType;
}

/**
 * BaselineComparison Component
 * 
 * Compares AI recommendation performance against baseline strategies:
 * - Buy-and-hold: Enter at first recommendation, exit at resolution
 * - Random strategy: Monte Carlo simulation of random entry/exit points
 * - AI performance: Actual performance following AI recommendations
 * 
 * Displays side-by-side comparison with visual bars, highlights when AI
 * outperforms baselines, and shows statistical significance (p-value).
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5
 * 
 * @example
 * ```tsx
 * // In PerformanceTab component:
 * const comparison = calculateBaselineComparison(
 *   recommendations,
 *   investmentAmount,
 *   firstRecommendationPrice,
 *   finalPrice
 * );
 * 
 * return (
 *   <div className="space-y-8">
 *     <InvestmentSimulator {...props} />
 *     <BaselineComparison comparison={comparison} />
 *   </div>
 * );
 * ```
 */
export default function BaselineComparison({ comparison }: BaselineComparisonProps) {
  const { aiPerformance, buyAndHold, randomStrategy, statisticalSignificance } = comparison;

  // Memoize derived calculations to avoid redundant computation
  const { outperformsBuyAndHold, outperformsRandom, maxROI } = useMemo(() => {
    // Determine if AI outperforms each baseline
    const outperformsBuyAndHold = aiPerformance.roi > buyAndHold.roi;
    const outperformsRandom = aiPerformance.roi > randomStrategy.roi;

    // Find the maximum ROI for scaling bars
    const maxROI = Math.max(
      Math.abs(aiPerformance.roi),
      Math.abs(buyAndHold.roi),
      Math.abs(randomStrategy.roi)
    );

    return { outperformsBuyAndHold, outperformsRandom, maxROI };
  }, [aiPerformance.roi, buyAndHold.roi, randomStrategy.roi]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-400" />
          Performance vs Baseline Strategies
        </h3>
        <TooltipInfo text="Compare AI performance against simple baseline strategies to measure added value" />
      </div>

      {/* Strategy Comparison Cards */}
      <div className="space-y-4 mb-6">
        {/* AI Performance */}
        <StrategyCard
          icon={TrendingUp}
          label="AI Recommendations"
          description="Following TradeWizard AI signals"
          roi={aiPerformance.roi}
          profitLoss={aiPerformance.profitLoss}
          maxROI={maxROI}
          isAI={true}
          outperforms={outperformsBuyAndHold && outperformsRandom}
        />

        {/* Buy and Hold */}
        <StrategyCard
          icon={Target}
          label="Buy & Hold"
          description="Enter at first recommendation, exit at resolution"
          roi={buyAndHold.roi}
          profitLoss={buyAndHold.profitLoss}
          maxROI={maxROI}
          isAI={false}
          outperforms={false}
          isOutperformed={outperformsBuyAndHold}
        />

        {/* Random Strategy */}
        <StrategyCard
          icon={Shuffle}
          label="Random Strategy"
          description={`Average of ${randomStrategy.iterations.toLocaleString()} random entry/exit simulations`}
          roi={randomStrategy.roi}
          profitLoss={randomStrategy.profitLoss}
          maxROI={maxROI}
          isAI={false}
          outperforms={false}
          isOutperformed={outperformsRandom}
        />
      </div>

      {/* Statistical Significance */}
      <div className="pt-6 border-t border-white/10">
        <div
          className={`flex items-start gap-3 p-4 rounded-lg border ${
            statisticalSignificance.isSignificant
              ? "bg-emerald-500/10 border-emerald-500/20"
              : "bg-blue-500/10 border-blue-500/20"
          }`}
        >
          <Info
            className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
              statisticalSignificance.isSignificant ? "text-emerald-400" : "text-blue-400"
            }`}
          />
          <div className="text-sm">
            <p className="font-semibold text-white mb-1">
              Statistical Significance
              {statisticalSignificance.isSignificant && (
                <CheckCircle2 className="inline-block w-4 h-4 ml-2 text-emerald-400" />
              )}
            </p>
            <p className="text-gray-300 mb-2">
              {statisticalSignificance.isSignificant ? (
                <>
                  AI performance is <span className="font-semibold text-emerald-400">statistically significant</span>{" "}
                  compared to random strategy (p-value: {statisticalSignificance.pValue.toFixed(4)}).
                  This suggests the AI's edge is unlikely due to chance.
                </>
              ) : (
                <>
                  AI performance is <span className="font-semibold">not statistically significant</span>{" "}
                  compared to random strategy (p-value: {statisticalSignificance.pValue.toFixed(4)}).
                  More data may be needed to confirm consistent outperformance.
                </>
              )}
            </p>
            <p className="text-xs text-gray-400">
              Statistical significance is determined using a t-test with p &lt; 0.05 threshold.
            </p>
          </div>
        </div>
      </div>

      {/* Explanatory Text */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="font-semibold text-white mb-1 flex items-center gap-2">
              <TrendingUp className="w-3 h-3 text-indigo-400" />
              AI Strategy
            </div>
            <p className="text-gray-400">
              Follows AI recommendations with entry/exit zones, confidence levels, and risk assessment.
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="font-semibold text-white mb-1 flex items-center gap-2">
              <Target className="w-3 h-3 text-blue-400" />
              Buy & Hold
            </div>
            <p className="text-gray-400">
              Simple baseline: buy when first recommendation issued, hold until market resolves.
            </p>
          </div>
          <div className="p-3 bg-white/5 rounded-lg border border-white/10">
            <div className="font-semibold text-white mb-1 flex items-center gap-2">
              <Shuffle className="w-3 h-3 text-purple-400" />
              Random Strategy
            </div>
            <p className="text-gray-400">
              Monte Carlo simulation of random entry/exit points to establish baseline luck.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

interface StrategyCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  roi: number;
  profitLoss: number;
  maxROI: number;
  isAI: boolean;
  outperforms: boolean;
  isOutperformed?: boolean;
}

function StrategyCard({
  icon: Icon,
  label,
  description,
  roi,
  profitLoss,
  maxROI,
  isAI,
  outperforms,
  isOutperformed = false,
}: StrategyCardProps) {
  const isPositive = roi >= 0;
  const barWidth = maxROI > 0 ? (Math.abs(roi) / maxROI) * 100 : 0;

  // Color scheme
  const colorScheme = isAI
    ? {
        bg: "bg-indigo-500/10",
        border: "border-indigo-500/30",
        text: "text-indigo-400",
        bar: "bg-indigo-500",
        highlight: "ring-2 ring-indigo-500/50",
      }
    : {
        bg: "bg-white/5",
        border: "border-white/10",
        text: "text-gray-400",
        bar: isPositive ? "bg-emerald-500/50" : "bg-red-500/50",
        highlight: "",
      };

  return (
    <div
      className={`relative p-5 rounded-xl border transition-all duration-300 ${colorScheme.bg} ${
        colorScheme.border
      } ${outperforms ? colorScheme.highlight : ""} ${
        isOutperformed ? "opacity-60" : ""
      }`}
    >
      {/* Outperformance Badge */}
      {outperforms && (
        <div className="absolute -top-2 -right-2 bg-emerald-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Best Performance
        </div>
      )}

      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${colorScheme.bg} border ${colorScheme.border}`}>
            <Icon className={`w-5 h-5 ${colorScheme.text}`} />
          </div>
          <div>
            <div className="text-white font-bold text-base flex items-center gap-2">
              {label}
              {isAI && (
                <span className="text-xs font-normal bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full">
                  AI
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{description}</div>
          </div>
        </div>

        {/* ROI Display */}
        <div className="text-right">
          <div
            className={`text-2xl font-bold font-mono ${
              isPositive ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {isPositive ? "+" : ""}
            {roi.toFixed(2)}%
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {isPositive ? "+" : ""}${profitLoss.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Visual Bar */}
      <div className="relative h-3 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 h-full ${colorScheme.bar} transition-all duration-1000 rounded-full`}
          style={{
            width: `${barWidth}%`,
            left: isPositive ? "50%" : `${50 - barWidth}%`,
          }}
        />
        {/* Center line */}
        <div className="absolute top-0 left-1/2 w-px h-full bg-white/30" />
      </div>
    </div>
  );
}

interface TooltipInfoProps {
  text: string;
}

function TooltipInfo({ text }: TooltipInfoProps) {
  return (
    <div className="relative group inline-block">
      <Info className="w-4 h-4 text-gray-500 hover:text-gray-400 cursor-help transition-colors" />
      <div className="absolute bottom-full right-0 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 w-64 z-10 border border-white/10">
        {text}
        <div className="absolute top-full right-4 transform -mt-1">
          <div className="border-4 border-transparent border-t-gray-900" />
        </div>
      </div>
    </div>
  );
}
