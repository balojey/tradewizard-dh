"use client";

import React, { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import { Target, TrendingUp, TrendingDown, Info } from "lucide-react";
import Card from "@/components/shared/Card";
import { calculateCalibrationMetrics, RecommendationWithOutcome } from "@/lib/performance-calculations";
import { useIsMobile } from "@/hooks/useMediaQuery";

interface CalibrationAnalysisProps {
  recommendations: RecommendationWithOutcome[];
  className?: string;
}

interface ScatterDataPoint {
  confidence: number;
  outcome: number;
  wasCorrect: boolean;
  fairProbability: number;
  id: string;
}

/**
 * CalibrationAnalysis Component
 * 
 * Displays a scatter plot showing how well AI confidence levels correlate with actual outcomes.
 * Includes calibration error metrics and highlights strong vs poor calibration.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 * 
 * @param recommendations - Array of recommendations with outcome data
 * 
 * @example
 * ```tsx
 * <CalibrationAnalysis recommendations={data.recommendations} />
 * ```
 */
export default function CalibrationAnalysis({
  recommendations,
  className = "",
}: CalibrationAnalysisProps) {
  // Detect mobile device for responsive optimizations
  const isMobile = useIsMobile();
  
  // Calculate calibration metrics
  const metrics = useMemo(() => {
    return calculateCalibrationMetrics(recommendations);
  }, [recommendations]);

  // Prepare scatter plot data
  const scatterData = useMemo<ScatterDataPoint[]>(() => {
    if (!recommendations || recommendations.length === 0) return [];

    return recommendations.map((rec) => ({
      confidence: rec.fairProbability,
      outcome: rec.wasCorrect ? 1 : 0,
      wasCorrect: rec.wasCorrect,
      fairProbability: rec.fairProbability,
      id: rec.id,
    }));
  }, [recommendations]);

  // Segment data by calibration quality
  const { strongCalibration, poorCalibration, moderate } = useMemo(() => {
    const strong: ScatterDataPoint[] = [];
    const poor: ScatterDataPoint[] = [];
    const mod: ScatterDataPoint[] = [];

    scatterData.forEach((point) => {
      // High confidence (>0.7) and correct = strong calibration
      if (point.confidence > 0.7 && point.wasCorrect) {
        strong.push(point);
      }
      // High confidence (>0.7) and incorrect = poor calibration
      else if (point.confidence > 0.7 && !point.wasCorrect) {
        poor.push(point);
      }
      // Everything else = moderate
      else {
        mod.push(point);
      }
    });

    return {
      strongCalibration: strong,
      poorCalibration: poor,
      moderate: mod,
    };
  }, [scatterData]);

  if (!recommendations || recommendations.length === 0) {
    return (
      <Card className={`p-6 ${className}`}>
        <div className="text-center text-gray-400">
          No recommendations available for calibration analysis
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-6 ${className}`}>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-400" />
            Confidence Calibration Analysis
          </h3>
          <TooltipInfo text="Shows how well AI confidence levels match actual outcomes. Points near the diagonal line indicate good calibration." />
        </div>
        <p className="text-sm text-gray-400">
          Scatter plot of predicted confidence vs actual outcomes
        </p>
      </div>

      {/* Calibration Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Calibration Error"
          value={metrics.calibrationError.toFixed(3)}
          subtext="Lower is better"
          color={
            metrics.calibrationError < 0.1
              ? "emerald"
              : metrics.calibrationError < 0.2
              ? "blue"
              : metrics.calibrationError < 0.3
              ? "yellow"
              : "red"
          }
          tooltip="Mean absolute difference between predicted probability and actual outcome. Perfect calibration = 0."
        />

        <MetricCard
          label="Avg Confidence (Correct)"
          value={metrics.avgConfidenceCorrect.toFixed(2)}
          subtext="Confidence when accurate"
          color="emerald"
          tooltip="Average confidence level for predictions that were correct. Higher values indicate the AI was confident when right."
        />

        <MetricCard
          label="Avg Confidence (Incorrect)"
          value={metrics.avgConfidenceIncorrect.toFixed(2)}
          subtext="Confidence when inaccurate"
          color="red"
          tooltip="Average confidence level for predictions that were incorrect. Lower values are better (less confident when wrong)."
        />
      </div>

      {/* Scatter Plot */}
      <div className="mb-6">
        <ResponsiveContainer width="100%" height={isMobile ? 300 : 400}>
          <ScatterChart
            margin={isMobile ? { top: 10, right: 10, bottom: 10, left: 10 } : { top: 20, right: 30, bottom: 20, left: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            
            <XAxis
              type="number"
              dataKey="confidence"
              name="Confidence"
              domain={[0, 1]}
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af", fontSize: isMobile ? 10 : 11 }}
              tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
              label={!isMobile ? {
                value: "AI Confidence Level",
                position: "insideBottom",
                offset: -10,
                fill: "#9ca3af",
                fontSize: 12,
              } : undefined}
            />
            
            <YAxis
              type="number"
              dataKey="outcome"
              name="Outcome"
              domain={[0, 1]}
              stroke="#9ca3af"
              tick={{ fill: "#9ca3af", fontSize: isMobile ? 10 : 11 }}
              ticks={[0, 1]}
              tickFormatter={(value) => (value === 1 ? "Correct" : "Incorrect")}
              label={!isMobile ? {
                value: "Actual Outcome",
                angle: -90,
                position: "insideLeft",
                fill: "#9ca3af",
                fontSize: 12,
              } : undefined}
            />
            
            <Tooltip content={<CustomTooltip isMobile={isMobile} />} />
            
            {!isMobile && (
              <Legend
                verticalAlign="top"
                height={36}
                iconType="circle"
                wrapperStyle={{ paddingBottom: "10px" }}
              />
            )}

            {/* Perfect calibration reference line */}
            <Scatter
              name="Perfect Calibration"
              data={[
                { confidence: 0, outcome: 0 },
                { confidence: 1, outcome: 1 },
              ]}
              line={{ stroke: "#6366f1", strokeWidth: 2, strokeDasharray: "5 5" }}
              shape={() => null}
            />

            {/* Moderate calibration points */}
            <Scatter
              name="Moderate"
              data={moderate}
              fill="#9ca3af"
            >
              {moderate.map((entry, index) => (
                <Cell key={`cell-moderate-${index}`} fill="#9ca3af" opacity={0.6} />
              ))}
            </Scatter>

            {/* Strong calibration points (high confidence + correct) */}
            <Scatter
              name="Strong Calibration"
              data={strongCalibration}
              fill="#10b981"
            >
              {strongCalibration.map((entry, index) => (
                <Cell key={`cell-strong-${index}`} fill="#10b981" />
              ))}
            </Scatter>

            {/* Poor calibration points (high confidence + incorrect) */}
            <Scatter
              name="Poor Calibration"
              data={poorCalibration}
              fill="#ef4444"
            >
              {poorCalibration.map((entry, index) => (
                <Cell key={`cell-poor-${index}`} fill="#ef4444" />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Calibration Quality Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CalibrationQualityCard
          icon={TrendingUp}
          label="Strong Calibration"
          count={strongCalibration.length}
          total={recommendations.length}
          description="High confidence + correct prediction"
          color="emerald"
        />

        <CalibrationQualityCard
          icon={Target}
          label="Moderate Calibration"
          count={moderate.length}
          total={recommendations.length}
          description="Lower confidence or mixed results"
          color="gray"
        />

        <CalibrationQualityCard
          icon={TrendingDown}
          label="Poor Calibration"
          count={poorCalibration.length}
          total={recommendations.length}
          description="High confidence + incorrect prediction"
          color="red"
        />
      </div>

      {/* Interpretation Guide */}
      <div className="mt-6 pt-6 border-t border-white/10">
        <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <p className="font-semibold text-white mb-1">Understanding Calibration</p>
            <p>
              Well-calibrated predictions cluster near the diagonal line. Strong calibration (green)
              shows the AI was confident and correct. Poor calibration (red) indicates overconfidence
              in incorrect predictions. Lower calibration error means better overall calibration.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  subtext: string;
  color: "emerald" | "blue" | "yellow" | "red";
  tooltip: string;
}

function MetricCard({ label, value, subtext, color, tooltip }: MetricCardProps) {
  const colorClasses = {
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
  }[color];

  return (
    <div className="flex flex-col items-center justify-center p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-center gap-1 mb-2">
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider text-center">
          {label}
        </div>
        <TooltipInfo text={tooltip} small />
      </div>
      <div className={`text-2xl font-bold font-mono ${colorClasses} mb-1`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 text-center">{subtext}</div>
    </div>
  );
}

interface CalibrationQualityCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  total: number;
  description: string;
  color: "emerald" | "gray" | "red";
}

function CalibrationQualityCard({
  icon: Icon,
  label,
  count,
  total,
  description,
  color,
}: CalibrationQualityCardProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  const colorClasses = {
    emerald: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      text: "text-emerald-400",
    },
    gray: {
      bg: "bg-gray-500/10",
      border: "border-gray-500/30",
      text: "text-gray-400",
    },
    red: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      text: "text-red-400",
    },
  }[color];

  return (
    <div className="flex flex-col items-center p-4 bg-white/5 rounded-xl border border-white/10">
      <div className={`p-3 rounded-lg ${colorClasses.bg} border ${colorClasses.border} mb-3`}>
        <Icon className={`w-5 h-5 ${colorClasses.text}`} />
      </div>
      <div className="text-center space-y-1">
        <div className="text-sm font-semibold text-white">{label}</div>
        <div className={`text-2xl font-bold ${colorClasses.text}`}>
          {count}
          <span className="text-sm text-gray-500 ml-1">
            ({percentage.toFixed(1)}%)
          </span>
        </div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
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

/**
 * Custom tooltip for scatter plot points
 */
function CustomTooltip({ active, payload, isMobile }: any) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload as ScatterDataPoint;

  return (
    <div className={`bg-black/95 border border-white/20 rounded-lg p-3 shadow-xl ${isMobile ? 'max-w-[200px]' : 'max-w-xs'}`}>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <span className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-300`}>Confidence:</span>
          <span className={`${isMobile ? 'text-xs' : 'text-sm'} font-bold text-white font-mono`}>
            {(data.confidence * 100).toFixed(1)}%
          </span>
        </div>
        
        <div className="flex items-center justify-between gap-4">
          <span className={`${isMobile ? 'text-xs' : 'text-sm'} text-gray-300`}>Outcome:</span>
          <span
            className={`${isMobile ? 'text-xs' : 'text-sm'} font-bold ${
              data.wasCorrect ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {data.wasCorrect ? "Correct" : "Incorrect"}
          </span>
        </div>

        {!isMobile && (
          <div className="pt-2 mt-2 border-t border-white/10">
            <div className="text-xs text-gray-400">
              {data.confidence > 0.7 && data.wasCorrect && (
                <span className="text-emerald-400">✓ Strong calibration</span>
              )}
              {data.confidence > 0.7 && !data.wasCorrect && (
                <span className="text-red-400">✗ Poor calibration (overconfident)</span>
              )}
              {data.confidence <= 0.7 && (
                <span className="text-gray-400">Moderate confidence</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
