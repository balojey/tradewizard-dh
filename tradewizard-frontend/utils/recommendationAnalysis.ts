/**
 * Utility functions for analyzing recommendation performance and P&L calculations
 */

export interface PnLCalculation {
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  potentialReturn: number;
  potentialReturnPercent: number;
  wouldHaveProfit: boolean;
  daysHeld: number;
  annualizedReturn?: number;
}

export interface RecommendationPerformanceMetrics {
  totalRecommendations: number;
  winRate: number;
  averageReturn: number;
  bestReturn: number;
  worstReturn: number;
  averageDaysHeld: number;
  totalPotentialProfit: number;
  profitableRecommendations: number;
}

/**
 * Calculate potential P&L for a recommendation given current market price
 */
export function calculateRecommendationPnL(
  action: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE',
  entryZone: [number, number],
  targetZone: [number, number],
  currentMarketPrice: number,
  recommendationTimestamp: string,
  investmentAmount: number = 100 // Default $100 investment
): PnLCalculation {
  if (action === 'NO_TRADE') {
    return {
      entryPrice: 0,
      currentPrice: 0,
      targetPrice: 0,
      potentialReturn: 0,
      potentialReturnPercent: 0,
      wouldHaveProfit: false,
      daysHeld: 0
    };
  }

  // Use the midpoint of entry zone as entry price
  const entryPrice = action === 'LONG_YES' 
    ? (entryZone[0] + entryZone[1]) / 2
    : 1 - ((entryZone[0] + entryZone[1]) / 2); // For LONG_NO, we buy NO tokens

  // Use the midpoint of target zone as target price
  const targetPrice = action === 'LONG_YES'
    ? (targetZone[0] + targetZone[1]) / 2
    : 1 - ((targetZone[0] + targetZone[1]) / 2);

  // Current price adjusted for the position type
  const actualCurrentPrice = action === 'LONG_YES' 
    ? currentMarketPrice 
    : 1 - currentMarketPrice;

  // Calculate returns
  const potentialReturn = actualCurrentPrice - entryPrice;
  const potentialReturnPercent = entryPrice > 0 ? (potentialReturn / entryPrice) * 100 : 0;
  
  // Calculate days held
  const daysHeld = Math.max(1, Math.floor(
    (new Date().getTime() - new Date(recommendationTimestamp).getTime()) / (1000 * 60 * 60 * 24)
  ));

  // Calculate annualized return
  const annualizedReturn = daysHeld > 0 ? (potentialReturnPercent * 365) / daysHeld : undefined;

  return {
    entryPrice,
    currentPrice: actualCurrentPrice,
    targetPrice,
    potentialReturn,
    potentialReturnPercent,
    wouldHaveProfit: potentialReturn > 0,
    daysHeld,
    annualizedReturn
  };
}

/**
 * Calculate performance metrics for a set of recommendations
 */
export function calculatePerformanceMetrics(
  pnlCalculations: PnLCalculation[]
): RecommendationPerformanceMetrics {
  if (pnlCalculations.length === 0) {
    return {
      totalRecommendations: 0,
      winRate: 0,
      averageReturn: 0,
      bestReturn: 0,
      worstReturn: 0,
      averageDaysHeld: 0,
      totalPotentialProfit: 0,
      profitableRecommendations: 0
    };
  }

  const profitableRecommendations = pnlCalculations.filter(p => p.wouldHaveProfit).length;
  const winRate = (profitableRecommendations / pnlCalculations.length) * 100;
  
  const returns = pnlCalculations.map(p => p.potentialReturnPercent);
  const averageReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const bestReturn = Math.max(...returns);
  const worstReturn = Math.min(...returns);
  
  const daysHeld = pnlCalculations.map(p => p.daysHeld);
  const averageDaysHeld = daysHeld.reduce((sum, d) => sum + d, 0) / daysHeld.length;
  
  const totalPotentialProfit = pnlCalculations.reduce((sum, p) => sum + p.potentialReturn, 0);

  return {
    totalRecommendations: pnlCalculations.length,
    winRate,
    averageReturn,
    bestReturn,
    worstReturn,
    averageDaysHeld,
    totalPotentialProfit,
    profitableRecommendations
  };
}

/**
 * Format percentage with proper sign and color class
 */
export function formatPercentageWithSign(value: number): { 
  text: string; 
  colorClass: string; 
} {
  const text = `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  const colorClass = value >= 0 ? 'text-green-400' : 'text-red-400';
  
  return { text, colorClass };
}

/**
 * Format currency with proper sign
 */
export function formatCurrencyWithSign(value: number): {
  text: string;
  colorClass: string;
} {
  const text = `${value >= 0 ? '+' : ''}$${Math.abs(value).toFixed(2)}`;
  const colorClass = value >= 0 ? 'text-green-400' : 'text-red-400';
  
  return { text, colorClass };
}

/**
 * Calculate risk-adjusted return (Sharpe-like ratio)
 */
export function calculateRiskAdjustedReturn(
  pnlCalculations: PnLCalculation[]
): number {
  if (pnlCalculations.length < 2) return 0;
  
  const returns = pnlCalculations.map(p => p.potentialReturnPercent);
  const averageReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  
  // Calculate standard deviation
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - averageReturn, 2), 0) / returns.length;
  const standardDeviation = Math.sqrt(variance);
  
  // Return risk-adjusted ratio (higher is better)
  return standardDeviation > 0 ? averageReturn / standardDeviation : 0;
}

/**
 * Determine recommendation quality based on performance metrics
 */
export function getRecommendationQuality(
  winRate: number,
  averageReturn: number,
  riskAdjustedReturn: number
): {
  quality: 'excellent' | 'good' | 'fair' | 'poor';
  description: string;
  colorClass: string;
} {
  // Scoring system
  let score = 0;
  
  // Win rate scoring (0-40 points)
  if (winRate >= 70) score += 40;
  else if (winRate >= 60) score += 30;
  else if (winRate >= 50) score += 20;
  else if (winRate >= 40) score += 10;
  
  // Average return scoring (0-40 points)
  if (averageReturn >= 20) score += 40;
  else if (averageReturn >= 10) score += 30;
  else if (averageReturn >= 5) score += 20;
  else if (averageReturn >= 0) score += 10;
  
  // Risk-adjusted return scoring (0-20 points)
  if (riskAdjustedReturn >= 2) score += 20;
  else if (riskAdjustedReturn >= 1) score += 15;
  else if (riskAdjustedReturn >= 0.5) score += 10;
  else if (riskAdjustedReturn >= 0) score += 5;
  
  if (score >= 80) {
    return {
      quality: 'excellent',
      description: 'Exceptional performance with high win rate and returns',
      colorClass: 'text-green-400'
    };
  } else if (score >= 60) {
    return {
      quality: 'good',
      description: 'Strong performance with consistent returns',
      colorClass: 'text-blue-400'
    };
  } else if (score >= 40) {
    return {
      quality: 'fair',
      description: 'Moderate performance with room for improvement',
      colorClass: 'text-yellow-400'
    };
  } else {
    return {
      quality: 'poor',
      description: 'Below average performance, high risk',
      colorClass: 'text-red-400'
    };
  }
}

/**
 * Calculate maximum drawdown from a series of P&L calculations
 */
export function calculateMaxDrawdown(pnlCalculations: PnLCalculation[]): number {
  if (pnlCalculations.length === 0) return 0;
  
  // Sort by timestamp (assuming they're in chronological order)
  let runningReturn = 0;
  let peak = 0;
  let maxDrawdown = 0;
  
  for (const pnl of pnlCalculations) {
    runningReturn += pnl.potentialReturnPercent;
    
    if (runningReturn > peak) {
      peak = runningReturn;
    }
    
    const drawdown = peak - runningReturn;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  
  return maxDrawdown;
}