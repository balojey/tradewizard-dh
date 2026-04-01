/**
 * LangGraph Workflow Definition
 *
 * This module defines the Market Intelligence Engine workflow as a LangGraph StateGraph.
 * The workflow orchestrates the multi-agent debate protocol with Opik tracing.
 */

import { StateGraph, END, MemorySaver } from '@langchain/langgraph';
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import { OpikCallbackHandler } from 'opik-langchain';
import { GraphState, type GraphStateType } from './models/state.js';
import type { EngineConfig } from './config/index.js';
import type { PolymarketClient } from './utils/polymarket-client.js';
import type { TradeRecommendation, AgentSignal } from './models/types.js';
import { GraphExecutionLogger } from './utils/audit-logger.js';
import { createDataIntegrationLayer } from './utils/data-integration.js';
import { createPostgresCheckpointer } from './database/postgres-checkpointer.js';
import { createMemoryRetrievalService } from './database/memory-retrieval.js';
import type { SupabaseClientManager } from './database/supabase-client.js';
import {
  createMarketIngestionNode,
  createKeywordExtractionNode,
  createMemoryRetrievalNode,
  createAgentNodes,
  createThesisConstructionNode,
  createCrossExaminationNode,
  createConsensusEngineNode,
  createRecommendationGenerationNode,
  createDynamicAgentSelectionNode,
  createEventImpactAgentNode,
  createHistoricalPatternAgentNode,
  createSocialSentimentAgentNode,
  createNarrativeVelocityAgentNode,
  createMomentumAgentNode,
  createMeanReversionAgentNode,
  createCatalystAgentNode,
  createTailRiskAgentNode,
  createAgentSignalFusionNode,
  createRiskPhilosophyAgentNodes,
  createAutonomousPollingAgentNode,
  createAutonomousBreakingNewsAgentNode,
  createAutonomousMediaSentimentAgentNode,
  createAutonomousMarketMicrostructureAgentNode,
} from './nodes/index.js';
import { createWebResearchAgentNode } from './nodes/web-research-agent.js';

/**
 * Create the Market Intelligence Engine workflow
 *
 * This function builds the complete LangGraph StateGraph with all nodes,
 * edges, and Opik tracing integration. Includes NewsData.io integration
 * when enabled.
 *
 * @param config - Engine configuration
 * @param polymarketClient - Polymarket API client
 * @param supabaseManager - Optional Supabase client manager for PostgreSQL checkpointing
 * @returns Compiled and traced LangGraph application
 */
export async function createWorkflow(
  config: EngineConfig,
  polymarketClient: PolymarketClient,
  supabaseManager?: SupabaseClientManager,
  existingOpikHandler?: any
) {
  // Create data integration layer for external data sources
  // Note: 'newsdata' provider is handled by autonomous agents, not the legacy data layer
  const dataLayerConfig = {
    ...config.externalData,
    news: {
      ...config.externalData.news,
      provider: config.externalData.news.provider === 'newsdata' 
        ? 'none' as const
        : config.externalData.news.provider,
    },
  };
  const dataLayer = createDataIntegrationLayer(dataLayerConfig);

  // Create all node functions
  const marketIngestion = createMarketIngestionNode(polymarketClient);
  const keywordExtraction = createKeywordExtractionNode(config, existingOpikHandler);
  
  // Create memory retrieval service and node (Requirements 2.1, 5.2)
  // Define all agent names that need memory context
  const allAgentNames = [
    'market_microstructure',
    'probability_baseline',
    'risk_assessment',
    'breaking_news',
    'event_impact',
    'polling_intelligence',
    'historical_pattern',
    'media_sentiment',
    'social_sentiment',
    'narrative_velocity',
    'momentum',
    'mean_reversion',
    'catalyst',
    'tail_risk',
  ];
  
  let memoryRetrieval;
  if (supabaseManager) {
    const memoryService = createMemoryRetrievalService(supabaseManager);
    memoryRetrieval = createMemoryRetrievalNode(memoryService, allAgentNames, config);
  } else {
    // Fallback: create a no-op memory retrieval node if no Supabase manager
    memoryRetrieval = async (_state: GraphStateType) => ({
      memoryContext: new Map(),
      auditLog: [
        {
          stage: 'memory_retrieval',
          timestamp: Date.now(),
          data: {
            success: false,
            reason: 'No Supabase manager available',
            duration: 0,
          },
        },
      ],
    });
  }
  
  // Create agents using standard agent nodes
  const agents = createAgentNodes(config);
  
  const thesisConstruction = createThesisConstructionNode(config);
  const crossExamination = createCrossExaminationNode(config);
  const consensusEngine = createConsensusEngineNode(config, supabaseManager);
  const recommendationGeneration = createRecommendationGenerationNode(config);

  // Create advanced agent nodes
  const dynamicAgentSelection = createDynamicAgentSelectionNode(config, dataLayer);
  const eventImpactAgent = createEventImpactAgentNode(config);
  
  // Create polling agent - always use autonomous version (Requirements 10)
  // Log warning if config tries to disable autonomous mode
  if (!config.pollingAgent.autonomous) {
    console.warn('[Workflow] Non-autonomous polling agent is deprecated and removed. Using autonomous version.');
  }
  const pollingIntelligenceAgent = createAutonomousPollingAgentNode(config);
  
  // Create news agents - always use autonomous versions (Requirements 10)
  // Log warnings if config tries to disable autonomous mode
  if (!config.newsAgents.breakingNewsAgent.autonomous) {
    console.warn('[Workflow] Non-autonomous breaking news agent is deprecated and removed. Using autonomous version.');
  }
  const breakingNewsAgentNode = createAutonomousBreakingNewsAgentNode(config);
  
  if (!config.newsAgents.mediaSentimentAgent.autonomous) {
    console.warn('[Workflow] Non-autonomous media sentiment agent is deprecated and removed. Using autonomous version.');
  }
  const mediaSentimentAgentNode = createAutonomousMediaSentimentAgentNode(config);
  
  if (!config.newsAgents.marketMicrostructureAgent.autonomous) {
    console.warn('[Workflow] Non-autonomous market microstructure agent is deprecated and removed. Using autonomous version.');
  }
  const marketMicrostructureAgentNode = createAutonomousMarketMicrostructureAgentNode(config);
  
  // Create Web Research Agent (always created, but may be a passthrough if disabled)
  const webResearchEnabled = config.webResearch?.enabled !== false;
  const webResearchAgent = webResearchEnabled
    ? createWebResearchAgentNode(config)
    : async (state: GraphStateType) => state; // passthrough no-op
  
  const historicalPatternAgent = createHistoricalPatternAgentNode(config);
  const socialSentimentAgent = createSocialSentimentAgentNode(config);
  const narrativeVelocityAgent = createNarrativeVelocityAgentNode(config);
  const momentumAgent = createMomentumAgentNode(config);
  const meanReversionAgent = createMeanReversionAgentNode(config);
  const catalystAgent = createCatalystAgentNode(config);
  const tailRiskAgent = createTailRiskAgentNode(config);
  const agentSignalFusion = createAgentSignalFusionNode(config);
  const riskPhilosophyAgents = createRiskPhilosophyAgentNodes(config);

  // Create the StateGraph
  const workflow = new StateGraph(GraphState)
    // Add all nodes to the graph
    .addNode('market_ingestion', marketIngestion)
    .addNode('memory_retrieval', memoryRetrieval)
    .addNode('web_research', webResearchAgent)
    .addNode('keyword_extraction', keywordExtraction)
    .addNode('dynamic_agent_selection', dynamicAgentSelection)
    
    // MVP agents (conditionally autonomous based on configuration)
    .addNode('market_microstructure_agent', marketMicrostructureAgentNode)
    .addNode('probability_baseline_agent', agents.probabilityBaselineAgent)
    .addNode('risk_assessment_agent', agents.riskAssessmentAgent)
    
    // Event Intelligence agents (conditionally autonomous based on configuration)
    .addNode('breaking_news_agent', breakingNewsAgentNode)
    .addNode('event_impact_agent', eventImpactAgent)
    
    // Polling & Statistical agents
    .addNode('polling_intelligence_agent', pollingIntelligenceAgent)
    .addNode('historical_pattern_agent', historicalPatternAgent)
    
    // Sentiment & Narrative agents (conditionally autonomous based on configuration)
    .addNode('media_sentiment_agent', mediaSentimentAgentNode)
    .addNode('social_sentiment_agent', socialSentimentAgent)
    .addNode('narrative_velocity_agent', narrativeVelocityAgent)
    
    // Price Action agents
    .addNode('momentum_agent', momentumAgent)
    .addNode('mean_reversion_agent', meanReversionAgent)
    
    // Event Scenario agents
    .addNode('catalyst_agent', catalystAgent)
    .addNode('tail_risk_agent', tailRiskAgent)
    
    // Signal fusion
    .addNode('agent_signal_fusion', agentSignalFusion)
    
    // Debate protocol nodes
    .addNode('thesis_construction', thesisConstruction)
    .addNode('cross_examination', crossExamination)
    .addNode('consensus_engine', consensusEngine)
    
    // Risk Philosophy agents
    .addNode('risk_philosophy_aggressive', riskPhilosophyAgents.aggressiveAgent)
    .addNode('risk_philosophy_conservative', riskPhilosophyAgents.conservativeAgent)
    .addNode('risk_philosophy_neutral', riskPhilosophyAgents.neutralAgent)
    
    .addNode('recommendation_generation', recommendationGeneration)

    // Define entry edge from START to market_ingestion
    .addEdge('__start__', 'market_ingestion')

    // Add conditional edge from ingestion (error handling)
    .addConditionalEdges(
      'market_ingestion',
      (state: GraphStateType) => {
        // If ingestion failed, end early
        if (state.ingestionError) {
          return 'error';
        }
        // Otherwise, proceed to memory retrieval
        return 'memory_retrieval';
      },
      {
        memory_retrieval: 'memory_retrieval',
        error: END,
      }
    )

    // Add edge from memory retrieval to web research or keyword extraction
    if (webResearchEnabled) {
      workflow.addEdge('memory_retrieval', 'web_research');
      workflow.addEdge('web_research', 'keyword_extraction');
    } else {
      workflow.addEdge('memory_retrieval', 'keyword_extraction');
    }

    // Add edge from keyword extraction to dynamic agent selection
    workflow.addEdge('keyword_extraction', 'dynamic_agent_selection');

    // Add parallel edges from dynamic_agent_selection to all agent nodes
    // MVP agents (always active)
    workflow.addEdge('dynamic_agent_selection', 'market_microstructure_agent');
    workflow.addEdge('dynamic_agent_selection', 'probability_baseline_agent');
    workflow.addEdge('dynamic_agent_selection', 'risk_assessment_agent');
    
    // Advanced agents (conditionally active based on dynamic selection)
    workflow.addEdge('dynamic_agent_selection', 'breaking_news_agent');
    workflow.addEdge('dynamic_agent_selection', 'event_impact_agent');
    workflow.addEdge('dynamic_agent_selection', 'polling_intelligence_agent');
    workflow.addEdge('dynamic_agent_selection', 'historical_pattern_agent');
    workflow.addEdge('dynamic_agent_selection', 'media_sentiment_agent');
    workflow.addEdge('dynamic_agent_selection', 'social_sentiment_agent');
    workflow.addEdge('dynamic_agent_selection', 'narrative_velocity_agent');
    workflow.addEdge('dynamic_agent_selection', 'momentum_agent');
    workflow.addEdge('dynamic_agent_selection', 'mean_reversion_agent');
    workflow.addEdge('dynamic_agent_selection', 'catalyst_agent');
    workflow.addEdge('dynamic_agent_selection', 'tail_risk_agent');

    // Add edges from all agents to signal fusion
    // LangGraph waits for all parallel nodes to complete before proceeding
    workflow.addEdge('market_microstructure_agent', 'agent_signal_fusion');
    workflow.addEdge('probability_baseline_agent', 'agent_signal_fusion');
    workflow.addEdge('risk_assessment_agent', 'agent_signal_fusion');
    workflow.addEdge('breaking_news_agent', 'agent_signal_fusion');
    workflow.addEdge('event_impact_agent', 'agent_signal_fusion');
    workflow.addEdge('polling_intelligence_agent', 'agent_signal_fusion');
    workflow.addEdge('historical_pattern_agent', 'agent_signal_fusion');
    workflow.addEdge('media_sentiment_agent', 'agent_signal_fusion');
    workflow.addEdge('social_sentiment_agent', 'agent_signal_fusion');
    workflow.addEdge('narrative_velocity_agent', 'agent_signal_fusion');
    workflow.addEdge('momentum_agent', 'agent_signal_fusion');
    workflow.addEdge('mean_reversion_agent', 'agent_signal_fusion');
    workflow.addEdge('catalyst_agent', 'agent_signal_fusion');
    workflow.addEdge('tail_risk_agent', 'agent_signal_fusion');

    // Add edge from signal fusion to thesis construction
    workflow.addEdge('agent_signal_fusion', 'thesis_construction');

    // Add sequential edges through debate protocol
    workflow.addEdge('thesis_construction', 'cross_examination');
    workflow.addEdge('cross_examination', 'consensus_engine');
    
    // Add parallel edges from consensus to risk philosophy agents
    workflow.addEdge('consensus_engine', 'risk_philosophy_aggressive');
    workflow.addEdge('consensus_engine', 'risk_philosophy_conservative');
    workflow.addEdge('consensus_engine', 'risk_philosophy_neutral');
    
    // Add edges from risk philosophy agents to recommendation generation
    workflow.addEdge('risk_philosophy_aggressive', 'recommendation_generation');
    workflow.addEdge('risk_philosophy_conservative', 'recommendation_generation');
    workflow.addEdge('risk_philosophy_neutral', 'recommendation_generation');

    // Add edge from recommendation to END
    workflow.addEdge('recommendation_generation', END);

  // Create checkpointer based on configuration
  const checkpointer = await createCheckpointer(config, supabaseManager);

  // Compile the graph with checkpointer
  const app = workflow.compile({
    checkpointer,
  });

  // Initialize OpikCallbackHandler (use existing or create new)
  const opikHandler = existingOpikHandler || new OpikCallbackHandler({
    projectName: config.opik.projectName,
  });

  // Return the compiled app and handler
  // Note: Opik integration happens at invocation time via callbacks
  return {
    app,
    opikHandler,
  };
}

/**
 * Create checkpointer based on configuration
 *
 * @param config - Engine configuration
 * @param supabaseManager - Optional Supabase client manager for PostgreSQL checkpointing
 * @returns Checkpointer instance
 */
async function createCheckpointer(
  config: EngineConfig,
  supabaseManager?: SupabaseClientManager
): Promise<BaseCheckpointSaver> {
  switch (config.langgraph.checkpointer) {
    case 'memory':
      return new MemorySaver();
    case 'sqlite':
      // TODO: Implement SqliteSaver when needed
      throw new Error('SqliteSaver not yet implemented');
    case 'postgres':
      if (!supabaseManager) {
        throw new Error(
          'PostgreSQL checkpointer requires Supabase client manager. Pass supabaseManager to createWorkflow().'
        );
      }
      try {
        return await createPostgresCheckpointer(supabaseManager);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn('[Workflow] PostgreSQL checkpointer failed, falling back to memory:', errorMessage);
        return new MemorySaver();
      }
    default:
      return new MemorySaver();
  }
}

/**
 * Get checkpointer instance for audit trail retrieval
 *
 * This function creates a checkpointer instance that can be used
 * to retrieve audit trails and inspect graph state.
 *
 * @param config - Engine configuration
 * @param supabaseManager - Optional Supabase client manager for PostgreSQL checkpointing
 * @returns Checkpointer instance
 */
export async function getCheckpointer(
  config: EngineConfig,
  supabaseManager?: SupabaseClientManager
): Promise<BaseCheckpointSaver> {
  return await createCheckpointer(config, supabaseManager);
}

/**
 * Analysis result containing recommendation and agent signals
 */
export interface AnalysisResult {
  recommendation: TradeRecommendation | null;
  agentSignals: AgentSignal[];
  cost?: number;
}

/**
 * Analyze a prediction market
 *
 * This function routes to either local workflow execution or remote workflow service
 * based on configuration. The caller doesn't need to know which execution method is used.
 *
 * @param conditionId - Polymarket condition ID to analyze
 * @param config - Engine configuration
 * @param polymarketClient - Polymarket API client (only used for local execution)
 * @param supabaseManager - Optional Supabase client manager (only used for local execution)
 * @param existingOpikHandler - Optional Opik handler (only used for local execution)
 * @returns Analysis result with recommendation and agent signals
 */
export async function analyzeMarket(
  conditionId: string,
  config: EngineConfig,
  polymarketClient: PolymarketClient,
  supabaseManager?: SupabaseClientManager,
  existingOpikHandler?: any
): Promise<AnalysisResult> {
  // Check if workflow service URL is configured (Requirements 1.2, 1.3, 9.1, 9.2)
  if (config.workflowService?.url) {
    console.log(`[Workflow] Using workflow service at ${config.workflowService.url}`);
    return executeRemoteWorkflow(conditionId, config);
  }

  console.log('[Workflow] Using local workflow execution');
  return executeLocalWorkflow(
    conditionId,
    config,
    polymarketClient,
    supabaseManager,
    existingOpikHandler
  );
}

/**
 * Execute workflow via remote service
 *
 * @param conditionId - Polymarket condition ID to analyze
 * @param config - Engine configuration
 * @returns Analysis result from workflow service
 */
async function executeRemoteWorkflow(
  conditionId: string,
  config: EngineConfig
): Promise<AnalysisResult> {
  const { createWorkflowServiceClient } = await import('./utils/workflow-service-client.js');
  const client = createWorkflowServiceClient(config);

  if (!client) {
    throw new Error('Workflow service client could not be created');
  }

  return client.analyzeMarket(conditionId);
}

/**
 * Execute workflow locally (existing implementation)
 *
 * @param conditionId - Polymarket condition ID to analyze
 * @param config - Engine configuration
 * @param polymarketClient - Polymarket API client
 * @param supabaseManager - Optional Supabase client manager for PostgreSQL checkpointing
 * @param existingOpikHandler - Optional Opik handler
 * @returns Analysis result with recommendation and agent signals
 */
async function executeLocalWorkflow(
  conditionId: string,
  config: EngineConfig,
  polymarketClient: PolymarketClient,
  supabaseManager?: SupabaseClientManager,
  existingOpikHandler?: any
): Promise<AnalysisResult> {
  // Create structured logger for this execution
  const logger = new GraphExecutionLogger();
  logger.info('workflow', 'Starting market analysis', { conditionId });

  // Create the workflow
  const { app, opikHandler } = await createWorkflow(config, polymarketClient, supabaseManager, existingOpikHandler);

  try {
    // Execute the workflow with thread_id for checkpointing and tracing
    logger.info('workflow', 'Invoking LangGraph workflow');
    const result = await app.invoke(
      { conditionId },
      {
        configurable: {
          thread_id: conditionId, // Used for both LangGraph checkpointing and Opik thread tracking
        },
        callbacks: [opikHandler], // Add Opik handler as callback for automatic tracing
      }
    );

    // Flush Opik traces before returning
    logger.info('workflow', 'Flushing Opik traces');
    await opikHandler.flushAsync();

    logger.info('workflow', 'Market analysis completed successfully', {
      action: result.recommendation?.action,
      expectedValue: result.recommendation?.expectedValue,
      agentSignalsCount: result.agentSignals?.length || 0,
    });

    // Return the analysis result with recommendation and agent signals
    return {
      recommendation: result.recommendation,
      agentSignals: result.agentSignals || [],
      cost: 0, // TODO: Extract cost from Opik traces
    };
  } catch (error) {
    logger.error('workflow', 'Market analysis failed', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Attempt to flush Opik traces even on error
    try {
      await opikHandler.flushAsync();
    } catch (flushError) {
      logger.error('workflow', 'Failed to flush Opik traces', {
        error: flushError instanceof Error ? flushError.message : String(flushError),
      });
    }

    throw error;
  }
}
