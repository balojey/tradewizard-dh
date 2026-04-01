"use client";

import React, { useMemo } from "react";
import Card from "@/components/shared/Card";
import WarningBanner from "@/components/shared/WarningBanner";
import { calculateAccuracyMetrics, RecommendationWithOutcome } from "@/lib/performance-calculations";
import { Target, TrendingUp, Activity, BarChart3 } from "lucide-react";
import { filterCompleteRecommendations, getDataCompletenessSummary } from "@/lib/data-validation";

interface AccuracyMetricsProps {
  recommendations: RecommendationWithOutcome[];
}

/**
 * AccuracyMetrics Component
 * 
 * Displays recommendation accuracy statistics including:
 * - Overall accuracy percentage
 * - Accuracy breakdown by confidence level (high, moderate, low)
 * - Average confidence and correlation metrics
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */
export default function AccuracyMetrics({ recommendations }: AccuracyMetricsProps) {
  // Check data completeness
  const dataCompleteness = useMemo(() => {
    return getDataCompletenessSummary(recommendations, []);
  }, [recommendations]);

  // Filter to only complete recommendations for calculations
  const completeRecommendations = useMemo(() => {
    return filterCompleteRecommendations(recommendations, "AccuracyMetrics");
  }, [recommendations]);

  const metrics = calculateAccuracyMetrics(completeRecommendations);

  if (!recommendations || recommendations.length === 0) {
    return (
      <Card className="p-6">
        <WarningBanner
          type="info"
          title="No Recommendations Available"
          message="No recommendations available for accuracy analysis."
        />
      </Card>
    );
  }

  // Show warning if some recommendations are incomplete
  const hasIncompleteData = dataCompleteness.invalidRecommendations > 0;

  return (
    <div className="space-y-6">
      {/* Warning banner for incomplete data */}
      {hasIncompleteData && (
        <WarningBanner
          type="warning"
          title="Incomplete Recommendation Data"
          message={`${dataCompleteness.invalidRecommendations} of ${dataCompleteness.totalRecommendations} recommendations excluded from accuracy calculations due to missing outcome data.`}
          details={[
            `${dataCompleteness.validRecommendations} complete recommendations included in calculations`,
          ]}
        />
      )}

      {/* Overall Accuracy Card */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <Target className="w-5 h-5 text-indigo-400" aria-hidden="true" />
          Recommendation Accuracy
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6" role="region" aria-label="Accuracy metrics summary">
          {/* Total Accuracy */}
          <div className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-xl border border-white/10" role="article" aria-labelledby="overall-accuracy-label">
            <div className="mb-4">
              <div className="relative w-32 h-32" role="img" aria-label={`Overall accuracy: ${metrics.accuracyPercentage.toFixed(1)} percent`}>
                <svg className="w-32 h-32 transform -rotate-90" aria-hidden="true">
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    className="text-white/10"
                  />
                  <circle
                    cx="64"
                    cy="64"
                    r="56"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="none"
                    strokeDasharray={`${2 * Math.PI * 56}`}
                    strokeDashoffset={`${2 * Math.PI * 56 * (1 - metrics.accuracyPercentage / 100)}`}
                    className={`${
                      metrics.accuracyPercentage >= 70
                        ? "text-emerald-500"
                        : metrics.accuracyPercentage >= 50
                        ? "text-yellow-500"
                        : "text-red-500"
                    } transition-all duration-1000`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-white">
                      {metrics.accuracyPercentage.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="text-center space-y-1">
              <div id="overall-accuracy-label" className="text-xl font-bold text-white">
                {metrics.correctRecommendations}{" "}
                <span className="text-gray-500 text-base font-normal">
                  / {metrics.totalRecommendations}
                </span>
              </div>
              <div className="text-sm text-gray-400">Correct Predictions</div>
            </div>
          </div>

          {/* Average Confidence */}
          <MetricCard
            icon={Activity}
            label="Average Confidence"
            value={metrics.averageConfidence.toFixed(2)}
            subtext="Across all recommendations"
            color="blue"
          />

          {/* Confidence-Accuracy Correlation */}
          <MetricCard
            icon={BarChart3}
            label="Confidence Correlation"
            value={metrics.confidenceAccuracyCorrelation.toFixed(3)}
            subtext="Higher is better calibrated"
            color="purple"
          />
        </div>
      </Card>

      {/* Accuracy by Confidence Level */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-400" />
          Accuracy by Confidence Level
        </h3>

        <div className="space-y-3">
          <ConfidenceLevelCard
            level="high"
            data={metrics.byConfidence.high}
          />
          <ConfidenceLevelCard
            level="moderate"
            data={metrics.byConfidence.moderate}
          />
          <ConfidenceLevelCard
            level="low"
            data={metrics.byConfidence.low}
          />
        </div>
      </Card>
    </div>
  );
}

interface MetricCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
  color: "blue" | "purple" | "emerald" | "red";
}

function MetricCard({ icon: Icon, label, value, subtext, color }: MetricCardProps) {
  const colorClasses = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
  }[color];

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-xl border border-white/10" role="article" aria-label={`${label}: ${value}`}>
      <div className={`p-3 rounded-lg ${colorClasses} mb-4`} aria-hidden="true">
        <Icon className="w-6 h-6" />
      </div>
      <div className="text-center space-y-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {label}
        </div>
        <div className="text-3xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-500">{subtext}</div>
      </div>
    </div>
  );
}

interface ConfidenceLevelCardProps {
  level: "high" | "moderate" | "low";
  data: {
    total: number;
    correct: number;
    percentage: number;
  };
}

function ConfidenceLevelCard({ level, data }: ConfidenceLevelCardProps) {
  const levelConfig = {
    high: {
      label: "High Confidence",
      color: "emerald",
      bgColor: "bg-emerald-500/10",
      borderColor: "border-emerald-500/30",
      textColor: "text-emerald-400",
      barColor: "bg-emerald-500",
    },
    moderate: {
      label: "Moderate Confidence",
      color: "yellow",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/30",
      textColor: "text-yellow-400",
      barColor: "bg-yellow-500",
    },
    low: {
      label: "Low Confidence",
      color: "red",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/30",
      textColor: "text-red-400",
      barColor: "bg-red-500",
    },
  }[level];

  return (
    <div className="group flex flex-col md:flex-row md:items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-xl transition-all duration-300">
      <div className="flex items-center gap-4 mb-4 md:mb-0">
        <div
          className={`w-12 h-12 rounded-lg flex items-center justify-center border ${levelConfig.bgColor} ${levelConfig.borderColor} ${levelConfig.textColor}`}
        >
          <span className="text-lg font-bold">{level[0].toUpperCase()}</span>
        </div>
        <div>
          <div className="text-white font-bold text-lg flex items-center gap-2">
            {levelConfig.label}
            <span className="text-xs font-normal text-gray-500 bg-white/10 px-2 py-0.5 rounded-full">
              {data.total} predictions
            </span>
          </div>
          <div className="text-sm text-gray-400">
            {data.correct} correct out of {data.total}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6 border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
        {/* Accuracy Percentage */}
        <div className="text-right">
          <div
            className={`text-2xl font-bold font-mono ${
              data.percentage >= 70
                ? "text-emerald-400"
                : data.percentage >= 50
                ? "text-yellow-400"
                : "text-red-400"
            }`}
          >
            {data.total > 0 ? data.percentage.toFixed(1) : "0.0"}%
          </div>
          <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Accuracy
          </div>
        </div>

        {/* Visual Progress Bar */}
        <div className="hidden md:block w-32">
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${levelConfig.barColor} transition-all duration-1000`}
              style={{ width: `${data.total > 0 ? data.percentage : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
