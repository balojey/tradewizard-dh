"use client";

import React from "react";
import Card from "@/components/shared/Card";
import PercentageGauge from "@/components/shared/PercentageGauge";
import { PerformanceData } from "@/hooks/usePerformanceData";
import { TrendingUp, TrendingDown, Target, DollarSign, Crown, AlertTriangle } from "lucide-react";

interface PerformanceMetricsProps {
  data: PerformanceData;
}

export default function PerformanceMetrics({ data }: PerformanceMetricsProps) {
  const { summary, performanceByConfidence, calculatedMetrics } = data;

  if (!summary) {
    return null;
  }

  return (
    <div className="space-y-8">
      {/* Detailed Overview */}
      <Card className="p-8">
        <h2 className="text-xl font-bold text-white mb-8 tracking-tight flex items-center gap-2">
          <ActivityIcon className="w-5 h-5 text-indigo-400" />
          Detailed Performance Analysis
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-2xl border border-white/5">
            <div className="mb-6 relative">
              <div className="absolute inset-0 bg-emerald-500/20 blur-2xl rounded-full" />
              <PercentageGauge
                value={summary.win_rate_pct}
                size={140}
                label="Win Rate"
              />
            </div>
            <div className="text-center space-y-1">
              <div className="text-2xl font-bold text-white">{summary.correct_recommendations} <span className="text-gray-500 text-lg font-normal">/ {summary.total_resolved_recommendations}</span></div>
              <div className="text-sm text-gray-400">Correct Recommendations</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MetricBox
              icon={TrendingUp}
              label="Average ROI"
              value={summary.avg_roi != null ? `${summary.avg_roi >= 0 ? "+" : ""}${summary.avg_roi.toFixed(2)}%` : "N/A"}
              subtext="Per recommendation"
              color="blue"
            />
            <MetricBox
              icon={Target}
              label="Edge Capture"
              value={summary.avg_edge_captured != null ? `${summary.avg_edge_captured >= 0 ? "+" : ""}${(summary.avg_edge_captured * 100).toFixed(1)}%` : "N/A"}
              subtext="Theoretical advantage"
              color="purple"
            />
            <MetricBox
              icon={DollarSign}
              label="Avg Win"
              value={summary.avg_winning_roi != null ? `+${summary.avg_winning_roi.toFixed(1)}%` : "N/A"}
              subtext="On winning trades"
              color="emerald"
            />
            <MetricBox
              icon={DollarSign}
              label="Avg Loss"
              value={summary.avg_losing_roi != null ? `${summary.avg_losing_roi.toFixed(1)}%` : "N/A"}
              subtext="On losing trades"
              color="red"
            />
          </div>
        </div>
      </Card>

      {/* Confidence Level Analysis */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white px-1">Analysis by Confidence</h3>
        <div className="grid grid-cols-1 gap-3">
          {performanceByConfidence.map((conf) => (
            <div
              key={conf.confidence}
              className="group flex flex-col md:flex-row md:items-center justify-between p-5 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/20 rounded-xl transition-all duration-300"
            >
              <div className="flex items-center gap-4 mb-4 md:mb-0">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center border ${conf.confidence === "high"
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : conf.confidence === "moderate"
                      ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                      : "bg-red-500/10 border-red-500/30 text-red-400"
                  }`}>
                  <span className="text-lg font-bold">{conf.confidence[0].toUpperCase()}</span>
                </div>
                <div>
                  <div className="text-white font-bold text-lg capitalize flex items-center gap-2">
                    {conf.confidence} Confidence
                    <span className="text-xs font-normal text-gray-500 bg-white/10 px-2 py-0.5 rounded-full">
                      {conf.total_recommendations} trades
                    </span>
                  </div>
                  <div className="text-sm text-gray-400 flex items-center gap-2">
                    <span className={conf.win_rate_pct > 50 ? "text-emerald-400" : "text-gray-400"}>
                      {conf.win_rate_pct != null ? conf.win_rate_pct.toFixed(1) : "0.0"}% Win Rate
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-8 border-t md:border-t-0 border-white/10 pt-4 md:pt-0">
                <div className="text-right">
                  <div className={`text-xl font-bold font-mono ${conf.avg_roi != null && conf.avg_roi >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}>
                    {conf.avg_roi != null ? `${conf.avg_roi >= 0 ? "+" : ""}${conf.avg_roi.toFixed(2)}%` : "N/A"}
                  </div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Avg ROI</div>
                </div>

                <div className="text-right pl-8 border-l border-white/10">
                  <div className="text-xl font-bold font-mono text-blue-400">
                    {conf.avg_edge_captured != null ? `${(conf.avg_edge_captured * 100).toFixed(1)}%` : "N/A"}
                  </div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">Edge</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trade Direction & Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white px-1">By Direction</h3>
          <div className="grid grid-cols-1 gap-3">
            <DirectionCard
              label="LONG YES"
              wins={summary.long_yes_wins}
              total={summary.long_yes_count}
              color="emerald"
            />
            <DirectionCard
              label="LONG NO"
              wins={summary.long_no_wins}
              total={summary.long_no_count}
              color="red"
            />
            <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
              <span className="font-semibold text-gray-400">NO TRADE</span>
              <span className="text-white font-mono">{summary.no_trade_count} <span className="text-gray-500 text-xs">skipped</span></span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-white px-1">Category Hall of Fame</h3>
          <div className="space-y-3">
            {calculatedMetrics.bestPerformingCategory && (
              <Card className="p-5 border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Crown className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-bold text-white">Best Performer</h4>
                  </div>
                  <span className="text-emerald-400 font-bold bg-emerald-500/20 px-2 py-1 rounded text-xs">
                    +{calculatedMetrics.bestPerformingCategory.avgROI.toFixed(1)}% ROI
                  </span>
                </div>
                <div className="text-2xl font-bold text-white capitalize mb-1">
                  {calculatedMetrics.bestPerformingCategory.category.replace(/_/g, ' ')}
                </div>
                <div className="text-sm text-emerald-200/70">
                  {calculatedMetrics.bestPerformingCategory.winRate.toFixed(1)}% accuracy across {calculatedMetrics.bestPerformingCategory.totalMarkets} markets
                </div>
              </Card>
            )}

            {calculatedMetrics.worstPerformingCategory && (
              <Card className="p-5 border-white/5 bg-white/5">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-400 opacity-70" />
                    <h4 className="font-semibold text-gray-300">Room for Improvement</h4>
                  </div>
                  <span className="text-red-400 font-bold bg-red-500/10 px-2 py-1 rounded text-xs">
                    {calculatedMetrics.worstPerformingCategory.avgROI.toFixed(1)}% ROI
                  </span>
                </div>
                <div className="text-lg font-medium text-white capitalize mb-1">
                  {calculatedMetrics.worstPerformingCategory.category.replace(/_/g, ' ')}
                </div>
                <div className="text-sm text-gray-500">
                  {calculatedMetrics.worstPerformingCategory.winRate.toFixed(1)}% accuracy across {calculatedMetrics.worstPerformingCategory.totalMarkets} markets
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricBox({ icon: Icon, label, value, subtext, color }: { icon: any, label: string, value: string, subtext: string, color: string }) {
  const colorClasses = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  }[color] || "text-gray-400 bg-gray-500/10 border-gray-500/20";

  return (
    <div className="p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-md ${colorClasses}`}>
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold font-mono mb-1 text-white`}>
        {value}
      </div>
      <div className="text-xs text-gray-500 leading-tight">
        {subtext}
      </div>
    </div>
  );
}

function DirectionCard({ label, wins, total, color }: { label: string, wins: number, total: number, color: 'emerald' | 'red' }) {
  const rate = total > 0 ? (wins / total) * 100 : 0;

  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10 relative overflow-hidden group">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${color === 'emerald' ? 'bg-emerald-500' : 'bg-red-500'}`} />
      <div className="flex justify-between items-center relative z-10">
        <div>
          <div className={`font-bold ${color === 'emerald' ? 'text-emerald-400' : 'text-red-400'}`}>{label}</div>
          <div className="text-xs text-gray-500">{wins}/{total} successful</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{rate.toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Win Rate</div>
        </div>
      </div>
      <div className={`absolute inset-0 ${color === 'emerald' ? 'bg-emerald-500/5' : 'bg-red-500/5'} opacity-0 group-hover:opacity-100 transition-opacity`} />
    </div>
  );
}

function ActivityIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}