"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useInfinitePerformanceData } from "@/hooks/usePerformanceData";
import { useTrading } from "@/providers/TradingProvider";
import Header from "@/components/Header";
import Card from "@/components/shared/Card";
import LoadingState from "@/components/shared/LoadingState";
import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import PerformanceMetrics from "@/components/Performance/PerformanceMetrics";
import ClosedMarketsGrid from "@/components/Performance/ClosedMarketsGrid";
import PerformanceCharts from "@/components/Performance/PerformanceCharts";
import PerformanceFilters from "@/components/Performance/PerformanceFilters";
import AgentPerformanceTable from "@/components/Performance/AgentPerformanceTable";
import { TrendingUp, BarChart3, Target, Brain, Activity } from "lucide-react";

interface PerformanceFilters {
  timeframe: "all" | "30d" | "90d" | "1y";
  category: string;
  confidence: "all" | "high" | "moderate" | "low";
  limit: number;
}

export default function PerformancePage() {
  const { endTradingSession } = useTrading();

  const [filters, setFilters] = useState<PerformanceFilters>({
    timeframe: "all",
    category: "all",
    confidence: "all",
    limit: 20, // Changed to 20 for pagination
  });

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfinitePerformanceData({
    timeframe: filters.timeframe,
    category: filters.category,
    confidence: filters.confidence,
    limit: filters.limit,
  });

  // Flatten all pages into a single array of markets
  const allMarkets = useMemo(() => {
    return data?.pages.flatMap((page) => page.closedMarkets) ?? [];
  }, [data]);

  // Get the first page data for aggregate metrics
  const performanceData = data?.pages[0];

  // Calculate total count and current count
  const totalCount = data?.pages[0]?.pagination?.total;
  const currentCount = allMarkets.length;

  const handleFiltersChange = (newFilters: PerformanceFilters) => {
    setFilters(newFilters);
  };

  /**
   * Prefetch next page when user scrolls near bottom
   * This improves perceived performance by loading data before user clicks "Load More"
   */
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;

    const handleScroll = () => {
      const scrollPosition = window.scrollY + window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const threshold = 500; // Prefetch when 500px from bottom

      if (scrollPosition >= documentHeight - threshold) {
        fetchNextPage();
      }
    };

    // Throttle scroll events for performance
    let timeoutId: NodeJS.Timeout;
    const throttledScroll = () => {
      if (timeoutId) return;
      timeoutId = setTimeout(() => {
        handleScroll();
        timeoutId = null as any;
      }, 200);
    };

    window.addEventListener("scroll", throttledScroll);
    return () => {
      window.removeEventListener("scroll", throttledScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="space-y-10">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium backdrop-blur-sm">
              <Activity className="w-3 h-3" />
              <span>System Analytics</span>
            </div>
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
                  Performance Dashboard
                </h1>
                <p className="text-gray-400 text-lg max-w-2xl">
                  Comprehensive analysis of AI prediction accuracy and returns
                </p>
              </div>
            </div>
          </div>
          <LoadingState message="Loading performance data..." />
        </div>
      );
    }

    if (error) {
      return (
        <div className="space-y-10">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white tracking-tight">
              Performance Dashboard
            </h1>
            <p className="text-gray-400 text-lg">
              Analyzing TradeWizard AI recommendation accuracy on resolved markets
            </p>
          </div>
          <ErrorState
            title="Failed to load performance data"
            error={error instanceof Error ? error.message : "Unknown error occurred"}
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }

    if (!performanceData || performanceData.closedMarkets.length === 0) {
      return (
        <div className="space-y-10">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white tracking-tight">
              Performance Dashboard
            </h1>
            <p className="text-gray-400 text-lg">
              Analyzing TradeWizard AI recommendation accuracy on resolved markets
            </p>
          </div>
          <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xl">
            <EmptyState
              icon={Target}
              title="No performance data available"
              message="No resolved markets with recommendations found. Performance data will appear here once markets are resolved and the AI system has generated recommendations."
              action={{
                label: "View Active Markets",
                onClick: () => window.location.href = "/"
              }}
            />
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-10">
        {/* Header */}
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium backdrop-blur-sm">
            <Activity className="w-3 h-3" />
            <span>System Analytics</span>
          </div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-white tracking-tight mb-2">
                Performance Dashboard
              </h1>
              <p className="text-gray-400 text-lg max-w-2xl">
                Comprehensive analysis of AI prediction accuracy and returns
              </p>
            </div>
            <div className="text-right hidden md:block">
              <div className="text-sm text-gray-500 font-mono">
                Last updated: {new Date().toLocaleTimeString()}
              </div>
              <div className="text-xs text-gray-600">
                {performanceData.calculatedMetrics.totalMarkets} Total Markets
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-1">
          <PerformanceFilters
            filters={filters}
            onFiltersChange={handleFiltersChange}
            availableCategories={performanceData.performanceByCategory.map(
              (cat) => cat.event_type
            )}
          />
        </Card>

        {/* Key Metrics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="relative group">
            <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Card className="relative p-6 border-emerald-500/20 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-400">
                    <Target className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-medium text-gray-200">Win Rate</h3>
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-1 tracking-tight">
                {performanceData.calculatedMetrics.winRate.toFixed(1)}%
              </div>
              <p className="text-sm text-emerald-400/70 font-medium">
                Top Tier Accuracy
              </p>
            </Card>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Card className="relative p-6 border-blue-500/20 bg-blue-500/5 group-hover:bg-blue-500/10 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-500/20 rounded-lg text-blue-400">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-medium text-gray-200">Avg ROI</h3>
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-1 tracking-tight">
                {performanceData.calculatedMetrics.avgROI > 0 ? "+" : ""}
                {performanceData.calculatedMetrics.avgROI.toFixed(1)}%
              </div>
              <p className="text-sm text-blue-400/70 font-medium">Per $100 Invested</p>
            </Card>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-purple-500/20 blur-xl rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Card className="relative p-6 border-purple-500/20 bg-purple-500/5 group-hover:bg-purple-500/10 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-purple-500/20 rounded-lg text-purple-400">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-medium text-gray-200">Total Profit</h3>
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-1 tracking-tight">
                {performanceData.calculatedMetrics.totalProfit > 0 ? "+" : ""}
                ${performanceData.calculatedMetrics.totalProfit.toFixed(0)}
              </div>
              <p className="text-sm text-purple-400/70 font-medium">Cumulative Returns</p>
            </Card>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Card className="relative p-6 border-orange-500/20 bg-orange-500/5 group-hover:bg-orange-500/10 transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-500/20 rounded-lg text-orange-400">
                    <Brain className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-medium text-gray-200">Avg Resolution</h3>
                </div>
              </div>
              <div className="text-3xl font-bold text-white mb-1 tracking-tight">
                {performanceData.calculatedMetrics.avgDaysToResolution.toFixed(1)}d
              </div>
              <p className="text-sm text-orange-400/70 font-medium">Time to Settlement</p>
            </Card>
          </div>
        </div>

        {/* Performance Charts */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-white tracking-tight px-1">Analytics Visualization</h2>
          <PerformanceCharts data={performanceData} />
        </section>

        {/* Performance Metrics Breakdown */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <PerformanceMetrics data={performanceData} />
          </div>
          <div className="lg:col-span-1">
            <AgentPerformanceTable agents={performanceData.performanceByAgent} />
          </div>
        </section>

        {/* Closed Markets Grid */}
        <section className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-2xl font-bold text-white tracking-tight">Resolved Markets</h2>
            <div className="text-sm text-gray-400">Detailed breakdown of past recommendations</div>
          </div>
          <ClosedMarketsGrid
            markets={allMarkets}
            isLoading={isLoading}
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            onLoadMore={() => fetchNextPage()}
            totalCount={totalCount}
            currentCount={currentCount}
          />
        </section>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0A] text-white selection:bg-indigo-500/30">
      <Header onEndSession={endTradingSession} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 flex flex-col gap-10">
        {renderContent()}
      </main>
    </div>
  );
}