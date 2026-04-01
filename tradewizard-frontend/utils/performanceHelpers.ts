import type { RecommendationWithOutcome } from "@/hooks/useMarketPerformance";

// --- Types ---

export type RecommendationStatus =
  | "in-entry-zone"
  | "above-target"
  | "below-stop"
  | "between-entry-and-target"
  | "pending";

export interface StatusBadgeConfig {
  label: string;
  colorClass: string;
  bgClass: string;
}

export const STATUS_BADGE_MAP: Record<RecommendationStatus, StatusBadgeConfig> = {
  "in-entry-zone":            { label: "In Entry Zone",  colorClass: "text-blue-400",    bgClass: "bg-blue-500/20" },
  "above-target":             { label: "Target Reached", colorClass: "text-emerald-400", bgClass: "bg-emerald-500/20" },
  "below-stop":               { label: "Stop Hit",       colorClass: "text-red-400",     bgClass: "bg-red-500/20" },
  "between-entry-and-target": { label: "Tracking",       colorClass: "text-yellow-400",  bgClass: "bg-yellow-500/20" },
  "pending":                  { label: "Pending",        colorClass: "text-gray-400",    bgClass: "bg-gray-500/20" },
};

// --- Computation helpers ---

/**
 * Compute live unrealized P&L for an active market recommendation.
 * Returns null for NO_TRADE, zero entry midpoint, or non-finite entry values.
 * Requirements: 3.2, 11.7
 */
export function computeLivePnL(
  rec: Pick<RecommendationWithOutcome, "direction" | "entryZoneMin" | "entryZoneMax">,
  currentYesPrice: number
): number | null {
  if (rec.direction === "NO_TRADE") return null;
  if (!isFinite(rec.entryZoneMin) || !isFinite(rec.entryZoneMax)) return null;

  const entryMid = (rec.entryZoneMin + rec.entryZoneMax) / 2;
  if (entryMid === 0) return null;

  if (rec.direction === "LONG_YES") {
    return ((currentYesPrice - entryMid) / entryMid) * 100;
  } else {
    // LONG_NO: trader holds NO token
    const noEntry = 1 - entryMid;
    const noCurrent = 1 - currentYesPrice;
    if (noEntry === 0) return null;
    return ((noCurrent - noEntry) / noEntry) * 100;
  }
}

/**
 * Compute the status of a recommendation relative to the current YES price.
 * Requirements: 9.1, 3.3–3.7
 */
export function computeRecommendationStatus(
  rec: Pick<
    RecommendationWithOutcome,
    "direction" | "entryZoneMin" | "entryZoneMax" | "targetZoneMin" | "targetZoneMax" | "stopLoss"
  >,
  currentYesPrice: number
): RecommendationStatus {
  if (rec.direction === "NO_TRADE") return "pending";
  if (!isFinite(currentYesPrice) || currentYesPrice <= 0) return "pending";
  if (!isFinite(rec.entryZoneMin) || !isFinite(rec.entryZoneMax)) return "pending";

  const { entryZoneMin, entryZoneMax, targetZoneMin, targetZoneMax, stopLoss } = rec;

  if (rec.direction === "LONG_YES") {
    if (targetZoneMin != null && isFinite(targetZoneMin) && currentYesPrice >= targetZoneMin) return "above-target";
    if (stopLoss != null && isFinite(stopLoss) && currentYesPrice <= stopLoss) return "below-stop";
    if (currentYesPrice >= entryZoneMin && currentYesPrice <= entryZoneMax) return "in-entry-zone";
    if (currentYesPrice > entryZoneMax) return "between-entry-and-target";
    return "pending";
  } else {
    // LONG_NO: target is when YES price falls to targetZoneMax or below
    if (targetZoneMax != null && isFinite(targetZoneMax) && currentYesPrice <= targetZoneMax) return "above-target";
    if (stopLoss != null && isFinite(stopLoss) && currentYesPrice >= stopLoss) return "below-stop";
    if (currentYesPrice >= entryZoneMin && currentYesPrice <= entryZoneMax) return "in-entry-zone";
    if (currentYesPrice < entryZoneMin) return "between-entry-and-target";
    return "pending";
  }
}

// --- Format helpers ---

/**
 * Format a price value as "0.00" or "N/A" for non-finite/null values.
 * Requirements: 12.2, 12.3, 11.3
 */
export function formatPrice(value: unknown): string {
  if (value == null) return "N/A";
  const n = Number(value);
  if (!isFinite(n)) return "N/A";
  return n.toFixed(2);
}

/**
 * Format a probability [0,1] as "XX.X%" or "N/A".
 * Requirements: 11.2, 12.4
 */
export function formatProbability(value: unknown): string {
  if (value == null) return "N/A";
  const n = Number(value);
  if (!isFinite(n)) return "N/A";
  return `${(n * 100).toFixed(1)}%`;
}

/**
 * Format an ROI value as "+X.XX%" / "-X.XX%" or "N/A".
 * Requirements: 11.1, 12.5
 */
export function formatROI(value: unknown): string {
  if (value == null) return "N/A";
  const n = Number(value);
  if (!isFinite(n)) return "N/A";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
