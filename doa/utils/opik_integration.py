"""
Opik observability integration for DOA workflow.

This module provides data models and integration classes for tracking
LLM usage, costs, and performance metrics using the Opik platform.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Any


@dataclass
class AgentCycleMetrics:
    """Agent performance metrics per cycle."""
    
    agent_name: str
    execution_count: int = 0
    total_duration: float = 0.0
    average_duration: float = 0.0
    total_cost: float = 0.0
    average_cost: float = 0.0
    success_count: int = 0
    error_count: int = 0
    average_confidence: float = 0.0
    total_input_tokens: int = 0
    total_output_tokens: int = 0


@dataclass
class AnalysisCycleMetrics:
    """Analysis cycle metrics for Opik tracking."""
    
    cycle_id: str
    timestamp: int
    markets_discovered: int = 0
    markets_analyzed: int = 0
    markets_updated: int = 0
    total_duration: float = 0.0
    total_cost: float = 0.0
    success_count: int = 0
    error_count: int = 0
    agent_metrics: Dict[str, AgentCycleMetrics] = field(default_factory=dict)


@dataclass
class AggregateMetrics:
    """Aggregate metrics across all cycles."""
    
    total_cycles: int
    total_markets_analyzed: int
    total_cost: float
    average_cost_per_market: float
    average_duration_per_market: float
    success_rate: float
    top_agents: List[Dict[str, Any]]


import logging
import time
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from doa.config import EngineConfig
    from doa.models.types import AgentSignal

logger = logging.getLogger(__name__)


class OpikMonitorIntegration:
    """Opik integration manager for DOA workflow."""
    
    def __init__(self, config: 'EngineConfig'):
        """
        Initialize Opik integration with configuration.
        
        Args:
            config: Engine configuration containing Opik settings
        """
        self.config = config
        self.current_cycle_metrics: Optional[AnalysisCycleMetrics] = None
        self.cycle_history: List[AnalysisCycleMetrics] = []
        
        if config.opik.is_enabled():
            logger.info(f"Opik integration enabled for project: {config.opik.project_name}")
        else:
            logger.info("Opik integration disabled (no API key)")
    
    def create_opik_handler(self) -> Optional[Any]:
        """
        Create Opik callback handler for workflow execution.
        
        Returns:
            OpikCallbackHandler if enabled, None otherwise
        """
        if not self.config.opik.is_enabled():
            return None
        
        try:
            from opik.integrations.langchain import OpikCallbackHandler
            
            handler = OpikCallbackHandler(
                project_name=self.config.opik.project_name,
                workspace=self.config.opik.workspace,
            )
            logger.info("OpikCallbackHandler created successfully")
            return handler
        except Exception as e:
            logger.error(f"Failed to create OpikCallbackHandler: {e}", exc_info=True)
            return None
    
    def start_cycle(self) -> str:
        """
        Start tracking an analysis cycle.
        
        Returns:
            Unique cycle ID, or empty string on error
        """
        try:
            cycle_id = f"cycle_{int(time.time() * 1000)}"
            self.current_cycle_metrics = AnalysisCycleMetrics(
                cycle_id=cycle_id,
                timestamp=int(time.time() * 1000)
            )
            
            logger.info(f"[OpikMonitor] Started tracking cycle: {cycle_id}")
            return cycle_id
        except Exception as e:
            logger.error(f"[OpikMonitor] Failed to start cycle: {e}", exc_info=True)
            return ""
    
    def record_discovery(self, market_count: int) -> None:
        """
        Record market discovery in current cycle.
        
        Args:
            market_count: Number of markets discovered
        """
        try:
            if not self.current_cycle_metrics:
                logger.warning("[OpikMonitor] No active cycle to record discovery")
                return
            
            self.current_cycle_metrics.markets_discovered = market_count
            logger.info(f"[OpikMonitor] Recorded discovery: {market_count} markets")
        except Exception as e:
            logger.error(f"[OpikMonitor] Failed to record discovery: {e}", exc_info=True)
    
    def record_analysis(
        self,
        condition_id: str,
        duration: float,
        cost: float,
        success: bool,
        agent_signals: Optional[List['AgentSignal']] = None,
        error: Optional[str] = None
    ) -> None:
        """
        Record market analysis in current cycle.
        
        Args:
            condition_id: Market condition ID
            duration: Analysis duration in milliseconds
            cost: Analysis cost in USD
            success: Whether analysis succeeded
            agent_signals: List of agent signals from analysis
            error: Error message if analysis failed
        """
        try:
            if not self.current_cycle_metrics:
                logger.warning("[OpikMonitor] No active cycle to record analysis")
                return
            
            # Update cycle totals
            self.current_cycle_metrics.markets_analyzed += 1
            self.current_cycle_metrics.total_duration += duration
            self.current_cycle_metrics.total_cost += cost
            
            if success:
                self.current_cycle_metrics.success_count += 1
            else:
                self.current_cycle_metrics.error_count += 1
            
            # Update agent metrics
            if agent_signals:
                for signal in agent_signals:
                    self._update_agent_metrics(signal, duration, cost, success)
            
            # Log trace URL
            trace_url = self.get_trace_url(condition_id)
            logger.info(f"[OpikMonitor] Analysis recorded: {condition_id}")
            logger.info(f"[OpikMonitor] Opik Trace: {trace_url}")
            
            if error:
                logger.error(f"[OpikMonitor] Analysis error: {error}")
        except Exception as e:
            logger.error(f"[OpikMonitor] Failed to record analysis: {e}", exc_info=True)
    
    def record_update(self, condition_id: str) -> None:
        """
        Record market update in current cycle.
        
        Args:
            condition_id: Market condition ID
        """
        try:
            if not self.current_cycle_metrics:
                logger.warning("[OpikMonitor] No active cycle to record update")
                return
            
            self.current_cycle_metrics.markets_updated += 1
            logger.info(f"[OpikMonitor] Recorded update: {condition_id}")
        except Exception as e:
            logger.error(f"[OpikMonitor] Failed to record update: {e}", exc_info=True)
    
    def end_cycle(self) -> Optional[AnalysisCycleMetrics]:
        """
        End current cycle and store metrics.
        
        Returns:
            Completed cycle metrics or None if no active cycle
        """
        try:
            if not self.current_cycle_metrics:
                logger.warning("[OpikMonitor] No active cycle to end")
                return None
            
            metrics = self.current_cycle_metrics
            self.cycle_history.append(metrics)
            
            # Keep only last 100 cycles
            if len(self.cycle_history) > 100:
                self.cycle_history.pop(0)
            
            logger.info(f"[OpikMonitor] Cycle ended: {metrics.cycle_id}")
            logger.info(f"[OpikMonitor] Cycle summary: "
                       f"discovered={metrics.markets_discovered}, "
                       f"analyzed={metrics.markets_analyzed}, "
                       f"updated={metrics.markets_updated}, "
                       f"duration={metrics.total_duration / 1000:.2f}s, "
                       f"cost=${metrics.total_cost:.4f}, "
                       f"success={metrics.success_count}, "
                       f"errors={metrics.error_count}")
            
            self.current_cycle_metrics = None
            return metrics
        except Exception as e:
            logger.error(f"[OpikMonitor] Failed to end cycle: {e}", exc_info=True)
            # Reset current cycle to prevent stuck state
            self.current_cycle_metrics = None
            return None
    
    def get_current_cycle_metrics(self) -> Optional[AnalysisCycleMetrics]:
        """
        Get current cycle metrics.
        
        Returns:
            Current cycle metrics or None if no active cycle
        """
        return self.current_cycle_metrics
    
    def get_cycle_history(self) -> List[AnalysisCycleMetrics]:
        """
        Get cycle history.
        
        Returns:
            Copy of cycle history list
        """
        return self.cycle_history.copy()
    
    def get_aggregate_metrics(self) -> AggregateMetrics:
        """
        Get aggregate metrics across all cycles.
        
        Returns:
            Aggregate metrics summary
        """
        try:
            if not self.cycle_history:
                return AggregateMetrics(
                    total_cycles=0,
                    total_markets_analyzed=0,
                    total_cost=0.0,
                    average_cost_per_market=0.0,
                    average_duration_per_market=0.0,
                    success_rate=0.0,
                    top_agents=[]
                )
            
            total_markets = sum(c.markets_analyzed for c in self.cycle_history)
            total_cost = sum(c.total_cost for c in self.cycle_history)
            total_duration = sum(c.total_duration for c in self.cycle_history)
            total_success = sum(c.success_count for c in self.cycle_history)
            total_errors = sum(c.error_count for c in self.cycle_history)
            
            # Aggregate agent metrics
            agent_aggregates: Dict[str, Dict[str, float]] = {}
            
            for cycle in self.cycle_history:
                for agent_name, metrics in cycle.agent_metrics.items():
                    if agent_name not in agent_aggregates:
                        agent_aggregates[agent_name] = {
                            'total_cost': 0.0,
                            'total_duration': 0.0,
                            'count': 0
                        }
                    agent_aggregates[agent_name]['total_cost'] += metrics.total_cost
                    agent_aggregates[agent_name]['total_duration'] += metrics.total_duration
                    agent_aggregates[agent_name]['count'] += metrics.execution_count
            
            # Calculate top agents
            top_agents = [
                {
                    'agent_name': name,
                    'average_cost': data['total_cost'] / data['count'],
                    'average_duration': data['total_duration'] / data['count']
                }
                for name, data in agent_aggregates.items()
            ]
            top_agents.sort(key=lambda x: x['average_cost'], reverse=True)
            top_agents = top_agents[:10]
            
            return AggregateMetrics(
                total_cycles=len(self.cycle_history),
                total_markets_analyzed=total_markets,
                total_cost=total_cost,
                average_cost_per_market=total_cost / total_markets if total_markets > 0 else 0.0,
                average_duration_per_market=total_duration / total_markets if total_markets > 0 else 0.0,
                success_rate=total_success / (total_success + total_errors) if (total_success + total_errors) > 0 else 0.0,
                top_agents=top_agents
            )
        except Exception as e:
            logger.error(f"[OpikMonitor] Failed to calculate aggregate metrics: {e}", exc_info=True)
            # Return empty metrics on error
            return AggregateMetrics(
                total_cycles=0,
                total_markets_analyzed=0,
                total_cost=0.0,
                average_cost_per_market=0.0,
                average_duration_per_market=0.0,
                success_rate=0.0,
                top_agents=[]
            )
    
    def get_trace_url(self, condition_id: str) -> str:
        """
        Get Opik trace URL for a market analysis.
        
        Args:
            condition_id: Market condition ID
            
        Returns:
            Opik dashboard URL for the trace
        """
        try:
            base_url = self.config.opik.base_url or "https://www.comet.com/opik"
            workspace = self.config.opik.workspace or "default"
            project_name = self.config.opik.project_name
            
            return f"{base_url}/{workspace}/projects/{project_name}/traces?search={condition_id}"
        except Exception as e:
            logger.error(f"Failed to generate trace URL: {e}", exc_info=True)
            return f"[Error generating trace URL: {e}]"
    
    def log_dashboard_link(self) -> None:
        """Log Opik dashboard link."""
        try:
            base_url = self.config.opik.base_url or "https://www.comet.com/opik"
            workspace = self.config.opik.workspace or "default"
            project_name = self.config.opik.project_name
            
            dashboard_url = f"{base_url}/{workspace}/projects/{project_name}"
            logger.info(f"[OpikMonitor] Opik Dashboard: {dashboard_url}")
        except Exception as e:
            logger.error(f"Failed to log dashboard link: {e}", exc_info=True)
    
    def _update_agent_metrics(
        self,
        signal: 'AgentSignal',
        duration: float,
        cost: float,
        success: bool
    ) -> None:
        """
        Update agent metrics in current cycle.
        
        Args:
            signal: Agent signal containing agent name and confidence
            duration: Analysis duration in milliseconds
            cost: Analysis cost in USD
            success: Whether analysis succeeded
        """
        try:
            if not self.current_cycle_metrics:
                return
            
            agent_name = signal.agent_name
            metrics = self.current_cycle_metrics.agent_metrics.get(agent_name)
            
            if metrics is None:
                metrics = AgentCycleMetrics(agent_name=agent_name)
                self.current_cycle_metrics.agent_metrics[agent_name] = metrics
            
            # Update counts
            metrics.execution_count += 1
            if success:
                metrics.success_count += 1
            else:
                metrics.error_count += 1
            
            # Update totals
            metrics.total_duration += duration
            metrics.total_cost += cost
            
            # Update averages
            metrics.average_duration = metrics.total_duration / metrics.execution_count
            metrics.average_cost = metrics.total_cost / metrics.execution_count
            
            # Update confidence (running average)
            n = metrics.execution_count
            metrics.average_confidence = (
                (metrics.average_confidence * (n - 1) + signal.confidence) / n
            )
        except Exception as e:
            logger.error(f"[OpikMonitor] Failed to update agent metrics: {e}", exc_info=True)


def create_opik_monitor_integration(config: 'EngineConfig') -> OpikMonitorIntegration:
    """
    Create Opik monitor integration instance.
    
    Args:
        config: Engine configuration
        
    Returns:
        OpikMonitorIntegration instance
    """
    return OpikMonitorIntegration(config)


def format_cycle_metrics(metrics: AnalysisCycleMetrics) -> str:
    """
    Format cycle metrics for logging.
    
    Args:
        metrics: Cycle metrics to format
        
    Returns:
        Human-readable string representation
    """
    from datetime import datetime
    
    lines = [
        f"Cycle: {metrics.cycle_id}",
        f"Timestamp: {datetime.fromtimestamp(metrics.timestamp / 1000).isoformat()}",
        f"Markets Discovered: {metrics.markets_discovered}",
        f"Markets Analyzed: {metrics.markets_analyzed}",
        f"Markets Updated: {metrics.markets_updated}",
        f"Total Duration: {metrics.total_duration / 1000:.2f}s",
        f"Total Cost: ${metrics.total_cost:.4f}",
        f"Success: {metrics.success_count}",
        f"Errors: {metrics.error_count}",
    ]
    
    if metrics.success_count + metrics.error_count > 0:
        success_rate = metrics.success_count / (metrics.success_count + metrics.error_count) * 100
        lines.append(f"Success Rate: {success_rate:.1f}%")
    
    if metrics.agent_metrics:
        lines.append("\nAgent Performance:")
        for agent_name, agent_metrics in metrics.agent_metrics.items():
            lines.append(
                f"  {agent_name}: {agent_metrics.execution_count} executions, "
                f"avg {agent_metrics.average_duration:.0f}ms, "
                f"avg ${agent_metrics.average_cost:.4f}, "
                f"confidence {agent_metrics.average_confidence:.2f}"
            )
    
    return "\n".join(lines)


def format_aggregate_metrics(metrics: AggregateMetrics) -> str:
    """
    Format aggregate metrics for logging.
    
    Args:
        metrics: Aggregate metrics to format
        
    Returns:
        Human-readable string representation
    """
    lines = [
        "Aggregate Metrics (All Cycles):",
        f"Total Cycles: {metrics.total_cycles}",
        f"Total Markets Analyzed: {metrics.total_markets_analyzed}",
        f"Total Cost: ${metrics.total_cost:.4f}",
        f"Average Cost per Market: ${metrics.average_cost_per_market:.4f}",
        f"Average Duration per Market: {metrics.average_duration_per_market / 1000:.2f}s",
        f"Success Rate: {metrics.success_rate * 100:.1f}%",
    ]
    
    if metrics.top_agents:
        lines.append("\nTop Agents by Cost:")
        for agent in metrics.top_agents:
            lines.append(
                f"  {agent['agent_name']}: "
                f"avg ${agent['average_cost']:.4f}, "
                f"avg {agent['average_duration'] / 1000:.2f}s"
            )
    
    return "\n".join(lines)
