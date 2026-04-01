/**
 * Unit tests for Signal Validation Module
 * Tests Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect } from 'vitest';
import {
  validateRequiredFields,
  validateProbability,
  validateConfidence,
  validateDirection,
  validateSignal,
  filterValidSignals,
} from './signal-validation.js';

describe('Signal Validation', () => {
  describe('validateRequiredFields', () => {
    it('should pass when all required fields are present', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'YES',
        fair_probability: 0.7,
        confidence: 0.8,
      };

      const result = validateRequiredFields(signal);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail when agent_name is missing', () => {
      const signal = {
        market_id: 'test_market',
        direction: 'YES',
        fair_probability: 0.7,
        confidence: 0.8,
      };

      const result = validateRequiredFields(signal);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('agent_name');
    });

    it('should fail when market_id is missing', () => {
      const signal = {
        agent_name: 'test_agent',
        direction: 'YES',
        fair_probability: 0.7,
        confidence: 0.8,
      };

      const result = validateRequiredFields(signal);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('market_id');
    });

    it('should fail when direction is missing', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        fair_probability: 0.7,
        confidence: 0.8,
      };

      const result = validateRequiredFields(signal);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('direction');
    });

    it('should fail when fair_probability is missing', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'YES',
        confidence: 0.8,
      };

      const result = validateRequiredFields(signal);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('fair_probability');
    });

    it('should fail when confidence is missing', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'YES',
        fair_probability: 0.7,
      };

      const result = validateRequiredFields(signal);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('confidence');
    });

    it('should fail when field is null', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: null,
        direction: 'YES',
        fair_probability: 0.7,
        confidence: 0.8,
      };

      const result = validateRequiredFields(signal);

      expect(result.valid).toBe(false);
    });

    it('should fail when field is undefined', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: undefined,
        fair_probability: 0.7,
        confidence: 0.8,
      };

      const result = validateRequiredFields(signal);

      expect(result.valid).toBe(false);
    });
  });

  describe('validateProbability', () => {
    it('should pass for valid probability 0.5', () => {
      const result = validateProbability(0.5);
      expect(result.valid).toBe(true);
    });

    it('should pass for probability 0 (lower bound)', () => {
      const result = validateProbability(0);
      expect(result.valid).toBe(true);
    });

    it('should pass for probability 1 (upper bound)', () => {
      const result = validateProbability(1);
      expect(result.valid).toBe(true);
    });

    it('should fail for probability < 0', () => {
      const result = validateProbability(-0.1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('[0, 1]');
    });

    it('should fail for probability > 1', () => {
      const result = validateProbability(1.5);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('[0, 1]');
    });

    it('should fail for non-number values', () => {
      const result = validateProbability('0.5' as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a valid number');
    });

    it('should fail for NaN', () => {
      const result = validateProbability(NaN);
      expect(result.valid).toBe(false);
    });

    it('should fail for Infinity', () => {
      const result = validateProbability(Infinity);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateConfidence', () => {
    it('should pass for valid confidence 0.8', () => {
      const result = validateConfidence(0.8);
      expect(result.valid).toBe(true);
    });

    it('should pass for confidence 0 (lower bound)', () => {
      const result = validateConfidence(0);
      expect(result.valid).toBe(true);
    });

    it('should pass for confidence 1 (upper bound)', () => {
      const result = validateConfidence(1);
      expect(result.valid).toBe(true);
    });

    it('should fail for confidence < 0', () => {
      const result = validateConfidence(-0.2);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('[0, 1]');
    });

    it('should fail for confidence > 1', () => {
      const result = validateConfidence(1.3);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('[0, 1]');
    });

    it('should fail for non-number values', () => {
      const result = validateConfidence('high' as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a valid number');
    });
  });

  describe('validateDirection', () => {
    it('should pass for YES', () => {
      const result = validateDirection('YES');
      expect(result.valid).toBe(true);
    });

    it('should pass for NO', () => {
      const result = validateDirection('NO');
      expect(result.valid).toBe(true);
    });

    it('should pass for NEUTRAL', () => {
      const result = validateDirection('NEUTRAL');
      expect(result.valid).toBe(true);
    });

    it('should pass for LONG_YES', () => {
      const result = validateDirection('LONG_YES');
      expect(result.valid).toBe(true);
    });

    it('should pass for LONG_NO', () => {
      const result = validateDirection('LONG_NO');
      expect(result.valid).toBe(true);
    });

    it('should pass for NO_TRADE', () => {
      const result = validateDirection('NO_TRADE');
      expect(result.valid).toBe(true);
    });

    it('should fail for invalid direction', () => {
      const result = validateDirection('MAYBE');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be one of');
    });

    it('should fail for lowercase direction', () => {
      const result = validateDirection('yes');
      expect(result.valid).toBe(false);
    });

    it('should fail for non-string values', () => {
      const result = validateDirection(123 as any);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('must be a string');
    });

    it('should fail for empty string', () => {
      const result = validateDirection('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateSignal', () => {
    it('should pass for completely valid signal', () => {
      const signal = {
        agent_name: 'polling_intelligence_agent',
        market_id: 'market-123',
        direction: 'YES',
        fair_probability: 0.68,
        confidence: 0.85,
        key_drivers: ['Strong polling', 'Demographic advantage'],
        metadata: { pollCount: 5 },
      };

      const result = validateSignal(signal);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple errors for invalid signal', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'INVALID',
        fair_probability: 1.5,
        confidence: -0.2,
      };

      const result = validateSignal(signal);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Should have errors for direction, probability, and confidence
      const errorFields = result.errors.map(e => e.field);
      expect(errorFields).toContain('direction');
      expect(errorFields).toContain('fair_probability');
      expect(errorFields).toContain('confidence');
    });

    it('should fail early if required fields are missing', () => {
      const signal = {
        agent_name: 'test_agent',
        // missing market_id, direction, fair_probability, confidence
      };

      const result = validateSignal(signal);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].field).toBe('required_fields');
    });

    it('should validate signal with boundary values', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'NEUTRAL',
        fair_probability: 0,
        confidence: 1,
      };

      const result = validateSignal(signal);

      expect(result.valid).toBe(true);
    });

    it('should handle signal with extra fields', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'YES',
        fair_probability: 0.7,
        confidence: 0.8,
        extra_field: 'should be ignored',
        another_field: 123,
      };

      const result = validateSignal(signal);

      expect(result.valid).toBe(true);
    });
  });

  describe('filterValidSignals', () => {
    it('should return all signals when all are valid', () => {
      const signals = [
        {
          agent_name: 'agent1',
          market_id: 'market1',
          direction: 'YES',
          fair_probability: 0.7,
          confidence: 0.8,
        },
        {
          agent_name: 'agent2',
          market_id: 'market1',
          direction: 'NO',
          fair_probability: 0.3,
          confidence: 0.9,
        },
      ];

      const filtered = filterValidSignals(signals);

      expect(filtered).toHaveLength(2);
      expect(filtered).toEqual(signals);
    });

    it('should filter out signals with invalid probability', () => {
      const signals = [
        {
          agent_name: 'agent1',
          market_id: 'market1',
          direction: 'YES',
          fair_probability: 0.7,
          confidence: 0.8,
        },
        {
          agent_name: 'agent2',
          market_id: 'market1',
          direction: 'NO',
          fair_probability: 1.5, // Invalid
          confidence: 0.9,
        },
      ];

      const filtered = filterValidSignals(signals);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].agent_name).toBe('agent1');
    });

    it('should filter out signals with invalid confidence', () => {
      const signals = [
        {
          agent_name: 'agent1',
          market_id: 'market1',
          direction: 'YES',
          fair_probability: 0.7,
          confidence: 0.8,
        },
        {
          agent_name: 'agent2',
          market_id: 'market1',
          direction: 'NO',
          fair_probability: 0.3,
          confidence: -0.1, // Invalid
        },
      ];

      const filtered = filterValidSignals(signals);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].agent_name).toBe('agent1');
    });

    it('should filter out signals with invalid direction', () => {
      const signals = [
        {
          agent_name: 'agent1',
          market_id: 'market1',
          direction: 'YES',
          fair_probability: 0.7,
          confidence: 0.8,
        },
        {
          agent_name: 'agent2',
          market_id: 'market1',
          direction: 'MAYBE', // Invalid
          fair_probability: 0.5,
          confidence: 0.6,
        },
      ];

      const filtered = filterValidSignals(signals);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].agent_name).toBe('agent1');
    });

    it('should filter out signals with missing required fields', () => {
      const signals = [
        {
          agent_name: 'agent1',
          market_id: 'market1',
          direction: 'YES',
          fair_probability: 0.7,
          confidence: 0.8,
        },
        {
          agent_name: 'agent2',
          // missing market_id
          direction: 'NO',
          fair_probability: 0.3,
          confidence: 0.9,
        },
      ];

      const filtered = filterValidSignals(signals);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].agent_name).toBe('agent1');
    });

    it('should return empty array when all signals are invalid', () => {
      const signals = [
        {
          agent_name: 'agent1',
          market_id: 'market1',
          direction: 'INVALID',
          fair_probability: 2.0,
          confidence: 1.5,
        },
        {
          agent_name: 'agent2',
          direction: 'NO',
          fair_probability: -0.5,
          confidence: 0.9,
        },
      ];

      const filtered = filterValidSignals(signals);

      expect(filtered).toHaveLength(0);
    });

    it('should handle empty array', () => {
      const filtered = filterValidSignals([]);
      expect(filtered).toHaveLength(0);
    });

    it('should filter mixed valid and invalid signals', () => {
      const signals = [
        {
          agent_name: 'valid1',
          market_id: 'market1',
          direction: 'YES',
          fair_probability: 0.7,
          confidence: 0.8,
        },
        {
          agent_name: 'invalid1',
          market_id: 'market1',
          direction: 'INVALID',
          fair_probability: 0.5,
          confidence: 0.6,
        },
        {
          agent_name: 'valid2',
          market_id: 'market1',
          direction: 'NO',
          fair_probability: 0.3,
          confidence: 0.9,
        },
        {
          agent_name: 'invalid2',
          market_id: 'market1',
          direction: 'YES',
          fair_probability: 1.5,
          confidence: 0.7,
        },
      ];

      const filtered = filterValidSignals(signals);

      expect(filtered).toHaveLength(2);
      expect(filtered[0].agent_name).toBe('valid1');
      expect(filtered[1].agent_name).toBe('valid2');
    });
  });

  describe('edge cases', () => {
    it('should handle signal with 0 probability and confidence', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'NEUTRAL',
        fair_probability: 0,
        confidence: 0,
      };

      const result = validateSignal(signal);
      expect(result.valid).toBe(true);
    });

    it('should handle signal with 1 probability and confidence', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'YES',
        fair_probability: 1,
        confidence: 1,
      };

      const result = validateSignal(signal);
      expect(result.valid).toBe(true);
    });

    it('should reject signal with probability just below 0', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'YES',
        fair_probability: -0.0001,
        confidence: 0.8,
      };

      const result = validateSignal(signal);
      expect(result.valid).toBe(false);
    });

    it('should reject signal with probability just above 1', () => {
      const signal = {
        agent_name: 'test_agent',
        market_id: 'test_market',
        direction: 'YES',
        fair_probability: 1.0001,
        confidence: 0.8,
      };

      const result = validateSignal(signal);
      expect(result.valid).toBe(false);
    });
  });
});
