"use client";

import { useState, useMemo } from "react";
import { useAgentSignalsGrouped } from "@/hooks/useAgentSignals";
import { 
  TrendingUp, 
  TrendingDown, 
  Brain, 
  Activity, 
  Target,
  ArrowRight,
  ArrowLeft,
  Users,
  Zap,
  AlertTriangle,
  CheckCircle,
  Scale,
  MoreHorizontal
} from "lucide-react";
import Card from "@/components/shared/Card";

interface AgentOutputComparisonProps {
  conditionId: string | null;
  marketQuestion: string;
  recommendationId?: string | null;
}

interface ComparisonAgent {
  id: string;
  name: string;
  type: string;
  fairProbability: number;
  confidence: number;
  direction: string;
  keyDrivers: string[];
  reasoning: {
    strengths: string[];
    weaknesses: string[];
    assumptions: string[];
  };
  metadata: Record<string, any>;
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

export default function AgentOutputComparison({ 
  conditionId, 
  marketQuestion,
  recommendationId
}: AgentOutputComparisonProps) {
  const [selectedAgents, setSelectedAgents] = useState<[string | null, string | null]>([null, null]);
  const [comparisonMode, setComparisonMode] = useState<'side-by-side' | 'differences' | 'consensus'>('side-by-side');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  
  const { 
    data: signals, 
    bullSignals, 
    bearSignals, 
    neutralSignals,
    isLoading, 
    error 
  } = useAgentSignalsGrouped(conditionId, recommendationId);

  // Transform signals into comparison format
  const comparisonAgents: ComparisonAgent[] = useMemo(() => {
    if (!signals) return [];
    
    return signals.map(signal => {
      const parsedKeyDrivers = parseKeyDrivers(signal.keyDrivers);
      
      return {
        id: signal.id,
        name: signal.agentName,
        type: signal.agentType,
        fairProbability: signal.fairProbability,
        confidence: signal.confidence,
        direction: signal.direction,
        keyDrivers: parsedKeyDrivers,
        reasoning: {
          strengths: parsedKeyDrivers.slice(0, 3), // Use first 3 key drivers as strengths
          weaknesses: [], // Would be populated from actual agent reasoning
          assumptions: [] // Would be populated from actual agent assumptions
        },
        metadata: signal.metadata
      };
    });
  }, [signals]);

  const selectAgent = (agentId: string, position: 0 | 1) => {
    const newSelection: [string | null, string | null] = [...selectedAgents];
    newSelection[position] = agentId;
    setSelectedAgents(newSelection);
  };

  const getAgentColor = (type: string) => {
    switch (type.toLowerCase()) {
      case 'bull': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'bear': return 'text-red-400 bg-red-500/20 border-red-500/30';
      case 'neutral': return 'text-gray-400 bg-white/5 border-white/10';
      default: return 'text-indigo-400 bg-indigo-500/20 border-indigo-500/30';
    }
  };

  const getAgentIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'bull': return TrendingUp;
      case 'bear': return TrendingDown;
      case 'neutral': return Activity;
      default: return Brain;
    }
  };

  const getPositionColor = (direction: string) => {
    switch (direction) {
      case 'LONG_YES': return 'text-green-400 bg-green-500/20';
      case 'LONG_NO': return 'text-red-400 bg-red-500/20';
      case 'NO_TRADE': return 'text-gray-400 bg-white/10';
      default: return 'text-gray-400 bg-white/10';
    }
  };

  const calculateDifferences = (agent1: ComparisonAgent, agent2: ComparisonAgent) => {
    const probDiff = Math.abs(agent1.fairProbability - agent2.fairProbability);
    const confDiff = Math.abs(agent1.confidence - agent2.confidence);
    
    return {
      probabilityDifference: probDiff,
      confidenceDifference: confDiff,
      positionAgreement: agent1.direction === agent2.direction,
      keyDriverOverlap: agent1.keyDrivers.filter(driver => 
        agent2.keyDrivers.some(d2 => d2.toLowerCase().includes(driver.toLowerCase()) || 
                                     driver.toLowerCase().includes(d2.toLowerCase()))
      ).length,
      overallAgreement: probDiff < 0.1 && agent1.direction === agent2.direction ? 'high' :
                       probDiff < 0.2 && agent1.direction === agent2.direction ? 'medium' : 'low'
    };
  };

  if (!conditionId) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <Scale className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Agent comparison not available</p>
        </div>
      </Card>
    );
  }

  if (!recommendationId) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <Scale className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium text-white">No Current Recommendation</p>
          <p className="text-sm mt-1">Agent comparison will appear when a recommendation is generated</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-full" />
            <div className="h-6 bg-white/10 rounded w-48" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2].map(i => (
              <div key={i} className="p-4 border border-white/10 rounded-lg space-y-2">
                <div className="h-4 bg-white/10 rounded w-32" />
                <div className="h-4 bg-white/10 rounded w-full" />
                <div className="h-4 bg-white/10 rounded w-3/4" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error || comparisonAgents.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <Scale className="w-12 h-12 mx-auto mb-3 text-red-400" />
          <p className="font-medium text-white">Agent Comparison Unavailable</p>
          <p className="text-sm mt-1">No agent data available for comparison</p>
        </div>
      </Card>
    );
  }

  const selectedAgent1 = selectedAgents[0] ? comparisonAgents.find(a => a.id === selectedAgents[0]) : null;
  const selectedAgent2 = selectedAgents[1] ? comparisonAgents.find(a => a.id === selectedAgents[1]) : null;
  const differences = selectedAgent1 && selectedAgent2 ? calculateDifferences(selectedAgent1, selectedAgent2) : null;

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/5 relative">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Scale className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="font-semibold text-white">Agent Output Comparison</h3>
              <p className="text-sm text-gray-400">
                Compare agent outputs for current recommendation
              </p>
            </div>
          </div>
          
          {/* Desktop Comparison Mode Toggle */}
          <div className="hidden sm:flex items-center gap-1 p-1 bg-white/5 rounded-lg border border-white/10">
            {[
              { id: 'side-by-side', label: 'Side by Side', icon: Users, shortLabel: 'Side' },
              { id: 'differences', label: 'Differences', icon: ArrowRight, shortLabel: 'Diff' },
              { id: 'consensus', label: 'Consensus', icon: Target, shortLabel: 'Cons' }
            ].map(mode => {
              const Icon = mode.icon;
              return (
                <button
                  key={mode.id}
                  onClick={() => setComparisonMode(mode.id as any)}
                  className={`
                    flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all
                    ${comparisonMode === mode.id 
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30' 
                      : 'text-gray-400 hover:text-gray-300 hover:bg-white/5'
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{mode.label}</span>
                  <span className="lg:hidden">{mode.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Mobile Comparison Mode Toggle */}
          <div className="sm:hidden absolute top-4 right-4">
            <button
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-gray-300 hover:bg-white/10 transition-all"
            >
              {(() => {
                const modes = [
                  { id: 'side-by-side', label: 'Side by Side', icon: Users, shortLabel: 'Side' },
                  { id: 'differences', label: 'Differences', icon: ArrowRight, shortLabel: 'Diff' },
                  { id: 'consensus', label: 'Consensus', icon: Target, shortLabel: 'Cons' }
                ];
                const selectedOption = modes.find(v => v.id === comparisonMode);
                const IconComponent = selectedOption?.icon;
                return IconComponent ? <IconComponent className="w-4 h-4" /> : null;
              })()}
              <span className="text-sm">
                {(() => {
                  const modes = [
                    { id: 'side-by-side', label: 'Side by Side', icon: Users, shortLabel: 'Side' },
                    { id: 'differences', label: 'Differences', icon: ArrowRight, shortLabel: 'Diff' },
                    { id: 'consensus', label: 'Consensus', icon: Target, shortLabel: 'Cons' }
                  ];
                  return modes.find(v => v.id === comparisonMode)?.shortLabel;
                })()}
              </span>
              <MoreHorizontal className={`w-4 h-4 transition-transform ${showMobileMenu ? 'rotate-90' : ''}`} />
            </button>

            {showMobileMenu && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-40 bg-black/20"
                  onClick={() => setShowMobileMenu(false)}
                />
                
                {/* Dropdown Menu */}
                <div className="absolute top-full right-0 mt-2 w-48 bg-gray-800/95 backdrop-blur-sm border border-white/20 rounded-lg shadow-2xl z-50 overflow-hidden">
                  {[
                    { id: 'side-by-side', label: 'Side by Side', icon: Users },
                    { id: 'differences', label: 'Differences', icon: ArrowRight },
                    { id: 'consensus', label: 'Consensus', icon: Target }
                  ].map((mode, index) => {
                    const Icon = mode.icon;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setComparisonMode(mode.id as any);
                          setShowMobileMenu(false);
                        }}
                        className={`
                          w-full flex items-center gap-3 px-4 py-3 text-sm transition-all text-left
                          ${comparisonMode === mode.id 
                            ? 'bg-indigo-500/20 text-indigo-300 border-l-2 border-indigo-400' 
                            : 'text-gray-300 hover:bg-white/10 hover:text-white'
                          }
                          ${index !== 2 ? 'border-b border-white/10' : ''}
                        `}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        <span className="flex-1">{mode.label}</span>
                        {comparisonMode === mode.id && (
                          <div className="w-2 h-2 rounded-full bg-indigo-400 flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Agent Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {[0, 1].map(position => (
            <div key={position}>
              <h4 className="font-medium text-gray-300 mb-3 text-sm sm:text-base">
                Select Agent {position + 1}
              </h4>
              <div className="space-y-2 max-h-32 sm:max-h-40 overflow-y-auto scrollbar-custom pr-2">
                {comparisonAgents.map(agent => {
                  const AgentIcon = getAgentIcon(agent.type);
                  const isSelected = selectedAgents[position] === agent.id;
                  
                  return (
                    <button
                      key={agent.id}
                      onClick={() => selectAgent(agent.id, position as 0 | 1)}
                      className={`w-full p-2 sm:p-3 rounded-lg border text-left transition-all duration-200 ${
                        isSelected 
                          ? getAgentColor(agent.type)
                          : 'border-white/10 bg-white/5 hover:border-white/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="p-1 rounded bg-black/20 flex-shrink-0">
                          <AgentIcon className="w-3 h-3" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white text-xs sm:text-sm truncate">
                            {agent.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {(agent.fairProbability * 100).toFixed(1)}% • {(agent.confidence * 100).toFixed(0)}% conf
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Comparison Content */}
        {selectedAgent1 && selectedAgent2 ? (
          <div className="space-y-6">
            {comparisonMode === 'side-by-side' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {[selectedAgent1, selectedAgent2].map((agent, index) => {
                  const AgentIcon = getAgentIcon(agent.type);
                  
                  return (
                    <div key={agent.id} className={`p-3 sm:p-4 rounded-lg border ${getAgentColor(agent.type)}`}>
                      <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-black/20 flex-shrink-0">
                          <AgentIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-semibold text-white text-sm sm:text-base truncate">{agent.name}</h4>
                          <p className="text-xs sm:text-sm text-gray-400 capitalize">{agent.type} Agent</p>
                        </div>
                      </div>

                      <div className="space-y-3 sm:space-y-4">
                        {/* Key Metrics */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
                          <div>
                            <span className="text-gray-400 block">Fair Price:</span>
                            <div className="font-medium text-white">
                              {(agent.fairProbability * 100).toFixed(1)}%
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-400 block">Confidence:</span>
                            <div className="font-medium text-white">
                              {(agent.confidence * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>

                        {/* Position */}
                        <div>
                          <span className="text-gray-400 text-xs sm:text-sm block mb-1">Position:</span>
                          <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getPositionColor(agent.direction)}`}>
                            {agent.direction.replace('_', ' ')}
                          </div>
                        </div>

                        {/* Key Drivers */}
                        <div>
                          <h5 className="font-medium text-xs sm:text-sm text-gray-300 mb-2">Key Drivers</h5>
                          <ul className="space-y-1">
                            {agent.keyDrivers.slice(0, 4).map((driver, driverIndex) => (
                              <li key={driverIndex} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                                <span className="w-1.5 h-1.5 bg-current rounded-full mt-1.5 sm:mt-2 flex-shrink-0" />
                                <span className="break-words">{driver}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Reasoning Strengths */}
                        {agent.reasoning.strengths.length > 0 && (
                          <div>
                            <h5 className="font-medium text-xs sm:text-sm text-gray-300 mb-2">Core Strengths</h5>
                            <ul className="space-y-1">
                              {agent.reasoning.strengths.map((strength, strengthIndex) => (
                                <li key={strengthIndex} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                                  <span className="break-words">{strength}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {comparisonMode === 'differences' && differences && (
              <div className="space-y-4">
                {/* Difference Summary */}
                <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
                  <h4 className="font-medium text-white mb-3 flex items-center gap-2 text-sm sm:text-base">
                    <ArrowRight className="w-4 h-4 text-indigo-400" />
                    Key Differences
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                    <div className="p-2 sm:p-3 bg-white/5 rounded border border-white/10">
                      <span className="text-gray-400 block mb-1">Probability Difference:</span>
                      <div className={`font-medium ${
                        differences.probabilityDifference < 0.1 ? 'text-green-400' :
                        differences.probabilityDifference < 0.2 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {(differences.probabilityDifference * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-2 sm:p-3 bg-white/5 rounded border border-white/10">
                      <span className="text-gray-400 block mb-1">Position Agreement:</span>
                      <div className={`font-medium ${
                        differences.positionAgreement ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {differences.positionAgreement ? 'Yes' : 'No'}
                      </div>
                    </div>
                    <div className="p-2 sm:p-3 bg-white/5 rounded border border-white/10">
                      <span className="text-gray-400 block mb-1">Confidence Difference:</span>
                      <div className={`font-medium ${
                        differences.confidenceDifference < 0.1 ? 'text-green-400' :
                        differences.confidenceDifference < 0.2 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {(differences.confidenceDifference * 100).toFixed(0)}%
                      </div>
                    </div>
                    <div className="p-2 sm:p-3 bg-white/5 rounded border border-white/10">
                      <span className="text-gray-400 block mb-1">Overall Agreement:</span>
                      <div className={`font-medium capitalize ${
                        differences.overallAgreement === 'high' ? 'text-green-400' :
                        differences.overallAgreement === 'medium' ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {differences.overallAgreement}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Detailed Comparison */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
                    <h5 className="font-medium text-white mb-3 text-sm sm:text-base break-words">
                      {selectedAgent1.name} Unique Points
                    </h5>
                    <ul className="space-y-2">
                      {selectedAgent1.keyDrivers
                        .filter(driver => !selectedAgent2.keyDrivers.some(d2 => 
                          d2.toLowerCase().includes(driver.toLowerCase()) || 
                          driver.toLowerCase().includes(d2.toLowerCase())
                        ))
                        .map((driver, index) => (
                          <li key={index} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                            <span className="w-1.5 h-1.5 bg-green-400 rounded-full mt-1.5 sm:mt-2 flex-shrink-0" />
                            <span className="break-words">{driver}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                  
                  <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
                    <h5 className="font-medium text-white mb-3 text-sm sm:text-base break-words">
                      {selectedAgent2.name} Unique Points
                    </h5>
                    <ul className="space-y-2">
                      {selectedAgent2.keyDrivers
                        .filter(driver => !selectedAgent1.keyDrivers.some(d1 => 
                          d1.toLowerCase().includes(driver.toLowerCase()) || 
                          driver.toLowerCase().includes(d1.toLowerCase())
                        ))
                        .map((driver, index) => (
                          <li key={index} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                            <span className="w-1.5 h-1.5 bg-red-400 rounded-full mt-1.5 sm:mt-2 flex-shrink-0" />
                            <span className="break-words">{driver}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {comparisonMode === 'consensus' && (
              <div className="p-3 sm:p-4 bg-white/5 rounded-lg border border-white/10">
                <h4 className="font-medium text-white mb-3 sm:mb-4 flex items-center gap-2 text-sm sm:text-base">
                  <Target className="w-4 h-4 text-indigo-400" />
                  Consensus Analysis
                </h4>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-center">
                    <div className="p-3 bg-white/5 rounded border border-white/10">
                      <div className="text-base sm:text-lg font-bold text-white">
                        {((selectedAgent1.fairProbability + selectedAgent2.fairProbability) / 2 * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400 mt-1">Average Probability</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded border border-white/10">
                      <div className="text-base sm:text-lg font-bold text-white">
                        {((selectedAgent1.confidence + selectedAgent2.confidence) / 2 * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400 mt-1">Average Confidence</div>
                    </div>
                    <div className="p-3 bg-white/5 rounded border border-white/10">
                      <div className={`text-base sm:text-lg font-bold ${
                        differences && differences.overallAgreement === 'high' ? 'text-green-400' :
                        differences && differences.overallAgreement === 'medium' ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {differences?.overallAgreement.toUpperCase()}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-400 mt-1">Agreement Level</div>
                    </div>
                  </div>

                  {/* Common Ground */}
                  <div>
                    <h5 className="font-medium text-gray-300 mb-2 sm:mb-3 text-sm sm:text-base">Common Ground</h5>
                    <ul className="space-y-1 sm:space-y-2">
                      {selectedAgent1.keyDrivers
                        .filter(driver => selectedAgent2.keyDrivers.some(d2 => 
                          d2.toLowerCase().includes(driver.toLowerCase()) || 
                          driver.toLowerCase().includes(d2.toLowerCase())
                        ))
                        .map((driver, index) => (
                          <li key={index} className="text-xs sm:text-sm text-gray-300 flex items-start gap-2">
                            <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                            <span className="break-words">{driver}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8 sm:py-12">
            <Users className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium text-white text-sm sm:text-base">Select Two Agents to Compare</p>
            <p className="text-xs sm:text-sm mt-1">Choose agents from the selection panels above</p>
          </div>
        )}
      </div>
    </Card>
  );
}