"use client";

import React from "react";
import Card from "@/components/shared/Card";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, Info } from "lucide-react";

interface ROIMetricsProps {
  totalROI: number;
  averageROI: number;
  bestROI: number;
  worstROI: number;
  byRecommendation?: Array<{ id: string; roi: number }>;
}

/**
 * ROIMetrics Component
 * 
 * Displays comprehensive ROI (Return on Investment) metrics for AI recommendations:
 * - Total ROI across all recommendations
 * - Average ROI per recommendation
 * - Best performing recommendation ROI
 * - Worst performing recommendation ROI
 * 
 * Uses color coding (green for positive, red for negative) and includes
 * tooltips for metric explanations.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
export default function ROIMetrics({
  totalROI,
  averageROI,
  bestROI,
  worstROI,
  byRecommendation = [],
}: ROIMetricsProps) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-indigo-400" />
          Return on Investment (ROI) Metrics
        </h3>
        <TooltipInfo text="ROI metrics show the percentage return on investment for AI recommendations, calculated using target zone (win) and stop loss (loss) prices relative to the entry zone midpoint." />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total ROI */}
        <ROIMetricCard
          icon={BarChart3}
          label="Total ROI"
          value={totalROI}
          subtext="Cumulative return"
          tooltip="Total return on investment across all recommendations combined"
        />

        {/* Average ROI */}
        <ROIMetricCard
          icon={TrendingUp}
          label="Average ROI"
          value={averageROI}
          subtext="Per recommendation"
          tooltip="Mean return on investment per recommendation"
        />

        {/* Best ROI */}
        <ROIMetricCard
          icon={TrendingUp}
          label="Best ROI"
          value={bestROI}
          subtext="Top performer"
          tooltip="Highest return on investment from a single recommendation"
          forcePositive
        />

        {/* Worst ROI */}
        <ROIMetricCard
          icon={TrendingDown}
          label="Worst ROI"
          value={worstROI}
          subtext="Lowest performer"
          tooltip="Lowest return on investment from a single recommendation"
          forceNegative
        />
      </div>

      {/* ROI Distribution Summary */}
      {byRecommendation.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/10">
          <h4 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
            ROI Distribution
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DistributionStat
              label="Positive Returns"
              value={byRecommendation.filter(r => r.roi > 0).length}
              total={byRecommendation.length}
              color="emerald"
            />
            <DistributionStat
              label="Negative Returns"
              value={byRecommendation.filter(r => r.roi < 0).length}
              total={byRecommendation.length}
              color="red"
            />
            <DistributionStat
              label="Break Even"
              value={byRecommendation.filter(r => r.roi === 0).length}
              total={byRecommendation.length}
              color="gray"
            />
            <DistributionStat
              label="Win Rate"
              value={byRecommendation.filter(r => r.roi > 0).length}
              total={byRecommendation.length}
              color="blue"
              isPercentage
            />
          </div>
        </div>
      )}
    </Card>
  );
}

interface ROIMetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  subtext: string;
  tooltip: string;
  forcePositive?: boolean;
  forceNegative?: boolean;
}

function ROIMetricCard({
  icon: Icon,
  label,
  value,
  subtext,
  tooltip,
  forcePositive = false,
  forceNegative = false,
}: ROIMetricCardProps) {
  // Determine color based on value
  const isPositive = forcePositive || (!forceNegative && value >= 0);
  const colorClass = isPositive ? "text-emerald-400" : "text-red-400";
  const bgColorClass = isPositive
    ? "bg-emerald-500/10 border-emerald-500/20"
    : "bg-red-500/10 border-red-500/20";
  const iconColorClass = isPositive ? "text-emerald-400" : "text-red-400";

  // Format value with sign
  const formattedValue = `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

  return (
    <div className="relative group flex flex-col items-center justify-center p-6 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all duration-300">
      {/* Icon */}
      <div className={`p-3 rounded-lg ${bgColorClass} mb-4`}>
        <Icon className={`w-6 h-6 ${iconColorClass}`} />
      </div>

      {/* Label with Tooltip */}
      <div className="flex items-center gap-1 mb-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">
          {label}
        </div>
        <TooltipInfo text={tooltip} small />
      </div>

      {/* Value */}
      <div className={`text-3xl font-bold font-mono ${colorClass} mb-1`}>
        {formattedValue}
      </div>

      {/* Subtext */}
      <div className="text-xs text-gray-500 text-center">{subtext}</div>
    </div>
  );
}

interface DistributionStatProps {
  label: string;
  value: number;
  total: number;
  color: "emerald" | "red" | "gray" | "blue";
  isPercentage?: boolean;
}

function DistributionStat({
  label,
  value,
  total,
  color,
  isPercentage = false,
}: DistributionStatProps) {
  const colorClasses = {
    emerald: "text-emerald-400 bg-emerald-500/10",
    red: "text-red-400 bg-red-500/10",
    gray: "text-gray-400 bg-gray-500/10",
    blue: "text-blue-400 bg-blue-500/10",
  }[color];

  const percentage = total > 0 ? (value / total) * 100 : 0;
  const displayValue = isPercentage
    ? `${percentage.toFixed(1)}%`
    : `${value}/${total}`;

  return (
    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
      <div className="text-xs text-gray-500 mb-2">{label}</div>
      <div className={`text-2xl font-bold ${colorClasses.split(" ")[0]} mb-1`}>
        {displayValue}
      </div>
      {!isPercentage && (
        <div className="text-xs text-gray-600">{percentage.toFixed(1)}%</div>
      )}
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
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 whitespace-nowrap z-10 border border-white/10">
        {text}
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
          <div className="border-4 border-transparent border-t-gray-900" />
        </div>
      </div>
    </div>
  );
}
