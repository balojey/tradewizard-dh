"use client";

import { useState, useMemo } from "react";
import { useAgentSignalsGrouped } from "@/hooks/useAgentSignals";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";
import {
  Clock,
  TrendingUp,
  TrendingDown,
  Target,
  CheckCircle,
  Activity,
  Brain,
  ChevronRight,
  Maximize2
} from "lucide-react";
import Card from "@/components/shared/Card";
import { motion, AnimatePresence } from "framer-motion";

interface ConsensusFormationTimelineProps {
  conditionId: string | null;
  // marketQuestion, // Unused
  recommendationId?: string | null;
}

interface TimelineEvent {
  id: string;
  timestamp: string;
  type: 'agent_analysis' | 'cross_examination' | 'consensus_update' | 'final_recommendation';
  title: string;
  description: string;
  agentName?: string;
  agentType?: string;
  data?: {
    fairProbability?: number;
    confidence?: number;
    consensusProbability?: number;
    agreementLevel?: number;
    keyChange?: string;
    keyDrivers?: string[];
  };
  icon: React.ElementType;
  color: string;
}

// Helper function to calculate agreement level
function calculateAgreementLevel(signals: Array<{ fairProbability: number }>) {
  if (signals.length < 2) return 1;
  const probabilities = signals.map(s => s.fairProbability || 0);
  const mean = probabilities.reduce((sum, p) => sum + p, 0) / probabilities.length;
  const variance = probabilities.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / probabilities.length;
  const stdDev = Math.sqrt(variance);
  return Math.max(0, 1 - (stdDev * 4));
}

// Helper function to parse key drivers from Json type
function parseKeyDrivers(keyDrivers: any): string[] {
  if (!keyDrivers) return [];
  
  // If it's already an array of strings
  if (Array.isArray(keyDrivers)) {
    return keyDrivers.filter(item => typeof item === 'string');
  }
  
  // If it's an object with arrays as values
  if (typeof keyDrivers === 'object' && !Array.isArray(keyDrivers)) {
    const allDrivers: string[] = [];
    Object.entries(keyDrivers).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        // Add category prefix to each driver
        const categoryDrivers = value
          .filter(item => typeof item === 'string')
          .map(item => `${key}: ${item}`);
        allDrivers.push(...categoryDrivers);
      } else if (typeof value === 'string') {
        allDrivers.push(`${key}: ${value}`);
      }
    });
    return allDrivers;
  }
  
  return [];
}

export default function ConsensusFormationTimeline({
  conditionId,
  recommendationId
}: ConsensusFormationTimelineProps) {
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);

  const {
    data: signals,
    isLoading: signalsLoading
  } = useAgentSignalsGrouped(conditionId, recommendationId);

  const {
    data: analysisHistory,
    isLoading: historyLoading
  } = useAnalysisHistory(conditionId, { limit: 20 });

  const isLoading = signalsLoading || historyLoading;

  // Build timeline from agent signals and analysis history
  const timelineEvents = useMemo(() => {
    if (!signals || !analysisHistory) return [];

    const events: TimelineEvent[] = [];

    // Add analysis history events
    analysisHistory.forEach((analysis) => {
      const baseTime = new Date(analysis.createdAt);

      // Add analysis start event
      events.push({
        id: `analysis-start-${analysis.id}`,
        timestamp: analysis.createdAt,
        type: 'agent_analysis',
        title: `${analysis.analysisType.replace('_', ' ')} Started`,
        description: `Multi-agent analysis initiated with ${analysis.agentsUsed.length} agents`,
        data: {
          keyChange: `Analysis type: ${analysis.analysisType}`
        },
        icon: Brain,
        color: 'indigo'
      });

      // Add completion event if successful
      if (analysis.status === 'completed' && analysis.durationMs) {
        const completionTime = new Date(baseTime.getTime() + analysis.durationMs);
        events.push({
          id: `analysis-complete-${analysis.id}`,
          timestamp: completionTime.toISOString(),
          type: 'consensus_update',
          title: `Analysis Completed`,
          description: `${analysis.analysisType.replace('_', ' ')} finished in ${(analysis.durationMs / 1000).toFixed(1)}s`,
          data: {
            keyChange: analysis.costUsd ? `Cost: $${analysis.costUsd.toFixed(3)}` : undefined
          },
          icon: CheckCircle,
          color: 'green'
        });
      }
    });

    // Add agent signal events
    signals.forEach((signal) => {
      const keyDrivers = parseKeyDrivers(signal.keyDrivers);
      
      events.push({
        id: `signal-${signal.id}`,
        timestamp: signal.createdAt,
        type: 'agent_analysis',
        title: `${signal.agentName} Analysis`,
        description: `${signal.agentType} agent completed individual analysis`,
        agentName: signal.agentName,
        agentType: signal.agentType,
        data: {
          fairProbability: signal.fairProbability,
          confidence: signal.confidence,
          keyChange: `Position: ${signal.direction}`,
          keyDrivers: keyDrivers.length > 0 ? keyDrivers : undefined
        },
        icon: signal.agentType === 'bull' ? TrendingUp :
          signal.agentType === 'bear' ? TrendingDown : Brain,
        color: signal.agentType === 'bull' ? 'green' :
          signal.agentType === 'bear' ? 'red' :
            'gray'
      });
    });

    // Sort events by timestamp
    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Add synthetic consensus formation events
    if (events.length > 1) {
      const midPoint = Math.floor(events.length / 2);
      // Use logic to find a midpoint time that makes sense, or default to current
      const t1 = new Date(events[midPoint - 1]?.timestamp || new Date()).getTime();
      const t2 = new Date(events[midPoint]?.timestamp || new Date()).getTime();
      const crossExamTime = new Date((t1 + t2) / 2);

      const safeCrossExamTime = crossExamTime.toString() === 'Invalid Date' ? new Date().toISOString() : crossExamTime.toISOString();

      events.splice(midPoint, 0, {
        id: 'cross-examination',
        timestamp: safeCrossExamTime,
        type: 'cross_examination',
        title: 'Cross-Examination Phase',
        description: 'Agents challenge each other\'s assumptions and refine positions',
        data: {
          agreementLevel: calculateAgreementLevel(signals),
          keyChange: 'Adversarial reasoning in progress'
        },
        icon: Activity,
        color: 'purple'
      });

      // Add final consensus event if exists
      if (events[events.length - 1]) {
        const finalTime = new Date(events[events.length - 1].timestamp);
        finalTime.setMinutes(finalTime.getMinutes() + 2);

        events.push({
          id: 'final-consensus',
          timestamp: finalTime.toISOString(),
          type: 'final_recommendation',
          title: 'Final Consensus Reached',
          description: 'Multi-agent system reached final recommendation',
          data: {
            consensusProbability: signals.reduce((sum, s) => sum + s.fairProbability, 0) / signals.length,
            agreementLevel: calculateAgreementLevel(signals),
            keyChange: 'Trade recommendation generated'
          },
          icon: Target,
          color: 'yellow'
        });
      }
    }

    return events;
  }, [signals, analysisHistory]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getColorClasses = (color: string, isSelected: boolean) => {
    const baseClasses = "transition-all duration-300 ";
    switch (color) {
      case 'green':
        return baseClasses + (isSelected ? 'bg-green-500/20 border-green-500 text-green-400 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-green-500/5 border-green-500/30 text-green-500/70 hover:bg-green-500/10');
      case 'red':
        return baseClasses + (isSelected ? 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-red-500/5 border-red-500/30 text-red-500/70 hover:bg-red-500/10');
      case 'purple':
        return baseClasses + (isSelected ? 'bg-purple-500/20 border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.3)]' : 'bg-purple-500/5 border-purple-500/30 text-purple-500/70 hover:bg-purple-500/10');
      case 'yellow':
        return baseClasses + (isSelected ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.3)]' : 'bg-yellow-500/5 border-yellow-500/30 text-yellow-500/70 hover:bg-yellow-500/10');
      case 'indigo':
        return baseClasses + (isSelected ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.3)]' : 'bg-indigo-500/5 border-indigo-500/30 text-indigo-500/70 hover:bg-indigo-500/10');
      default:
        return baseClasses + (isSelected ? 'bg-gray-500/20 border-gray-400 text-gray-300 shadow-[0_0_15px_rgba(156,163,175,0.3)]' : 'bg-white/5 border-white/10 text-gray-500 hover:bg-white/10');
    }
  };

  // Derive selection: Use explicit selectedEvent or default to the last event
  const effectiveSelectedEventId = selectedEvent || (timelineEvents.length > 0 ? timelineEvents[timelineEvents.length - 1].id : null);
  const selectedEventData = effectiveSelectedEventId ? timelineEvents.find(e => e.id === effectiveSelectedEventId) : null;

  if (!conditionId) {
    return (
      <Card className="p-8 border border-white/5 bg-white/5 backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center text-gray-500 h-[300px]">
          <div className="p-4 rounded-full bg-white/5 mb-4">
            <Clock className="w-8 h-8 opacity-50" />
          </div>
          <p className="font-medium">Condition ID required</p>
        </div>
      </Card>
    );
  }

  if (!recommendationId) {
    return (
      <Card className="p-8 border border-white/5 bg-white/5 backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center text-center h-[300px]">
          <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4 animate-pulse">
            <Clock className="w-8 h-8 text-indigo-400 opacity-50" />
          </div>
          <p className="font-medium text-white text-lg">Waiting for Analysis</p>
          <p className="text-sm text-gray-400 mt-2 max-w-xs">
            Timeline will populate as agents deliberate.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl h-full flex flex-col">
      <div className="p-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30">
            <Clock className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white tracking-tight">Formation Timeline</h3>
            <p className="text-xs text-gray-400 font-medium">
              Live consensus tracking
            </p>
          </div>
        </div>
        <div className="text-xs text-gray-500 bg-white/5 px-2 py-1 rounded border border-white/5">
          {timelineEvents.length} Events
        </div>
      </div>

      <div className="flex-1 p-0 overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-4 animate-pulse">
                <div className="w-2 h-full bg-white/5 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-1/3" />
                  <div className="h-12 bg-white/5 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : timelineEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[300px] text-gray-400">
            <Clock className="w-10 h-10 mb-3 opacity-30" />
            <p>No events recorded yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 h-full">
            {/* Timeline Column */}
            <div className="col-span-1 lg:col-span-7 overflow-y-auto p-6 max-h-[500px] scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <div className="relative pl-4 space-y-6">
                {/* Vertical Line */}
                <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-transparent via-white/10 to-transparent" />

                {timelineEvents.map((event, index) => {
                  const EventIcon = event.icon;
                  const isSelected = effectiveSelectedEventId === event.id;

                  return (
                    <motion.div
                      key={event.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="relative pl-8 group"
                    >
                      {/* Node Dot */}
                      <button
                        onClick={() => setSelectedEvent(event.id)}
                        className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-[3px] flex items-center justify-center transition-all duration-200 z-10 bg-[#0a0a0a] ${isSelected
                            ? `border-${event.color === 'gray' ? 'gray-400' : event.color + '-500'} scale-110 shadow-[0_0_10px_rgba(255,255,255,0.2)]`
                            : 'border-white/10 group-hover:border-white/30'
                          }`}
                      >
                        {isSelected && <div className={`w-2 h-2 rounded-full bg-${event.color === 'gray' ? 'gray-400' : event.color + '-500'}`} />}
                      </button>

                      <div
                        onClick={() => setSelectedEvent(event.id)}
                        className={`rounded-xl border p-3 cursor-pointer relative overflow-hidden ${getColorClasses(event.color, isSelected)}`}
                      >
                        <div className="flex items-start justify-between relative z-10">
                          <div className="flex items-center gap-2">
                            <EventIcon size={14} className="opacity-80" />
                            <span className="text-xs font-bold uppercase tracking-wider opacity-90">{formatTime(event.timestamp)}</span>
                          </div>
                          {event.agentName && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/20 text-white/70 font-medium">
                              {event.agentName}
                            </span>
                          )}
                        </div>
                        <h4 className="font-semibold text-white mt-1.5 text-sm">{event.title}</h4>
                        {!isSelected && <p className="text-xs text-inherit opacity-70 mt-1 line-clamp-1">{event.description}</p>}

                        {isSelected && (
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-20">
                            <ChevronRight size={40} />
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Details Column */}
            <div className="col-span-1 lg:col-span-5 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/20 p-6 flex flex-col">
              <AnimatePresence mode="wait">
                {selectedEventData ? (
                  <motion.div
                    key={selectedEventData.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                    className="h-full flex flex-col"
                  >
                    <div className="mb-6">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold border mb-3 ${selectedEventData.color === 'green' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                          selectedEventData.color === 'red' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                            selectedEventData.color === 'purple' ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' :
                              selectedEventData.color === 'yellow' ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                                'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                        }`}>
                        <selectedEventData.icon size={12} />
                        {selectedEventData.type.replace(/_/g, ' ').toUpperCase()}
                      </div>
                      <h2 className="text-xl font-bold text-white mb-2 leading-tight">{selectedEventData.title}</h2>
                      <div className="text-sm text-gray-400 flex items-center gap-2">
                        <Clock size={12} />
                        {new Date(selectedEventData.timestamp).toLocaleString()}
                      </div>
                    </div>

                    <div className="space-y-4 flex-1">
                      <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                        <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Description</h5>
                        <p className="text-sm text-gray-200 leading-relaxed">
                          {selectedEventData.description}
                        </p>
                      </div>

                      {selectedEventData.data && (
                        <div className="grid grid-cols-1 gap-3">
                          {selectedEventData.data.keyChange && (
                            <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                              <span className="block text-xs text-indigo-300 font-medium mb-1">Key Update</span>
                              <span className="text-sm font-semibold text-indigo-100">{selectedEventData.data.keyChange}</span>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            {selectedEventData.data.fairProbability !== undefined && (
                              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <span className="block text-xs text-gray-500 mb-1">Fair Price</span>
                                <span className="text-lg font-mono text-white">{(selectedEventData.data.fairProbability * 100).toFixed(1)}%</span>
                              </div>
                            )}
                            {selectedEventData.data.confidence !== undefined && (
                              <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                                <span className="block text-xs text-gray-500 mb-1">Confidence</span>
                                <span className="text-lg font-mono text-white">{(selectedEventData.data.confidence * 100).toFixed(0)}%</span>
                              </div>
                            )}
                          </div>

                          {selectedEventData.data.agreementLevel !== undefined && (
                            <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                              <div className="flex justify-between items-end mb-2">
                                <span className="text-xs text-gray-500">Agent Agreement</span>
                                <span className={`text-sm font-bold ${selectedEventData.data.agreementLevel > 0.7 ? 'text-green-400' :
                                    selectedEventData.data.agreementLevel > 0.4 ? 'text-yellow-400' : 'text-red-400'
                                  }`}>{(selectedEventData.data.agreementLevel * 100).toFixed(0)}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${selectedEventData.data.agreementLevel > 0.7 ? 'bg-green-500' :
                                      selectedEventData.data.agreementLevel > 0.4 ? 'bg-yellow-500' : 'bg-red-500'
                                    }`}
                                  style={{ width: `${selectedEventData.data.agreementLevel * 100}%` }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {selectedEventData.data?.keyDrivers && selectedEventData.data.keyDrivers.length > 0 && (
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                          <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                            <Brain size={12} />
                            Key Drivers
                          </h5>
                          <div className="space-y-2">
                            {selectedEventData.data.keyDrivers.map((driver, idx) => (
                              <div 
                                key={idx}
                                className="flex items-start gap-2 text-sm text-gray-300 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                              >
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                                <span className="leading-relaxed">{driver}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-full flex flex-col items-center justify-center text-gray-500"
                  >
                    <Maximize2 className="w-8 h-8 opacity-20 mb-4" />
                    <p className="text-sm">Select an event to view full details</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}