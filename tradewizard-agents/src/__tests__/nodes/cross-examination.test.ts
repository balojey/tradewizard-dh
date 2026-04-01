/**
 * Unit tests for cross-examination node
 *
 * Tests each examination test type with sample theses, debate scoring logic,
 * argument survival determination, and state updates.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 11.2
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createCrossExaminationNode } from './cross-examination.js';
import type { GraphStateType } from '../models/state.js';
import type { Thesis, MarketBriefingDocument } from '../models/types.js';
import type { EngineConfig } from '../config/index.js';

// Mock LangChain modules to avoid real API calls
vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn().mockImplementation(function() {
    return {
      invoke: vi.fn().mockResolvedValue({
        content: 'The claim is well-supported by evidence and survived scrutiny. The factual basis is strong.',
      }),
    };
  }),
}));

vi.mock('@langchain/openai', () => ({
  ChatOpenAI: vi.fn().mockImplementation(function() {
    return {
      invoke: vi.fn().mockResolvedValue({
        content: 'The claim is well-supported by evidence and survived scrutiny. The factual basis is strong.',
      }),
    };
  }),
}));

vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(function() {
    return {
      invoke: vi.fn().mockResolvedValue({
        content: 'The claim is well-supported by evidence and survived scrutiny. The factual basis is strong.',
      }),
    };
  }),
}));

// Mock configuration for testing
const mockConfig: EngineConfig = {
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
    projectName: 'test-project',
    tags: [],
    trackCosts: true,
  },
  llm: {
    singleProvider: 'google',
    google: {
      apiKey: process.env.GOOGLE_API_KEY || 'test-key',
      defaultModel: 'gemini-2.5-flash',
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
    eventIntelligence: {
      enabled: false,
      breakingNews: true,
      eventImpact: true,
    },
    pollingStatistical: {
      enabled: false,
      pollingIntelligence: true,
      historicalPattern: true,
    },
    sentimentNarrative: {
      enabled: false,
      mediaSentiment: true,
      socialSentiment: true,
      narrativeVelocity: true,
    },
    priceAction: {
      enabled: false,
      momentum: true,
      meanReversion: true,
      minVolumeThreshold: 1000,
    },
    eventScenario: {
      enabled: false,
      catalyst: true,
      tailRisk: true,
    },
    riskPhilosophy: {
      enabled: false,
      aggressive: true,
      conservative: true,
      neutral: true,
    },
  },
  externalData: {
    news: {
      provider: 'none',
      cacheTTL: 900,
      maxArticles: 20,
    },
    polling: {
      provider: 'none',
      cacheTTL: 3600,
    },
    social: {
      providers: [],
      cacheTTL: 300,
      maxMentions: 100,
    },
  },
  signalFusion: {
    baseWeights: {
      'market_microstructure': 1.0,
      'probability_baseline': 1.0,
      'risk_assessment': 1.0,
    },
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

// Sample Market Briefing Document
const sampleMBD: MarketBriefingDocument = {
  marketId: 'test-market-123',
  conditionId: 'test-condition-456',
  eventType: 'election',
  question: 'Will candidate X win the election?',
  resolutionCriteria: 'Resolves YES if candidate X is declared winner by official sources',
  expiryTimestamp: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days from now
  currentProbability: 0.55,
  liquidityScore: 7.5,
  bidAskSpread: 2.5,
  volatilityRegime: 'medium',
  volume24h: 50000,
  metadata: {
    ambiguityFlags: [],
    keyCatalysts: [
      { event: 'Debate scheduled', timestamp: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    ],
  },
};

// Sample bull thesis
const sampleBullThesis: Thesis = {
  direction: 'YES',
  fairProbability: 0.65,
  marketProbability: 0.55,
  edge: 0.10,
  coreArgument:
    'Candidate X has strong polling numbers and favorable demographics in key swing states.',
  catalysts: [
    'Upcoming debate will showcase policy strengths',
    'Economic indicators favor incumbent party',
  ],
  failureConditions: [
    'Major scandal emerges',
    'Economic downturn before election',
  ],
  supportingSignals: ['market_microstructure', 'probability_baseline'],
};

// Sample bear thesis
const sampleBearThesis: Thesis = {
  direction: 'NO',
  fairProbability: 0.45,
  marketProbability: 0.55,
  edge: 0.10,
  coreArgument:
    'Candidate X faces headwinds from voter dissatisfaction and strong opposition.',
  catalysts: [
    'Opposition candidate gaining momentum',
    'Key demographic groups shifting away',
  ],
  failureConditions: [
    'Opposition candidate makes major mistake',
    'Unexpected positive economic news',
  ],
  supportingSignals: ['risk_assessment'],
};

describe('Cross-Examination Node', () => {
  let crossExaminationNode: ReturnType<typeof createCrossExaminationNode>;

  beforeEach(() => {
    crossExaminationNode = createCrossExaminationNode(mockConfig);
  });

  describe('Basic Functionality', () => {
    it('should execute cross-examination with valid theses', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.debateRecord).toBeDefined();
      expect(result.debateRecord?.tests).toBeDefined();
      expect(result.debateRecord?.tests.length).toBeGreaterThan(0);
      expect(result.debateRecord?.bullScore).toBeDefined();
      expect(result.debateRecord?.bearScore).toBeDefined();
      expect(result.debateRecord?.keyDisagreements).toBeDefined();
    });

    it('should return error when bull thesis is missing', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: null,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.consensusError).toBeDefined();
      expect(result.consensusError?.type).toBe('INSUFFICIENT_DATA');
      if (result.consensusError?.type === 'INSUFFICIENT_DATA') {
        expect(result.consensusError.reason).toContain('theses are required');
      }
    });

    it('should return error when bear thesis is missing', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: null,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.consensusError).toBeDefined();
      expect(result.consensusError?.type).toBe('INSUFFICIENT_DATA');
    });
  });

  describe('Examination Test Types', () => {
    it('should execute evidence tests on both theses', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      const evidenceTests = result.debateRecord?.tests.filter(
        (test) => test.testType === 'evidence'
      );
      expect(evidenceTests).toBeDefined();
      expect(evidenceTests!.length).toBeGreaterThanOrEqual(2); // At least one for each thesis
    });

    it('should execute causality tests on both theses', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      const causalityTests = result.debateRecord?.tests.filter(
        (test) => test.testType === 'causality'
      );
      expect(causalityTests).toBeDefined();
      expect(causalityTests!.length).toBeGreaterThanOrEqual(2);
    });

    it('should execute timing tests on both theses', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      const timingTests = result.debateRecord?.tests.filter(
        (test) => test.testType === 'timing'
      );
      expect(timingTests).toBeDefined();
      expect(timingTests!.length).toBeGreaterThanOrEqual(2);
    });

    it('should execute liquidity tests on both theses', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      const liquidityTests = result.debateRecord?.tests.filter(
        (test) => test.testType === 'liquidity'
      );
      expect(liquidityTests).toBeDefined();
      expect(liquidityTests!.length).toBeGreaterThanOrEqual(2);
    });

    it('should execute tail risk tests on both theses', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      const tailRiskTests = result.debateRecord?.tests.filter(
        (test) => test.testType === 'tail-risk'
      );
      expect(tailRiskTests).toBeDefined();
      expect(tailRiskTests!.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Debate Scoring Logic', () => {
    it('should calculate aggregate bull and bear scores', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.debateRecord?.bullScore).toBeDefined();
      expect(result.debateRecord?.bearScore).toBeDefined();
      expect(typeof result.debateRecord?.bullScore).toBe('number');
      expect(typeof result.debateRecord?.bearScore).toBe('number');
      expect(result.debateRecord?.bullScore).toBeGreaterThanOrEqual(-1);
      expect(result.debateRecord?.bullScore).toBeLessThanOrEqual(1);
      expect(result.debateRecord?.bearScore).toBeGreaterThanOrEqual(-1);
      expect(result.debateRecord?.bearScore).toBeLessThanOrEqual(1);
    });

    it('should have test scores in valid range (-1 to 1)', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      result.debateRecord?.tests.forEach((test) => {
        expect(test.score).toBeGreaterThanOrEqual(-1);
        expect(test.score).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Argument Survival Determination', () => {
    it('should classify test outcomes as survived, weakened, or refuted', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      result.debateRecord?.tests.forEach((test) => {
        expect(['survived', 'weakened', 'refuted']).toContain(test.outcome);
      });
    });

    it('should identify key disagreements between theses', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.debateRecord?.keyDisagreements).toBeDefined();
      expect(Array.isArray(result.debateRecord?.keyDisagreements)).toBe(true);
    });

    it('should detect significant probability disagreement', async () => {
      // Create theses with large probability difference
      const bullThesisHighProb: Thesis = {
        ...sampleBullThesis,
        fairProbability: 0.8,
      };
      const bearThesisLowProb: Thesis = {
        ...sampleBearThesis,
        fairProbability: 0.3,
      };

      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: bullThesisHighProb,
        bearThesis: bearThesisLowProb,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      const hasProbDisagreement = result.debateRecord?.keyDisagreements.some((d) =>
        d.includes('probability disagreement')
      );
      expect(hasProbDisagreement).toBe(true);
    });
  });

  describe('State Updates', () => {
    it('should write debate record to state', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      // Skip if LLM call fails
      if (result.consensusError) return;

      expect(result.debateRecord).toBeDefined();
      expect(result.debateRecord?.tests).toBeDefined();
      expect(result.debateRecord?.bullScore).toBeDefined();
      expect(result.debateRecord?.bearScore).toBeDefined();
      expect(result.debateRecord?.keyDisagreements).toBeDefined();
    });

    it('should add audit log entry on success', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.auditLog).toBeDefined();
      expect(result.auditLog!.length).toBeGreaterThan(0);
      expect(result.auditLog![0].stage).toBe('cross_examination');
      expect(result.auditLog![0].data.success).toBe(true);
    });

    it('should add audit log entry on error', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: null,
        bearThesis: null,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.auditLog).toBeDefined();
      expect(result.auditLog!.length).toBeGreaterThan(0);
      expect(result.auditLog![0].stage).toBe('cross_examination');
      expect(result.auditLog![0].data.success).toBe(false);
    });

    it('should include execution duration in audit log', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.auditLog![0].data.duration).toBeDefined();
      expect(typeof result.auditLog![0].data.duration).toBe('number');
      expect(result.auditLog![0].data.duration).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing MBD gracefully', async () => {
      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: null,
        bullThesis: sampleBullThesis,
        bearThesis: sampleBearThesis,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      // Should still execute but with weakened timing/liquidity tests
      expect(result.debateRecord).toBeDefined();
      expect(result.debateRecord?.tests).toBeDefined();
    });

    it('should handle theses with empty catalysts', async () => {
      const bullThesisNoCatalysts: Thesis = {
        ...sampleBullThesis,
        catalysts: [],
      };
      const bearThesisNoCatalysts: Thesis = {
        ...sampleBearThesis,
        catalysts: [],
      };

      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: bullThesisNoCatalysts,
        bearThesis: bearThesisNoCatalysts,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.debateRecord).toBeDefined();
      expect(result.debateRecord?.tests).toBeDefined();
    });

    it('should handle theses with empty failure conditions', async () => {
      const bullThesisNoFailures: Thesis = {
        ...sampleBullThesis,
        failureConditions: [],
      };
      const bearThesisNoFailures: Thesis = {
        ...sampleBearThesis,
        failureConditions: [],
      };

      const state: Partial<GraphStateType> = {
        conditionId: 'test-condition-456',
        mbd: sampleMBD,
        bullThesis: bullThesisNoFailures,
        bearThesis: bearThesisNoFailures,
        agentSignals: [],
        agentErrors: [],
        auditLog: [],
      };

      const result = await crossExaminationNode(state as GraphStateType);

      expect(result.debateRecord).toBeDefined();
      expect(result.debateRecord?.tests).toBeDefined();
    });
  });
});
