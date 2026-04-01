/**
 * Performance Calculation Utilities
 * 
 * This module provides calculation functions for the Closed Markets Performance Viewer.
 * All calculations follow the specifications in the design document and handle edge cases
 * gracefully by returning null for invalid inputs.
 * 
 * Error Handling Strategy:
 * - Division by zero returns null and displays "N/A" in UI
 * - Invalid input data is validated before calculations
 * - Warnings are logged for invalid data without crashing
 * - Calculations skip invalid entries and continue processing
 * 
 * @module performance-calculations
 */

/**
 * Polymarket trading fee (2% on winning positions only)
 */
const POLYMARKET_FEE = 0.02;

/**
 * Validates that a number is finite and not NaN
 */
function isValidNumber(value: any): value is number {
  return typeof value === 'number' && isFinite(value) && !isNaN(value);
}

/**
 * Validates that a price is within valid range [0, 1]
 */
function isValidPrice(price: any): price is number {
  return isValidNumber(price) && price >= 0 && price <= 1;
}

/**
 * Logs a warning message for invalid data
 */
function logWarning(message: string, context?: Record<string, any>): void {
  console.warn(`[Performance Calculations] ${message}`, context || '');
}

/**
 * Represents a single simulated trade based on an AI recommendation
 */
export interface SimulatedTrade {
  recommendationId: string;
  entryPrice: number;
  exitPrice: number;
  shares: number;
  entryFee: number;
  exitFee: number;
  grossProfitLoss: number;
  netProfitLoss: number;
  roi: number;
  timestamp: string;
}

/**
 * Represents cumulative performance at a point in time
 */
export interface CumulativePerformance {
  timestamp: string;
  cumulativePL: number;
  cumulativeROI: number;
  tradeCount: number;
}

/**
 * Summary of simulated portfolio performance
 */
export interface PortfolioSummary {
  totalPL: number;
  totalROI: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
}

/**
 * Complete simulated portfolio result
 */
export interface SimulatedPortfolio {
  trades: SimulatedTrade[];
  cumulative: CumulativePerformance[];
  summary: PortfolioSummary;
}

/**
 * Recommendation with outcome data for calculations
 */
export interface RecommendationWithOutcome {
  id: string;
  marketId: string;
  direction: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  confidence: 'high' | 'moderate' | 'low';
  fairProbability: number;
  marketEdge: number;
  expectedValue: number;
  entryZoneMin: number;
  entryZoneMax: number;
  explanation: string;
  createdAt: string;
  actualOutcome: string;
  wasCorrect: boolean;
  roiRealized: number;
  edgeCaptured: number;
  marketPriceAtRecommendation: number;
  resolutionDate: string;
  entryPrice: number;
  exitPrice?: number;
}

/**
 * Accuracy metrics for recommendations
 */
export interface AccuracyMetrics {
  totalRecommendations: number;
  correctRecommendations: number;
  accuracyPercentage: number;
  averageConfidence: number;
  confidenceAccuracyCorrelation: number;
  byConfidence: {
    high: { total: number; correct: number; percentage: number };
    moderate: { total: number; correct: number; percentage: number };
    low: { total: number; correct: number; percentage: number };
  };
}

/**
 * Risk-adjusted performance metrics
 */
export interface RiskMetrics {
  sharpeRatio: number | null;
  maxDrawdown: number;
  volatility: number;
  riskAdjustedReturn: number | null;
}

/**
 * Calibration analysis metrics
 */
export interface CalibrationMetrics {
  calibrationError: number;
  avgConfidenceCorrect: number;
  avgConfidenceIncorrect: number;
  confidenceAccuracyCorrelation: number;
}

/**
 * Baseline strategy comparison results
 */
export interface BaselineComparison {
  buyAndHold: {
    roi: number;
    profitLoss: number;
  };
  randomStrategy: {
    roi: number;
    profitLoss: number;
    iterations: number;
  };
  aiPerformance: {
    roi: number;
    profitLoss: number;
  };
  statisticalSignificance: {
    pValue: number;
    isSignificant: boolean;
  };
}

/**
 * Task 3.1: Calculate simulated portfolio performance
 * 
 * Simulates profit/loss from following AI recommendations with a specified investment amount.
 * Applies Polymarket's 2% fee only on winning positions.
 * 
 * @param recommendations - Array of recommendations with outcome data
 * @param investmentAmount - Amount to invest per recommendation (in dollars)
 * @returns Simulated portfolio with trades, cumulative performance, and summary
 * 
 * @example
 * ```typescript
 * const portfolio = calculateSimulatedPortfolio(recommendations, 100);
 * console.log(`Total P/L: $${portfolio.summary.totalPL.toFixed(2)}`);
 * console.log(`Win Rate: ${portfolio.summary.winRate.toFixed(1)}%`);
 * ```
 */
export function calculateSimulatedPortfolio(
  recommendations: RecommendationWithOutcome[],
  investmentAmount: number
): SimulatedPortfolio {
  // Validate input parameters
  if (!recommendations || !Array.isArray(recommendations)) {
    logWarning('Invalid recommendations array provided', { recommendations });
    return {
      trades: [],
      cumulative: [],
      summary: {
        totalPL: 0,
        totalROI: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
      },
    };
  }

  if (!isValidNumber(investmentAmount) || investmentAmount <= 0) {
    logWarning('Invalid investment amount', { investmentAmount });
    return {
      trades: [],
      cumulative: [],
      summary: {
        totalPL: 0,
        totalROI: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
      },
    };
  }

  if (recommendations.length === 0) {
    return {
      trades: [],
      cumulative: [],
      summary: {
        totalPL: 0,
        totalROI: 0,
        winRate: 0,
        avgWin: 0,
        avgLoss: 0,
      },
    };
  }

  const trades: SimulatedTrade[] = [];
  const cumulative: CumulativePerformance[] = [];
  let cumulativePL = 0;

  // Filter out NO_TRADE recommendations
  const tradableRecs = recommendations.filter(rec => rec.direction !== 'NO_TRADE');

  tradableRecs.forEach((rec) => {
    const entryPrice = rec.marketPriceAtRecommendation;
    
    // Validate entry price exists and is valid
    if (!isValidPrice(entryPrice)) {
      logWarning('Invalid or missing entry price for recommendation', { 
        recommendationId: rec.id, 
        entryPrice 
      });
      return; // Skip this recommendation
    }
    
    // Division by zero check for entry price
    if (entryPrice === 0) {
      logWarning('Entry price is zero, cannot calculate shares', { 
        recommendationId: rec.id 
      });
      return; // Skip this recommendation
    }
    
    // Use exit price if available, otherwise use resolution price (1 for YES, 0 for NO)
    let exitPrice = rec.exitPrice;
    if (exitPrice === undefined || exitPrice === null) {
      // Check if we have a valid resolution outcome
      if (rec.actualOutcome !== 'YES' && rec.actualOutcome !== 'NO') {
        logWarning('Missing exit price and resolution outcome for recommendation', { 
          recommendationId: rec.id,
          actualOutcome: rec.actualOutcome
        });
        return; // Skip this recommendation
      }
      exitPrice = rec.actualOutcome === 'YES' ? 1 : 0;
    }

    // Validate exit price is in valid range [0, 1]
    if (!isValidPrice(exitPrice)) {
      logWarning('Invalid exit price for recommendation', { 
        recommendationId: rec.id, 
        exitPrice 
      });
      return; // Skip this recommendation
    }

    // Calculate shares purchased (safe after division by zero check)
    const shares = investmentAmount / entryPrice;

    // Validate shares calculation
    if (!isValidNumber(shares)) {
      logWarning('Invalid shares calculation', { 
        recommendationId: rec.id, 
        shares, 
        investmentAmount, 
        entryPrice 
      });
      return; // Skip this recommendation
    }

    // Calculate gross P/L
    const grossPL = shares * (exitPrice - entryPrice);

    // Validate gross P/L
    if (!isValidNumber(grossPL)) {
      logWarning('Invalid gross P/L calculation', { 
        recommendationId: rec.id, 
        grossPL 
      });
      return; // Skip this recommendation
    }

    // Apply fees only on winning positions (2% of gross profit)
    const fees = grossPL > 0 ? grossPL * POLYMARKET_FEE : 0;
    const netPL = grossPL - fees;

    // Calculate ROI as percentage (safe after division by zero check)
    const roi = (netPL / investmentAmount) * 100;

    // Validate final calculations
    if (!isValidNumber(roi) || !isValidNumber(netPL)) {
      logWarning('Invalid final calculations', { 
        recommendationId: rec.id, 
        roi, 
        netPL 
      });
      return; // Skip this recommendation
    }

    trades.push({
      recommendationId: rec.id,
      entryPrice,
      exitPrice,
      shares,
      entryFee: 0, // Polymarket doesn't charge entry fees
      exitFee: fees,
      grossProfitLoss: grossPL,
      netProfitLoss: netPL,
      roi,
      timestamp: rec.createdAt,
    });

    cumulativePL += netPL;

    cumulative.push({
      timestamp: rec.createdAt,
      cumulativePL,
      cumulativeROI: (cumulativePL / (investmentAmount * trades.length)) * 100,
      tradeCount: trades.length,
    });
  });

  // Calculate summary statistics with division by zero protection
  const wins = trades.filter(t => t.netProfitLoss > 0);
  const losses = trades.filter(t => t.netProfitLoss < 0);

  const summary: PortfolioSummary = {
    totalPL: cumulativePL,
    totalROI: trades.length > 0 ? (cumulativePL / (investmentAmount * trades.length)) * 100 : 0,
    winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
    avgWin: wins.length > 0 ? wins.reduce((sum, t) => sum + t.netProfitLoss, 0) / wins.length : 0,
    avgLoss: losses.length > 0 ? losses.reduce((sum, t) => sum + t.netProfitLoss, 0) / losses.length : 0,
  };

  return {
    trades,
    cumulative,
    summary,
  };
}

/**
 * Task 3.3: Calculate accuracy metrics for recommendations
 * 
 * Calculates overall accuracy, accuracy by confidence level, and correlation
 * between confidence and accuracy.
 * 
 * @param recommendations - Array of recommendations with outcome data
 * @returns Accuracy metrics including overall and by-confidence breakdowns
 * 
 * @example
 * ```typescript
 * const metrics = calculateAccuracyMetrics(recommendations);
 * console.log(`Accuracy: ${metrics.accuracyPercentage.toFixed(1)}%`);
 * console.log(`High confidence accuracy: ${metrics.byConfidence.high.percentage.toFixed(1)}%`);
 * ```
 */
export function calculateAccuracyMetrics(
  recommendations: RecommendationWithOutcome[]
): AccuracyMetrics {
  // Validate input
  if (!recommendations || !Array.isArray(recommendations)) {
    logWarning('Invalid recommendations array provided to calculateAccuracyMetrics', { recommendations });
    return {
      totalRecommendations: 0,
      correctRecommendations: 0,
      accuracyPercentage: 0,
      averageConfidence: 0,
      confidenceAccuracyCorrelation: 0,
      byConfidence: {
        high: { total: 0, correct: 0, percentage: 0 },
        moderate: { total: 0, correct: 0, percentage: 0 },
        low: { total: 0, correct: 0, percentage: 0 },
      },
    };
  }

  if (recommendations.length === 0) {
    return {
      totalRecommendations: 0,
      correctRecommendations: 0,
      accuracyPercentage: 0,
      averageConfidence: 0,
      confidenceAccuracyCorrelation: 0,
      byConfidence: {
        high: { total: 0, correct: 0, percentage: 0 },
        moderate: { total: 0, correct: 0, percentage: 0 },
        low: { total: 0, correct: 0, percentage: 0 },
      },
    };
  }

  const total = recommendations.length;
  const correct = recommendations.filter(r => r.wasCorrect).length;
  
  // Division by zero protection
  const accuracyPercentage = total > 0 ? (correct / total) * 100 : 0;

  // Calculate average confidence (convert confidence levels to numeric values)
  const confidenceValues = recommendations.map(r => {
    switch (r.confidence) {
      case 'high': return 3;
      case 'moderate': return 2;
      case 'low': return 1;
      default: 
        logWarning('Unknown confidence level', { confidence: r.confidence, recommendationId: r.id });
        return 2;
    }
  });
  
  // Division by zero protection
  const avgConfidence = total > 0 
    ? confidenceValues.reduce((sum, val) => sum + val, 0) / total 
    : 0;

  // Calculate accuracy by confidence level
  const byConfidence = {
    high: calculateConfidenceAccuracy(recommendations, 'high'),
    moderate: calculateConfidenceAccuracy(recommendations, 'moderate'),
    low: calculateConfidenceAccuracy(recommendations, 'low'),
  };

  // Calculate correlation between confidence and accuracy
  const correlation = calculateCorrelation(
    confidenceValues,
    recommendations.map(r => r.wasCorrect ? 1 : 0)
  );

  // Validate correlation result
  if (!isValidNumber(correlation)) {
    logWarning('Invalid correlation calculation result', { correlation });
  }

  return {
    totalRecommendations: total,
    correctRecommendations: correct,
    accuracyPercentage,
    averageConfidence: avgConfidence,
    confidenceAccuracyCorrelation: isValidNumber(correlation) ? correlation : 0,
    byConfidence,
  };
}

/**
 * Helper function to calculate accuracy for a specific confidence level
 */
function calculateConfidenceAccuracy(
  recommendations: RecommendationWithOutcome[],
  confidence: 'high' | 'moderate' | 'low'
): { total: number; correct: number; percentage: number } {
  const filtered = recommendations.filter(r => r.confidence === confidence);
  const total = filtered.length;
  const correct = filtered.filter(r => r.wasCorrect).length;
  const percentage = total > 0 ? (correct / total) * 100 : 0;

  return { total, correct, percentage };
}

/**
 * Task 3.5: Calculate risk-adjusted performance metrics
 * 
 * Calculates Sharpe ratio, maximum drawdown, and volatility for a series of returns.
 * Assumes risk-free rate of 0 for Sharpe ratio calculation.
 * 
 * @param returns - Array of return percentages (e.g., [5.2, -3.1, 8.7])
 * @returns Risk metrics including Sharpe ratio, max drawdown, and volatility
 * 
 * @example
 * ```typescript
 * const returns = trades.map(t => t.roi);
 * const risk = calculateRiskMetrics(returns);
 * console.log(`Sharpe Ratio: ${risk.sharpeRatio?.toFixed(2) ?? 'N/A'}`);
 * console.log(`Max Drawdown: ${risk.maxDrawdown.toFixed(2)}%`);
 * ```
 */
export function calculateRiskMetrics(returns: number[]): RiskMetrics {
  // Validate input
  if (!returns || !Array.isArray(returns)) {
    logWarning('Invalid returns array provided to calculateRiskMetrics', { returns });
    return {
      sharpeRatio: null,
      maxDrawdown: 0,
      volatility: 0,
      riskAdjustedReturn: null,
    };
  }

  if (returns.length === 0) {
    return {
      sharpeRatio: null,
      maxDrawdown: 0,
      volatility: 0,
      riskAdjustedReturn: null,
    };
  }

  // Filter out invalid returns
  const validReturns = returns.filter(r => isValidNumber(r));
  
  if (validReturns.length === 0) {
    logWarning('No valid returns found in array', { originalLength: returns.length });
    return {
      sharpeRatio: null,
      maxDrawdown: 0,
      volatility: 0,
      riskAdjustedReturn: null,
    };
  }

  if (validReturns.length !== returns.length) {
    logWarning('Some invalid returns were filtered out', { 
      original: returns.length, 
      valid: validReturns.length 
    });
  }

  // Calculate average return with division by zero protection
  const avgReturn = validReturns.length > 0 
    ? validReturns.reduce((sum, r) => sum + r, 0) / validReturns.length 
    : 0;

  // Calculate volatility (standard deviation) with division by zero protection
  const variance = validReturns.length > 0
    ? validReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / validReturns.length
    : 0;
  const volatility = Math.sqrt(variance);

  // Validate volatility calculation
  if (!isValidNumber(volatility)) {
    logWarning('Invalid volatility calculation', { volatility, variance });
    return {
      sharpeRatio: null,
      maxDrawdown: 0,
      volatility: 0,
      riskAdjustedReturn: null,
    };
  }

  // Calculate Sharpe ratio (assuming risk-free rate of 0)
  // Division by zero protection: return null if volatility is zero
  const sharpeRatio = volatility > 0 ? avgReturn / volatility : null;

  // Validate Sharpe ratio
  if (sharpeRatio !== null && !isValidNumber(sharpeRatio)) {
    logWarning('Invalid Sharpe ratio calculation', { sharpeRatio, avgReturn, volatility });
  }

  // Calculate maximum drawdown
  const maxDrawdown = calculateMaxDrawdown(validReturns);

  // Validate max drawdown
  if (!isValidNumber(maxDrawdown)) {
    logWarning('Invalid max drawdown calculation', { maxDrawdown });
  }

  // Calculate risk-adjusted return (return per unit of volatility)
  // Division by zero protection: return null if volatility is zero
  const riskAdjustedReturn = volatility > 0 ? avgReturn / volatility : null;

  // Validate risk-adjusted return
  if (riskAdjustedReturn !== null && !isValidNumber(riskAdjustedReturn)) {
    logWarning('Invalid risk-adjusted return calculation', { riskAdjustedReturn });
  }

  return {
    sharpeRatio: sharpeRatio !== null && isValidNumber(sharpeRatio) ? sharpeRatio : null,
    maxDrawdown: isValidNumber(maxDrawdown) ? maxDrawdown : 0,
    volatility: isValidNumber(volatility) ? volatility : 0,
    riskAdjustedReturn: riskAdjustedReturn !== null && isValidNumber(riskAdjustedReturn) ? riskAdjustedReturn : null,
  };
}

/**
 * Helper function to calculate maximum drawdown from returns
 */
function calculateMaxDrawdown(returns: number[]): number {
  if (returns.length === 0) return 0;

  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;

  for (const ret of returns) {
    cumulative += ret;
    
    if (cumulative > peak) {
      peak = cumulative;
    }
    
    const drawdown = peak - cumulative;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }

  return maxDrawdown;
}

/**
 * Task 3.7: Calculate calibration analysis metrics
 * 
 * Analyzes how well confidence levels correlate with actual outcomes.
 * Calculates calibration error and average confidence for correct vs incorrect predictions.
 * 
 * @param recommendations - Array of recommendations with outcome data
 * @returns Calibration metrics including error and confidence segmentation
 * 
 * @example
 * ```typescript
 * const calibration = calculateCalibrationMetrics(recommendations);
 * console.log(`Calibration Error: ${calibration.calibrationError.toFixed(3)}`);
 * console.log(`Avg Confidence (Correct): ${calibration.avgConfidenceCorrect.toFixed(2)}`);
 * ```
 */
export function calculateCalibrationMetrics(
  recommendations: RecommendationWithOutcome[]
): CalibrationMetrics {
  // Validate input
  if (!recommendations || !Array.isArray(recommendations)) {
    logWarning('Invalid recommendations array provided to calculateCalibrationMetrics', { recommendations });
    return {
      calibrationError: 0,
      avgConfidenceCorrect: 0,
      avgConfidenceIncorrect: 0,
      confidenceAccuracyCorrelation: 0,
    };
  }

  if (recommendations.length === 0) {
    return {
      calibrationError: 0,
      avgConfidenceCorrect: 0,
      avgConfidenceIncorrect: 0,
      confidenceAccuracyCorrelation: 0,
    };
  }

  // Calculate calibration error (mean absolute difference between predicted probability and outcome)
  const calibrationErrors = recommendations
    .filter(rec => isValidNumber(rec.fairProbability))
    .map(rec => {
      const predicted = rec.fairProbability;
      const actual = rec.wasCorrect ? 1 : 0;
      return Math.abs(predicted - actual);
    });

  if (calibrationErrors.length === 0) {
    logWarning('No valid fair probabilities found for calibration calculation');
    return {
      calibrationError: 0,
      avgConfidenceCorrect: 0,
      avgConfidenceIncorrect: 0,
      confidenceAccuracyCorrelation: 0,
    };
  }

  // Division by zero protection
  const calibrationError = calibrationErrors.length > 0
    ? calibrationErrors.reduce((sum, err) => sum + err, 0) / calibrationErrors.length
    : 0;

  // Validate calibration error
  if (!isValidNumber(calibrationError)) {
    logWarning('Invalid calibration error calculation', { calibrationError });
  }

  // Segment by correctness
  const correct = recommendations.filter(r => r.wasCorrect);
  const incorrect = recommendations.filter(r => !r.wasCorrect);

  // Calculate average confidence for each segment (using numeric values)
  // Division by zero protection
  const avgConfidenceCorrect = correct.length > 0
    ? correct.reduce((sum, r) => sum + confidenceToNumeric(r.confidence), 0) / correct.length
    : 0;

  const avgConfidenceIncorrect = incorrect.length > 0
    ? incorrect.reduce((sum, r) => sum + confidenceToNumeric(r.confidence), 0) / incorrect.length
    : 0;

  // Calculate correlation between confidence and accuracy
  const confidenceValues = recommendations.map(r => confidenceToNumeric(r.confidence));
  const accuracyValues = recommendations.map(r => r.wasCorrect ? 1 : 0);
  const correlation = calculateCorrelation(confidenceValues, accuracyValues);

  // Validate correlation
  if (!isValidNumber(correlation)) {
    logWarning('Invalid correlation in calibration metrics', { correlation });
  }

  return {
    calibrationError: isValidNumber(calibrationError) ? calibrationError : 0,
    avgConfidenceCorrect: isValidNumber(avgConfidenceCorrect) ? avgConfidenceCorrect : 0,
    avgConfidenceIncorrect: isValidNumber(avgConfidenceIncorrect) ? avgConfidenceIncorrect : 0,
    confidenceAccuracyCorrelation: isValidNumber(correlation) ? correlation : 0,
  };
}

/**
 * Helper function to convert confidence level to numeric value
 */
function confidenceToNumeric(confidence: 'high' | 'moderate' | 'low'): number {
  switch (confidence) {
    case 'high': return 3;
    case 'moderate': return 2;
    case 'low': return 1;
    default: return 2;
  }
}

/**
 * Task 3.8: Calculate baseline strategy comparison
 * 
 * Compares AI performance against buy-and-hold and random strategy baselines.
 * Uses Monte Carlo simulation for random strategy (1000 iterations).
 * 
 * @param recommendations - Array of recommendations with outcome data
 * @param investmentAmount - Amount invested per recommendation
 * @param firstRecommendationPrice - Market price at first recommendation
 * @param finalPrice - Final market resolution price (1 for YES, 0 for NO)
 * @returns Baseline comparison with statistical significance
 * 
 * @example
 * ```typescript
 * const comparison = calculateBaselineComparison(recommendations, 100, 0.45, 1);
 * console.log(`AI ROI: ${comparison.aiPerformance.roi.toFixed(2)}%`);
 * console.log(`Buy & Hold ROI: ${comparison.buyAndHold.roi.toFixed(2)}%`);
 * console.log(`Significant: ${comparison.statisticalSignificance.isSignificant}`);
 * ```
 */
export function calculateBaselineComparison(
  recommendations: RecommendationWithOutcome[],
  investmentAmount: number,
  firstRecommendationPrice: number,
  finalPrice: number
): BaselineComparison {
  // Validate inputs
  if (!recommendations || !Array.isArray(recommendations)) {
    logWarning('Invalid recommendations array provided to calculateBaselineComparison', { recommendations });
    return createEmptyBaselineComparison();
  }

  if (!isValidNumber(investmentAmount) || investmentAmount <= 0) {
    logWarning('Invalid investment amount', { investmentAmount });
    return createEmptyBaselineComparison();
  }

  if (!isValidPrice(firstRecommendationPrice)) {
    logWarning('Invalid first recommendation price', { firstRecommendationPrice });
    return createEmptyBaselineComparison();
  }

  if (!isValidPrice(finalPrice)) {
    logWarning('Invalid final price', { finalPrice });
    return createEmptyBaselineComparison();
  }

  // Division by zero check for first recommendation price
  if (firstRecommendationPrice === 0) {
    logWarning('First recommendation price is zero, cannot calculate baseline comparison');
    return createEmptyBaselineComparison();
  }

  // Calculate AI performance
  const aiPortfolio = calculateSimulatedPortfolio(recommendations, investmentAmount);
  const aiPerformance = {
    roi: aiPortfolio.summary.totalROI,
    profitLoss: aiPortfolio.summary.totalPL,
  };

  // Calculate buy-and-hold baseline (safe after division by zero check)
  const buyAndHoldShares = investmentAmount / firstRecommendationPrice;
  const buyAndHoldGrossPL = buyAndHoldShares * (finalPrice - firstRecommendationPrice);
  const buyAndHoldFees = buyAndHoldGrossPL > 0 ? buyAndHoldGrossPL * POLYMARKET_FEE : 0;
  const buyAndHoldNetPL = buyAndHoldGrossPL - buyAndHoldFees;
  const buyAndHoldROI = (buyAndHoldNetPL / investmentAmount) * 100;

  // Validate buy-and-hold calculations
  if (!isValidNumber(buyAndHoldROI) || !isValidNumber(buyAndHoldNetPL)) {
    logWarning('Invalid buy-and-hold calculations', { buyAndHoldROI, buyAndHoldNetPL });
  }

  const buyAndHold = {
    roi: isValidNumber(buyAndHoldROI) ? buyAndHoldROI : 0,
    profitLoss: isValidNumber(buyAndHoldNetPL) ? buyAndHoldNetPL : 0,
  };

  // Calculate random strategy baseline (Monte Carlo simulation)
  const randomIterations = 1000;
  const randomResults: number[] = [];

  for (let i = 0; i < randomIterations; i++) {
    // Simulate random entry/exit points
    const randomEntry = Math.random();
    const randomExit = Math.random();
    
    // Division by zero check
    if (randomEntry === 0) {
      continue; // Skip this iteration
    }
    
    const shares = investmentAmount / randomEntry;
    const grossPL = shares * (randomExit - randomEntry);
    const fees = grossPL > 0 ? grossPL * POLYMARKET_FEE : 0;
    const netPL = grossPL - fees;
    const roi = (netPL / investmentAmount) * 100;
    
    // Validate calculation
    if (isValidNumber(roi)) {
      randomResults.push(roi);
    }
  }

  // Division by zero protection for random strategy average
  const randomAvgROI = randomResults.length > 0
    ? randomResults.reduce((sum, roi) => sum + roi, 0) / randomResults.length
    : 0;

  const randomStrategy = {
    roi: isValidNumber(randomAvgROI) ? randomAvgROI : 0,
    profitLoss: isValidNumber(randomAvgROI) ? (randomAvgROI / 100) * investmentAmount : 0,
    iterations: randomResults.length,
  };

  // Calculate statistical significance (t-test)
  const aiReturns = aiPortfolio.trades.map(t => t.roi);
  const significance = calculateTTest(aiReturns, randomResults);

  return {
    buyAndHold,
    randomStrategy,
    aiPerformance,
    statisticalSignificance: significance,
  };
}

/**
 * Helper function to create empty baseline comparison result
 */
function createEmptyBaselineComparison(): BaselineComparison {
  return {
    buyAndHold: { roi: 0, profitLoss: 0 },
    randomStrategy: { roi: 0, profitLoss: 0, iterations: 0 },
    aiPerformance: { roi: 0, profitLoss: 0 },
    statisticalSignificance: { pValue: 1, isSignificant: false },
  };
}

/**
 * Helper function to calculate Pearson correlation coefficient
 */
function calculateCorrelation(x: number[], y: number[]): number {
  // Validate inputs
  if (!x || !y || !Array.isArray(x) || !Array.isArray(y)) {
    logWarning('Invalid arrays provided to calculateCorrelation');
    return 0;
  }

  if (x.length !== y.length) {
    logWarning('Array length mismatch in calculateCorrelation', { xLength: x.length, yLength: y.length });
    return 0;
  }

  if (x.length === 0) {
    return 0;
  }

  const n = x.length;
  const sumX = x.reduce((sum, val) => sum + val, 0);
  const sumY = y.reduce((sum, val) => sum + val, 0);
  const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0);
  const sumX2 = x.reduce((sum, val) => sum + val * val, 0);
  const sumY2 = y.reduce((sum, val) => sum + val * val, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  // Division by zero protection
  if (denominator === 0) {
    logWarning('Zero denominator in correlation calculation (no variance in data)');
    return 0;
  }

  const correlation = numerator / denominator;

  // Validate result
  if (!isValidNumber(correlation)) {
    logWarning('Invalid correlation result', { correlation, numerator, denominator });
    return 0;
  }

  return correlation;
}

/**
 * Helper function to perform two-sample t-test
 */
function calculateTTest(
  sample1: number[],
  sample2: number[]
): { pValue: number; isSignificant: boolean } {
  // Validate inputs
  if (!sample1 || !sample2 || !Array.isArray(sample1) || !Array.isArray(sample2)) {
    logWarning('Invalid samples provided to calculateTTest');
    return { pValue: 1, isSignificant: false };
  }

  if (sample1.length === 0 || sample2.length === 0) {
    logWarning('Empty sample arrays in t-test', { sample1Length: sample1.length, sample2Length: sample2.length });
    return { pValue: 1, isSignificant: false };
  }

  // Filter out invalid numbers
  const validSample1 = sample1.filter(isValidNumber);
  const validSample2 = sample2.filter(isValidNumber);

  if (validSample1.length === 0 || validSample2.length === 0) {
    logWarning('No valid numbers in samples after filtering');
    return { pValue: 1, isSignificant: false };
  }

  // Division by zero protection for means
  const mean1 = validSample1.length > 0
    ? validSample1.reduce((sum, val) => sum + val, 0) / validSample1.length
    : 0;
  const mean2 = validSample2.length > 0
    ? validSample2.reduce((sum, val) => sum + val, 0) / validSample2.length
    : 0;

  // Need at least 2 samples for variance calculation
  if (validSample1.length < 2 || validSample2.length < 2) {
    logWarning('Insufficient samples for t-test (need at least 2 per group)');
    return { pValue: 1, isSignificant: false };
  }

  // Division by zero protection for variance
  const variance1 = validSample1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / (validSample1.length - 1);
  const variance2 = validSample2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / (validSample2.length - 1);

  // Validate variances
  if (!isValidNumber(variance1) || !isValidNumber(variance2)) {
    logWarning('Invalid variance calculations', { variance1, variance2 });
    return { pValue: 1, isSignificant: false };
  }

  const pooledVariance = ((validSample1.length - 1) * variance1 + (validSample2.length - 1) * variance2) / 
                         (validSample1.length + validSample2.length - 2);

  // Validate pooled variance
  if (!isValidNumber(pooledVariance) || pooledVariance < 0) {
    logWarning('Invalid pooled variance', { pooledVariance });
    return { pValue: 1, isSignificant: false };
  }

  const standardError = Math.sqrt(pooledVariance * (1 / validSample1.length + 1 / validSample2.length));

  // Division by zero protection for standard error
  if (standardError === 0) {
    logWarning('Zero standard error in t-test (no variance)');
    return { pValue: 1, isSignificant: false };
  }

  // Validate standard error
  if (!isValidNumber(standardError)) {
    logWarning('Invalid standard error calculation', { standardError });
    return { pValue: 1, isSignificant: false };
  }

  const tStatistic = (mean1 - mean2) / standardError;

  // Validate t-statistic
  if (!isValidNumber(tStatistic)) {
    logWarning('Invalid t-statistic calculation', { tStatistic, mean1, mean2, standardError });
    return { pValue: 1, isSignificant: false };
  }

  // Simplified p-value approximation (for demonstration)
  // In production, use a proper statistical library
  const pValue = 2 * (1 - normalCDF(Math.abs(tStatistic)));

  // Validate p-value
  if (!isValidNumber(pValue) || pValue < 0 || pValue > 1) {
    logWarning('Invalid p-value calculation', { pValue, tStatistic });
    return { pValue: 1, isSignificant: false };
  }

  return {
    pValue,
    isSignificant: pValue < 0.05,
  };
}

/**
 * Helper function for normal cumulative distribution function (approximation)
 */
function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  
  return z > 0 ? 1 - prob : prob;
}
