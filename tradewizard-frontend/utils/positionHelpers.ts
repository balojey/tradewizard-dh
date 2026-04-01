import type { PolymarketPosition } from "@/hooks/useUserPositions";

/**
 * Find a user's position for a specific token/asset
 */
export function findUserPosition(
  positions: PolymarketPosition[] | undefined,
  tokenId: string
): { size: number; avgPrice: number } | null {
  if (!positions) return null;
  
  const position = positions.find(p => p.asset === tokenId);
  if (!position || position.size <= 0) return null;
  
  return {
    size: position.size,
    avgPrice: position.avgPrice
  };
}

/**
 * Check if user has a position in a specific token
 */
export function hasPosition(
  positions: PolymarketPosition[] | undefined,
  tokenId: string
): boolean {
  return findUserPosition(positions, tokenId) !== null;
}

/**
 * Get the maximum sellable amount for a position
 */
export function getMaxSellAmount(
  positions: PolymarketPosition[] | undefined,
  tokenId: string
): number {
  const position = findUserPosition(positions, tokenId);
  return position?.size || 0;
}