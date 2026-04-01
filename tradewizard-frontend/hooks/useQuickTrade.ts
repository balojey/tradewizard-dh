import { useState, useCallback, useMemo } from "react";
import type { TradeRecommendation } from "@/hooks/useTradeRecommendation";

export interface QuickTradeZone {
  type: 'entry' | 'target' | 'stopLoss' | 'current';
  price: number;
  label: string;
  isActive: boolean;
  color: string;
}

export interface QuickTradeAnalysis {
  zones: QuickTradeZone[];
  potentialReturn: number;
  maxLoss: number; // Maximum loss if stop-loss is hit
  isInEntryZone: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  recommendation: string;
}

interface UseQuickTradeOptions {
  recommendation: TradeRecommendation;
  currentPrice: number;
}

/**
 * Hook for managing quick trade functionality with AI recommendations
 */
export function useQuickTrade({ recommendation, currentPrice }: UseQuickTradeOptions) {
  const [selectedZone, setSelectedZone] = useState<'entry' | 'target' | 'current' | null>(null);

  // Calculate zone analysis
  const analysis = useMemo((): QuickTradeAnalysis => {
    const entryMin = recommendation.entryZone[0];
    const entryMax = recommendation.entryZone[1];
    const targetMin = recommendation.targetZone[0];
    const targetMax = recommendation.targetZone[1];
    const stopLoss = recommendation.stopLoss;

    const entryMidpoint = (entryMin + entryMax) / 2;
    const targetMidpoint = (targetMin + targetMax) / 2;

    const isInEntryZone = currentPrice >= entryMin && currentPrice <= entryMax;
    const potentialReturn = ((targetMidpoint - entryMidpoint) / entryMidpoint) * 100;
    const maxLoss = ((stopLoss - entryMidpoint) / entryMidpoint) * 100;

    const zones: QuickTradeZone[] = [
      {
        type: 'stopLoss',
        price: stopLoss,
        label: `Stop-Loss (${(stopLoss * 100).toFixed(1)}%)`,
        isActive: false,
        color: 'red',
      },
      {
        type: 'entry',
        price: entryMidpoint,
        label: `Entry Zone (${(entryMin * 100).toFixed(1)}% - ${(entryMax * 100).toFixed(1)}%)`,
        isActive: isInEntryZone,
        color: isInEntryZone ? 'green' : 'gray',
      },
      {
        type: 'current',
        price: currentPrice,
        label: `Current Price (${(currentPrice * 100).toFixed(1)}%)`,
        isActive: true,
        color: 'blue',
      },
      {
        type: 'target',
        price: targetMidpoint,
        label: `Target Zone (${(targetMin * 100).toFixed(1)}% - ${(targetMax * 100).toFixed(1)}%)`,
        isActive: false,
        color: 'purple',
      },
    ];

    return {
      zones,
      potentialReturn,
      maxLoss,
      isInEntryZone,
      riskLevel: recommendation.liquidityRisk,
      recommendation: recommendation.action.replace('_', ' '),
    };
  }, [recommendation, currentPrice]);

  // Zone selection handlers
  const selectZone = useCallback((zone: 'entry' | 'target' | 'current') => {
    setSelectedZone(zone);
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedZone(null);
  }, []);

  // Get zone by type
  const getZone = useCallback((type: 'entry' | 'target' | 'current') => {
    return analysis.zones.find(zone => zone.type === type);
  }, [analysis.zones]);

  // Check if trading is recommended
  const shouldTrade = useMemo(() => {
    return recommendation.action !== 'NO_TRADE' && recommendation.expectedValue > 0;
  }, [recommendation]);

  // Get optimal zone for current conditions
  const getOptimalZone = useCallback((): QuickTradeZone => {
    if (analysis.isInEntryZone) {
      return analysis.zones.find(z => z.type === 'entry')!;
    }
    return analysis.zones.find(z => z.type === 'current')!;
  }, [analysis]);

  return {
    analysis,
    selectedZone,
    selectZone,
    clearSelection,
    getZone,
    shouldTrade,
    getOptimalZone,
  };
}

export default useQuickTrade;