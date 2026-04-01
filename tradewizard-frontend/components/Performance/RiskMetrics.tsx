"use client";

import React, { useMemo } from "react";
import Card from "@/components/shared/Card";
import WarningBanner from "@/components/shared/WarningBanner";
import { calculateRiskMetrics } from "@/lib/performance-calculations";
import { TrendingDown, Activity, AlertTriangle, Info } from "lucide-react";
import { logWarning } from "@/utils/errorLogging";

interface RiskMetricsProps {
  returns: number[];
}

/**
 * RiskMetrics Component
 * 
 * Displays risk-adjusted performance metrics calculated from return series:
 * - Sharpe ratio: Risk-adjusted return (higher is better)
 * - Maximum drawdown: Largest peak-to-trough decline
 * - Volatility: Standard deviation of returns
 * 
 * Each metric includes explanatory tooltips and handles null values
 * by displaying "N/A".
 * 
 * Requirements: 9.1, 9.2, 9.3
 * 
 * @example
 * ```tsx
 * // In PerformanceTab component:
 * const returns = data.recommendations.map(rec => rec.roiRealized);
 * 
 * return (
 *   <div className="space-y-8">
 *     <ROIMetrics {...data.metrics.roi} />
 *     <AccuracyMetrics recommendations={data.recommendations} />
 *     <RiskMetrics returns={returns} />
 *   </div>
 * );
 * ```
 */
export default function RiskMetrics({ returns }: RiskMetricsProps) {
  // Memoize metrics calculation to avoid redundant computation
  const metrics = useMemo(() => {
    return calculateRiskMetrics(returns);
  }, [returns]);

  // Check for insufficient data
  const hasInsufficientData = !returns || returns.length < 2;

  // Log warning if data is insufficient
  if (hasInsufficientData) {
    logWarning("Insufficient data for risk metrics calculation", {
      component: "RiskMetrics",
      dataPoints: returns?.length || 0,
      minimumRequired: 2,
    });
  }

  if (!returns || returns.length === 0) {
    return (
      <Card className="p-6">
        <WarningBanner
          type="info"
          title="No Data Available"
          message="No return data available for risk analysis. Risk metrics require at least one completed trade."
        />
      </Card>
    );
  }

  if (returns.length === 1) {
    return (
      <Card className="p-6">
        <WarningBanner
          type="info"
          title="Insufficient Data"
          message="Risk metrics require at least 2 data points for meaningful analysis. Only 1 trade available."
          details={[
            "Sharpe ratio and volatility calculations need multiple returns",
            "Continue trading to see risk-adjusted performance metrics",
          ]}
        />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-indigo-400" />
          Risk-Adjusted Performance
        </h3>
        <TooltipInfo text="Risk metrics help evaluate whether returns justified the risk taken" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Sharpe Ratio */}
        <RiskMetricCard
          icon={TrendingDown}
          label="Sharpe Ratio"
          value={metrics.sharpeRatio}
          subtext="Return per unit of risk"
          tooltip="Measures risk-adjusted return. Higher values indicate better risk-adjusted performance. Values above 1.0 are considered good, above 2.0 are excellent."
          formatType="decimal"
          color={
            metrics.sharpeRatio === null
              ? "gray"
              : metrics.sharpeRatio >= 2.0
              ? "emerald"
              : metrics.sharpeRatio >= 1.0
              ? "blue"
              : metrics.sharpeRatio >= 0
              ? "yellow"
              : "red"
          }
        />

        {/* Maximum Drawdown */}
        <RiskMetricCard
          icon={TrendingDown}
          label="Max Drawdown"
          value={metrics.maxDrawdown}
          subtext="Largest peak-to-trough decline"
          tooltip="The largest cumulative loss from a peak to a trough. Lower values indicate less risk. A 20% drawdown means the portfolio declined 20% from its peak."
          formatType="percentage"
          color={
            metrics.maxDrawdown === 0
              ? "emerald"
              : metrics.maxDrawdown < 10
              ? "blue"
              : metrics.maxDrawdown < 20
              ? "yellow"
              : "red"
          }
          invertColor
        />

        {/* Volatility */}
        <RiskMetricCard
          icon={Activity}
          label="Volatility"
          value={metrics.volatility}
          subtext="Standard deviation of returns"
          tooltip="Measures the variability of returns. Lower values indicate more consistent performance. High volatility means returns fluctuate significantly."
          formatType="percentage"
          color={
            metrics.volatility === 0
              ? "emerald"
              : metrics.volatility < 10
              ? "blue"
              : metrics.volatility < 20
              ? "yellow"
              : "red"
          }
          invertColor
        />
      </div>

      {/* Additional Context */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-semibold text-white mb-1">Understanding Risk Metrics</p>
            <p>
              These metrics help evaluate performance quality beyond raw returns. A high Sharpe ratio
              indicates efficient risk-taking, while low drawdown and volatility suggest consistent,
              stable performance.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

interface RiskMetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null;
  subtext: string;
  tooltip: string;
  formatType: "decimal" | "percentage";
  color: "emerald" | "blue" | "yellow" | "red" | "gray";
  invertColor?: boolean;
}

function RiskMetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  tooltip,
  formatType,
  color,
  invertColor = false,
}: RiskMetricCardProps) {
  const colorClasses = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    yellow: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    gray: "text-gray-400 bg-gray-500/10 border-gray-500/20",
  }[color];

  // Format value
  const formattedValue =
    value === null
      ? "N/A"
      : formatType === "percentage"
      ? `${value.toFixed(2)}%`
      : value.toFixed(3);

  // For display purposes, show if this is a good or bad value
  const displayColor = value === null ? "text-gray-400" : colorClasses.split(" ")[0];

  return (
    <div className="relative group flex flex-col items-center justify-center p-6 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all duration-300">
      {/* Icon */}
      <div className={`p-3 rounded-lg ${colorClasses} mb-4`}>
        <Icon className="w-6 h-6" />
      </div>

      {/* Label with Tooltip */}
      <div className="flex items-center gap-1 mb-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">
          {label}
        </div>
        <TooltipInfo text={tooltip} small />
      </div>

      {/* Value */}
      <div className={`text-3xl font-bold font-mono ${displayColor} mb-1`}>
        {formattedValue}
      </div>

      {/* Subtext */}
      <div className="text-xs text-gray-500 text-center">{subtext}</div>
    </div>
  );
}

interface TooltipInfoProps {
  text: string;
  small?: boolean;
}

function TooltipInfo({ text, small = false }: TooltipInfoProps) {
  return (
    <div className="relative group inline-block">
      <Info
        className={`${
          small ? "w-3 h-3" : "w-4 h-4"
        } text-gray-500 hover:text-gray-400 cursor-help transition-colors`}
      />
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 w-64 z-10 border border-white/10">
        {text}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
          <div className="border-4 border-transparent border-t-gray-900" />
        </div>
      </div>
    </div>
  );
}
