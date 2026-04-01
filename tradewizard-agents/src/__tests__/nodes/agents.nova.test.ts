/**
 * Nova integration tests for agent nodes
 *
 * Tests that agent nodes work correctly with Amazon Nova models.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAgentNode, createLLMInstances } from './agents.js';
import type { GraphStateType } from '../models/state.js';
import type { MarketBriefingDocument } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// Mock ChatBedrockConverse for Nova
vi.mock('@langchain/aws', () => ({
  ChatBedrockConverse: class MockChatBedrockConverse {
    constructor(config?: any) {
      // Accept config but don't require it for mocking
    }
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockResolvedValue({
          confidence: 0.72,
          direction: 'YES',
          fairProbability: 0.62,
          keyDrivers: ['Nova analysis factor 1', 'Nova analysis factor 2', 'Nova analysis factor 3'],
          riskFactors: ['Nova identified risk'],
          metadata: { provider: 'nova' },
        }),
      };
    }
  },
}));

// Mock BedrockClient
vi.mock('../utils/bedrock-client.js', () => ({
  BedrockClient: class MockBedrockClient {
    constructor(config?: any) {
      // Accept config but don't require it for mocking
    }
    createChatModel() {
      // Return a mock ChatBedrockConverse instance
      return {
        withStructuredOutput: () => ({
          invoke: vi.fn().mockResolvedValue({
            confidence: 0.72,
            direction: 'YES',
            fairProbability: 0.62,
            keyDrivers: ['Nova analysis factor 1', 'Nova analysis factor 2', 'Nova analysis factor 3'],
            riskFactors: ['Nova identified risk'],
            metadata: { provider: 'nova' },
          }),
        }),
      };
    }
    static validateModelId() {
      return true;
    }
    static getAvailableModels() {
      return [
        { id: 'micro', name: 'Nova Micro', modelId: 'amazon.nova-micro-v1:0' },
        { id: 'lite', name: 'Nova Lite', modelId: 'amazon.nova-lite-v1:0' },
        { id: 'pro', name: 'Nova Pro', modelId: 'amazon.nova-pro-v1:0' },
      ];
    }
  },
}));

// Mock other LLM providers
vi.mock('@langchain/openai', () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockResolvedValue({
          confidence: 0.75,
          direction: 'YES',
          fairProbability: 0.65,
          keyDrivers: ['OpenAI factor 1', 'OpenAI factor 2'],
          riskFactors: ['OpenAI risk'],
          metadata: {},
        }),
      };
    }
  },
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: class MockChatAnthropic {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockResolvedValue({
          confidence: 0.70,
          direction: 'NO',
          fairProbability: 0.45,
          keyDrivers: ['Anthropic factor 1'],
          riskFactors: ['Anthropic risk'],
          metadata: {},
        }),
      };
    }
  },
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: class MockChatGoogleGenerativeAI {
    constructor() {}
    withStructuredOutput() {
      return {
        invoke: vi.fn().mockResolvedValue({
          confidence: 0.80,
          direction: 'NEUTRAL',
          fairProbability: 0.50,
          keyDrivers: ['Google factor 1'],
          riskFactors: ['Google risk'],
          metadata: {},
        }),
      };
    }
  },
}));

describe('Agent Nodes - Nova Integration', () => {
  // Sample Market Briefing Document for testing
  const sampleMBD: MarketBriefingDocument = {
    marketId: 'test-market-123',
    conditionId: 'test-condition-456',
    eventType: 'election',
    question: 'Will candidate X win the election?',
    resolutionCriteria: 'Resolves YES if candidate X is declared winner by official sources',
    expiryTimestamp: Date.now() + 86400000,
    currentProbability: 0.55,
    liquidityScore: 7.5,
    bidAskSpread: 2.5,
    volatilityRegime: 'medium',
    volume24h: 50000,
    metadata: {
      ambiguityFlags: [],
      keyCatalysts: [{ event: 'Debate', timestamp: Date.now() + 3600000 }],
    },
  };

  // Sample graph state with MBD
  const sampleState: GraphStateType = {
    conditionId: 'test-condition-456',
    mbd: sampleMBD,
    ingestionError: null,
    agentSignals: [],
    agentErrors: [],
    bullThesis: null,
    bearThesis: null,
    debateRecord: null,
    consensus: null,
    consensusError: null,
    recommendation: null,
    auditLog: [],
  };

  describe('Single-provider mode with Nova', () => {
    it('should create LLM instances using Nova when configured as single provider', () => {
      const config: EngineConfig = {
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          eventsApiEndpoint: '/events',
          includeRelatedTags: true,
          maxEventsPerDiscovery: 20,
          maxMarketsPerEvent: 50,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: true,
          correlationThreshold: 0.3,
          arbitrageThreshold: 0.05,
          eventsApiRateLimit: 500,
          maxRequestsPerMinute: 60,
          rateLimitWindowMs: 60000,
          eventCacheTTL: 300,
          marketCacheTTL: 300,
          tagCacheTTL: 3600,
          correlationCacheTTL: 1800,
          enableEventBasedKeywords: true,
          enableMultiMarketAnalysis: true,
          enableCrossMarketCorrelation: true,
          enableArbitrageDetection: true,
          enableEventLevelIntelligence: true,
          enableEnhancedEventDiscovery: true,
          enableMultiMarketFiltering: true,
          enableEventRankingAlgorithm: true,
          enableCrossMarketOpportunities: true,
          maxRetries: 3,
          circuitBreakerThreshold: 5,
          fallbackToCache: true,
          enableGracefulDegradation: true,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'moderate',
          environment: 'development',
          environmentConfigs: {},
        },
        langgraph: {
          checkpointer: 'memory',
          recursionLimit: 25,
          streamMode: 'values',
        },
        opik: {
          projectName: 'test-project',
          trackCosts: true,
          tags: [],
        },
        llm: {
          singleProvider: 'nova',
          nova: {
            modelName: 'amazon.nova-lite-v1:0',
            awsRegion: 'us-east-1',
            temperature: 0.7,
          },
        },
        agents: {
          timeoutMs: 10000,
          minAgentsRequired: 2,
        },
        consensus: {
          minEdgeThreshold: 0.05,
          highDisagreementThreshold: 0.15,
        },
        logging: {
          level: 'info',
          auditTrailRetentionDays: 30,
        },
        advancedAgents: {
          eventIntelligence: { enabled: false, breakingNews: true, eventImpact: true },
          pollingStatistical: { enabled: false, pollingIntelligence: true, historicalPattern: true },
          sentimentNarrative: { enabled: false, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
          priceAction: { enabled: false, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
          eventScenario: { enabled: false, catalyst: true, tailRisk: true },
          riskPhilosophy: { enabled: false, aggressive: true, conservative: true, neutral: true },
        },
        externalData: {
          news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
          polling: { provider: 'none', cacheTTL: 3600 },
          social: { providers: [], cacheTTL: 300, maxMentions: 100 },
        },
        signalFusion: {
          baseWeights: {},
          contextAdjustments: true,
          conflictThreshold: 0.20,
          alignmentBonus: 0.20,
        },
        costOptimization: {
          maxCostPerAnalysis: 2.0,
          skipLowImpactAgents: false,
          batchLLMRequests: true,
        },
        performanceTracking: {
          enabled: false,
          evaluateOnResolution: true,
          minSampleSize: 10,
        },
      };

      const llms = createLLMInstances(config);

      // All agents should use the same Nova instance in single-provider mode
      expect(llms.marketMicrostructure).toBeDefined();
      expect(llms.probabilityBaseline).toBeDefined();
      expect(llms.riskAssessment).toBeDefined();
    });

    it('should execute agent node successfully with Nova', async () => {
      const config: EngineConfig = {
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          eventsApiEndpoint: '/events',
          includeRelatedTags: true,
          maxEventsPerDiscovery: 20,
          maxMarketsPerEvent: 50,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: true,
          correlationThreshold: 0.3,
          arbitrageThreshold: 0.05,
          eventsApiRateLimit: 500,
          maxRequestsPerMinute: 60,
          rateLimitWindowMs: 60000,
          eventCacheTTL: 300,
          marketCacheTTL: 300,
          tagCacheTTL: 3600,
          correlationCacheTTL: 1800,
          enableEventBasedKeywords: true,
          enableMultiMarketAnalysis: true,
          enableCrossMarketCorrelation: true,
          enableArbitrageDetection: true,
          enableEventLevelIntelligence: true,
          enableEnhancedEventDiscovery: true,
          enableMultiMarketFiltering: true,
          enableEventRankingAlgorithm: true,
          enableCrossMarketOpportunities: true,
          maxRetries: 3,
          circuitBreakerThreshold: 5,
          fallbackToCache: true,
          enableGracefulDegradation: true,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'moderate',
          environment: 'development',
          environmentConfigs: {},
        },
        langgraph: {
          checkpointer: 'memory',
          recursionLimit: 25,
          streamMode: 'values',
        },
        opik: {
          projectName: 'test-project',
          trackCosts: true,
          tags: [],
        },
        llm: {
          singleProvider: 'nova',
          nova: {
            modelName: 'amazon.nova-lite-v1:0',
            awsRegion: 'us-east-1',
            temperature: 0.7,
          },
        },
        agents: {
          timeoutMs: 10000,
          minAgentsRequired: 2,
        },
        consensus: {
          minEdgeThreshold: 0.05,
          highDisagreementThreshold: 0.15,
        },
        logging: {
          level: 'info',
          auditTrailRetentionDays: 30,
        },
        advancedAgents: {
          eventIntelligence: { enabled: false, breakingNews: true, eventImpact: true },
          pollingStatistical: { enabled: false, pollingIntelligence: true, historicalPattern: true },
          sentimentNarrative: { enabled: false, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
          priceAction: { enabled: false, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
          eventScenario: { enabled: false, catalyst: true, tailRisk: true },
          riskPhilosophy: { enabled: false, aggressive: true, conservative: true, neutral: true },
        },
        externalData: {
          news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
          polling: { provider: 'none', cacheTTL: 3600 },
          social: { providers: [], cacheTTL: 300, maxMentions: 100 },
        },
        signalFusion: {
          baseWeights: {},
          contextAdjustments: true,
          conflictThreshold: 0.20,
          alignmentBonus: 0.20,
        },
        costOptimization: {
          maxCostPerAnalysis: 2.0,
          skipLowImpactAgents: false,
          batchLLMRequests: true,
        },
        performanceTracking: {
          enabled: false,
          evaluateOnResolution: true,
          minSampleSize: 10,
        },
      };

      const llms = createLLMInstances(config);
      const agentNode = createAgentNode('test_nova_agent', llms.marketMicrostructure, 'Test system prompt');

      const result = await agentNode(sampleState);

      // Verify agent executed successfully
      expect(result.agentSignals).toBeDefined();
      expect(result.agentSignals?.length).toBe(1);
      expect(result.agentSignals?.[0].agentName).toBe('test_nova_agent');
      expect(result.agentSignals?.[0].confidence).toBeGreaterThan(0);
      expect(result.agentSignals?.[0].fairProbability).toBeGreaterThanOrEqual(0);
      expect(result.agentSignals?.[0].fairProbability).toBeLessThanOrEqual(1);
    });
  });

  describe('Multi-provider mode with Nova fallback', () => {
    it('should use Nova as fallback when other providers not configured', () => {
      const config: EngineConfig = {
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          eventsApiEndpoint: '/events',
          includeRelatedTags: true,
          maxEventsPerDiscovery: 20,
          maxMarketsPerEvent: 50,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: true,
          correlationThreshold: 0.3,
          arbitrageThreshold: 0.05,
          eventsApiRateLimit: 500,
          maxRequestsPerMinute: 60,
          rateLimitWindowMs: 60000,
          eventCacheTTL: 300,
          marketCacheTTL: 300,
          tagCacheTTL: 3600,
          correlationCacheTTL: 1800,
          enableEventBasedKeywords: true,
          enableMultiMarketAnalysis: true,
          enableCrossMarketCorrelation: true,
          enableArbitrageDetection: true,
          enableEventLevelIntelligence: true,
          enableEnhancedEventDiscovery: true,
          enableMultiMarketFiltering: true,
          enableEventRankingAlgorithm: true,
          enableCrossMarketOpportunities: true,
          maxRetries: 3,
          circuitBreakerThreshold: 5,
          fallbackToCache: true,
          enableGracefulDegradation: true,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'moderate',
          environment: 'development',
          environmentConfigs: {},
        },
        langgraph: {
          checkpointer: 'memory',
          recursionLimit: 25,
          streamMode: 'values',
        },
        opik: {
          projectName: 'test-project',
          trackCosts: true,
          tags: [],
        },
        llm: {
          // No single provider, only Nova configured
          nova: {
            modelName: 'amazon.nova-lite-v1:0',
            awsRegion: 'us-east-1',
            temperature: 0.7,
          },
        },
        agents: {
          timeoutMs: 10000,
          minAgentsRequired: 2,
        },
        consensus: {
          minEdgeThreshold: 0.05,
          highDisagreementThreshold: 0.15,
        },
        logging: {
          level: 'info',
          auditTrailRetentionDays: 30,
        },
        advancedAgents: {
          eventIntelligence: { enabled: false, breakingNews: true, eventImpact: true },
          pollingStatistical: { enabled: false, pollingIntelligence: true, historicalPattern: true },
          sentimentNarrative: { enabled: false, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
          priceAction: { enabled: false, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
          eventScenario: { enabled: false, catalyst: true, tailRisk: true },
          riskPhilosophy: { enabled: false, aggressive: true, conservative: true, neutral: true },
        },
        externalData: {
          news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
          polling: { provider: 'none', cacheTTL: 3600 },
          social: { providers: [], cacheTTL: 300, maxMentions: 100 },
        },
        signalFusion: {
          baseWeights: {},
          contextAdjustments: true,
          conflictThreshold: 0.20,
          alignmentBonus: 0.20,
        },
        costOptimization: {
          maxCostPerAnalysis: 2.0,
          skipLowImpactAgents: false,
          batchLLMRequests: true,
        },
        performanceTracking: {
          enabled: false,
          evaluateOnResolution: true,
          minSampleSize: 10,
        },
      };

      const llms = createLLMInstances(config);

      // Should successfully create LLM instances using Nova as fallback
      expect(llms.marketMicrostructure).toBeDefined();
      expect(llms.probabilityBaseline).toBeDefined();
      expect(llms.riskAssessment).toBeDefined();
    });
  });

  describe('State consistency with Nova', () => {
    it('should maintain state consistency when using Nova', async () => {
      const config: EngineConfig = {
        polymarket: {
          gammaApiUrl: 'https://gamma-api.polymarket.com',
          clobApiUrl: 'https://clob.polymarket.com',
          rateLimitBuffer: 80,
          politicsTagId: 2,
          eventsApiEndpoint: '/events',
          includeRelatedTags: true,
          maxEventsPerDiscovery: 20,
          maxMarketsPerEvent: 50,
          defaultSortBy: 'volume24hr',
          enableCrossMarketAnalysis: true,
          correlationThreshold: 0.3,
          arbitrageThreshold: 0.05,
          eventsApiRateLimit: 500,
          maxRequestsPerMinute: 60,
          rateLimitWindowMs: 60000,
          eventCacheTTL: 300,
          marketCacheTTL: 300,
          tagCacheTTL: 3600,
          correlationCacheTTL: 1800,
          enableEventBasedKeywords: true,
          enableMultiMarketAnalysis: true,
          enableCrossMarketCorrelation: true,
          enableArbitrageDetection: true,
          enableEventLevelIntelligence: true,
          enableEnhancedEventDiscovery: true,
          enableMultiMarketFiltering: true,
          enableEventRankingAlgorithm: true,
          enableCrossMarketOpportunities: true,
          maxRetries: 3,
          circuitBreakerThreshold: 5,
          fallbackToCache: true,
          enableGracefulDegradation: true,
          keywordExtractionMode: 'event_priority',
          correlationAnalysisDepth: 'basic',
          riskAssessmentLevel: 'moderate',
          environment: 'development',
          environmentConfigs: {},
        },
        langgraph: {
          checkpointer: 'memory',
          recursionLimit: 25,
          streamMode: 'values',
        },
        opik: {
          projectName: 'test-project',
          trackCosts: true,
          tags: [],
        },
        llm: {
          singleProvider: 'nova',
          nova: {
            modelName: 'amazon.nova-lite-v1:0',
            awsRegion: 'us-east-1',
            temperature: 0.7,
          },
        },
        agents: {
          timeoutMs: 10000,
          minAgentsRequired: 2,
        },
        consensus: {
          minEdgeThreshold: 0.05,
          highDisagreementThreshold: 0.15,
        },
        logging: {
          level: 'info',
          auditTrailRetentionDays: 30,
        },
        advancedAgents: {
          eventIntelligence: { enabled: false, breakingNews: true, eventImpact: true },
          pollingStatistical: { enabled: false, pollingIntelligence: true, historicalPattern: true },
          sentimentNarrative: { enabled: false, mediaSentiment: true, socialSentiment: true, narrativeVelocity: true },
          priceAction: { enabled: false, momentum: true, meanReversion: true, minVolumeThreshold: 1000 },
          eventScenario: { enabled: false, catalyst: true, tailRisk: true },
          riskPhilosophy: { enabled: false, aggressive: true, conservative: true, neutral: true },
        },
        externalData: {
          news: { provider: 'none', cacheTTL: 900, maxArticles: 20 },
          polling: { provider: 'none', cacheTTL: 3600 },
          social: { providers: [], cacheTTL: 300, maxMentions: 100 },
        },
        signalFusion: {
          baseWeights: {},
          contextAdjustments: true,
          conflictThreshold: 0.20,
          alignmentBonus: 0.20,
        },
        costOptimization: {
          maxCostPerAnalysis: 2.0,
          skipLowImpactAgents: false,
          batchLLMRequests: true,
        },
        performanceTracking: {
          enabled: false,
          evaluateOnResolution: true,
          minSampleSize: 10,
        },
      };

      const llms = createLLMInstances(config);
      const agentNode = createAgentNode('test_nova_agent', llms.marketMicrostructure, 'Test system prompt');

      // Execute agent and verify state structure is preserved
      const result = await agentNode(sampleState);

      // Verify state structure matches expected format
      expect(result).toHaveProperty('agentSignals');
      expect(result).toHaveProperty('auditLog');
      
      // Verify original state fields are not modified
      expect(sampleState.conditionId).toBe('test-condition-456');
      expect(sampleState.mbd).toBeDefined();
      
      // Verify agent signal has correct structure
      if (result.agentSignals && result.agentSignals.length > 0) {
        const signal = result.agentSignals[0];
        expect(signal).toHaveProperty('agentName');
        expect(signal).toHaveProperty('confidence');
        expect(signal).toHaveProperty('direction');
        expect(signal).toHaveProperty('fairProbability');
        expect(signal).toHaveProperty('keyDrivers');
        expect(signal).toHaveProperty('riskFactors');
        expect(signal).toHaveProperty('timestamp');
      }
    });
  });
});
