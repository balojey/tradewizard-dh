import React from "react";
import type { AgentSignal } from "@/hooks/useMarketPerformance";
import { formatProbability } from "@/utils/performanceHelpers";

interface AgentSignalsSectionProps {
  agentSignals: AgentSignal[];
}

/**
 * Renders a grid of agent signal cards.
 * LONG_YES signals are styled green, LONG_NO red.
 * Omits the section entirely when there are no signals.
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export default function AgentSignalsSection({
  agentSignals,
}: AgentSignalsSectionProps) {
  if (agentSignals.length === 0) return null;

  return (
    <div className="bg-white/5 border border-white/10 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Agent Signals</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {agentSignals.map((signal, index) => {
          const isLong = signal.direction === "LONG_YES";
          const directionClasses = isLong
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-red-500/20 text-red-400";

          return (
            <div
              key={index}
              className="p-3 bg-white/5 rounded-lg border border-white/10"
            >
              <div className="text-sm font-semibold text-white mb-2">
                {signal.agent_name}
              </div>
              <div className="flex items-center justify-between">
                <span className={`text-xs px-2 py-1 rounded ${directionClasses}`}>
                  {signal.direction}
                </span>
                <span className="text-xs text-gray-400">
                  {formatProbability(signal.agent_probability)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
