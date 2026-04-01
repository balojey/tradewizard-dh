import { useMemo } from "react";
import { 
  calculateSimulatedPortfolio, 
  SimulatedPortfolio 
} from "@/lib/performance-calculations";
import { RecommendationWithOutcome } from "@/hooks/useMarketPerformance";

/**
 * Custom hook that provides memoized portfolio calculations
 * 
 * This hook wraps the calculateSimulatedPortfolio utility function with useMemo
 * to avoid redundant computation. It recalculates only when recommendations or
 * investment amount changes.
 * 
 * @param recommendations - Array of recommendations with outcome data
 * @param investmentAmount - Investment amount per trade in dollars
 * @returns Simulated portfolio with trades, cumulative series, and summary metrics
 * 
 * @example
 * ```tsx
 * const portfolio = useSimulatedPortfolio(recommendations, 100);
 * console.log(`Total P/L: $${portfolio.summary.totalPL.toFixed(2)}`);
 * console.log(`Win Rate: ${portfolio.summary.winRate.toFixed(1)}%`);
 * ```
 * 
 * **Validates: Requirements 4.2, 11.4**
 */
export function useSimulatedPortfolio(
  recommendations: RecommendationWithOutcome[],
  investmentAmount: number
): SimulatedPortfolio {
  return useMemo(() => {
    return calculateSimulatedPortfolio(recommendations, investmentAmount);
  }, [recommendations, investmentAmount]);
}
