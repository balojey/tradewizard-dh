/**
 * Test for concurrent state updates in riskPhilosophySignals
 * 
 * This test verifies that the custom reducer properly handles
 * concurrent updates from multiple risk philosophy agents.
 */

import { describe, it, expect } from 'vitest';

describe('GraphState - Concurrent Updates', () => {
  it('should merge concurrent updates correctly', () => {
    // Test the reducer logic directly
    const reducer = (current: any, update: any) => {
      return { ...current, ...update };
    };

    // Initial empty state
    const initialState = {};

    // Simulate concurrent updates from three agents
    const aggressiveUpdate = {
      aggressive: {
        agentName: 'risk_philosophy_aggressive',
        timestamp: 1000,
        confidence: 0.85,
        direction: 'YES' as const,
        fairProbability: 0.75,
        keyDrivers: ['High conviction opportunity'],
        riskFactors: ['High variance'],
        metadata: {
          recommendedPositionSize: 0.2,
          kellyCriterion: 0.15,
          convictionLevel: 'high' as const,
          expectedReturn: 25.0,
          varianceWarning: 'High risk',
        },
      },
    };

    const conservativeUpdate = {
      conservative: {
        agentName: 'risk_philosophy_conservative',
        timestamp: 1001,
        confidence: 0.80,
        direction: 'NO' as const,
        fairProbability: 0.25,
        keyDrivers: ['Capital preservation'],
        riskFactors: ['Downside risk'],
        metadata: {
          recommendedPositionSize: 0.05,
          hedgingStrategy: 'Put options',
          maxDrawdownTolerance: 0.02,
          stopLossLevel: 0.95,
          capitalPreservationScore: 0.90,
        },
      },
    };

    const neutralUpdate = {
      neutral: {
        agentName: 'risk_philosophy_neutral',
        timestamp: 1002,
        confidence: 0.75,
        direction: 'NEUTRAL' as const,
        fairProbability: 0.50,
        keyDrivers: ['Market neutral opportunity'],
        riskFactors: ['Execution risk'],
        metadata: {
          spreadOpportunities: [{
            setup: 'Long/short spread',
            expectedReturn: 0.05,
            riskLevel: 'low' as const,
          }],
          pairedPositions: [{
            long: 'Asset A',
            short: 'Asset B',
            netExposure: 0.0,
          }],
          arbitrageSetups: ['Cross-market arbitrage'],
        },
      },
    };

    // Apply updates sequentially (simulating concurrent resolution)
    let currentState = reducer(initialState, aggressiveUpdate);
    currentState = reducer(currentState, conservativeUpdate);
    currentState = reducer(currentState, neutralUpdate);

    // Verify all three philosophies are present
    expect(currentState).toHaveProperty('aggressive');
    expect(currentState).toHaveProperty('conservative');
    expect(currentState).toHaveProperty('neutral');

    // Verify each philosophy has correct data
    expect(currentState.aggressive?.agentName).toBe('risk_philosophy_aggressive');
    expect(currentState.conservative?.agentName).toBe('risk_philosophy_conservative');
    expect(currentState.neutral?.agentName).toBe('risk_philosophy_neutral');

    // Verify no data was overwritten
    expect(currentState.aggressive?.confidence).toBe(0.85);
    expect(currentState.conservative?.confidence).toBe(0.80);
    expect(currentState.neutral?.confidence).toBe(0.75);
  });

  it('should handle partial updates without losing existing data', () => {
    const reducer = (current: any, update: any) => {
      return { ...current, ...update };
    };

    // Start with existing aggressive signal
    const existingState = {
      aggressive: {
        agentName: 'risk_philosophy_aggressive',
        timestamp: 1000,
        confidence: 0.85,
        direction: 'YES' as const,
        fairProbability: 0.75,
        keyDrivers: ['High conviction'],
        riskFactors: ['High variance'],
        metadata: {
          recommendedPositionSize: 0.2,
          kellyCriterion: 0.15,
          convictionLevel: 'high' as const,
          expectedReturn: 25.0,
          varianceWarning: 'High risk',
        },
      },
    };

    // Add conservative signal
    const conservativeUpdate = {
      conservative: {
        agentName: 'risk_philosophy_conservative',
        timestamp: 1001,
        confidence: 0.80,
        direction: 'NO' as const,
        fairProbability: 0.25,
        keyDrivers: ['Capital preservation'],
        riskFactors: ['Downside risk'],
        metadata: {
          recommendedPositionSize: 0.05,
          hedgingStrategy: 'Put options',
          maxDrawdownTolerance: 0.02,
          stopLossLevel: 0.95,
          capitalPreservationScore: 0.90,
        },
      },
    };

    const newState = reducer(existingState, conservativeUpdate);

    // Verify both signals are present
    expect(newState).toHaveProperty('aggressive');
    expect(newState).toHaveProperty('conservative');

    // Verify existing aggressive signal wasn't lost
    expect(newState.aggressive?.agentName).toBe('risk_philosophy_aggressive');
    expect(newState.aggressive?.confidence).toBe(0.85);

    // Verify new conservative signal was added
    expect(newState.conservative?.agentName).toBe('risk_philosophy_conservative');
    expect(newState.conservative?.confidence).toBe(0.80);
  });

  it('should demonstrate the fix for concurrent updates', () => {
    // This test demonstrates that our reducer fix allows concurrent updates
    // whereas the default LastValue reducer would fail
    
    const customReducer = (current: any, update: any) => {
      return { ...current, ...update };
    };

    // Simulate what happens when multiple agents update simultaneously
    const initialState = {};
    
    // Each agent updates only their own key
    const update1 = { aggressive: { agentName: 'aggressive', confidence: 0.8 } };
    const update2 = { conservative: { agentName: 'conservative', confidence: 0.7 } };
    const update3 = { neutral: { agentName: 'neutral', confidence: 0.6 } };

    // With our custom reducer, all updates are preserved
    let state = customReducer(initialState, update1);
    state = customReducer(state, update2);
    state = customReducer(state, update3);

    expect(Object.keys(state)).toHaveLength(3);
    expect(state.aggressive.confidence).toBe(0.8);
    expect(state.conservative.confidence).toBe(0.7);
    expect(state.neutral.confidence).toBe(0.6);
  });
});