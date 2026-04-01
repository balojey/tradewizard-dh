"use client";

import React, { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  ReferenceArea,
  Legend,
} from "recharts";
import { TrendingUp, TrendingDown } from "lucide-react";
import Card from "@/components/shared/Card";
import EmptyState from "@/components/shared/EmptyState";
import WarningBanner from "@/components/shared/WarningBanner";
import { RecommendationWithOutcome } from "@/hooks/useMarketPerformance";
import { PriceHistoryPoint } from "@/hooks/usePriceHistory";
import { downsamplePriceData, getOptimalMaxPoints } from "@/utils/chartDataDownsampling";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { validatePriceHistory } from "@/lib/data-validation";
import { logWarning } from "@/utils/errorLogging";

interface PriceChartWithMarkersProps {
  priceHistory: PriceHistoryPoint[];
  recommendations: RecommendationWithOutcome[];
  highlightedPeriod?: { start: string; end: string };
  className?: string;
}

interface ChartDataPoint {
  timestamp: number;
  yesPrice: number;
  noPrice: number;
  formattedDate: string;
}

interface MarkerData {
  id: string;
  timestamp: number;
  /** Price in the token's own space — YES markers on yesPrice line, NO on noPrice line */
  price: number;
  type: "entry" | "target" | "stop";
  direction: "LONG_YES" | "LONG_NO";
  wasCorrect: boolean;
  recommendation: RecommendationWithOutcome;
}

export default function PriceChartWithMarkers({
  priceHistory,
  recommendations,
  highlightedPeriod,
  className = "",
}: PriceChartWithMarkersProps) {
  const isMobile = useIsMobile();

  const priceHistoryValidation = useMemo(() => {
    const validation = validatePriceHistory(priceHistory);
    if (!validation.isValid) {
      logWarning("Incomplete price history detected", {
        component: "PriceChartWithMarkers",
        reason: validation.reason,
        dataPoints: priceHistory?.length || 0,
      });
    }
    return validation;
  }, [priceHistory]);

  // Build dual-line chart data: YES price + derived NO price (1 - yesPrice)
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!priceHistoryValidation.isValid) return [];
    const maxPoints = getOptimalMaxPoints(isMobile);
    const downsampled = downsamplePriceData(priceHistory, maxPoints);
    return downsampled.map((d) => ({
      timestamp: d.timestamp,
      yesPrice: d.price,
      noPrice: parseFloat((1 - d.price).toFixed(6)),
      formattedDate: d.formattedDate,
    }));
  }, [priceHistory, isMobile, priceHistoryValidation.isValid]);

  // Build markers — each pinned to the correct token line
  const markers = useMemo<MarkerData[]>(() => {
    if (!recommendations || recommendations.length === 0) return [];

    const list: MarkerData[] = [];

    recommendations.forEach((rec) => {
      if (rec.direction === "NO_TRADE") return;
      if (rec.entryZoneMin == null || rec.entryZoneMax == null) return;

      const dir = rec.direction as "LONG_YES" | "LONG_NO";
      const entryTs = new Date(rec.createdAt).getTime();
      const entryAvg = (rec.entryZoneMin + rec.entryZoneMax) / 2;

      // Entry marker
      list.push({
        id: `${rec.id}-entry`,
        timestamp: entryTs,
        price: entryAvg,
        type: "entry",
        direction: dir,
        wasCorrect: rec.wasCorrect ?? false,
        recommendation: rec,
      });

      // Exit marker — use actual exit price if graded intraday, else use target/stop midpoint
      if (rec.exitPrice != null) {
        const exitTs = rec.exitTimestamp
          ? new Date(rec.exitTimestamp).getTime()
          : rec.resolutionDate
          ? new Date(rec.resolutionDate).getTime()
          : null;

        if (exitTs) {
          list.push({
            id: `${rec.id}-exit`,
            timestamp: exitTs,
            price: rec.exitPrice,
            type: rec.wasCorrect ? "target" : "stop",
            direction: dir,
            wasCorrect: rec.wasCorrect ?? false,
            recommendation: rec,
          });
        }
      } else {
        // No intraday grade — show target and stop as reference lines on the chart
        if (rec.targetZoneMin != null && rec.targetZoneMax != null) {
          list.push({
            id: `${rec.id}-target`,
            timestamp: entryTs,
            price: (rec.targetZoneMin + rec.targetZoneMax) / 2,
            type: "target",
            direction: dir,
            wasCorrect: rec.wasCorrect ?? false,
            recommendation: rec,
          });
        }
        if (rec.stopLoss != null) {
          list.push({
            id: `${rec.id}-stop`,
            timestamp: entryTs,
            price: rec.stopLoss,
            type: "stop",
            direction: dir,
            wasCorrect: rec.wasCorrect ?? false,
            recommendation: rec,
          });
        }
      }
    });

    return list;
  }, [recommendations]);

  const highlightedArea = useMemo(() => {
    if (!highlightedPeriod) return null;
    return {
      startTime: new Date(highlightedPeriod.start).getTime(),
      endTime: new Date(highlightedPeriod.end).getTime(),
    };
  }, [highlightedPeriod]);

  if (!priceHistoryValidation.isValid) {
    return (
      <Card className={`p-6 ${className}`}>
        <WarningBanner
          type="warning"
          title="Incomplete Price Data"
          message={priceHistoryValidation.reason || "Historical price data is incomplete."}
          details={["Some performance metrics may be unavailable"]}
        />
      </Card>
    );
  }

  if (!recommendations || recommendations.length === 0) {
    return (
      <Card className={`p-6 ${className}`}>
        <EmptyState
          icon={TrendingUp}
          title="No Recommendations Available"
          message="Price chart with entry/exit markers will appear once recommendations are generated."
        />
      </Card>
    );
  }

  const allPrices = chartData.flatMap((d) => [d.yesPrice, d.noPrice]);
  const yAxisMin = Math.max(0, Math.min(...allPrices) - 0.05);
  const yAxisMax = Math.min(1, Math.max(...allPrices) + 0.05);

  const hasLongYes = recommendations.some((r) => r.direction === "LONG_YES");
  const hasLongNo = recommendations.some((r) => r.direction === "LONG_NO");

  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-4">
        <h4 className="text-lg font-bold text-white mb-1">
          Price Chart — YES &amp; NO Tokens
        </h4>
        <p className="text-sm text-gray-400">
          Both token prices with recommendation entry, target, and stop markers
        </p>
      </div>

      {/* Legend */}
      <div
        className="mb-4 flex flex-wrap items-center gap-3 sm:gap-5 text-xs"
        role="list"
        aria-label="Chart legend"
      >
        <div className="flex items-center gap-2" role="listitem">
          <div className="w-8 h-0.5 bg-emerald-400" />
          <span className="text-gray-400">YES token</span>
        </div>
        <div className="flex items-center gap-2" role="listitem">
          <div className="w-8 h-0.5 bg-red-400" />
          <span className="text-gray-400">NO token</span>
        </div>
        <div className="flex items-center gap-2" role="listitem">
          <TriangleUp color="#6366f1" size={10} />
          <span className="text-gray-400">Entry</span>
        </div>
        <div className="flex items-center gap-2" role="listitem">
          <CircleDot color="#10b981" size={10} />
          <span className="text-gray-400">Target hit</span>
        </div>
        <div className="flex items-center gap-2" role="listitem">
          <CircleDot color="#ef4444" size={10} />
          <span className="text-gray-400">Stop hit</span>
        </div>
      </div>

      <div
        role="img"
        aria-label={`Dual token price chart with ${markers.length} recommendation markers`}
      >
        <ResponsiveContainer width="100%" height={isMobile ? 300 : 420}>
          <LineChart
            data={chartData}
            margin={
              isMobile
                ? { top: 5, right: 5, left: 0, bottom: 5 }
                : { top: 20, right: 30, left: 20, bottom: 20 }
            }
            aria-hidden="true"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />

            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af", fontSize: isMobile ? 10 : 11 }}
              tickFormatter={(ts) =>
                new Date(ts).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }
            />

            <YAxis
              domain={[yAxisMin, yAxisMax]}
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af", fontSize: isMobile ? 10 : 11 }}
              tickFormatter={(v) => v.toFixed(2)}
              label={
                !isMobile
                  ? {
                      value: "Token Price",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#9ca3af",
                      fontSize: 12,
                    }
                  : undefined
              }
            />

            <Tooltip content={<CustomTooltip isMobile={isMobile} />} />

            {highlightedArea && (
              <ReferenceArea
                x1={highlightedArea.startTime}
                x2={highlightedArea.endTime}
                fill="#3b82f6"
                fillOpacity={0.1}
                stroke="#3b82f6"
                strokeOpacity={0.3}
              />
            )}

            {/* YES token price line — always shown */}
            <Line
              type="monotone"
              dataKey="yesPrice"
              name="YES"
              stroke="#34d399"
              strokeWidth={isMobile ? 1.5 : 2}
              dot={false}
              activeDot={{ r: isMobile ? 3 : 4, fill: "#34d399" }}
            />

            {/* NO token price line — always shown (mirror of YES) */}
            <Line
              type="monotone"
              dataKey="noPrice"
              name="NO"
              stroke="#f87171"
              strokeWidth={isMobile ? 1.5 : 2}
              dot={false}
              activeDot={{ r: isMobile ? 3 : 4, fill: "#f87171" }}
              strokeDasharray="4 2"
            />

            {/* Recommendation markers — pinned to the correct token line */}
            {markers.map((marker) => (
              <ReferenceDot
                key={marker.id}
                x={marker.timestamp}
                y={marker.price}
                r={isMobile ? 5 : 6}
                fill={markerFill(marker)}
                stroke="#fff"
                strokeWidth={isMobile ? 1.5 : 2}
                shape={
                  <MarkerShape
                    type={marker.type}
                    direction={marker.direction}
                    wasCorrect={marker.wasCorrect}
                    size={isMobile ? 6 : 8}
                  />
                }
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function markerFill(marker: MarkerData): string {
  if (marker.type === "entry") return "#6366f1"; // indigo — direction-neutral
  if (marker.type === "target") return "#10b981"; // emerald — success
  return "#ef4444"; // red — stop
}

function MarkerShape({
  cx,
  cy,
  type,
  direction,
  wasCorrect,
  size = 8,
}: {
  cx?: number;
  cy?: number;
  type: "entry" | "target" | "stop";
  direction: "LONG_YES" | "LONG_NO";
  wasCorrect: boolean;
  size?: number;
}) {
  if (cx === undefined || cy === undefined) return null;

  if (type === "entry") {
    // Triangle up for LONG_YES, triangle down for LONG_NO
    if (direction === "LONG_YES") {
      return (
        <polygon
          points={`${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`}
          fill="#6366f1"
          stroke="#fff"
          strokeWidth={1.5}
        />
      );
    }
    return (
      <polygon
        points={`${cx},${cy + size} ${cx - size},${cy - size} ${cx + size},${cy - size}`}
        fill="#6366f1"
        stroke="#fff"
        strokeWidth={1.5}
      />
    );
  }

  // Target / stop — circle
  const color = type === "target" ? "#10b981" : "#ef4444";
  return <circle cx={cx} cy={cy} r={size * 0.8} fill={color} stroke="#fff" strokeWidth={1.5} />;
}

// Tiny inline SVG helpers for the legend
function TriangleUp({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size * 2} height={size * 2} viewBox={`0 0 ${size * 2} ${size * 2}`}>
      <polygon
        points={`${size},0 0,${size * 2} ${size * 2},${size * 2}`}
        fill={color}
      />
    </svg>
  );
}

function CircleDot({ color, size }: { color: string; size: number }) {
  return (
    <svg width={size * 2} height={size * 2} viewBox={`0 0 ${size * 2} ${size * 2}`}>
      <circle cx={size} cy={size} r={size} fill={color} />
    </svg>
  );
}

function CustomTooltip({ active, payload, isMobile }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0].payload as ChartDataPoint;

  return (
    <div
      className={`bg-black/95 border border-white/20 rounded-lg p-3 shadow-xl ${
        isMobile ? "max-w-[200px]" : "max-w-xs"
      }`}
    >
      <div className={`${isMobile ? "text-[10px]" : "text-xs"} text-gray-400 mb-2`}>
        {new Date(data.timestamp).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: isMobile ? undefined : "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-emerald-400">YES:</span>
          <span className="text-xs font-bold text-white font-mono">
            {data.yesPrice.toFixed(3)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-red-400">NO:</span>
          <span className="text-xs font-bold text-white font-mono">
            {data.noPrice.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}
