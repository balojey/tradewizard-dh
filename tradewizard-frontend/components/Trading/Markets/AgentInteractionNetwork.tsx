"use client";

import { useState, useMemo } from "react";
import { useAgentSignalsGrouped } from "@/hooks/useAgentSignals";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Activity,
  Users,
  Target,
  MessageSquare,
  X
} from "lucide-react";
import Card from "@/components/shared/Card";
import { motion, AnimatePresence } from "framer-motion";

interface AgentInteractionNetworkProps {
  conditionId: string | null;
  marketQuestion: string;
  recommendationId?: string | null;
}

interface AgentNode {
  id: string;
  name: string;
  type: 'bull' | 'bear' | 'neutral' | 'technical';
  position: { x: number; y: number };
  fairProbability: number;
  confidence: number;
  direction: string;
  keyDrivers: string[];
}

interface AgentConnection {
  from: string;
  to: string;
  type: 'agreement' | 'disagreement' | 'influence';
  strength: number; // 0-1
  reason: string;
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

export default function AgentInteractionNetwork({
  conditionId,
  // marketQuestion,
  recommendationId
}: AgentInteractionNetworkProps) {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);

  const {
    data: signals,
    isLoading,
    error
  } = useAgentSignalsGrouped(conditionId, recommendationId);

  // Transform agent signals into network nodes and connections
  const { nodes, connections } = useMemo(() => {
    if (!signals || signals.length === 0) {
      return { nodes: [], connections: [] };
    }

    // Create nodes from agent signals
    // Use a fixed coordination system (400x400) that scales via viewBox
    const nodes: AgentNode[] = signals.map((signal, index) => {
      const angle = (index / signals.length) * 2 * Math.PI - (Math.PI / 2); // Start from top
      const radius = 140;
      const centerX = 200;
      const centerY = 200;

      return {
        id: signal.id,
        name: signal.agentName,
        type: signal.agentType.toLowerCase() as AgentNode['type'],
        position: {
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius
        },
        fairProbability: signal.fairProbability,
        confidence: signal.confidence,
        direction: signal.direction,
        keyDrivers: parseKeyDrivers(signal.keyDrivers)
      };
    });

    // Generate connections based on agent agreement/disagreement
    const connections: AgentConnection[] = [];

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const nodeA = nodes[i];
        const nodeB = nodes[j];

        // Calculate agreement based on probability difference
        const probDiff = Math.abs(nodeA.fairProbability - nodeB.fairProbability);
        const agreement = 1 - probDiff; // Higher agreement = lower probability difference

        // Determine connection type
        let connectionType: 'agreement' | 'disagreement' | 'influence' = 'influence';
        let reason = '';

        if (agreement > 0.8) {
          connectionType = 'agreement';
          reason = `Both agents see similar fair value (~${(nodeA.fairProbability * 100).toFixed(0)}%)`;
        } else if (agreement < 0.3) {
          connectionType = 'disagreement';
          reason = `Significant disagreement: ${(nodeA.fairProbability * 100).toFixed(0)}% vs ${(nodeB.fairProbability * 100).toFixed(0)}%`;
        } else {
          connectionType = 'influence';
          reason = `Moderate difference in probability estimates`;
        }

        // Only show meaningful connections (not too weak)
        if (agreement > 0.2 || agreement < 0.8) {
          connections.push({
            from: nodeA.id,
            to: nodeB.id,
            type: connectionType,
            strength: connectionType === 'agreement' ? agreement : (1 - agreement),
            reason
          });
        }
      }
    }

    return { nodes, connections };
  }, [signals]);

  const getAgentColor = (type: string) => {
    switch (type) {
      case 'bull': return '#10b981'; // emerald-500
      case 'bear': return '#ef4444'; // red-500
      case 'neutral': return '#9ca3af'; // gray-400
      case 'technical': return '#8b5cf6'; // violet-500
      default: return '#6366f1'; // indigo-500
    }
  };

  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'bull': return TrendingUp;
      case 'bear': return TrendingDown;
      case 'neutral': return Activity;
      case 'technical': return Target;
      default: return Brain;
    }
  };

  const getConnectionColor = (type: string) => {
    switch (type) {
      case 'agreement': return '#10b981';
      case 'disagreement': return '#ef4444';
      case 'influence': return '#6366f1';
      default: return '#6b7280';
    }
  };

  if (!conditionId) {
    return (
      <Card className="p-8 border border-white/5 bg-white/5 backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center text-gray-500 h-[300px]">
          <div className="p-4 rounded-full bg-white/5 mb-4">
            <Users className="w-8 h-8 opacity-50" />
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
            <Users className="w-8 h-8 text-indigo-400 opacity-50" />
          </div>
          <p className="font-medium text-white text-lg">Waiting for Recommendation</p>
          <p className="text-sm text-gray-400 mt-2 max-w-xs">
            The agent network will visualize the consensus once AI analysis is complete.
          </p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6 border border-white/5 bg-white/5 backdrop-blur-sm">
        <div className="animate-pulse space-y-8">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-full" />
            <div className="h-6 bg-white/10 rounded w-48" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 aspect-[4/3] bg-white/5 rounded-2xl" />
            <div className="h-full space-y-4">
              <div className="h-32 bg-white/5 rounded-xl" />
              <div className="h-32 bg-white/5 rounded-xl" />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (error || nodes.length === 0) {
    return (
      <Card className="p-8 border border-white/5 bg-white/5 backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center text-center h-[300px]">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-red-400" />
          </div>
          <p className="font-medium text-white text-lg">Network Analysis Unavailable</p>
          <p className="text-sm text-gray-400 mt-2">Could not load agent interaction data.</p>
        </div>
      </Card>
    );
  }

  const selectedNode = selectedAgent ? nodes.find(n => n.id === selectedAgent) : null;

  return (
    <Card className="overflow-hidden border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl">
      {/* Header */}
      <div className="p-5 border-b border-white/10 bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/20 ring-1 ring-indigo-500/30">
            <Users className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white tracking-tight">Agent Consensus</h3>
            <p className="text-xs text-gray-400 font-medium">
              Running live analysis on {nodes.length} market agents
            </p>
          </div>
        </div>
      </div>

      <div className="p-0 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-8">

          {/* Network Visualization */}
          <div className="col-span-1 lg:col-span-7 xl:col-span-8 relative min-h-[400px] flex flex-col">
            <div className="flex-1 w-full h-full relative p-4 flex items-center justify-center">
              <div className="w-full h-full max-w-[500px] max-h-[500px] aspect-square relative">
                <svg width="100%" height="100%" viewBox="0 0 400 400" className="overflow-visible">
                  <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* Connections */}
                  <AnimatePresence>
                    {connections.map((connection) => {
                      const fromNode = nodes.find(n => n.id === connection.from);
                      const toNode = nodes.find(n => n.id === connection.to);

                      if (!fromNode || !toNode) return null;

                      const connectionId = `${connection.from}-${connection.to}`;
                      const isHovered = hoveredConnection === connectionId;
                      const isRelatedToSelected = selectedAgent && (connection.from === selectedAgent || connection.to === selectedAgent);
                      const isDimmed = selectedAgent && !isRelatedToSelected;

                      return (
                        <motion.g
                          key={connectionId}
                          initial={{ opacity: 0 }}
                          animate={{
                            opacity: isDimmed ? 0.1 : 1,
                            strokeWidth: isHovered ? 3 : Math.max(1, connection.strength * 2.5)
                          }}
                          exit={{ opacity: 0 }}
                        >
                          <line
                            x1={fromNode.position.x}
                            y1={fromNode.position.y}
                            x2={toNode.position.x}
                            y2={toNode.position.y}
                            stroke={getConnectionColor(connection.type)}
                            strokeOpacity={isHovered ? 0.8 : 0.3}
                            strokeDasharray={connection.type === 'disagreement' ? '4,4' : 'none'}
                            className="cursor-pointer transition-all duration-300"
                            onMouseEnter={() => setHoveredConnection(connectionId)}
                            onMouseLeave={() => setHoveredConnection(null)}
                          />
                          {/* Invisible thicker line for easier hovering */}
                          <line
                            x1={fromNode.position.x}
                            y1={fromNode.position.y}
                            x2={toNode.position.x}
                            y2={toNode.position.y}
                            stroke="transparent"
                            strokeWidth="15"
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredConnection(connectionId)}
                            onMouseLeave={() => setHoveredConnection(null)}
                          />
                        </motion.g>
                      );
                    })}
                  </AnimatePresence>

                  {/* Nodes */}
                  <AnimatePresence>
                    {nodes.map((node) => {
                      const isSelected = selectedAgent === node.id;
                      const color = getAgentColor(node.type);
                      const isDimmed = selectedAgent && selectedAgent !== node.id && !connections.some(c =>
                        (c.from === selectedAgent && c.to === node.id) ||
                        (c.to === selectedAgent && c.from === node.id)
                      );

                      return (
                        <motion.g
                          key={node.id}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{
                            scale: isSelected ? 1.1 : 1,
                            opacity: isDimmed ? 0.3 : 1
                          }}
                          whileHover={{ scale: 1.1 }}
                          onClick={() => setSelectedAgent(node.id === selectedAgent ? null : node.id)}
                          className="cursor-pointer"
                        >
                          {/* Glow effect */}
                          <circle
                            cx={node.position.x}
                            cy={node.position.y}
                            r={30}
                            fill={color}
                            fillOpacity="0.15"
                            filter="url(#glow)"
                            className="animate-pulse"
                          />

                          {/* Main node circle */}
                          <circle
                            cx={node.position.x}
                            cy={node.position.y}
                            r={22}
                            fill="#1e1e24" // Dark background
                            stroke={color}
                            strokeWidth={isSelected ? 3 : 2}
                          />

                          {/* Confidence Ring */}
                          <circle
                            cx={node.position.x}
                            cy={node.position.y}
                            r={16}
                            fill="none"
                            stroke={color}
                            strokeWidth={2}
                            strokeOpacity={0.6}
                            strokeDasharray={`${node.confidence * 100} 100`}
                            transform={`rotate(-90 ${node.position.x} ${node.position.y})`}
                            strokeLinecap="round"
                          />

                          {/* Icon */}
                          <foreignObject
                            x={node.position.x - 10}
                            y={node.position.y - 10}
                            width={20}
                            height={20}
                            className="pointer-events-none"
                          >
                            <div className="flex items-center justify-center w-full h-full text-white">
                              {(() => {
                                const Icon = getAgentIcon(node.type);
                                return <Icon size={14} style={{ color }} />;
                              })()}
                            </div>
                          </foreignObject>

                          {/* Agent Name Label */}
                          <text
                            x={node.position.x}
                            y={node.position.y + 40}
                            fill="white"
                            fontSize="11"
                            fontWeight="500"
                            textAnchor="middle"
                            className="pointer-events-none drop-shadow-md"
                          >
                            {node.name.split(' ')[0]}
                          </text>

                          {/* Probability Label */}
                          <text
                            x={node.position.x}
                            y={node.position.y + 54}
                            fill={color}
                            fontSize="10"
                            fontWeight="600"
                            textAnchor="middle"
                            className="pointer-events-none"
                          >
                            {(node.fairProbability * 100).toFixed(0)}%
                          </text>
                        </motion.g>
                      );
                    })}
                  </AnimatePresence>
                </svg>
              </div>

              {/* Legend overlay */}
              <div className="absolute bottom-4 left-4 right-4 flex flex-wrap justify-center gap-4 text-[10px] sm:text-xs pointer-events-none">
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 border border-white/5 backdrop-blur-md">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-gray-300">Agree</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 border border-white/5 backdrop-blur-md">
                  <div className="w-2 h-2 rounded-full border border-dashed border-red-500 bg-red-500/20" />
                  <span className="text-gray-300">Disagree</span>
                </div>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/40 border border-white/5 backdrop-blur-md">
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                  <span className="text-gray-300">Influence</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details Panel - Moves to bottom on mobile, right on desktop */}
          <div className="col-span-1 lg:col-span-5 xl:col-span-4 border-t lg:border-t-0 lg:border-l border-white/10 bg-black/20 backdrop-blur-md">
            <AnimatePresence mode="wait">
              {selectedNode ? (
                <motion.div
                  key={selectedNode.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                  className="h-fullflex flex-col"
                >
                  <div className={`p-5 border-b border-white/5 ${selectedNode.type === 'bull' ? 'bg-green-500/5' :
                    selectedNode.type === 'bear' ? 'bg-red-500/5' :
                      'bg-indigo-500/5'
                    }`}>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${selectedNode.type === 'bull' ? 'bg-green-500/20 text-green-400' :
                          selectedNode.type === 'bear' ? 'bg-red-500/20 text-red-400' :
                            'bg-indigo-500/20 text-indigo-400'
                          }`}>
                          {(() => {
                            const Icon = getAgentIcon(selectedNode.type);
                            return <Icon className="w-5 h-5" />;
                          })()}
                        </div>
                        <div>
                          <h4 className="font-bold text-white text-lg">{selectedNode.name}</h4>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block mt-1 ${selectedNode.type === 'bull' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                            selectedNode.type === 'bear' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                              'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            }`}>
                            {selectedNode.type.toUpperCase()}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedAgent(null)}
                        className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <span className="text-gray-400 text-xs uppercase tracking-wider font-medium">Fair Price</span>
                        <div className="text-xl font-bold text-white mt-0.5">
                          {(selectedNode.fairProbability * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <span className="text-gray-400 text-xs uppercase tracking-wider font-medium">Confidence</span>
                        <div className="text-xl font-bold text-white mt-0.5">
                          {(selectedNode.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-5 space-y-5 overflow-y-auto max-h-[400px] scrollbar-custom">
                    {/* Interactions */}
                    {connections.filter(c => c.from === selectedNode.id || c.to === selectedNode.id).length > 0 && (
                      <div>
                        <h5 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                          <Activity className="w-4 h-4 text-indigo-400" />
                          Network Interactions
                        </h5>
                        <div className="space-y-2">
                          {connections
                            .filter(c => c.from === selectedNode.id || c.to === selectedNode.id)
                            .map((connection, index) => {
                              const otherAgentId = connection.from === selectedNode.id ? connection.to : connection.from;
                              const otherAgent = nodes.find(n => n.id === otherAgentId);

                              if (!otherAgent) return null;

                              return (
                                <div key={index} className="p-3 bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
                                  <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold text-white">
                                      {otherAgent.name}
                                    </span>
                                    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${connection.type === 'agreement' ? 'bg-green-500/20 text-green-400' :
                                      connection.type === 'disagreement' ? 'bg-red-500/20 text-red-400' :
                                        'bg-indigo-500/20 text-indigo-400'
                                      }`}>
                                      {connection.type}
                                    </span>
                                  </div>
                                  <p className="text-xs text-gray-400 leading-relaxed">{connection.reason}</p>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[300px] flex flex-col items-center justify-center p-8 text-center text-gray-500 bg-white/[0.02]"
                >
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 opacity-40" />
                  </div>
                  <h4 className="text-lg font-medium text-gray-300 mb-2">Agent Details</h4>
                  <p className="text-sm max-w-[200px]">
                    Select an agent node on the left to view their reasoning and network connections.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </Card>
  );
}