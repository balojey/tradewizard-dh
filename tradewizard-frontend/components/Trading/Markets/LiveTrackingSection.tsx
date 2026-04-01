import React from "react";
import { AlertTriangle } from "lucide-react";
import type { RecommendationWithOutcome } from "@/hooks/useMarketPerformance";
import {
  computeLivePnL,
  computeRecommendationStatus,
  formatPrice,
  formatROI,
} from "@/utils/performanceHelpers";
import RecommendationStatusBadge from "./RecommendationStatusBadge";

interface LiveTrackingSectionProps {
  recommendations: RecommendationWithOutcome[];
  currentMarketPrice: number;
}

/**
 * Displays live P&L tracking for active market recommendations.
 * Computes P&L from currentMarketPrice — NOT from rec.roiRealized (API placeholder).
 * Requirements: 3.1, 3.2, 3.3, 3.8, 3.9, 3.10, 5.5, 11.7
 */
export default function LiveTrackingSection({
  recommendations,
  currentMarketPrice,
}: LiveTrackingSectionProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Live Tracking</h3>
      <div className="space-y-3">
        {recommendations.map((rec, index) => {
          const status = computeRecommendationStatus(rec, currentMarketPrice);
          const livePnL = computeLivePnL(rec, currentMarketPrice);
          const isNoTrade = rec.direction === "NO_TRADE";
          const hasMissingZone =
            rec.entryZoneMin === 0 && rec.entryZoneMax === 0;

          return (
            <div
              key={rec.id}
              data-testid="recommendation-card"
              className={`p-4 rounded-lg border transition-colors ${
                isNoTrade
                  ? "bg-white/3 border-white/5"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              {/* Data quality warning */}
              {hasMissingZone && (
                <div className="flex items-center gap-2 text-yellow-400 text-xs mb-3 p-2 bg-yellow-500/10 rounded border border-yellow-500/20">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  <span>Missing price data — some fields unavailable</span>
                </div>
              )}

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
                  {/* Always show Pending badge for active markets — no final verdict */}
                  <span className="px-2 py-1 rounded text-xs font-semibold bg-gray-500/20 text-gray-400">
                    Pending
                  </span>
                  {!isNoTrade && <RecommendationStatusBadge status={status} />}
                </div>

                {/* Live P&L — only for tradeable recs */}
                {!isNoTrade && livePnL !== null && (
                  <div className="text-right ml-2">
                    <div
                      className={`text-lg font-bold ${
                        livePnL >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatROI(livePnL)}
                    </div>
                    <div className="text-xs text-gray-500">Live P&L</div>
                  </div>
                )}
              </div>

              <div className="text-xs text-gray-500 mb-3">
                Created: {new Date(rec.createdAt).toLocaleString()}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-white/10">
                <div>
                  <div className="text-xs text-gray-500">Entry Zone</div>
                  <div className="text-sm text-white font-mono">
                    {hasMissingZone
                      ? "N/A"
                      : `${formatPrice(rec.entryZoneMin)} – ${formatPrice(rec.entryZoneMax)}`}
                  </div>
                </div>
                {!isNoTrade && (
                  <>
                    <div>
                      <div className="text-xs text-emerald-500">Target Zone</div>
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
                  <div className="text-xs text-gray-500">Current Price</div>
                  <div className="text-sm text-white font-mono">
                    {isNoTrade
                      ? formatPrice(currentMarketPrice)
                      : formatPrice(
                          rec.direction === "LONG_NO"
                            ? 1 - currentMarketPrice
                            : currentMarketPrice
                        )}
                  </div>
                  <div className="text-[10px] text-gray-600">
                    {isNoTrade ? "YES" : rec.direction === "LONG_NO" ? "NO token" : "YES token"}
                  </div>
                </div>
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
  );
}
