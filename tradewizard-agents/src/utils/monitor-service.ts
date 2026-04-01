/**
 * Automated Market Monitor Service
 *
 * Main service orchestrator that continuously monitors prediction markets,
 * schedules analysis workflows, and persists results to Supabase PostgreSQL.
 */

import type { EngineConfig } from '../config/index.js';
import type { SupabaseClientManager } from '../database/supabase-client.js';
import type { DatabasePersistence } from '../database/persistence.js';
import type { Scheduler } from './scheduler.js';
import type { APIQuotaManager } from './api-quota-manager.js';
import type { MarketDiscoveryEngine } from './market-discovery.js';
import type { PolymarketClient } from './polymarket-client.js';
import type { TradeRecommendation, AgentSignal } from '../models/types.js';
import { analyzeMarket } from '../workflow.js';
import { createScheduler } from './scheduler.js';
import {
  createOpikMonitorIntegration,
  type OpikMonitorIntegration,
  formatCycleMetrics,
  formatAggregateMetrics,
} from './opik-integration.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Health status for the monitor service
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  lastAnalysis: string | null;
  nextScheduledRun: string | null;
  database: {
    connected: boolean;
    lastCheck: string;
  };
  scheduler: {
    running: boolean;
    executing: boolean;
  };
  workflowService: {
    enabled: boolean;
    url: string | null;
    lastSuccess: string | null;
    consecutiveFailures: number;
  };
  quota: {
    newsapi: { used: number; limit: number };
    twitter: { used: number; limit: number };
    reddit: { used: number; limit: number };
    recommendedMarkets: number;
  };
}

// ============================================================================
// Monitor Service Interface
// ============================================================================

export interface MonitorService {
  /**
   * Initialize the monitor service
   */
  initialize(): Promise<void>;

  /**
   * Start the monitor
   */
  start(): Promise<void>;

  /**
   * Stop the monitor gracefully
   */
  stop(): Promise<void>;

  /**
   * Get service health status
   */
  getHealth(): HealthStatus;

  /**
   * Manually trigger analysis for a specific market
   */
  analyzeMarket(conditionId: string): Promise<TradeRecommendation>;

  /**
   * Get Opik integration metrics
   */
  getOpikMetrics(): {
    currentCycle: any;
    cycleHistory: any[];
    aggregateMetrics: any;
  };
}

// ============================================================================
// Monitor Service Implementation
// ============================================================================

export class AutomatedMarketMonitor implements MonitorService {
  private isRunning: boolean = false;
  private lastAnalysisTime: Date | null = null;
  private startTime: Date | null = null;
  private lastDatabaseCheck: Date = new Date();
  private isDatabaseConnected: boolean = false;
  private opikIntegration: OpikMonitorIntegration;
  private lastWorkflowServiceSuccess: Date | null = null;
  private workflowServiceConsecutiveFailures: number = 0;

  constructor(
    private config: EngineConfig,
    private supabaseManager: SupabaseClientManager,
    private database: DatabasePersistence,
    private quotaManager: APIQuotaManager,
    private discovery: MarketDiscoveryEngine,
    private polymarketClient: PolymarketClient,
    private opikHandler?: any
  ) {
    // Create scheduler with bound analysis cycle function
    this.scheduler = this.createScheduler();
    
    // Create Opik integration
    this.opikIntegration = createOpikMonitorIntegration(config);
  }

  private scheduler: Scheduler;

  /**
   * Initialize the monitor service
   */
  async initialize(): Promise<void> {
    console.log('[MonitorService] Initializing...');

    try {
      // Test database connection
      await this.checkDatabaseConnection();

      // Set up signal handlers for graceful shutdown
      this.setupSignalHandlers();

      // Log Opik dashboard link
      this.opikIntegration.logDashboardLink();

      console.log('[MonitorService] Initialization complete');
    } catch (error) {
      console.error('[MonitorService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start the monitor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[MonitorService] Already running');
      return;
    }

    console.log('[MonitorService] Starting monitor service...');
    this.isRunning = true;
    this.startTime = new Date();

    // Start scheduler with configured interval
    const intervalHours = parseInt(process.env.ANALYSIS_INTERVAL_HOURS || '24', 10);
    const intervalMs = intervalHours * 60 * 60 * 1000;

    this.scheduler.start(intervalMs);

    // Start daily quota reset scheduler
    this.startQuotaResetScheduler();

    console.log(`[MonitorService] Monitor started with ${intervalHours}h interval`);
  }

  /**
   * Stop the monitor gracefully
   */
  async stop(): Promise<void> {
    console.log('[MonitorService] Stopping monitor gracefully...');
    this.isRunning = false;

    // Stop scheduler (waits for current cycle to complete)
    await this.scheduler.stop();

    // Log final aggregate metrics
    const aggregateMetrics = this.opikIntegration.getAggregateMetrics();
    console.log('[MonitorService] Final aggregate metrics:\n' + formatAggregateMetrics(aggregateMetrics));

    console.log('[MonitorService] Monitor stopped');
  }

  /**
   * Get service health status
   */
  getHealth(): HealthStatus {
    const uptime = this.startTime ? (Date.now() - this.startTime.getTime()) / 1000 : 0;

    return {
      status: this.calculateHealthStatus(),
      timestamp: new Date().toISOString(),
      uptime,
      lastAnalysis: this.lastAnalysisTime?.toISOString() || null,
      nextScheduledRun: this.scheduler.getNextRun()?.toISOString() || null,
      database: {
        connected: this.isDatabaseConnected,
        lastCheck: this.lastDatabaseCheck.toISOString(),
      },
      scheduler: {
        running: this.scheduler.isRunning(),
        executing: (this.scheduler as any).isExecutingCycle?.() || false,
      },
      workflowService: {
        enabled: !!this.config.workflowService?.url,
        url: this.config.workflowService?.url || null,
        lastSuccess: this.lastWorkflowServiceSuccess?.toISOString() || null,
        consecutiveFailures: this.workflowServiceConsecutiveFailures,
      },
      quota: {
        newsapi: {
          used: this.quotaManager.getUsage('newsapi'),
          limit: (this.quotaManager as any).getQuotaLimit('newsapi'),
        },
        twitter: {
          used: this.quotaManager.getUsage('twitter'),
          limit: (this.quotaManager as any).getQuotaLimit('twitter'),
        },
        reddit: {
          used: this.quotaManager.getUsage('reddit'),
          limit: (this.quotaManager as any).getQuotaLimit('reddit'),
        },
        recommendedMarkets: parseInt(process.env.MAX_MARKETS_PER_CYCLE || '3', 10),
      },
    };
  }

  /**
   * Get Opik integration metrics
   */
  getOpikMetrics() {
    return {
      currentCycle: this.opikIntegration.getCurrentCycleMetrics(),
      cycleHistory: this.opikIntegration.getCycleHistory(),
      aggregateMetrics: this.opikIntegration.getAggregateMetrics(),
    };
  }

  /**
   * Manually trigger analysis for a specific market
   * 
   * This method ensures resilient error handling:
   * - Errors are logged but don't stop the monitoring service
   * - Health metrics are updated on failures
   * - Errors are propagated to allow callers to handle them appropriately
   */
  async analyzeMarket(conditionId: string): Promise<TradeRecommendation> {
    console.log(`[MonitorService] Analyzing market: ${conditionId}`);
    const startTime = Date.now();

    try {
      // Run Market Intelligence Engine
      const analysisResult = await analyzeMarket(
        conditionId,
        this.config,
        this.polymarketClient,
        this.supabaseManager,
        this.opikHandler
      );

      if (!analysisResult.recommendation) {
        throw new Error('Analysis returned null recommendation');
      }

      // Extract agent signals and cost from analysis result
      const { recommendation, agentSignals, cost = 0 } = analysisResult;

      // Store results in database ONLY if using local workflow execution
      // When using remote workflow service, it handles its own persistence
      if (!this.config.workflowService?.url) {
        await this.storeAnalysisResults(conditionId, recommendation, agentSignals, cost, startTime);
      } else {
        console.log('[MonitorService] Skipping database persistence - workflow service handles its own persistence');
      }

      // Update last analysis time
      this.lastAnalysisTime = new Date();

      // Track workflow service success if enabled
      if (this.config.workflowService?.url) {
        this.lastWorkflowServiceSuccess = new Date();
        this.workflowServiceConsecutiveFailures = 0;
        console.log(`[MonitorService] Workflow service success - consecutive failures reset to 0`);
      }

      const duration = Date.now() - startTime;
      
      // Record analysis in Opik integration
      this.opikIntegration.recordAnalysis(conditionId, duration, cost, true, agentSignals);

      console.log(`[MonitorService] Market analyzed successfully in ${duration}ms`);

      return recommendation;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Track workflow service failure if enabled
      if (this.config.workflowService?.url) {
        this.workflowServiceConsecutiveFailures++;
        console.error(
          `[MonitorService] Workflow service failure (consecutive: ${this.workflowServiceConsecutiveFailures}): ${errorMessage}`
        );
      } else {
        // Log error for local workflow execution
        console.error(`[MonitorService] Local workflow execution failed: ${errorMessage}`);
      }
      
      // Record failed analysis in Opik integration
      this.opikIntegration.recordAnalysis(conditionId, duration, 0, false, [], errorMessage);
      
      // Log full error details for debugging
      console.error(`[MonitorService] Market analysis failed after ${duration}ms:`, error);
      
      // Propagate error to caller - the caller (discoverAndAnalyze/updateExistingMarkets)
      // will catch this and continue processing other markets
      throw error;
    }
  }

  // ==========================================================================
  // Private Methods
  // ==========================================================================

  /**
   * Create scheduler with analysis cycle function
   */
  private createScheduler(): Scheduler {
    return createScheduler(() => this.discoverAndAnalyze());
  }

  /**
   * Discovery and analysis cycle
   * 
   * NOTE: Market updates from database are currently DISABLED.
   * The monitor only discovers and analyzes NEW markets from the Gamma API.
   * This prevents duplicate analysis when "new" markets are already in the database.
   * 
   * To re-enable updates: Uncomment the updateExistingMarkets() call below
   * and adjust quota allocation logic.
   */
  async discoverAndAnalyze(): Promise<void> {
    console.log('[MonitorService] Starting discovery and analysis cycle');

    // Start tracking cycle in Opik
    this.opikIntegration.startCycle();

    try {
      // Get configured max markets per cycle from environment (user has full control)
      const maxMarkets = parseInt(process.env.MAX_MARKETS_PER_CYCLE || '3', 10);
      
      console.log(`[MonitorService] Analyzing up to ${maxMarkets} NEW markets per cycle (updates disabled)`);

      // Discover new markets (use full quota for discovery since updates are disabled)
      const markets = await this.discovery.discoverMarkets(maxMarkets);
      console.log(`[MonitorService] Discovered ${markets.length} new markets for analysis`);
      
      // Record discovery in Opik
      this.opikIntegration.recordDiscovery(markets.length);

      // Analyze each discovered market
      // Error handling: Each market analysis is isolated - failures don't stop the cycle
      for (const market of markets) {
        try {
          await this.analyzeMarket(market.conditionId);
        } catch (error) {
          // Log error but continue processing other markets (Requirement 4.3)
          console.error(
            `[MonitorService] Failed to analyze market ${market.conditionId}, continuing with next market:`,
            error
          );
          // Health metrics are already updated in analyzeMarket() error handler
        }
      }

      // DISABLED: Update existing markets from database
      // 
      // Reason: Temporary disable to focus on new market discovery only.
      // This prevents duplicate analysis when "new" markets from Gamma API
      // are already in the database from previous cycles.
      // 
      // To re-enable:
      // 1. Uncomment the code below
      // 2. Adjust quota allocation (e.g., split maxMarkets between discovery and updates)
      // 3. Consider adding deduplication logic to check if discovered markets are already in DB
      // 
      // const updateQuota = maxMarkets - markets.length;
      // if (updateQuota > 0) {
      //   await this.updateExistingMarkets(updateQuota);
      // } else {
      //   console.log('[MonitorService] No quota remaining for market updates this cycle');
      // }
      
      console.log('[MonitorService] Market updates are currently disabled - only analyzing new markets');

      // End cycle and log metrics
      const cycleMetrics = this.opikIntegration.endCycle();
      if (cycleMetrics) {
        console.log('[MonitorService] Cycle metrics:\n' + formatCycleMetrics(cycleMetrics));
        
        // Log aggregate metrics every 10 cycles
        if (this.opikIntegration.getCycleHistory().length % 10 === 0) {
          const aggregateMetrics = this.opikIntegration.getAggregateMetrics();
          console.log('[MonitorService] Aggregate metrics:\n' + formatAggregateMetrics(aggregateMetrics));
        }
      }

      console.log('[MonitorService] Discovery and analysis cycle complete');
    } catch (error) {
      // End cycle even on error
      this.opikIntegration.endCycle();
      
      console.error('[MonitorService] Discovery and analysis cycle failed:', error);
      throw error;
    }
  }

  /**
   * Update existing markets
   * 
   * NOTE: This method is currently NOT CALLED by discoverAndAnalyze().
   * It is preserved for future re-enablement when market updates are needed.
   * 
   * To re-enable:
   * 1. Uncomment the call in discoverAndAnalyze()
   * 2. Adjust quota allocation between discovery and updates
   * 3. Consider adding deduplication logic
   * 
   * @param maxUpdates - Maximum number of markets to update (respects quota allocation)
   */
  async updateExistingMarkets(maxUpdates: number): Promise<void> {
    console.log(`[MonitorService] Updating existing markets (quota: ${maxUpdates})`);

    try {
      const updateIntervalHours = parseInt(process.env.UPDATE_INTERVAL_HOURS || '24', 10);
      const updateIntervalMs = updateIntervalHours * 60 * 60 * 1000;

      const allMarkets = await this.database.getMarketsForUpdate(updateIntervalMs);
      // Respect the allocated quota
      const markets = allMarkets.slice(0, maxUpdates);
      console.log(`[MonitorService] Found ${allMarkets.length} markets for update, processing ${markets.length} (limited by quota)`);

      for (const market of markets) {
        try {
          // Check if market is resolved before analyzing
          const resolutionStatus = await this.polymarketClient.checkMarketResolution(
            market.conditionId
          );

          if (resolutionStatus.resolved) {
            console.log(
              `[MonitorService] Market ${market.conditionId} is resolved with outcome: ${resolutionStatus.outcome}`
            );

            // Get market ID from database
            const client = this.supabaseManager.getClient();
            const { data: marketData, error } = await client
              .from('markets')
              .select('id')
              .eq('condition_id', market.conditionId)
              .single();

            if (!error && marketData) {
              await this.database.markMarketResolved(marketData.id, resolutionStatus.outcome);
              console.log(`[MonitorService] Market ${market.conditionId} marked as resolved`);
            }

            // Skip analysis for resolved markets
            continue;
          }

          // Market is still active, proceed with analysis
          await this.analyzeMarket(market.conditionId);
          
          // Record update in Opik
          this.opikIntegration.recordUpdate(market.conditionId);
        } catch (error) {
          // Log error but continue processing other markets (Requirement 4.3)
          console.error(
            `[MonitorService] Failed to update market ${market.conditionId}, continuing with next market:`,
            error
          );
          // Health metrics are already updated in analyzeMarket() error handler
        }
      }
    } catch (error) {
      console.error('[MonitorService] Update existing markets failed:', error);
      throw error;
    }
  }

  /**
   * Store analysis results in database
   */
  private async storeAnalysisResults(
    conditionId: string,
    recommendation: TradeRecommendation,
    agentSignals: AgentSignal[],
    cost: number,
    startTime: number
  ): Promise<void> {
    try {
      // Fetch market data from Polymarket
      const marketDataResult = await this.polymarketClient.fetchMarketData(conditionId);

      if (!marketDataResult.ok) {
        throw new Error(`Failed to fetch market data: ${marketDataResult.error.type}`);
      }

      const mbd = marketDataResult.data;

      // Store market
      const marketId = await this.database.upsertMarket({
        conditionId,
        question: mbd.question,
        description: mbd.resolutionCriteria,
        eventType: mbd.eventType,
        marketProbability: mbd.currentProbability,
        volume24h: mbd.volume24h,
        liquidity: mbd.liquidityScore,
        status: 'active',
      });

      // Store recommendation
      const recommendationId = await this.database.storeRecommendation(marketId, recommendation);

      // Store agent signals
      if (agentSignals.length > 0) {
        await this.database.storeAgentSignals(marketId, recommendationId, agentSignals);
      }

      // Record analysis
      await this.database.recordAnalysis(marketId, {
        type: 'initial',
        status: 'success',
        durationMs: Date.now() - startTime,
        costUsd: cost,
        agentsUsed: agentSignals.map((s) => s.agentName),
      });

      console.log('[MonitorService] Analysis results stored successfully');
    } catch (error) {
      console.error('[MonitorService] Failed to store analysis results:', error);
      // Don't throw - we want to continue even if storage fails
    }
  }

  /**
   * Check database connection
   */
  private async checkDatabaseConnection(): Promise<void> {
    try {
      const client = this.supabaseManager.getClient();
      const { error } = await client.from('markets').select('id').limit(1);

      this.isDatabaseConnected = !error;
      this.lastDatabaseCheck = new Date();

      if (error) {
        console.error('[MonitorService] Database connection check failed:', error);
      } else {
        console.log('[MonitorService] Database connection OK');
      }
    } catch (error) {
      this.isDatabaseConnected = false;
      this.lastDatabaseCheck = new Date();
      console.error('[MonitorService] Database connection check failed:', error);
    }
  }

  /**
   * Calculate overall health status
   */
  private calculateHealthStatus(): 'healthy' | 'degraded' | 'unhealthy' {
    if (!this.isDatabaseConnected) {
      return 'unhealthy';
    }

    if (!this.scheduler.isRunning()) {
      return 'degraded';
    }

    // Check workflow service health if enabled
    if (this.config.workflowService?.url) {
      // If we have 3 or more consecutive failures, mark as unhealthy
      if (this.workflowServiceConsecutiveFailures >= 3) {
        return 'unhealthy';
      }
      // If we have 1-2 consecutive failures, mark as degraded
      if (this.workflowServiceConsecutiveFailures > 0) {
        return 'degraded';
      }
    }

    return 'healthy';
  }

  /**
   * Set up signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    const handleShutdown = async (signal: string) => {
      console.log(`[MonitorService] Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on('SIGTERM', () => handleShutdown('SIGTERM'));
    process.on('SIGINT', () => handleShutdown('SIGINT'));
  }

  /**
   * Start daily quota reset scheduler
   */
  private startQuotaResetScheduler(): void {
    // Calculate time until next midnight UTC
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();

    // Schedule first reset at midnight
    setTimeout(() => {
      this.quotaManager.resetUsage();
      console.log('[MonitorService] Daily quota reset executed');

      // Schedule recurring resets every 24 hours
      setInterval(() => {
        this.quotaManager.resetUsage();
        console.log('[MonitorService] Daily quota reset executed');
      }, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    console.log(`[MonitorService] Quota reset scheduled for ${tomorrow.toISOString()}`);
  }
}

/**
 * Create a monitor service instance
 */
export function createMonitorService(
  config: EngineConfig,
  supabaseManager: SupabaseClientManager,
  database: DatabasePersistence,
  quotaManager: APIQuotaManager,
  discovery: MarketDiscoveryEngine,
  polymarketClient: PolymarketClient,
  opikHandler?: any
): MonitorService {
  return new AutomatedMarketMonitor(
    config,
    supabaseManager,
    database,
    quotaManager,
    discovery,
    polymarketClient,
    opikHandler
  );
}
