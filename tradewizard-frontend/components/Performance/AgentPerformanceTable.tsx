"use client";

import React, { useState } from "react";
import Card from "@/components/shared/Card";
import { PerformanceByAgent } from "@/hooks/usePerformanceData";
import { Brain, TrendingUp, Target, Users, ChevronDown, ChevronUp, Bot } from "lucide-react";

interface AgentPerformanceTableProps {
  agents: PerformanceByAgent[];
}

export default function AgentPerformanceTable({ agents }: AgentPerformanceTableProps) {
  const [sortBy, setSortBy] = useState<keyof PerformanceByAgent>("win_rate_pct");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [showAll, setShowAll] = useState(false);

  if (!agents || agents.length === 0) {
    return (
      <Card className="p-8 border border-white/5 bg-white/5 backdrop-blur-xl">
        <div className="flex flex-col items-center justify-center text-center py-8">
          <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium text-white">No Agent Data</h3>
          <p className="text-gray-400 max-w-xs mt-2">No individual agent performance data available yet.</p>
        </div>
      </Card>
    );
  }

  const handleSort = (key: keyof PerformanceByAgent) => {
    if (sortBy === key) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(key);
      setSortOrder("desc");
    }
  };

  const sortedAgents = [...agents].sort((a, b) => {
    const aValue = a[sortBy];
    const bValue = b[sortBy];

    if (typeof aValue === "number" && typeof bValue === "number") {
      return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    }

    if (typeof aValue === "string" && typeof bValue === "string") {
      return sortOrder === "asc"
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }

    return 0;
  });

  const displayedAgents = showAll ? sortedAgents : sortedAgents.slice(0, 8);

  // Styling helpers
  const getAgentColor = (type: string) => {
    // deterministic color based on agent type
    const colors = [
      "text-blue-400 bg-blue-500/10",
      "text-purple-400 bg-purple-500/10",
      "text-emerald-400 bg-emerald-500/10",
      "text-orange-400 bg-orange-500/10",
      "text-pink-400 bg-pink-500/10",
    ];
    const sum = type.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[sum % colors.length];
  };

  const SortButton = ({
    column,
    children,
    align = "left"
  }: {
    column: keyof PerformanceByAgent,
    children: React.ReactNode,
    align?: "left" | "right"
  }) => (
    <button
      onClick={() => handleSort(column)}
      className={`flex items-center gap-1 hover:text-white transition-colors group ${align === "right" ? "ml-auto" : ""}`}
    >
      <span className="uppercase tracking-wider text-[10px] font-bold">{children}</span>
      <div className={`text-gray-600 group-hover:text-gray-400 ${sortBy === column ? "text-indigo-400" : ""}`}>
        {sortBy === column && sortOrder === "desc" ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </div>
    </button>
  );

  return (
    <div className="bg-white/5 backdrop-blur-xl border border-white/5 rounded-2xl overflow-hidden p-6 max-h-[800px] flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-lg border border-indigo-500/30">
            <Brain className="h-5 w-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Agent Leaderboard</h2>
            <p className="text-xs text-gray-400">{agents.length} intelligence models ranked</p>
          </div>
        </div>

        {/* Simplified stats row in header */}
        <div className="hidden md:flex gap-6">
          <div className="text-right">
            <div className="text-lg font-bold text-white">{(agents.reduce((sum, a) => sum + a.win_rate_pct, 0) / agents.length).toFixed(1)}%</div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Avg Win Rate</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-bold text-white">{agents.reduce((sum, a) => sum + a.total_agent_signals, 0)}</div>
            <div className="text-[10px] text-gray-500 uppercase font-bold">Total Signals</div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto flex-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-4 px-4 text-gray-500 font-medium">
                <SortButton column="agent_name">Agent Model</SortButton>
              </th>
              <th className="text-right py-4 px-4 text-gray-500 font-medium">
                <SortButton column="win_rate_pct" align="right">Win Rate</SortButton>
              </th>
              <th className="text-right py-4 px-4 text-gray-500 font-medium">
                <SortButton column="avg_roi" align="right">ROI</SortButton>
              </th>
              <th className="text-right py-4 px-4 text-gray-500 font-medium hidden md:table-cell">
                <SortButton column="total_recommendations" align="right">Markets</SortButton>
              </th>
              <th className="text-right py-4 px-4 text-gray-500 font-medium hidden md:table-cell">
                <SortButton column="agent_signal_accuracy_pct" align="right">Signal Acc</SortButton>
              </th>
              <th className="text-right py-4 px-4 text-gray-500 font-medium hidden lg:table-cell">
                <SortButton column="avg_agent_confidence" align="right">Avg Conf</SortButton>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {displayedAgents.map((agent, index) => (
              <tr
                key={agent.agent_name}
                className="group hover:bg-white/5 transition-colors"
              >
                <td className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${getAgentColor(agent.agent_type)} border border-white/5`}>
                      {agent.agent_name.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm group-hover:text-indigo-300 transition-colors">
                        {agent.agent_name.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                        {agent.agent_type.replace(/_/g, " ")}
                      </div>
                    </div>
                  </div>
                </td>

                <td className="py-4 px-4 text-right">
                  <div className={`font-bold font-mono ${agent.win_rate_pct >= 60 ? 'text-emerald-400' :
                      agent.win_rate_pct >= 50 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                    {agent.win_rate_pct.toFixed(1)}%
                  </div>
                </td>

                <td className="py-4 px-4 text-right">
                  <div className={`font-mono text-sm ${agent.avg_roi >= 0 ? 'text-emerald-500' : 'text-red-500'
                    }`}>
                    {agent.avg_roi >= 0 ? "+" : ""}{agent.avg_roi.toFixed(1)}%
                  </div>
                </td>

                <td className="py-4 px-4 text-right hidden md:table-cell">
                  <span className="text-gray-300 text-sm">{agent.total_recommendations}</span>
                </td>

                <td className="py-4 px-4 text-right hidden md:table-cell">
                  <div className="flex flex-col items-end">
                    <span className="text-white text-sm">{agent.agent_signal_accuracy_pct.toFixed(1)}%</span>
                    <span className="text-[10px] text-gray-500">{agent.agent_correct_signals}/{agent.total_agent_signals}</span>
                  </div>
                </td>

                <td className="py-4 px-4 text-right hidden lg:table-cell">
                  <span className="text-gray-400 text-sm font-mono">{(agent.avg_agent_probability * 100).toFixed(0)}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {agents.length > 8 && (
        <div className="mt-4 pt-4 border-t border-white/5 text-center">
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs font-semibold text-gray-400 hover:text-white uppercase tracking-wider transition-colors"
          >
            {showAll ? "Show Less" : "View All Agents"}
          </button>
        </div>
      )}
    </div>
  );
}