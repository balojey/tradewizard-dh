import React from "react";
import type { AccuracyMetrics } from "@/hooks/useMarketPerformance";

interface ConfidenceBreakdownTableProps {
  byConfidence: AccuracyMetrics["byConfidence"];
}

const LEVEL_STYLES: Record<string, { letter: string; classes: string }> = {
  high:     { letter: "H", classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  moderate: { letter: "M", classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30" },
  low:      { letter: "L", classes: "bg-red-500/10 text-red-400 border-red-500/30" },
};

/**
 * Renders a confidence-level accuracy breakdown table.
 * Omits rows where total === 0.
 * Requirements: 4.6, 4.7
 */
export default function ConfidenceBreakdownTable({
  byConfidence,
}: ConfidenceBreakdownTableProps) {
  const levels = (["high", "moderate", "low"] as const).filter(
    (level) => byConfidence[level].total > 0
  );

  if (levels.length === 0) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">
        Performance by Confidence Level
      </h3>
      <div className="space-y-3">
        {levels.map((level) => {
          const stats = byConfidence[level];
          const style = LEVEL_STYLES[level];
          return (
            <div
              key={level}
              className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold border ${style.classes}`}
                >
                  {style.letter}
                </div>
                <div>
                  <div className="text-white font-semibold capitalize">
                    {level} Confidence
                  </div>
                  <div className="text-sm text-gray-400">
                    {stats.correct} of {stats.total} correct
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">
                  {stats.percentage.toFixed(1)}%
                </div>
                <div className="text-xs text-gray-500">Accuracy</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
