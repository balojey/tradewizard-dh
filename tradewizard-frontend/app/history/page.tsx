"use client";

import React, { useState, useMemo } from "react";
import Header from "@/components/Header";
import { useTrading } from "@/providers/TradingProvider";
import { usePerformanceData } from "@/hooks/usePerformanceData";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import Card from "@/components/shared/Card";
import AgentPerformanceTable from "@/components/Performance/AgentPerformanceTable";
import ClosedMarketsGrid from "@/components/Performance/ClosedMarketsGrid";
import {
  Target,
  TrendingUp,
  BarChart3,
  Brain,
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent: "emerald" | "blue" | "purple" | "orange" | "red" | "indigo";
}

function StatCard({ icon: Icon, label, value, sub, accent }: StatCardProps) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    indigo: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  };
  const cls = colors[accent];
  return (
    <div className="relative group">
      <div
        className={`absolute inset-0 blur-xl rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${cls.split(" ")[1]}`}
      />
      <Card
        className={`relative p-5 border ${cls.split(" ")[2]} ${cls.split(" ")[1]} group-hover:brightness-110 transition-all duration-300`}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2 rounded-lg ${cls}`}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-sm font-medium text-gray-300">{label}</span>
        </div>
        <div className="text-3xl font-bold text-white tracking-tight">{value}</div>
        {sub && <div className="text-xs text-gray-500 mt-1">{sub}</div>}
      </Card>
    </div>
  );
}

// ─── Confidence Row ───────────────────────────────────────────────────────────

function ConfidenceRow({
  level,
  total,
  correct,
  winRate,
  avgRoi,
}: {
  level: string;
  total: number;
  correct: number;
  winRate: number;
  avgRoi: number;
}) {
  const styles: Record<string, string> = {
    high: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
    moderate: "bg-yellow-500/10 border-yellow-500/30 text-yellow-400",
    low: "bg-red-500/10 border-red-500/30 text-red-400",
  };
  const cls = styles[level] ?? styles.low;
  return (
    <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm border ${cls}`}>
          {level[0].toUpperCase()}
        </div>
        <div>
          <div className="text-white font-semibold capitalize">{level} Confidence</div>
          <div className="text-xs text-gray-500">
            {correct}/{total} correct
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className="text-lg font-bold text-white">{winRate.toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Win Rate</div>
        </div>
        <div className="text-right w-20">
          <div className={`text-lg font-bold font-mono ${avgRoi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {avgRoi >= 0 ? "+" : ""}{avgRoi.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-500">Avg ROI</div>
        </div>
      </div>
    </div>
  );
}

// ─── Direction Card ───────────────────────────────────────────────────────────

function DirectionCard({
  label,
  wins,
  total,
  color,
}: {
  label: string;
  wins: number;
  total: number;
  color: "emerald" | "red";
}) {
  const rate = total > 0 ? (wins / total) * 100 : 0;
  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10 relative overflow-hidden group">
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${color === "emerald" ? "bg-emerald-500" : "bg-red-500"}`} />
      <div className="flex justify-between items-center">
        <div>
          <div className={`font-bold text-sm ${color === "emerald" ? "text-emerald-400" : "text-red-400"}`}>{label}</div>
          <div className="text-xs text-gray-500">{wins}/{total} correct</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white">{rate.toFixed(1)}%</div>
          <div className="text-xs text-gray-500">Win Rate</div>
        </div>
      </div>
    </div>
  );
}

// ─── Monthly Row ──────────────────────────────────────────────────────────────

function MonthlyRow({
  month,
  total,
  winRate,
  avgRoi,
  totalProfit,
}: {
  month: string;
  total: number;
  winRate: number;
  avgRoi: number;
  totalProfit: number;
}) {
  const label = new Date(month).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return (
    <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-2 h-2 rounded-full bg-indigo-400" />
        <span className="text-sm font-medium text-gray-300">{label}</span>
        <span className="text-xs text-gray-600">{total} mkts</span>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right">
          <div className={`text-sm font-bold ${winRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
            {winRate.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600">Win Rate</div>
        </div>
        <div className="text-right w-16">
          <div className={`text-sm font-bold font-mono ${avgRoi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {avgRoi >= 0 ? "+" : ""}{avgRoi.toFixed(1)}%
          </div>
          <div className="text-xs text-gray-600">Avg ROI</div>
        </div>
        <div className="text-right w-16 hidden sm:block">
          <div className={`text-sm font-bold font-mono ${totalProfit >= 0 ? "text-blue-400" : "text-red-400"}`}>
            {totalProfit >= 0 ? "+" : ""}{totalProfit.toFixed(0)}
          </div>
          <div className="text-xs text-gray-600">Profit</div>
        </div>
      </div>
    </div>
  );
}

// ─── Category Row ─────────────────────────────────────────────────────────────

function CategoryRow({
  category,
  total,
  winRate,
  avgRoi,
}: {
  category: string;
  total: number;
  winRate: number;
  avgRoi: number;
}) {
  const pct = Math.min(100, Math.max(0, winRate));
  return (
    <div className="p-3 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-white capitalize">
          {category.replace(/_/g, " ")}
        </span>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{total} mkts</span>
          <span className={`text-sm font-bold ${winRate >= 50 ? "text-emerald-400" : "text-red-400"}`}>
            {winRate.toFixed(1)}%
          </span>
          <span className={`text-xs font-mono ${avgRoi >= 0 ? "text-blue-400" : "text-red-400"} w-14 text-right`}>
            {avgRoi >= 0 ? "+" : ""}{avgRoi.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="w-full bg-white/5 rounded-full h-1.5">
        <div
          className={`h-full rounded-full ${winRate >= 60 ? "bg-emerald-500" : winRate >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { endTradingSession } = useTrading();
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);

  const { data, isLoading, error, refetch } = usePerformanceData({
    timeframe: "all",
    limit: 50,
  });

  const summary = data?.summary;
  const metrics = data?.calculatedMetrics;
  const byConfidence = data?.performanceByConfidence ?? [];
  const byAgent = data?.performanceByAgent ?? [];
  const monthly = data?.monthlyPerformance ?? [];
  const byCategory = data?.performanceByCategory ?? [];
  const markets = data?.closedMarkets ?? [];

  const visibleMonths = showAllMonths ? monthly : monthly.slice(0, 6);
  const visibleCategories = showAllCategories ? byCategory : byCategory.slice(0, 6);

  // Aggregate recommendation direction stats from summary
  const directionStats = useMemo(() => {
    if (!summary) return null;
    return {
      longYes: { wins: summary.long_yes_wins, total: summary.long_yes_count },
      longNo: { wins: summary.long_no_wins, total: summary.long_no_count },
    };
  }, [summary]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0A0A0A] text-white">
        <Header onEndSession={endTradingSession} />
        <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
          <LoadingState message="Loading AI performance history..." />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0A0A0A] text-white">
        <Header onEndSession={endTradingSession} />
        <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
          <ErrorState
            title="Failed to load history"
            error={error instanceof Error ? error.message : "Unknown error"}
            onRetry={() => refetch()}
          />
        </main>
      </div>
    );
  }

  if (!summary || !metrics || markets.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-[#0A0A0A] text-white">
        <Header onEndSession={endTradingSession} />
        <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12">
          <EmptyState
            icon={BarChart3}
            title="No history yet"
            message="Performance history will appear here once markets have resolved and the AI has generated recommendations."
          />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0A] text-white selection:bg-indigo-500/30">
      <Header onEndSession={endTradingSession} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 space-y-12">

        {/* ── Page Header ── */}
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium">
            <Activity className="w-3 h-3" />
            AI Track Record
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">Recommendation History</h1>
          <p className="text-gray-400 max-w-2xl">
            How the multi-agent AI system has performed across all resolved markets — accuracy, ROI, agent signals, and category breakdowns.
          </p>
        </div>

        {/* ── Top-Level Recommendation Stats ── */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-white">Recommendation Stats</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              icon={Target}
              label="Win Rate"
              value={`${summary.win_rate_pct.toFixed(1)}%`}
              sub={`${summary.correct_recommendations} / ${summary.total_resolved_recommendations} correct`}
              accent="emerald"
            />
            <StatCard
              icon={TrendingUp}
              label="Avg ROI"
              value={`${summary.avg_roi >= 0 ? "+" : ""}${summary.avg_roi.toFixed(1)}%`}
              sub="Per recommendation"
              accent="blue"
            />
            <StatCard
              icon={BarChart3}
              label="Total Recommendations"
              value={`${summary.total_resolved_recommendations}`}
              sub="Across all resolved markets"
              accent="indigo"
            />
            <StatCard
              icon={CheckCircle}
              label="Avg Win"
              value={`+${summary.avg_winning_roi.toFixed(1)}%`}
              sub="On winning trades"
              accent="emerald"
            />
            <StatCard
              icon={XCircle}
              label="Avg Loss"
              value={`${summary.avg_losing_roi.toFixed(1)}%`}
              sub="On losing trades"
              accent="red"
            />
            <StatCard
              icon={Zap}
              label="Edge Captured"
              value={`${(summary.avg_edge_captured * 100).toFixed(1)}%`}
              sub="Avg theoretical edge"
              accent="purple"
            />
          </div>
        </section>

        {/* ── Accuracy by Confidence + Direction ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Confidence breakdown */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Accuracy by Confidence</h2>
            <div className="space-y-3">
              {byConfidence.length > 0 ? (
                byConfidence.map((c) => (
                  <ConfidenceRow
                    key={c.confidence}
                    level={c.confidence}
                    total={c.total_recommendations}
                    correct={c.correct_recommendations}
                    winRate={c.win_rate_pct}
                    avgRoi={c.avg_roi}
                  />
                ))
              ) : (
                <p className="text-gray-500 text-sm">No confidence data available.</p>
              )}
            </div>
          </div>

          {/* Direction breakdown */}
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-white">Accuracy by Direction</h2>
            <div className="space-y-3">
              {directionStats && (
                <>
                  <DirectionCard
                    label="LONG YES"
                    wins={directionStats.longYes.wins}
                    total={directionStats.longYes.total}
                    color="emerald"
                  />
                  <DirectionCard
                    label="LONG NO"
                    wins={directionStats.longNo.wins}
                    total={directionStats.longNo.total}
                    color="red"
                  />
                  <div className="p-4 bg-white/5 rounded-xl border border-white/10 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-400">NO TRADE</span>
                    <span className="text-white font-mono">
                      {summary.no_trade_count}{" "}
                      <span className="text-gray-500 text-xs">skipped</span>
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Best / Worst category callout */}
            {metrics.bestPerformingCategory && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">Best Category</div>
                <div className="text-white font-semibold capitalize">
                  {metrics.bestPerformingCategory.category.replace(/_/g, " ")}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {metrics.bestPerformingCategory.winRate.toFixed(1)}% win rate · +{metrics.bestPerformingCategory.avgROI.toFixed(1)}% avg ROI
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Agent Stats ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Agent Stats</h2>
          </div>
          <AgentPerformanceTable agents={byAgent} />
        </section>

        {/* ── Market Stats: Monthly + Category ── */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Monthly trends */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Monthly Trends</h2>
              <span className="text-xs text-gray-500">{monthly.length} months</span>
            </div>
            <div className="space-y-2">
              {visibleMonths.length > 0 ? (
                visibleMonths.map((m) => (
                  <MonthlyRow
                    key={m.month}
                    month={m.month}
                    total={m.total_recommendations}
                    winRate={m.win_rate_pct}
                    avgRoi={m.avg_roi}
                    totalProfit={m.total_profit}
                  />
                ))
              ) : (
                <p className="text-gray-500 text-sm">No monthly data available.</p>
              )}
            </div>
            {monthly.length > 6 && (
              <button
                onClick={() => setShowAllMonths((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                {showAllMonths ? (
                  <>
                    <ChevronUp className="w-3 h-3" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" /> Show all {monthly.length} months
                  </>
                )}
              </button>
            )}
          </div>

          {/* Category breakdown */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">By Category</h2>
              <span className="text-xs text-gray-500">{byCategory.length} categories</span>
            </div>
            <div className="space-y-2">
              {visibleCategories.length > 0 ? (
                visibleCategories.map((c) => (
                  <CategoryRow
                    key={c.event_type}
                    category={c.event_type}
                    total={c.total_recommendations}
                    winRate={c.win_rate_pct}
                    avgRoi={c.avg_roi}
                  />
                ))
              ) : (
                <p className="text-gray-500 text-sm">No category data available.</p>
              )}
            </div>
            {byCategory.length > 6 && (
              <button
                onClick={() => setShowAllCategories((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
              >
                {showAllCategories ? (
                  <>
                    <ChevronUp className="w-3 h-3" /> Show less
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" /> Show all {byCategory.length} categories
                  </>
                )}
              </button>
            )}
          </div>
        </section>

        {/* ── Resolved Markets ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-400" />
              <h2 className="text-xl font-bold text-white">Resolved Markets</h2>
            </div>
            <span className="text-sm text-gray-500">{markets.length} markets</span>
          </div>
          <ClosedMarketsGrid
            markets={markets}
            isLoading={false}
          />
        </section>

      </main>
    </div>
  );
}
