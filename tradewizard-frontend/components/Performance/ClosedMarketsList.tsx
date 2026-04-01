"use client";

import React, { useState } from "react";
import Card from "@/components/shared/Card";
import LoadingState from "@/components/shared/LoadingState";
import { ClosedMarketPerformance } from "@/hooks/usePerformanceData";
import { formatDistanceToNow } from "date-fns";
import {
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Calendar,
  DollarSign,
  Target,
  Users,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface ClosedMarketsListProps {
  markets: ClosedMarketPerformance[];
  isLoading: boolean;
}

export default function ClosedMarketsList({
  markets,
  isLoading,
}: ClosedMarketsListProps) {
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

  if (isLoading) {
    return (
      <div className="p-12 mb-8 rounded-2xl border border-white/5 bg-white/5 backdrop-blur-xl flex justify-center">
        <LoadingState message="Loading resolved markets..." />
      </div>
    );
  }

  const toggleExpanded = (marketId: string) => {
    const newExpanded = new Set(expandedMarkets);
    if (newExpanded.has(marketId)) {
      newExpanded.delete(marketId);
    } else {
      newExpanded.add(marketId);
    }
    setExpandedMarkets(newExpanded);
  };

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case "LONG_YES":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "LONG_NO":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      case "NO_TRADE":
        return "text-gray-400 bg-gray-500/10 border-gray-500/20";
      default:
        return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high":
        return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "moderate":
        return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
      case "low":
        return "text-red-400 bg-red-500/10 border-red-500/20";
      default:
        return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  return (
    <div className="space-y-4">
      {markets.map((market, index) => {
        const isExpanded = expandedMarkets.has(market.market_id);
        const explanation = market.explanation ? JSON.parse(market.explanation) : null;
        const isWin = market.recommendation_was_correct;

        return (
          <motion.div
            key={market.market_id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className={`rounded-xl border transition-all duration-300 overflow-hidden ${isExpanded
                ? "bg-white/10 border-indigo-500/30 shadow-[0_0_20px_rgba(99,102,241,0.15)]"
                : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10"
              }`}
          >
            {/* Market Header */}
            <div
              className="p-5 cursor-pointer"
              onClick={() => toggleExpanded(market.market_id)}
            >
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Left Side: Status & Title */}
                <div className="flex-1 flex gap-4">
                  <div className={`mt-1 flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center border ${isWin ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}>
                    {isWin ? <CheckCircle className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                  </div>

                  <div>
                    <h3 className="text-lg font-medium text-white leading-snug mb-2 pr-4">{market.question}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${getDirectionColor(market.direction)}`}>
                        {market.direction.replace("_", " ")}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase border ${getConfidenceColor(market.confidence)}`}>
                        {market.confidence}
                      </span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium text-gray-400 border border-white/10 bg-white/5 uppercase">
                        {market.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-gray-500 flex items-center gap-1 ml-2">
                        <Calendar className="w-3 h-3" />
                        Resolved {formatDistanceToNow(new Date(market.resolution_date), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Metrics */}
                <div className="flex items-center gap-6 lg:border-l border-white/10 lg:pl-6 pt-4 lg:pt-0">
                  <div className="text-right min-w-[80px]">
                    <div className={`text-xl font-bold font-mono ${market.roi_realized >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {market.roi_realized >= 0 ? "+" : ""}{market.roi_realized?.toFixed(1) || 0}%
                    </div>
                    <div className="text-xs text-gray-500 uppercase font-medium">ROI</div>
                  </div>

                  <div className="text-right min-w-[80px]">
                    <div className="text-xl font-bold font-mono text-blue-400">
                      {market.edge_captured >= 0 ? "+" : ""}{(market.edge_captured * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500 uppercase font-medium">Edge</div>
                  </div>

                  <div className={`transition-transform duration-300 text-gray-400 ${isExpanded ? "rotate-180" : ""}`}>
                    <ChevronDown className="w-5 h-5" />
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="border-t border-white/10 bg-black/20"
                >
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Data Points */}
                    <div className="lg:col-span-1 space-y-4">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Prediction Data</h4>

                      <div className="grid grid-cols-2 gap-3">
                        <DataPoint label="Fair Prob" value={`${(market.fair_probability * 100).toFixed(1)}%`} icon={Target} />
                        <DataPoint label="Entry Price" value={`${(market.market_probability_at_recommendation * 100).toFixed(1)}c`} icon={DollarSign} />
                        <DataPoint label="Consensus" value={`${market.agents_in_agreement}/${market.total_agents}`} icon={Users} />
                        <DataPoint label="Duration" value={`${market.days_to_resolution?.toFixed(1) || "-"}d`} icon={Calendar} />
                      </div>

                      <div className="p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Target Entry Zone</span>
                          <span className="text-white font-mono">{(market.entry_zone_min * 100).toFixed(0)}-{(market.entry_zone_max * 100).toFixed(0)}%</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-400">Actual Outcome</span>
                          <span className={`font-bold ${market.resolved_outcome === "YES" ? "text-emerald-400" : "text-red-400"}`}>{market.resolved_outcome}</span>
                        </div>
                      </div>
                    </div>

                    {/* Analysis */}
                    <div className="lg:col-span-2 space-y-4">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">AI Reasoning</h4>

                      {explanation ? (
                        <div className="space-y-4">
                          <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                            <p className="text-sm text-gray-300 leading-relaxed">
                              {explanation.summary || explanation.coreThesis || "Analysis summary unavailable."}
                            </p>
                          </div>

                          {explanation.keyCatalysts && explanation.keyCatalysts.length > 0 && (
                            <div>
                              <span className="text-xs font-medium text-indigo-400 block mb-2">Key Drivers</span>
                              <div className="flex flex-wrap gap-2">
                                {explanation.keyCatalysts.slice(0, 3).map((catalyst: string, i: number) => (
                                  <span key={i} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-gray-300">
                                    {catalyst}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-gray-500 text-sm italic p-4 border border-dashed border-gray-700 rounded-lg">
                          Detailed analysis data not linked for this resolved market.
                        </div>
                      )}

                      <div className="flex justify-end pt-2">
                        <a href={`/market/${market.market_id}`} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                          View Full Market History <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}

      {markets.length === 0 && (
        <div className="text-center py-16 bg-white/5 rounded-2xl border border-white/5">
          <Target className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-400 mb-2">
            No resolved markets
          </h3>
          <p className="text-gray-600 text-sm">
            Check back later once active markets have resolved.
          </p>
        </div>
      )}
    </div>
  );
}

function DataPoint({ label, value, icon: Icon }: any) {
  return (
    <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-gray-500" />
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <span className="text-sm font-bold text-white font-mono">{value}</span>
    </div>
  )
}