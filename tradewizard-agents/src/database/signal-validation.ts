/**
 * Signal Validation Module
 *
 * This module provides validation utilities for agent signals to ensure
 * data integrity and correctness in the memory system.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

/**
 * Validation result for a signal field
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  value: unknown;
  reason: string;
}

/**
 * Complete validation result for a signal
 */
export interface SignalValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Valid direction values
 */
const VALID_DIRECTIONS = ['YES', 'NO', 'NEUTRAL', 'LONG_YES', 'LONG_NO', 'NO_TRADE'] as const;

/**
 * Validate that a signal has all required fields
 * Requirement 10.1: Required fields validation
 */
export function validateRequiredFields(signal: any): ValidationResult {
  const requiredFields = ['agent_name', 'market_id', 'direction', 'fair_probability', 'confidence'];
  
  for (const field of requiredFields) {
    if (signal[field] === null || signal[field] === undefined) {
      return {
        valid: false,
        error: `Missing required field: ${field}`,
      };
    }
  }
  
  return { valid: true };
}

/**
 * Validate fair_probability is in range [0, 1]
 * Requirement 10.3: Probability range validation
 */
export function validateProbability(probability: number): ValidationResult {
  if (typeof probability !== 'number' || isNaN(probability)) {
    return {
      valid: false,
      error: 'fair_probability must be a valid number',
    };
  }
  
  if (probability < 0 || probability > 1) {
    return {
      valid: false,
      error: `fair_probability must be in range [0, 1], got ${probability}`,
    };
  }
  
  return { valid: true };
}

/**
 * Validate confidence is in range [0, 1]
 * Requirement 10.4: Confidence range validation
 */
export function validateConfidence(confidence: number): ValidationResult {
  if (typeof confidence !== 'number' || isNaN(confidence)) {
    return {
      valid: false,
      error: 'confidence must be a valid number',
    };
  }
  
  if (confidence < 0 || confidence > 1) {
    return {
      valid: false,
      error: `confidence must be in range [0, 1], got ${confidence}`,
    };
  }
  
  return { valid: true };
}

/**
 * Validate direction is one of the allowed values
 * Requirement 10.5: Direction enum validation
 */
export function validateDirection(direction: string): ValidationResult {
  if (typeof direction !== 'string') {
    return {
      valid: false,
      error: 'direction must be a string',
    };
  }
  
  if (!VALID_DIRECTIONS.includes(direction as any)) {
    return {
      valid: false,
      error: `direction must be one of [${VALID_DIRECTIONS.join(', ')}], got ${direction}`,
    };
  }
  
  return { valid: true };
}

/**
 * Validate a complete signal
 * Returns validation result with all errors
 */
export function validateSignal(signal: any): SignalValidationResult {
  const errors: ValidationError[] = [];
  
  // Check required fields
  const requiredResult = validateRequiredFields(signal);
  if (!requiredResult.valid) {
    errors.push({
      field: 'required_fields',
      value: signal,
      reason: requiredResult.error!,
    });
    // If required fields are missing, no point checking other validations
    return { valid: false, errors };
  }
  
  // Validate probability
  const probResult = validateProbability(signal.fair_probability);
  if (!probResult.valid) {
    errors.push({
      field: 'fair_probability',
      value: signal.fair_probability,
      reason: probResult.error!,
    });
  }
  
  // Validate confidence
  const confResult = validateConfidence(signal.confidence);
  if (!confResult.valid) {
    errors.push({
      field: 'confidence',
      value: signal.confidence,
      reason: confResult.error!,
    });
  }
  
  // Validate direction
  const dirResult = validateDirection(signal.direction);
  if (!dirResult.valid) {
    errors.push({
      field: 'direction',
      value: signal.direction,
      reason: dirResult.error!,
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Filter out invalid signals from an array
 * Returns only valid signals and logs warnings for invalid ones
 */
export function filterValidSignals(signals: any[]): any[] {
  return signals.filter((signal) => {
    const validation = validateSignal(signal);
    if (!validation.valid) {
      console.warn('[SignalValidation] Invalid signal filtered out:', {
        signal,
        errors: validation.errors,
      });
      return false;
    }
    return true;
  });
}
