"use client";

import React from "react";
import { Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import Card from "@/components/shared/Card";
import { DataCompletenessSummary, CalculationRequirements } from "@/lib/data-validation";

interface DataCompletenessInfoProps {
  summary: DataCompletenessSummary;
  requirements: CalculationRequirements;
  className?: string;
}

/**
 * DataCompletenessInfo Component
 * 
 * Displays a summary of data completeness and which calculations are available.
 * Helps users understand what metrics can be calculated with the available data.
 * 
 * Requirements: 15.1, 15.2
 * 
 * @example
 * ```tsx
 * const summary = getDataCompletenessSummary(recommendations, priceHistory);
 * const requirements = getCalculationRequirements(summary);
 * 
 * <DataCompletenessInfo summary={summary} requirements={requirements} />
 * ```
 */
export default function DataCompletenessInfo({
  summary,
  requirements,
  className = "",
}: DataCompletenessInfoProps) {
  // Don't show if all data is complete
  const hasIssues =
    summary.invalidRecommendations > 0 ||
    !summary.priceHistoryStatus.isValid ||
    summary.priceHistoryStatus.hasGaps;

  if (!hasIssues) {
    return null;
  }

  return (
    <Card className={`p-4 sm:p-6 ${className}`}>
      <div className="flex items-start gap-3 mb-4">
        <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-base font-semibold text-white mb-1">
            Data Completeness Summary
          </h4>
          <p className="text-sm text-gray-400">
            Some data is incomplete. The following metrics are affected:
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Recommendations Status */}
        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {summary.invalidRecommendations === 0 ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-yellow-400" />
              )}
              <span className="text-sm font-medium text-white">
                Recommendations
              </span>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <div>
                Total: {summary.totalRecommendations} | Valid:{" "}
                {summary.validRecommendations} | Incomplete:{" "}
                {summary.invalidRecommendations}
              </div>
              {summary.invalidRecommendations > 0 && (
                <div className="text-yellow-400">
                  {summary.invalidRecommendations} recommendation(s) missing
                  entry/exit data
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Price History Status */}
        <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {summary.priceHistoryStatus.isValid ? (
                summary.priceHistoryStatus.hasGaps ? (
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                )
              ) : (
                <XCircle className="w-4 h-4 text-red-400" />
              )}
              <span className="text-sm font-medium text-white">
                Price History
              </span>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              {summary.priceHistoryStatus.isValid ? (
                <>
                  <div className="text-emerald-400">
                    Sufficient data for chart rendering
                  </div>
                  {summary.priceHistoryStatus.hasGaps && (
                    <div className="text-yellow-400">
                      {summary.priceHistoryStatus.gapCount} gap(s) detected in
                      price history
                    </div>
                  )}
                </>
              ) : (
                <div className="text-red-400">
                  {summary.priceHistoryStatus.reason}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Available Calculations */}
        <div className="pt-3 border-t border-white/10">
          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Available Calculations
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CalculationStatus
              label="Profit/Loss"
              available={requirements.profitLoss}
            />
            <CalculationStatus
              label="Accuracy"
              available={requirements.accuracy}
            />
            <CalculationStatus
              label="Risk Metrics"
              available={requirements.riskMetrics}
            />
            <CalculationStatus
              label="Price Chart"
              available={requirements.priceChart}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

interface CalculationStatusProps {
  label: string;
  available: boolean;
}

function CalculationStatus({ label, available }: CalculationStatusProps) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
        available
          ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
          : "bg-gray-500/10 border-gray-500/20 text-gray-500"
      }`}
    >
      {available ? (
        <CheckCircle className="w-3 h-3" />
      ) : (
        <XCircle className="w-3 h-3" />
      )}
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}
