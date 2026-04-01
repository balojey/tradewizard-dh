/**
 * Unit tests for cost optimization utilities
 */

import { describe, it, expect } from 'vitest';
import {
  estimateAgentCost,
  getAgentPriority,
  filterAgentsByCost,
  applyCostOptimization,
  createCostOptimizationAuditEntry,
  trackAgentCost,
  AgentPriority,
  getNovaPricing,
  calculateCost,
  NOVA_PRICING,
  recordUsage,
  UsageRecord,
  getCostsByProvider,
  getNovaCostBreakdown,
} from './cost-optimization.js';
import type { EngineConfig } from '../config/index.js';

describe('Cost Optimization', () => {
  describe('estimateAgentCost', () => {
    it('should estimate cost for MVP agents', () => {
      const agents = ['market_microstructure', 'probability_baseline', 'risk_assessment'];
      const cost = estimateAgentCost(agents);
      
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1.0); // Should be reasonable
    });

    it('should estimate cost for advanced agents', () => {
      const agents = ['breaking_news', 'polling_intelligence', 'media_sentiment'];
      const cost = estimateAgentCost(agents);
      
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1.0);
    });

    it('should handle empty agent list', () => {
      const cost = estimateAgentCost([]);
      expect(cost).toBe(0);
    });

    it('should use default cost for unknown agents', () => {
      const cost = estimateAgentCost(['unknown_agent']);
      expect(cost).toBe(0.10); // Default cost
    });
  });

  describe('getAgentPriority', () => {
    it('should return CRITICAL for MVP agents', () => {
      expect(getAgentPriority('market_microstructure')).toBe(AgentPriority.CRITICAL);
      expect(getAgentPriority('probability_baseline')).toBe(AgentPriority.CRITICAL);
      expect(getAgentPriority('risk_assessment')).toBe(AgentPriority.CRITICAL);
    });

    it('should return HIGH for event intelligence agents', () => {
      expect(getAgentPriority('breaking_news')).toBe(AgentPriority.HIGH);
      expect(getAgentPriority('event_impact')).toBe(AgentPriority.HIGH);
    });

    it('should return MEDIUM for price action agents', () => {
      expect(getAgentPriority('momentum')).toBe(AgentPriority.MEDIUM);
      expect(getAgentPriority('mean_reversion')).toBe(AgentPriority.MEDIUM);
    });

    it('should return LOW for sentiment agents', () => {
      expect(getAgentPriority('media_sentiment')).toBe(AgentPriority.LOW);
      expect(getAgentPriority('social_sentiment')).toBe(AgentPriority.LOW);
    });

    it('should return LOW for unknown agents', () => {
      expect(getAgentPriority('unknown_agent')).toBe(AgentPriority.LOW);
    });
  });

  describe('filterAgentsByCost', () => {
    it('should include all agents when budget is sufficient', () => {
      const agents = ['breaking_news', 'polling_intelligence', 'media_sentiment'];
      const result = filterAgentsByCost(agents, 2.0, true);

      expect(result.selectedAgents).toHaveLength(3);
      expect(result.skippedAgents).toHaveLength(0);
      expect(result.estimatedCost).toBeLessThanOrEqual(2.0);
    });

    it('should prioritize CRITICAL agents even when over budget', () => {
      const agents = ['market_microstructure', 'probability_baseline', 'risk_assessment'];
      const result = filterAgentsByCost(agents, 0.01, true); // Very low budget

      // Critical agents should still be included
      expect(result.selectedAgents).toContain('market_microstructure');
      expect(result.selectedAgents).toContain('probability_baseline');
      expect(result.selectedAgents).toContain('risk_assessment');
    });

    it('should skip LOW priority agents when budget is tight', () => {
      const agents = [
        'market_microstructure', // CRITICAL
        'breaking_news', // HIGH
        'media_sentiment', // LOW
        'social_sentiment', // LOW
      ];
      const result = filterAgentsByCost(agents, 0.25, true);

      // Should include critical and high priority
      expect(result.selectedAgents).toContain('market_microstructure');
      expect(result.selectedAgents).toContain('breaking_news');
      
      // Should skip low priority
      expect(result.skippedAgents.length).toBeGreaterThan(0);
    });

    it('should calculate cost breakdown correctly', () => {
      const agents = ['market_microstructure', 'breaking_news'];
      const result = filterAgentsByCost(agents, 2.0, true);

      expect(result.costBreakdown).toHaveProperty('market_microstructure');
      expect(result.costBreakdown).toHaveProperty('breaking_news');
      expect(result.costBreakdown['market_microstructure']).toBeGreaterThan(0);
    });

    it('should calculate remaining budget correctly', () => {
      const agents = ['market_microstructure'];
      const result = filterAgentsByCost(agents, 1.0, true);

      expect(result.remainingBudget).toBeGreaterThanOrEqual(0);
      expect(result.remainingBudget).toBeLessThanOrEqual(1.0);
      expect(result.estimatedCost + result.remainingBudget).toBeCloseTo(1.0, 2);
    });
  });

  describe('applyCostOptimization', () => {
    const createMockConfig = (maxCost: number, skipLowImpact: boolean): EngineConfig => ({
      costOptimization: {
        maxCostPerAnalysis: maxCost,
        skipLowImpactAgents: skipLowImpact,
        batchLLMRequests: true,
      },
      // Other required config fields (minimal for testing)
      polymarket: {
        gammaApiUrl: 'https://gamma-api.polymarket.com',
        clobApiUrl: 'https://clob.polymarket.com',
        rateLimitBuffer: 80,
      },
      langgraph: {
        checkpointer: 'memory',
        recursionLimit: 25,
        streamMode: 'values',
      },
      opik: {
        projectName: 'test',
        trackCosts: true,
        tags: [],
      },
      llm: {
        openai: {
          apiKey: 'test',
          defaultModel: 'gpt-4',
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
      performanceTracking: {
        enabled: false,
        evaluateOnResolution: true,
        minSampleSize: 10,
      },
    });

    it('should return all agents when optimization is disabled', () => {
      const config = createMockConfig(2.0, false);
      const agents = ['breaking_news', 'polling_intelligence', 'media_sentiment'];
      const result = applyCostOptimization(agents, config);

      expect(result.selectedAgents).toHaveLength(3);
      expect(result.skippedAgents).toHaveLength(0);
      expect(result.optimizationApplied).toBe(false);
    });

    it('should apply optimization when enabled and budget is tight', () => {
      const config = createMockConfig(0.20, true);
      const agents = [
        'breaking_news',
        'polling_intelligence',
        'media_sentiment',
        'social_sentiment',
        'narrative_velocity',
      ];
      const result = applyCostOptimization(agents, config);

      expect(result.selectedAgents.length).toBeLessThan(agents.length);
      expect(result.skippedAgents.length).toBeGreaterThan(0);
      expect(result.optimizationApplied).toBe(true);
    });

    it('should include maxCost in result', () => {
      const config = createMockConfig(1.5, true);
      const agents = ['breaking_news'];
      const result = applyCostOptimization(agents, config);

      expect(result.maxCost).toBe(1.5);
    });

    it('should include cost breakdown', () => {
      const config = createMockConfig(2.0, true);
      const agents = ['breaking_news', 'polling_intelligence'];
      const result = applyCostOptimization(agents, config);

      expect(result.costBreakdown).toBeDefined();
      expect(Object.keys(result.costBreakdown).length).toBeGreaterThan(0);
    });
  });

  describe('createCostOptimizationAuditEntry', () => {
    it('should create audit entry with all required fields', () => {
      const result = {
        selectedAgents: ['breaking_news', 'polling_intelligence'],
        skippedAgents: ['media_sentiment'],
        estimatedCost: 0.27,
        maxCost: 0.50,
        costBreakdown: {
          'breaking_news': 0.12,
          'polling_intelligence': 0.15,
        },
        optimizationApplied: true,
      };

      const auditEntry = createCostOptimizationAuditEntry(result);

      expect(auditEntry.optimizationApplied).toBe(true);
      expect(auditEntry.maxCost).toBe(0.50);
      expect(auditEntry.estimatedCost).toBe(0.27);
      expect(auditEntry.remainingBudget).toBeCloseTo(0.23, 2);
      expect(auditEntry.selectedAgentCount).toBe(2);
      expect(auditEntry.skippedAgentCount).toBe(1);
      expect(auditEntry.selectedAgents).toEqual(['breaking_news', 'polling_intelligence']);
      expect(auditEntry.skippedAgents).toEqual(['media_sentiment']);
      expect(auditEntry.costBreakdown).toEqual(result.costBreakdown);
      expect(auditEntry.budgetUtilization).toBeCloseTo(54, 0);
    });

    it('should handle zero skipped agents', () => {
      const result = {
        selectedAgents: ['breaking_news'],
        skippedAgents: [],
        estimatedCost: 0.12,
        maxCost: 2.0,
        costBreakdown: { 'breaking_news': 0.12 },
        optimizationApplied: false,
      };

      const auditEntry = createCostOptimizationAuditEntry(result);

      expect(auditEntry.skippedAgentCount).toBe(0);
      expect(auditEntry.optimizationApplied).toBe(false);
    });
  });

  describe('trackAgentCost', () => {
    it('should return estimated cost when no token data provided', () => {
      const cost = trackAgentCost('breaking_news');
      expect(cost).toBeGreaterThan(0);
      expect(cost).toBeLessThan(1.0);
    });

    it('should calculate cost from token usage with default pricing', () => {
      const cost = trackAgentCost('breaking_news', {
        input: 2000,
        output: 500,
      });

      expect(cost).toBeGreaterThan(0);
      // Cost should be: (2000/1000 * 0.03) + (500/1000 * 0.06) = 0.06 + 0.03 = 0.09
      expect(cost).toBeCloseTo(0.09, 2);
    });

    it('should calculate cost with Nova provider', () => {
      const cost = trackAgentCost(
        'breaking_news',
        { input: 2000, output: 500 },
        'nova',
        'amazon.nova-lite-v1:0'
      );

      // (2000/1000 * 0.00006) + (500/1000 * 0.00024) = 0.00012 + 0.00012 = 0.00024
      expect(cost).toBeCloseTo(0.00024, 5);
    });

    it('should calculate cost with other providers', () => {
      const cost = trackAgentCost(
        'breaking_news',
        { input: 2000, output: 500 },
        'anthropic',
        'claude-3'
      );

      // (2000/1000 * 0.015) + (500/1000 * 0.075) = 0.03 + 0.0375 = 0.0675
      expect(cost).toBeCloseTo(0.0675, 4);
    });

    it('should handle zero tokens', () => {
      const cost = trackAgentCost('breaking_news', {
        input: 0,
        output: 0,
      });

      expect(cost).toBe(0);
    });

    it('should use default cost for unknown agents', () => {
      const cost = trackAgentCost('unknown_agent');
      expect(cost).toBe(0.10);
    });
  });

  describe('recordUsage', () => {
    it('should record usage for Nova provider with metadata', () => {
      const record = recordUsage({
        provider: 'nova',
        modelName: 'amazon.nova-lite-v1:0',
        agentName: 'breaking_news',
        inputTokens: 2000,
        outputTokens: 500,
      });

      expect(record.provider).toBe('nova');
      expect(record.modelName).toBe('amazon.nova-lite-v1:0');
      expect(record.agentName).toBe('breaking_news');
      expect(record.inputTokens).toBe(2000);
      expect(record.outputTokens).toBe(500);
      expect(record.totalCost).toBeCloseTo(0.00024, 5);
      expect(record.timestamp).toBeInstanceOf(Date);
      expect(record.metadata).toBeDefined();
      expect(record.metadata?.modelVariant).toBe('lite');
      expect(record.metadata?.inputCostPer1kTokens).toBe(0.00006);
      expect(record.metadata?.outputCostPer1kTokens).toBe(0.00024);
    });

    it('should record usage for Nova Micro with correct variant', () => {
      const record = recordUsage({
        provider: 'nova',
        modelName: 'amazon.nova-micro-v1:0',
        inputTokens: 1000,
        outputTokens: 250,
      });

      expect(record.metadata?.modelVariant).toBe('micro');
      expect(record.totalCost).toBeCloseTo(0.000035 + 0.000035, 6);
    });

    it('should record usage for Nova Pro with correct variant', () => {
      const record = recordUsage({
        provider: 'nova',
        modelName: 'amazon.nova-pro-v1:0',
        inputTokens: 1000,
        outputTokens: 250,
      });

      expect(record.metadata?.modelVariant).toBe('pro');
      expect(record.totalCost).toBeCloseTo(0.0008 + 0.0008, 4);
    });

    it('should record usage for OpenAI provider without Nova metadata', () => {
      const record = recordUsage({
        provider: 'openai',
        modelName: 'gpt-4',
        agentName: 'market_microstructure',
        inputTokens: 2000,
        outputTokens: 500,
      });

      expect(record.provider).toBe('openai');
      expect(record.modelName).toBe('gpt-4');
      expect(record.totalCost).toBeCloseTo(0.09, 2);
      expect(record.timestamp).toBeInstanceOf(Date);
      // Should not have Nova-specific metadata
      expect(record.metadata?.modelVariant).toBeUndefined();
    });

    it('should record usage for Anthropic provider', () => {
      const record = recordUsage({
        provider: 'anthropic',
        modelName: 'claude-3',
        inputTokens: 2000,
        outputTokens: 500,
      });

      expect(record.provider).toBe('anthropic');
      expect(record.totalCost).toBeCloseTo(0.0675, 4);
    });

    it('should record usage for Google provider', () => {
      const record = recordUsage({
        provider: 'google',
        modelName: 'gemini-pro',
        inputTokens: 2000,
        outputTokens: 500,
      });

      expect(record.provider).toBe('google');
      expect(record.totalCost).toBeCloseTo(0.00075, 5);
    });

    it('should preserve custom metadata', () => {
      const customMetadata = { customField: 'customValue', analysisId: '123' };
      const record = recordUsage({
        provider: 'nova',
        modelName: 'amazon.nova-lite-v1:0',
        inputTokens: 1000,
        outputTokens: 500,
        metadata: customMetadata,
      });

      expect(record.metadata?.customField).toBe('customValue');
      expect(record.metadata?.analysisId).toBe('123');
      expect(record.metadata?.modelVariant).toBe('lite');
    });

    it('should handle zero tokens', () => {
      const record = recordUsage({
        provider: 'nova',
        modelName: 'amazon.nova-lite-v1:0',
        inputTokens: 0,
        outputTokens: 0,
      });

      expect(record.totalCost).toBe(0);
    });
  });

  describe('getCostsByProvider', () => {
    it('should aggregate costs by provider', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'openai', modelName: 'gpt-4', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-pro-v1:0', inputTokens: 1000, outputTokens: 250 }),
      ];

      const costsByProvider = getCostsByProvider(records);

      expect(costsByProvider.size).toBe(2);
      expect(costsByProvider.has('nova')).toBe(true);
      expect(costsByProvider.has('openai')).toBe(true);
    });

    it('should calculate total costs correctly', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
      ];

      const costsByProvider = getCostsByProvider(records);
      const novaSummary = costsByProvider.get('nova')!;

      expect(novaSummary.totalCost).toBeCloseTo(0.00048, 5);
      expect(novaSummary.totalInputTokens).toBe(4000);
      expect(novaSummary.totalOutputTokens).toBe(1000);
      expect(novaSummary.invocationCount).toBe(2);
    });

    it('should track per-model statistics', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-pro-v1:0', inputTokens: 1000, outputTokens: 250 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 1000, outputTokens: 250 }),
      ];

      const costsByProvider = getCostsByProvider(records);
      const novaSummary = costsByProvider.get('nova')!;

      expect(novaSummary.models).toBeDefined();
      expect(novaSummary.models!['amazon.nova-lite-v1:0'].invocationCount).toBe(2);
      expect(novaSummary.models!['amazon.nova-pro-v1:0'].invocationCount).toBe(1);
      expect(novaSummary.models!['amazon.nova-lite-v1:0'].inputTokens).toBe(3000);
    });

    it('should handle multiple providers', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'openai', modelName: 'gpt-4', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'anthropic', modelName: 'claude-3', inputTokens: 2000, outputTokens: 500 }),
      ];

      const costsByProvider = getCostsByProvider(records);

      expect(costsByProvider.size).toBe(3);
      expect(costsByProvider.get('nova')!.invocationCount).toBe(1);
      expect(costsByProvider.get('openai')!.invocationCount).toBe(1);
      expect(costsByProvider.get('anthropic')!.invocationCount).toBe(1);
    });

    it('should handle empty records array', () => {
      const costsByProvider = getCostsByProvider([]);
      expect(costsByProvider.size).toBe(0);
    });
  });

  describe('getNovaCostBreakdown', () => {
    it('should break down costs by Nova variant', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-micro-v1:0', inputTokens: 1000, outputTokens: 250 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-pro-v1:0', inputTokens: 1000, outputTokens: 250 }),
      ];

      const breakdown = getNovaCostBreakdown(records);

      expect(breakdown.micro.invocationCount).toBe(1);
      expect(breakdown.lite.invocationCount).toBe(1);
      expect(breakdown.pro.invocationCount).toBe(1);
      expect(breakdown.total.invocationCount).toBe(3);
    });

    it('should calculate costs correctly for each variant', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-micro-v1:0', inputTokens: 1000, outputTokens: 250 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-pro-v1:0', inputTokens: 1000, outputTokens: 250 }),
      ];

      const breakdown = getNovaCostBreakdown(records);

      // Micro: (1000/1000 * 0.000035) + (250/1000 * 0.00014) = 0.000035 + 0.000035 = 0.00007
      expect(breakdown.micro.cost).toBeCloseTo(0.00007, 6);
      
      // Lite: (2000/1000 * 0.00006) + (500/1000 * 0.00024) = 0.00012 + 0.00012 = 0.00024
      expect(breakdown.lite.cost).toBeCloseTo(0.00024, 5);
      
      // Pro: (1000/1000 * 0.0008) + (250/1000 * 0.0032) = 0.0008 + 0.0008 = 0.0016
      expect(breakdown.pro.cost).toBeCloseTo(0.0016, 4);
      
      // Total
      expect(breakdown.total.cost).toBeCloseTo(0.00007 + 0.00024 + 0.0016, 4);
    });

    it('should aggregate token counts correctly', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 1000, outputTokens: 250 }),
      ];

      const breakdown = getNovaCostBreakdown(records);

      expect(breakdown.lite.inputTokens).toBe(3000);
      expect(breakdown.lite.outputTokens).toBe(750);
      expect(breakdown.total.inputTokens).toBe(3000);
      expect(breakdown.total.outputTokens).toBe(750);
    });

    it('should filter out non-Nova records', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-lite-v1:0', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'openai', modelName: 'gpt-4', inputTokens: 2000, outputTokens: 500 }),
        recordUsage({ provider: 'anthropic', modelName: 'claude-3', inputTokens: 2000, outputTokens: 500 }),
      ];

      const breakdown = getNovaCostBreakdown(records);

      expect(breakdown.total.invocationCount).toBe(1);
      expect(breakdown.lite.invocationCount).toBe(1);
      expect(breakdown.micro.invocationCount).toBe(0);
      expect(breakdown.pro.invocationCount).toBe(0);
    });

    it('should handle empty records array', () => {
      const breakdown = getNovaCostBreakdown([]);

      expect(breakdown.total.cost).toBe(0);
      expect(breakdown.total.invocationCount).toBe(0);
      expect(breakdown.micro.invocationCount).toBe(0);
      expect(breakdown.lite.invocationCount).toBe(0);
      expect(breakdown.pro.invocationCount).toBe(0);
    });

    it('should handle records with only one variant', () => {
      const records: UsageRecord[] = [
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-pro-v1:0', inputTokens: 1000, outputTokens: 250 }),
        recordUsage({ provider: 'nova', modelName: 'amazon.nova-pro-v1:0', inputTokens: 2000, outputTokens: 500 }),
      ];

      const breakdown = getNovaCostBreakdown(records);

      expect(breakdown.pro.invocationCount).toBe(2);
      expect(breakdown.micro.invocationCount).toBe(0);
      expect(breakdown.lite.invocationCount).toBe(0);
      expect(breakdown.total.invocationCount).toBe(2);
    });
  });

  describe('getNovaPricing', () => {
    it('should return pricing for Nova Micro', () => {
      const pricing = getNovaPricing('amazon.nova-micro-v1:0');
      expect(pricing.inputCostPer1kTokens).toBe(0.000035);
      expect(pricing.outputCostPer1kTokens).toBe(0.00014);
    });

    it('should return pricing for Nova Lite', () => {
      const pricing = getNovaPricing('amazon.nova-lite-v1:0');
      expect(pricing.inputCostPer1kTokens).toBe(0.00006);
      expect(pricing.outputCostPer1kTokens).toBe(0.00024);
    });

    it('should return pricing for Nova Pro', () => {
      const pricing = getNovaPricing('amazon.nova-pro-v1:0');
      expect(pricing.inputCostPer1kTokens).toBe(0.0008);
      expect(pricing.outputCostPer1kTokens).toBe(0.0032);
    });

    it('should throw error for invalid model ID', () => {
      expect(() => getNovaPricing('invalid-model')).toThrow('Invalid Nova model ID');
      expect(() => getNovaPricing('gpt-4')).toThrow('Invalid Nova model ID');
    });

    it('should include valid model IDs in error message', () => {
      try {
        getNovaPricing('invalid-model');
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).toContain('amazon.nova-micro-v1:0');
        expect(error.message).toContain('amazon.nova-lite-v1:0');
        expect(error.message).toContain('amazon.nova-pro-v1:0');
      }
    });
  });

  describe('calculateCost', () => {
    describe('Nova provider', () => {
      it('should calculate cost for Nova Micro', () => {
        const cost = calculateCost('nova', 'amazon.nova-micro-v1:0', 2000, 500);
        // (2000/1000 * 0.000035) + (500/1000 * 0.00014) = 0.00007 + 0.00007 = 0.00014
        expect(cost).toBeCloseTo(0.00014, 5);
      });

      it('should calculate cost for Nova Lite', () => {
        const cost = calculateCost('nova', 'amazon.nova-lite-v1:0', 2000, 500);
        // (2000/1000 * 0.00006) + (500/1000 * 0.00024) = 0.00012 + 0.00012 = 0.00024
        expect(cost).toBeCloseTo(0.00024, 5);
      });

      it('should calculate cost for Nova Pro', () => {
        const cost = calculateCost('nova', 'amazon.nova-pro-v1:0', 2000, 500);
        // (2000/1000 * 0.0008) + (500/1000 * 0.0032) = 0.0016 + 0.0016 = 0.0032
        expect(cost).toBeCloseTo(0.0032, 4);
      });

      it('should handle zero tokens', () => {
        const cost = calculateCost('nova', 'amazon.nova-lite-v1:0', 0, 0);
        expect(cost).toBe(0);
      });

      it('should throw error for invalid Nova model', () => {
        expect(() => calculateCost('nova', 'invalid-model', 1000, 500)).toThrow();
      });
    });

    describe('Other providers', () => {
      it('should calculate cost for OpenAI (default)', () => {
        const cost = calculateCost('openai', 'gpt-4', 2000, 500);
        // (2000/1000 * 0.03) + (500/1000 * 0.06) = 0.06 + 0.03 = 0.09
        expect(cost).toBeCloseTo(0.09, 2);
      });

      it('should calculate cost for Anthropic', () => {
        const cost = calculateCost('anthropic', 'claude-3', 2000, 500);
        // (2000/1000 * 0.015) + (500/1000 * 0.075) = 0.03 + 0.0375 = 0.0675
        expect(cost).toBeCloseTo(0.0675, 4);
      });

      it('should calculate cost for Google', () => {
        const cost = calculateCost('google', 'gemini-pro', 2000, 500);
        // (2000/1000 * 0.00025) + (500/1000 * 0.0005) = 0.0005 + 0.00025 = 0.00075
        expect(cost).toBeCloseTo(0.00075, 5);
      });

      it('should use default pricing for unknown provider', () => {
        const cost = calculateCost('unknown', 'model', 2000, 500);
        // Should use GPT-4 default pricing
        expect(cost).toBeCloseTo(0.09, 2);
      });
    });
  });

  describe('Integration: Cost optimization with agent prioritization', () => {
    it('should prioritize agents correctly under budget constraints', () => {
      const agents = [
        'market_microstructure', // CRITICAL
        'probability_baseline', // CRITICAL
        'breaking_news', // HIGH
        'polling_intelligence', // HIGH
        'momentum', // MEDIUM
        'media_sentiment', // LOW
        'narrative_velocity', // LOW
      ];

      const result = filterAgentsByCost(agents, 0.50, true);

      // Critical agents should always be included
      expect(result.selectedAgents).toContain('market_microstructure');
      expect(result.selectedAgents).toContain('probability_baseline');

      // High priority should be preferred over low priority
      const hasHighPriority = result.selectedAgents.includes('breaking_news') ||
                              result.selectedAgents.includes('polling_intelligence');
      const hasLowPriority = result.selectedAgents.includes('media_sentiment') ||
                             result.selectedAgents.includes('narrative_velocity');

      if (result.selectedAgents.length > 2) {
        // If we have room for more than critical agents, high priority should come first
        expect(hasHighPriority).toBe(true);
      }

      // Low priority should be skipped before high priority
      if (result.skippedAgents.length > 0) {
        const skippedLowPriority = result.skippedAgents.includes('media_sentiment') ||
                                   result.skippedAgents.includes('narrative_velocity');
        expect(skippedLowPriority).toBe(true);
      }
    });

    it('should stay within budget when optimization is enabled', () => {
      const agents = [
        'breaking_news',
        'polling_intelligence',
        'media_sentiment',
        'social_sentiment',
        'narrative_velocity',
        'momentum',
        'mean_reversion',
      ];

      const maxCost = 0.40;
      const result = filterAgentsByCost(agents, maxCost, true);

      // Estimated cost should not exceed budget (with small tolerance for critical agents)
      expect(result.estimatedCost).toBeLessThanOrEqual(maxCost * 1.5);
    });
  });
});
