"use client";

import React, { lazy, Suspense } from "react";
import type {
  RecommendationWithOutcome,
  PerformanceMetrics,
  MarketInfo,
} from "@/hooks/useMarketPerformance";
import ROIMetrics from "@/components/Performance/ROIMetrics";
import ConfidenceBreakdownTable from "./ConfidenceBreakdownTable";
import { formatPrice, formatProbability, formatROI } from "@/utils/performanceHelpers";

// Lazy-load the heavy chart component — Requirements: 8.1, 8.2
const PriceChartWithMarkers = lazy(
  () => import("@/components/Performance/PriceChartWithMarkers")
);

interface ResolvedMarketSectionProps {
  recommendations: RecommendationWithOutcome[];
  metrics: PerformanceMetrics;
  market: MarketInfo;           // source of truth for outcome + dates
  endDate?: string;             // fallback from MarketDetails if API date missing
  priceHistory: Array<{ timestamp: string; price: number }>;
}

/**
 * Displays final graded results for a resolved market.
 * Uses roiRealized from the API (server-graded) — does NOT recompute client-side.
 * Requirements: 4.1–4.9, 5.8, 8.1, 8.2, 11.4, 11.5, 11.6
 */
export default function ResolvedMarketSection({
  recommendations,
  metrics,
  market,
  endDate,
  priceHistory,
}: ResolvedMarketSectionProps) {
  const tradeableRecs = recommendations.filter(
    (r) => r.direction !== "NO_TRADE"
  );
  const allNoTrade = tradeableRecs.length === 0;

  // Use the API's resolvedOutcome as the source of truth — the market.winningOutcome
  // prop from MarketDetails is derived from a price heuristic and may be missing.
  const resolvedOutcome = market.resolvedOutcome || "—";
  const resolutionDate = market.resolutionDate || endDate;

  return (
    <div className="space-y-6">
      {/* Market Resolution summary — Requirement 4.1 */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Market Resolution
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-400 mb-1">Outcome</div>
            <div className={`text-xl font-bold ${
              resolvedOutcome === "Yes" || resolvedOutcome === "YES"
                ? "text-emerald-400"
                : resolvedOutcome === "No" || resolvedOutcome === "NO"
                ? "text-red-400"
                : "text-white"
            }`}>
              {resolvedOutcome}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">Resolution Date</div>
            <div className="text-xl font-bold text-white">
              {resolutionDate ? new Date(resolutionDate).toLocaleDateString() : "—"}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">
              Total Recommendations
            </div>
            <div className="text-xl font-bold text-white">
              {recommendations.length}
            </div>
          </div>
        </div>
      </div>

      {/* ROI + Accuracy metrics — omitted when all NO_TRADE */}
      {allNoTrade ? (
        <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center text-gray-400">
          No tradeable recommendations
        </div>
      ) : (
        <>
          <ROIMetrics
            totalROI={metrics.roi.total}
            averageROI={metrics.roi.average}
            bestROI={metrics.roi.best}
            worstROI={metrics.roi.worst}
            byRecommendation={metrics.roi.byRecommendation}
          />
          <ConfidenceBreakdownTable byConfidence={metrics.accuracy.byConfidence} />
        </>
      )}

      {/* Recommendation list — Requirement 4.2, 4.3, 4.8, 4.9, 11.4, 11.5 */}
      <div className="bg-white/5 border border-white/10 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">
          Recommendation History
        </h3>
        <div className="space-y-3">
          {recommendations.map((rec, index) => {
            const isNoTrade = rec.direction === "NO_TRADE";

            // Close date logic — Requirement 11.5
            const closeDate = rec.gradedByPriceHistory
              ? rec.exitTimestamp
                ? new Date(rec.exitTimestamp).toLocaleString()
                : null
              : "Resolved at market close";

            return (
              <div
                key={rec.id}
                data-testid="recommendation-card"
                className="p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-gray-500">
                      #{index + 1}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        isNoTrade
                          ? "bg-gray-500/20 text-gray-400"
                          : rec.direction === "LONG_YES"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-red-500/20 text-red-400"
                      }`}
                    >
                      {rec.direction}
                    </span>
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                        rec.confidence === "high"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : rec.confidence === "moderate"
                          ? "bg-yellow-500/10 text-yellow-400"
                          : "bg-red-500/10 text-red-400"
                      }`}
                    >
                      {rec.confidence}
                    </span>
                    {!isNoTrade && (
                      <>
                        {rec.wasCorrect ? (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-emerald-500/20 text-emerald-400">
                            ✓ Correct
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-red-500/20 text-red-400">
                            ✗ Incorrect
                          </span>
                        )}
                        {/* Intraday badge — Requirement 4.3 */}
                        {rec.gradedByPriceHistory && (
                          <span className="px-2 py-1 rounded text-xs font-semibold bg-indigo-500/20 text-indigo-400">
                            ⚡ Intraday
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  {/* ROI from API — Requirement 11.4 */}
                  {!isNoTrade && (
                    <div className="text-right ml-2">
                      <div
                        className={`text-lg font-bold ${
                          (rec.roiRealized ?? 0) >= 0
                            ? "text-emerald-400"
                            : "text-red-400"
                        }`}
                      >
                        {formatROI(rec.roiRealized)}
                      </div>
                      <div className="text-xs text-gray-500">ROI</div>
                    </div>
                  )}
                </div>

                <div className="text-xs text-gray-500 mb-3">
                  Opened: {new Date(rec.createdAt).toLocaleString()}
                  {closeDate && (
                    <span className="ml-2 text-gray-600">
                      · Closed: {closeDate}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/10">
                  <div>
                    <div className="text-xs text-gray-500">Entry Zone</div>
                    <div className="text-sm text-white font-mono">
                      {rec.entryZoneMin != null && rec.entryZoneMax != null
                        ? `${formatPrice(rec.entryZoneMin)} – ${formatPrice(rec.entryZoneMax)}`
                        : "N/A"}
                    </div>
                  </div>
                  {!isNoTrade && (
                    <>
                      <div>
                        <div className="text-xs text-emerald-500">
                          Target Zone
                        </div>
                        <div className="text-sm text-emerald-400 font-mono">
                          {rec.targetZoneMin != null && rec.targetZoneMax != null
                            ? `${formatPrice(rec.targetZoneMin)} – ${formatPrice(rec.targetZoneMax)}`
                            : "N/A"}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-red-500">Stop Loss</div>
                        <div className="text-sm text-red-400 font-mono">
                          {formatPrice(rec.stopLoss)}
                        </div>
                      </div>
                    </>
                  )}
                  <div>
                    <div className="text-xs text-gray-500">Fair Probability</div>
                    <div className="text-sm text-white font-mono">
                      {formatProbability(rec.fairProbability)}
                    </div>
                  </div>
                  {!isNoTrade && rec.actualOutcome && rec.actualOutcome !== "Pending" && (
                    <div>
                      <div className="text-xs text-gray-500">
                        {rec.gradedByPriceHistory ? "Intraday Result" : "Actual Outcome"}
                      </div>
                      <div className={`text-sm font-semibold ${
                        rec.actualOutcome === "Yes" || rec.actualOutcome === "YES"
                          ? "text-emerald-400"
                          : rec.actualOutcome === "No" || rec.actualOutcome === "NO"
                          ? "text-red-400"
                          : "text-gray-300"
                      }`}>
                        {rec.actualOutcome}
                      </div>
                    </div>
                  )}
                </div>

                {rec.explanation && (
                  <div className="text-sm text-gray-400 mt-3">
                    {rec.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Price chart — lazy loaded, Requirement 4.8, 4.9, 8.1, 8.2 */}
      {priceHistory.length > 0 ? (
        <Suspense
          fallback={
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <div className="animate-pulse space-y-4">
                <div className="h-6 bg-white/10 rounded w-1/4" />
                <div className="h-64 bg-white/10 rounded" />
              </div>
            </div>
          }
        >
          <PriceChartWithMarkers
            priceHistory={priceHistory}
            recommendations={recommendations}
            highlightedPeriod={undefined}
          />
        </Suspense>
      ) : (
        <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center text-gray-400 text-sm">
          Price chart unavailable
        </div>
      )}
    </div>
  );
}
