"use client";

import React from "react";
import Card from "@/components/shared/Card";
import { PerformanceData } from "@/hooks/usePerformanceData";
import { BarChart3, TrendingUp, PieChart, Activity } from "lucide-react";

interface PerformanceChartsProps {
  data: PerformanceData;
}

export default function PerformanceCharts({ data }: PerformanceChartsProps) {
  const { monthlyPerformance, performanceByCategory, calculatedMetrics } = data;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Monthly Performance Trend */}
      <Card className="p-6 border border-white/5 bg-gradient-to-br from-white/5 to-transparent">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Monthly Trends</h2>
            <p className="text-xs text-gray-400">Performance over time</p>
          </div>
        </div>

        {monthlyPerformance && monthlyPerformance.length > 0 ? (
          <div className="space-y-8">
            <NeonBarChart
              data={monthlyPerformance}
              xKey="month"
              yKey="win_rate_pct"
              title="Win Rate History"
              color="emerald"
            />

            <NeonBarChart
              data={monthlyPerformance}
              xKey="month"
              yKey="avg_roi"
              title="ROI History"
              color="blue"
            />

            <div className="pt-4 border-t border-white/10">
              <div className="space-y-2 text-xs">
                {monthlyPerformance.slice(0, 3).map((month, index) => (
                  <div key={index} className="flex justify-between items-center bg-white/5 p-2 rounded">
                    <span className="text-gray-400 font-medium">
                      {new Date(month.month).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                    <div className="flex gap-3">
                      <span className="text-white">
                        {month.total_recommendations} mkts
                      </span>
                      <span className={month.win_rate_pct != null && month.win_rate_pct >= 50 ? "text-emerald-400" : "text-red-400"}>
                        {month.win_rate_pct != null ? month.win_rate_pct.toFixed(1) : "0.0"}% WR
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 flex flex-col items-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-3">
              <Activity className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-gray-500">Not enough data for monthly trends yet.</p>
          </div>
        )}
      </Card>

      {/* Performance by Category */}
      <Card className="p-6 border border-white/5 bg-gradient-to-br from-white/5 to-transparent">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
            <PieChart className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Category Winners</h2>
            <p className="text-xs text-gray-400">Success rate by topic</p>
          </div>
        </div>

        {performanceByCategory && performanceByCategory.length > 0 ? (
          <div className="space-y-8">
            <NeonBarChart
              data={performanceByCategory}
              xKey="event_type"
              yKey="win_rate_pct"
              title="Win Rate by Topic"
              color="purple"
            />

            <div className="pt-4 border-t border-white/10">
              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Top Categories</h4>
              <div className="space-y-3">
                {performanceByCategory.slice(0, 5).map((category, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-black/20 border border-white/5 rounded-lg group hover:border-white/20 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.5)]"></div>
                      <div>
                        <div className="text-white font-semibold text-sm">
                          {category.event_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          {category.total_recommendations} Mkts
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${category.win_rate_pct != null && category.win_rate_pct >= 60 ? 'text-emerald-400' :
                          category.win_rate_pct != null && category.win_rate_pct >= 50 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                        {category.win_rate_pct != null ? category.win_rate_pct.toFixed(1) : "0.0"}%
                      </div>
                      <div className="text-[10px] text-gray-500 font-mono">
                        {category.avg_roi != null ? `${category.avg_roi >= 0 ? '+' : ''}${category.avg_roi.toFixed(1)}% ROI` : "N/A"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 flex flex-col items-center">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-3">
              <PieChart className="h-8 w-8 text-gray-600" />
            </div>
            <p className="text-gray-500">Not enough data for category analysis.</p>
          </div>
        )}
      </Card>

      {/* Distribution Block moved/merged or kept if needed. For now keeping main two. */}
    </div>
  );
}

// Styled Chart Component
function NeonBarChart({
  data,
  xKey,
  yKey,
  title,
  color = "blue"
}: {
  data: any[],
  xKey: string,
  yKey: string,
  title: string,
  color?: string
}) {
  if (!data || data.length === 0) return null;

  const maxValue = Math.max(...data.map(item => item[yKey]));
  const colorConfigs = {
    blue: { bg: "bg-blue-500", glow: "shadow-[0_0_12px_rgba(59,130,246,0.6)]", text: "text-blue-400" },
    emerald: { bg: "bg-emerald-500", glow: "shadow-[0_0_12px_rgba(16,185,129,0.6)]", text: "text-emerald-400" },
    red: { bg: "bg-red-500", glow: "shadow-[0_0_12px_rgba(239,68,68,0.6)]", text: "text-red-400" },
    purple: { bg: "bg-purple-500", glow: "shadow-[0_0_12px_rgba(168,85,247,0.6)]", text: "text-purple-400" },
  };

  const activeColor = colorConfigs[color as keyof typeof colorConfigs] || colorConfigs.blue;

  return (
    <div className="space-y-4">
      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</h4>
      <div className="space-y-3">
        {data.slice(0, 5).map((item, index) => {
          const label = typeof item[xKey] === 'string' && item[xKey].includes('-')
            ? new Date(item[xKey]).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            : item[xKey].toString().replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()); // Capitalize

          const percent = (item[yKey] / (Math.max(maxValue, 1))) * 100; // avoid divide by zero

          return (
            <div key={index} className="group">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300 font-medium">{label}</span>
                <span className="text-white font-mono">{typeof item[yKey] === 'number' ? item[yKey].toFixed(1) : item[yKey]}{yKey.includes('pct') ? '%' : ''}</span>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${activeColor.bg} ${activeColor.glow} relative transition-all duration-1000 ease-out`}
                  style={{
                    width: `${percent}%`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  );
};