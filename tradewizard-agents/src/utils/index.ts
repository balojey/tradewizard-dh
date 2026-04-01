/**
 * Utility functions and clients
 */

export { PolymarketClient, createPolymarketClient } from './polymarket-client.js';
export {
  getAuditTrail,
  getStateAtCheckpoint,
  listCheckpoints,
  queryOpikTraces,
  getOpikTraceUrl,
  GraphExecutionLogger,
  type CheckpointMetadata,
  type OpikTraceQuery,
  type OpikTraceSummary,
} from './audit-logger.js';
export {
  DataIntegrationLayer,
  createDataIntegrationLayer,
  type NewsArticle,
  type PollingData,
  type SocialSentiment,
  type CachedData,
  type DataSourceConfig,
} from './data-integration.js';
export {
  updateAgentMetrics,
  calculateAccuracyScore,
  evaluateOnResolution,
  getPerformanceWeightAdjustment,
  getPerformanceLeaderboard,
  getPerformanceDashboard,
  trackAgentExecution,
  type AgentPerformanceMetrics,
  type MarketResolution,
} from './performance-tracking.js';
export {
  estimateAgentCost,
  getAgentPriority,
  filterAgentsByCost,
  applyCostOptimization,
  createCostOptimizationAuditEntry,
  trackAgentCost,
  AgentPriority,
} from './cost-optimization.js';
export {
  QuotaManager,
  createQuotaManager,
  type APIQuotaManager,
  type QuotaConfig,
} from './api-quota-manager.js';
export {
  PolymarketDiscoveryEngine,
  createMarketDiscoveryEngine,
  type MarketDiscoveryEngine,
  type PolymarketMarket,
  type RankedMarket,
} from './market-discovery.js';
export {
  CronScheduler,
  createScheduler,
  type Scheduler,
  type AnalysisCycleFunction,
} from './scheduler.js';
export {
  AutomatedMarketMonitor,
  createMonitorService,
  type MonitorService,
  type HealthStatus,
} from './monitor-service.js';
export {
  createLogger,
  createMonitorLogger,
  initializeLogger,
  initializeMonitorLogger,
  getLogger,
  getMonitorLogger,
  MonitorLogger,
  sanitizeLogData,
  formatDuration,
  formatCost,
  type LogLevel,
  type LoggerConfig,
  type LogContext,
  type ErrorContext,
} from './logger.js';
export {
  OpikMonitorIntegration,
  createOpikMonitorIntegration,
  formatCycleMetrics,
  formatAggregateMetrics,
  type OpikSpanMetadata,
  type AnalysisCycleMetrics,
  type AgentCycleMetrics,
} from './opik-integration.js';
export {
  EventMultiMarketKeywordExtractor,
  type MarketKeywords,
  type ProcessedEventKeywords,
  type KeywordExtractionMode,
} from './event-multi-market-keyword-extractor.js';
export {
  withRetry,
  calculateBackoffDelay,
  withTimeout,
  sleep,
  CircuitBreaker,
  isNetworkError,
  isRateLimitError,
  isServerError,
  isClientError,
  isRetryableError,
  retryApiCall,
  retryDatabaseOperation,
  type RetryOptions,
  type CircuitState,
  type CircuitBreakerOptions,
} from './retry-logic.js';
export { ToolCache, createToolCache, type CacheEntry, type CacheStats } from './tool-cache.js';
export {
  formatMemoryContext,
  type MemoryFormatOptions,
  type FormattedMemoryContext,
} from './memory-formatter.js';
export {
  createEvolutionTracker,
  logEvolutionEvents,
  EvolutionTrackerImpl,
  type EvolutionTracker,
  type EvolutionEvent,
  type EvolutionEventType,
} from './evolution-tracker.js';
