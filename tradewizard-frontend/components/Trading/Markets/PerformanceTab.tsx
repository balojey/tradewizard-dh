"use client";

import React, { useMemo } from "react";
import { BarChart2 } from "lucide-react";
import { useMarketPerformance } from "@/hooks/useMarketPerformance";
import ErrorBoundary from "@/components/shared/ErrorBoundary";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import LiveTrackingSection from "./LiveTrackingSection";
import ResolvedMarketSection from "./ResolvedMarketSection";
import AgentSignalsSection from "./AgentSignalsSection";

interface PerformanceTabProps {
  conditionId: string | null;
  isResolved: boolean;
  winningOutcome?: string;
  endDate?: string;
  currentMarketPrice: number;
}

/**
 * Performance tab for market details page.
 * Active markets → LiveTrackingSection (live P&L from currentMarketPrice).
 * Resolved markets → ResolvedMarketSection (server-graded results).
 * Requirements: 1.3, 2.1, 2.2, 5.1–5.4, 8.4, 8.5
 */
export default function PerformanceTab({
  conditionId,
  isResolved,
  winningOutcome,
  endDate,
  currentMarketPrice,
}: PerformanceTabProps) {
  // No conditionId → empty state, no fetch — Requirement 2.2
  if (conditionId === null) {
    return (
      <div className="py-12">
        <EmptyState
          icon={BarChart2}
          title="No AI Analysis Available"
          message="No market selected."
        />
      </div>
    );
  }

  return (
    <ErrorBoundary resetKeys={[conditionId]}>
      <PerformanceTabInner
        conditionId={conditionId}
        isResolved={isResolved}
        winningOutcome={winningOutcome}
        endDate={endDate}
        currentMarketPrice={currentMarketPrice}
      />
    </ErrorBoundary>
  );
}

function PerformanceTabInner({
  conditionId,
  isResolved,
  winningOutcome,
  endDate,
  currentMarketPrice,
}: Required<Pick<PerformanceTabProps, "conditionId" | "isResolved" | "currentMarketPrice">> &
  Pick<PerformanceTabProps, "winningOutcome" | "endDate">) {
  const { data, isLoading, error, refetch } = useMarketPerformance(
    conditionId,
    { isResolved }
  );

  // Memoize confidence breakdown aggregation — Requirement 8.5
  const byConfidence = useMemo(
    () => data?.metrics.accuracy.byConfidence,
    [data?.metrics.accuracy.byConfidence]
  );

  // Memoize ROI totals — Requirement 8.5
  const roiMetrics = useMemo(
    () => data?.metrics.roi,
    [data?.metrics.roi]
  );

  if (isLoading) {
    return (
      <div className="py-12">
        <LoadingState message="Loading performance data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <ErrorState
          error={error}
          title="Failed to load performance data"
          onRetry={refetch}
        />
      </div>
    );
  }

  if (!data || data.recommendations.length === 0) {
    return (
      <div className="py-12">
        <EmptyState
          icon={BarChart2}
          title="No AI Analysis Available"
          message="The AI system may not have had sufficient data or confidence to generate predictions for this market."
        />
      </div>
    );
  }

  // Rebuild metrics with memoized values to avoid prop drilling re-renders
  const metrics = {
    accuracy: { ...data.metrics.accuracy, byConfidence: byConfidence! },
    roi: roiMetrics!,
  };

  return (
    <div className="space-y-6 py-6">
      {isResolved ? (
        <ResolvedMarketSection
          recommendations={data.recommendations}
          metrics={metrics}
          market={data.market}
          endDate={endDate}
          priceHistory={data.priceHistory ?? []}
        />
      ) : (
        <LiveTrackingSection
          recommendations={data.recommendations}
          currentMarketPrice={currentMarketPrice}
        />
      )}
      <AgentSignalsSection agentSignals={data.agentSignals} />
    </div>
  );
}
