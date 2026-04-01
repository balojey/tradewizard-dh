"use client";

import { useState, useEffect } from "react";
import { 
  Database, 
  Brain, 
  Users, 
  Target, 
  CheckCircle, 
  ArrowRight, 
  ArrowDown,
  Clock,
  Zap,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertTriangle
} from "lucide-react";
import Card from "@/components/shared/Card";
import { useAnalysisHistory } from "@/hooks/useAnalysisHistory";

interface AgentWorkflowDiagramProps {
  conditionId: string | null;
  marketQuestion: string;
}

interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'completed' | 'running' | 'pending' | 'failed';
  duration?: number;
  agents?: string[];
  outputs?: string[];
}

export default function AgentWorkflowDiagram({ 
  conditionId, 
  marketQuestion 
}: AgentWorkflowDiagramProps) {
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  
  const { data: analysisHistory } = useAnalysisHistory(conditionId, { limit: 10 });

  useEffect(() => {
    if (!conditionId) return;

    // Build workflow steps from analysis history or use default flow
    const steps: WorkflowStep[] = [
      {
        id: 'data-ingestion',
        name: 'Data Ingestion',
        description: 'Collect market data, news, and external signals',
        icon: Database,
        status: 'completed',
        duration: 2.3,
        outputs: ['Market prices', 'Volume data', 'News articles', 'Social sentiment']
      },
      {
        id: 'agent-analysis',
        name: 'Multi-Agent Analysis',
        description: 'Independent analysis by specialized agents',
        icon: Brain,
        status: 'completed',
        duration: 15.7,
        agents: ['Bull Agent', 'Bear Agent', 'Risk Agent', 'Technical Agent'],
        outputs: ['Individual theses', 'Probability estimates', 'Key drivers', 'Risk factors']
      },
      {
        id: 'cross-examination',
        name: 'Cross-Examination',
        description: 'Agents challenge each other\'s assumptions',
        icon: Users,
        status: 'completed',
        duration: 8.4,
        agents: ['All agents'],
        outputs: ['Counter-arguments', 'Refined positions', 'Evidence validation']
      },
      {
        id: 'consensus-building',
        name: 'Consensus Building',
        description: 'Weighted aggregation of agent opinions',
        icon: Target,
        status: 'completed',
        duration: 3.2,
        outputs: ['Fair probability', 'Confidence intervals', 'Agreement metrics']
      },
      {
        id: 'recommendation',
        name: 'Final Recommendation',
        description: 'Generate actionable trading recommendation',
        icon: CheckCircle,
        status: 'completed',
        duration: 1.8,
        outputs: ['Trade direction', 'Entry/target zones', 'Risk assessment', 'Expected value']
      }
    ];

    // Update status based on analysis history
    if (analysisHistory && analysisHistory.length > 0) {
      const latestAnalysis = analysisHistory[0];
      if (latestAnalysis.status === 'running') {
        // Find which step would be running based on analysis type
        const runningStepIndex = steps.findIndex(step => 
          step.name.toLowerCase().includes(latestAnalysis.analysisType.toLowerCase())
        );
        if (runningStepIndex !== -1) {
          steps[runningStepIndex].status = 'running';
          // Mark previous steps as completed, later as pending
          steps.forEach((step, index) => {
            if (index < runningStepIndex) step.status = 'completed';
            if (index > runningStepIndex) step.status = 'pending';
          });
        }
      } else if (latestAnalysis.status === 'failed') {
        steps[steps.length - 1].status = 'failed';
      }
    }

    setWorkflowSteps(steps);

    // Trigger animation
    setIsAnimating(true);
    const timer = setTimeout(() => setIsAnimating(false), 2000);
    return () => clearTimeout(timer);
  }, [conditionId, analysisHistory]);

  const getStepColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400 bg-green-500/20 border-green-500/30';
      case 'running': return 'text-indigo-400 bg-indigo-500/20 border-indigo-500/30';
      case 'pending': return 'text-gray-400 bg-white/5 border-white/10';
      case 'failed': return 'text-red-400 bg-red-500/20 border-red-500/30';
      default: return 'text-gray-400 bg-white/5 border-white/10';
    }
  };

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'completed': return CheckCircle;
      case 'running': return Clock;
      case 'failed': return AlertTriangle;
      default: return Clock;
    }
  };

  if (!conditionId) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Workflow diagram not available</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/5">
        <div className="flex items-center gap-3">
          <Zap className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="font-semibold text-white">Agent Workflow</h3>
            <p className="text-sm text-gray-400">Multi-agent analysis pipeline</p>
          </div>
        </div>
      </div>

      <div className="p-6">
        <div className="space-y-6">
          {workflowSteps.map((step, index) => {
            const StepIcon = step.icon;
            const StatusIcon = getStepIcon(step.status);
            const isLast = index === workflowSteps.length - 1;

            return (
              <div key={step.id} className="relative">
                {/* Step Card */}
                <div className={`relative border rounded-lg p-4 transition-all duration-500 ${
                  getStepColor(step.status)
                } ${isAnimating && step.status === 'running' ? 'animate-pulse' : ''}`}>
                  
                  {/* Step Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="p-2 rounded-lg bg-black/20">
                          <StepIcon className="w-5 h-5" />
                        </div>
                        <div className="absolute -top-1 -right-1">
                          <StatusIcon className="w-4 h-4" />
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white">{step.name}</h4>
                        <p className="text-sm text-gray-300">{step.description}</p>
                      </div>
                    </div>
                    
                    {step.duration && (
                      <div className="text-right">
                        <div className="text-sm font-medium text-white">
                          {step.duration}s
                        </div>
                        <div className="text-xs text-gray-400">Duration</div>
                      </div>
                    )}
                  </div>

                  {/* Step Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {/* Agents Involved */}
                    {step.agents && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                          Agents Involved
                        </h5>
                        <div className="flex flex-wrap gap-1">
                          {step.agents.map((agent, agentIndex) => (
                            <span
                              key={agentIndex}
                              className="px-2 py-1 bg-white/10 text-gray-300 text-xs rounded-full border border-white/10"
                            >
                              {agent}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Outputs */}
                    {step.outputs && (
                      <div>
                        <h5 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
                          Key Outputs
                        </h5>
                        <div className="space-y-1">
                          {step.outputs.map((output, outputIndex) => (
                            <div key={outputIndex} className="flex items-center gap-2 text-sm text-gray-300">
                              <div className="w-1.5 h-1.5 bg-current rounded-full flex-shrink-0" />
                              {output}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Running Animation */}
                  {step.status === 'running' && (
                    <div className="absolute inset-0 border-2 border-indigo-400 rounded-lg animate-pulse" />
                  )}
                </div>

                {/* Arrow to Next Step */}
                {!isLast && (
                  <div className="flex justify-center my-4">
                    <div className={`p-2 rounded-full border transition-colors ${
                      workflowSteps[index + 1].status !== 'pending' 
                        ? 'border-indigo-500/30 bg-indigo-500/20' 
                        : 'border-white/10 bg-white/5'
                    }`}>
                      <ArrowDown className={`w-4 h-4 transition-colors ${
                        workflowSteps[index + 1].status !== 'pending' 
                          ? 'text-indigo-400' 
                          : 'text-gray-400'
                      }`} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Workflow Summary */}
        <div className="mt-6 p-4 bg-white/5 rounded-lg border border-white/10">
          <h4 className="font-medium text-white mb-3">Workflow Summary</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="text-lg font-bold text-green-400">
                {workflowSteps.filter(s => s.status === 'completed').length}
              </div>
              <div className="text-gray-400">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-indigo-400">
                {workflowSteps.filter(s => s.status === 'running').length}
              </div>
              <div className="text-gray-400">Running</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-400">
                {workflowSteps.filter(s => s.status === 'pending').length}
              </div>
              <div className="text-gray-400">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-white">
                {workflowSteps.reduce((sum, s) => sum + (s.duration || 0), 0).toFixed(1)}s
              </div>
              <div className="text-gray-400">Total Time</div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}