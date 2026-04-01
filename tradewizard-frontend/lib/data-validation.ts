/**
 * Data Validation Utilities
 * 
 * Provides validation and filtering functions for incomplete data scenarios.
 * Used to ensure data quality and exclude incomplete recommendations from calculations.
 * 
 * Requirements: 15.1, 15.2
 */

import { RecommendationWithOutcome } from "./performance-calculations";
import { PriceHistoryPoint } from "@/hooks/usePriceHistory";
import { logWarning } from "@/utils/errorLogging";

/**
 * Validation result for recommendations
 */
export interface RecommendationValidation {
  isValid: boolean;
  missingFields: string[];
  reason?: string;
}

/**
 * Validation result for price history
 */
export interface PriceHistoryValidation {
  isValid: boolean;
  hasMinimumPoints: boolean;
  hasGaps: boolean;
  gapCount: number;
  reason?: string;
}

/**
 * Summary of data completeness
 */
export interface DataCompletenessSummary {
  totalRecommendations: number;
  validRecommendations: number;
  invalidRecommendations: number;
  incompleteRecommendations: RecommendationWithOutcome[];
  missingDataReasons: string[];
  priceHistoryStatus: PriceHistoryValidation;
}

/**
 * Validate a single recommendation for completeness
 * 
 * A recommendation is considered complete if it has:
 * - Valid entry price (between 0 and 1)
 * - Either an exit price OR a resolution outcome
 * - Valid timestamps
 * 
 * @param recommendation - Recommendation to validate
 * @returns Validation result with missing fields
 */
export function validateRecommendation(
  recommendation: RecommendationWithOutcome
): RecommendationValidation {
  const missingFields: string[] = [];

  // Check entry price
  if (
    recommendation.marketPriceAtRecommendation === undefined ||
    recommendation.marketPriceAtRecommendation === null ||
    recommendation.marketPriceAtRecommendation <= 0 ||
    recommendation.marketPriceAtRecommendation > 1
  ) {
    missingFields.push("entryPrice");
  }

  // Check exit price or resolution outcome
  const hasExitPrice =
    recommendation.exitPrice !== undefined &&
    recommendation.exitPrice !== null &&
    recommendation.exitPrice >= 0 &&
    recommendation.exitPrice <= 1;

  const hasResolutionOutcome =
    recommendation.actualOutcome === "YES" ||
    recommendation.actualOutcome === "NO";

  if (!hasExitPrice && !hasResolutionOutcome) {
    missingFields.push("exitPrice or resolutionOutcome");
  }

  // Check timestamps
  if (!recommendation.createdAt) {
    missingFields.push("createdAt");
  }

  const isValid = missingFields.length === 0;

  return {
    isValid,
    missingFields,
    reason: isValid
      ? undefined
      : `Missing or invalid: ${missingFields.join(", ")}`,
  };
}

/**
 * Filter recommendations to only include complete ones
 * Logs warnings for incomplete recommendations
 * 
 * @param recommendations - Array of recommendations to filter
 * @param context - Context for logging (e.g., "InvestmentSimulator")
 * @returns Array of valid recommendations
 */
export function filterCompleteRecommendations(
  recommendations: RecommendationWithOutcome[],
  context: string = "DataValidation"
): RecommendationWithOutcome[] {
  if (!recommendations || recommendations.length === 0) {
    return [];
  }

  const validRecommendations: RecommendationWithOutcome[] = [];
  const invalidRecommendations: RecommendationWithOutcome[] = [];

  recommendations.forEach((rec) => {
    const validation = validateRecommendation(rec);

    if (validation.isValid) {
      validRecommendations.push(rec);
    } else {
      invalidRecommendations.push(rec);
      logWarning(
        `Incomplete recommendation excluded from ${context}: ${validation.reason}`,
        {
          component: context,
          recommendationId: rec.id,
          missingFields: validation.missingFields,
        }
      );
    }
  });

  if (invalidRecommendations.length > 0) {
    logWarning(
      `${invalidRecommendations.length} of ${recommendations.length} recommendations excluded due to incomplete data`,
      {
        component: context,
        totalRecommendations: recommendations.length,
        validRecommendations: validRecommendations.length,
        invalidRecommendations: invalidRecommendations.length,
      }
    );
  }

  return validRecommendations;
}

/**
 * Validate price history for completeness
 * 
 * Price history is considered valid if:
 * - Has at least 2 data points
 * - All prices are between 0 and 1
 * - Timestamps are in chronological order
 * 
 * @param priceHistory - Price history to validate
 * @param minPoints - Minimum number of points required (default: 2)
 * @returns Validation result
 */
export function validatePriceHistory(
  priceHistory: PriceHistoryPoint[],
  minPoints: number = 2
): PriceHistoryValidation {
  if (!priceHistory || priceHistory.length === 0) {
    return {
      isValid: false,
      hasMinimumPoints: false,
      hasGaps: false,
      gapCount: 0,
      reason: "No price history data available",
    };
  }

  if (priceHistory.length < minPoints) {
    return {
      isValid: false,
      hasMinimumPoints: false,
      hasGaps: false,
      gapCount: 0,
      reason: `Insufficient data points (${priceHistory.length} < ${minPoints})`,
    };
  }

  // Check for invalid prices
  const invalidPrices = priceHistory.filter(
    (point) => point.price < 0 || point.price > 1
  );

  if (invalidPrices.length > 0) {
    return {
      isValid: false,
      hasMinimumPoints: true,
      hasGaps: false,
      gapCount: 0,
      reason: `${invalidPrices.length} price points out of valid range [0, 1]`,
    };
  }

  // Check for chronological order and gaps
  let gapCount = 0;
  const sortedHistory = [...priceHistory].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (let i = 1; i < sortedHistory.length; i++) {
    const prevTime = new Date(sortedHistory[i - 1].timestamp).getTime();
    const currTime = new Date(sortedHistory[i].timestamp).getTime();

    // Check for large gaps (more than 7 days)
    const daysDiff = (currTime - prevTime) / (1000 * 60 * 60 * 24);
    if (daysDiff > 7) {
      gapCount++;
    }
  }

  return {
    isValid: true,
    hasMinimumPoints: true,
    hasGaps: gapCount > 0,
    gapCount,
    reason: gapCount > 0 ? `${gapCount} gaps detected in price history` : undefined,
  };
}

/**
 * Get comprehensive data completeness summary
 * 
 * @param recommendations - Recommendations to analyze
 * @param priceHistory - Price history to analyze
 * @returns Summary of data completeness
 */
export function getDataCompletenessSummary(
  recommendations: RecommendationWithOutcome[],
  priceHistory: PriceHistoryPoint[]
): DataCompletenessSummary {
  const totalRecommendations = recommendations?.length || 0;
  const incompleteRecommendations: RecommendationWithOutcome[] = [];
  const missingDataReasons: string[] = [];

  let validRecommendations = 0;

  if (recommendations && recommendations.length > 0) {
    recommendations.forEach((rec) => {
      const validation = validateRecommendation(rec);
      if (validation.isValid) {
        validRecommendations++;
      } else {
        incompleteRecommendations.push(rec);
        if (validation.reason && !missingDataReasons.includes(validation.reason)) {
          missingDataReasons.push(validation.reason);
        }
      }
    });
  }

  const priceHistoryStatus = validatePriceHistory(priceHistory);

  if (!priceHistoryStatus.isValid && priceHistoryStatus.reason) {
    missingDataReasons.push(`Price history: ${priceHistoryStatus.reason}`);
  }

  return {
    totalRecommendations,
    validRecommendations,
    invalidRecommendations: incompleteRecommendations.length,
    incompleteRecommendations,
    missingDataReasons,
    priceHistoryStatus,
  };
}

/**
 * Check if data is sufficient for specific calculations
 */
export interface CalculationRequirements {
  profitLoss: boolean;
  accuracy: boolean;
  riskMetrics: boolean;
  priceChart: boolean;
}

/**
 * Determine which calculations can be performed with available data
 * 
 * @param summary - Data completeness summary
 * @returns Object indicating which calculations are possible
 */
export function getCalculationRequirements(
  summary: DataCompletenessSummary
): CalculationRequirements {
  return {
    // P/L requires at least 1 valid recommendation
    profitLoss: summary.validRecommendations > 0,

    // Accuracy requires at least 1 valid recommendation
    accuracy: summary.validRecommendations > 0,

    // Risk metrics require at least 2 valid recommendations
    riskMetrics: summary.validRecommendations >= 2,

    // Price chart requires valid price history
    priceChart: summary.priceHistoryStatus.isValid,
  };
}
