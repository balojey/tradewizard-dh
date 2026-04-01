import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { CLOB_API_URL } from "@/constants/api";

interface RouteContext {
  params: Promise<{ marketId: string }>; // Polymarket condition_id
}

interface ClobPricePoint {
  t: number; // Unix timestamp (seconds)
  p: string; // YES token price as string
}

/**
 * Fetch the full price history for a YES token from the CLOB API.
 * Returns an array sorted ascending by timestamp.
 */
async function fetchYesPriceHistory(
  tokenId: string
): Promise<Array<{ ts: number; price: number }>> {
  const url = `${CLOB_API_URL}/prices-history?market=${tokenId}&interval=max&fidelity=60`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "TradeWizard/1.0" },
    next: { revalidate: 0 }, // always fresh for closed-market grading
  });
  if (!res.ok) throw new Error(`CLOB prices-history ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.history) || data.history.length === 0)
    throw new Error("Empty price history");
  return (data.history as ClobPricePoint[])
    .map((p) => ({ ts: p.t * 1000, price: parseFloat(p.p) }))
    .sort((a, b) => a.ts - b.ts);
}

/**
 * Fetch the YES token ID for a market from the CLOB API.
 * tokens[0] is always the YES token.
 */
async function fetchYesTokenId(conditionId: string): Promise<string | null> {
  try {
    const res = await fetch(`${CLOB_API_URL}/markets/${conditionId}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const market = await res.json();
    return market?.tokens?.[0]?.token_id ?? null;
  } catch {
    return null;
  }
}

interface GradeResult {
  wasCorrect: boolean;
  roiRealized: number;
  exitPrice: number;
  exitTimestamp: string | null;
  gradedByPriceHistory: boolean;
}

/**
 * Walk the price history from the recommendation's creation time forward and
 * determine whether the target or stop loss was hit first.
 *
 * Zone storage convention (from recommendation-generation.ts):
 *   LONG_YES: entry/target/stop stored as YES-token prices
 *   LONG_NO:  entry/target/stop stored as NO-token prices (1 - YES price)
 *
 * So for both directions the formula is identical in token space:
 *   tokenPrice = direction === 'LONG_YES' ? yesPrice : 1 - yesPrice
 *   SUCCESS when tokenPrice >= target_zone_min
 *   FAILURE when tokenPrice <= stop_loss
 *   ROI = (exitPrice - entryAvg) / entryAvg * 100
 */
function gradeByPriceHistory(
  rec: {
    direction: string;
    entry_zone_min: number;
    entry_zone_max: number;
    target_zone_min: number | null;
    target_zone_max: number | null;
    stop_loss: number | null;
    created_at: string;
  },
  history: Array<{ ts: number; price: number }>
): GradeResult | null {
  if (
    rec.direction === "NO_TRADE" ||
    rec.target_zone_min == null ||
    rec.target_zone_max == null ||
    rec.stop_loss == null
  )
    return null;

  // All zones are already in token space — use them directly
  const entryAvg = (rec.entry_zone_min + rec.entry_zone_max) / 2;
  const targetMin = rec.target_zone_min;
  const stopLoss = rec.stop_loss;
  const recTs = new Date(rec.created_at).getTime();

  const relevant = history.filter((p) => p.ts >= recTs);
  if (relevant.length === 0) return null;

  for (const point of relevant) {
    // Convert YES price to the recommendation's token space
    const tokenPrice = rec.direction === "LONG_YES" ? point.price : 1 - point.price;

    if (tokenPrice >= targetMin) {
      const roi = ((targetMin - entryAvg) / entryAvg) * 100;
      return {
        wasCorrect: true,
        roiRealized: Math.round(roi * 100) / 100,
        exitPrice: targetMin,
        exitTimestamp: new Date(point.ts).toISOString(),
        gradedByPriceHistory: true,
      };
    }
    if (tokenPrice <= stopLoss) {
      const roi = ((stopLoss - entryAvg) / entryAvg) * 100;
      return {
        wasCorrect: false,
        roiRealized: Math.round(roi * 100) / 100,
        exitPrice: stopLoss,
        exitTimestamp: new Date(point.ts).toISOString(),
        gradedByPriceHistory: true,
      };
    }
  }

  // Neither threshold was hit — fall back to resolution-based grading.
  return null;
}

/**
 * Fallback grading when price history is unavailable or no threshold was hit.
 * Uses the resolved outcome + target/stop prices for ROI.
 */
function gradeByResolution(
  rec: {
    direction: string;
    entry_zone_min: number;
    entry_zone_max: number;
    target_zone_min: number | null;
    target_zone_max: number | null;
    stop_loss: number | null;
  },
  resolvedOutcome: string
): GradeResult {
  if (rec.direction === "NO_TRADE") {
    return {
      wasCorrect: true,
      roiRealized: 0,
      exitPrice: 0,
      exitTimestamp: null,
      gradedByPriceHistory: false,
    };
  }

  const entryAvg = (rec.entry_zone_min + rec.entry_zone_max) / 2;
  const wasCorrect =
    (rec.direction === "LONG_YES" && resolvedOutcome === "YES") ||
    (rec.direction === "LONG_NO" && resolvedOutcome === "NO");

  // All zones are stored in token space — formula is identical for both directions
  if (rec.target_zone_min != null && rec.target_zone_max != null && rec.stop_loss != null) {
    const targetAvg = (rec.target_zone_min + rec.target_zone_max) / 2;
    const stopLoss = rec.stop_loss;
    const exitPrice = wasCorrect ? targetAvg : stopLoss;
    const roi = ((exitPrice - entryAvg) / entryAvg) * 100;
    return {
      wasCorrect,
      roiRealized: Math.round(roi * 100) / 100,
      exitPrice,
      exitTimestamp: null,
      gradedByPriceHistory: false,
    };
  }

  // Legacy fallback: binary payout (no zones stored)
  let roi: number;
  if (wasCorrect) {
    roi = ((1 - entryAvg) / entryAvg) * 100;
  } else {
    roi = -100;
  }
  return {
    wasCorrect,
    roiRealized: Math.round(roi * 100) / 100,
    exitPrice: wasCorrect ? 1 : 0,
    exitTimestamp: null,
    gradedByPriceHistory: false,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { marketId } = await context.params;

    if (!marketId) {
      return NextResponse.json({ error: "Market ID is required" }, { status: 400 });
    }

    // ── 1. Fetch market from DB ──────────────────────────────────────────────
    const { data: market, error: marketError } = await supabase
      .from("markets")
      .select("id, condition_id, question, event_type, status, resolved_outcome")
      .eq("condition_id", marketId)
      .single();

    if (marketError || !market) {
      return NextResponse.json({ error: "Market not found" }, { status: 404 });
    }

    const isResolved = market.status === "resolved";

    // ── 2. Fetch recommendations ─────────────────────────────────────────────
    let recommendations: any[];
    let recError: any;

    if (isResolved) {
      const result = await supabase
        .from("recommendations")
        .select(`
          id, market_id, direction, confidence, fair_probability,
          market_edge, expected_value,
          entry_zone_min, entry_zone_max,
          target_zone_min, target_zone_max, stop_loss,
          explanation, created_at
        `)
        .eq("market_id", market.id)
        .order("created_at", { ascending: false });

      recommendations = (result.data ?? []).map((rec: any) => ({ ...rec }));
      recError = result.error;
    } else {
      const result = await supabase
        .from("recommendations")
        .select(`
          id, market_id, direction, confidence, fair_probability,
          market_edge, expected_value,
          entry_zone_min, entry_zone_max,
          target_zone_min, target_zone_max, stop_loss,
          explanation, created_at
        `)
        .eq("market_id", market.id)
        .order("created_at", { ascending: false });
      recommendations = result.data ?? [];
      recError = result.error;
    }

    if (recError) {
      console.error("Error fetching recommendations:", recError);
      return NextResponse.json({ error: "Failed to fetch market performance data" }, { status: 500 });
    }

    if (!recommendations || recommendations.length === 0) {
      return NextResponse.json({ error: "No performance data found for this market" }, { status: 404 });
    }

    // ── 3. For resolved markets: grade using real price history ──────────────
    let priceHistory: Array<{ ts: number; price: number }> = [];
    let yesTokenId: string | null = null;

    if (isResolved) {
      // Fetch YES token ID and full price history once, shared across all recs
      yesTokenId = await fetchYesTokenId(market.condition_id);
      if (yesTokenId) {
        try {
          priceHistory = await fetchYesPriceHistory(yesTokenId);
        } catch (e) {
          console.warn(`[Performance] Could not fetch price history for ${market.condition_id}:`, e);
        }
      }

      // Grade each recommendation using real price history
      for (const rec of recommendations) {
        const grade =
          priceHistory.length > 0
            ? (gradeByPriceHistory(rec, priceHistory) ??
               gradeByResolution(rec, market.resolved_outcome ?? ""))
            : gradeByResolution(rec, market.resolved_outcome ?? "");

        const marketProbEstimate =
          rec.direction === "LONG_YES" ? rec.entry_zone_max : 1 - rec.entry_zone_min;

        const edgeCaptured =
          market.resolved_outcome === "YES"
            ? rec.fair_probability - marketProbEstimate
            : (1 - rec.fair_probability) - (1 - marketProbEstimate);

        rec._outcome = {
          recommendation_was_correct: grade.wasCorrect,
          roi_realized: grade.roiRealized,
          edge_captured: Math.round(edgeCaptured * 10000) / 10000,
          market_probability_at_recommendation: marketProbEstimate,
          resolution_date: grade.exitTimestamp,
        };
        rec._exitPrice = grade.exitPrice;
        rec._exitTimestamp = grade.exitTimestamp;
        rec._gradedByPriceHistory = grade.gradedByPriceHistory;
      }
    }

    // ── 4. Build response ────────────────────────────────────────────────────
    const marketInfo = {
      id: market.id,
      conditionId: market.condition_id,
      question: market.question,
      description: "",
      eventType: market.event_type,
      resolvedOutcome: market.resolved_outcome || "Pending",
      resolutionDate:
        isResolved && recommendations[0]?._outcome?.resolution_date
          ? recommendations[0]._outcome.resolution_date
          : new Date().toISOString(),
      slug: generateMarketSlug(market.question, market.id),
    };

    const { data: agentSignals } = await supabase
      .from("agent_signals")
      .select("agent_name, direction, agent_probability, agent_confidence")
      .eq("market_id", market.id)
      .order("created_at", { ascending: false })
      .limit(50);

    const recommendationsWithOutcome = recommendations.map((rec: any) => {
      if (isResolved) {
        const o = rec._outcome;
        return {
          id: rec.id,
          marketId: rec.market_id,
          direction: rec.direction,
          confidence: rec.confidence,
          fairProbability: rec.fair_probability,
          marketEdge: rec.market_edge,
          expectedValue: rec.expected_value,
          entryZoneMin: rec.entry_zone_min,
          entryZoneMax: rec.entry_zone_max,
          targetZoneMin: rec.target_zone_min,
          targetZoneMax: rec.target_zone_max,
          stopLoss: rec.stop_loss,
          explanation: rec.explanation,
          createdAt: rec.created_at,
          actualOutcome: market.resolved_outcome,
          wasCorrect: o?.recommendation_was_correct ?? null,
          roiRealized: o?.roi_realized ?? 0,
          edgeCaptured: o?.edge_captured ?? 0,
          marketPriceAtRecommendation: o?.market_probability_at_recommendation ?? null,
          resolutionDate: o?.resolution_date ?? null,
          entryPrice: o?.market_probability_at_recommendation ?? null,
          exitPrice: rec._exitPrice ?? undefined,
          exitTimestamp: rec._exitTimestamp ?? null,
          gradedByPriceHistory: rec._gradedByPriceHistory ?? false,
        };
      } else {
        const estimatedMarketPrice =
          (rec.entry_zone_min + rec.entry_zone_max) / 2;
        return {
          id: rec.id,
          marketId: rec.market_id,
          direction: rec.direction,
          confidence: rec.confidence,
          fairProbability: rec.fair_probability,
          marketEdge: rec.market_edge,
          expectedValue: rec.expected_value,
          entryZoneMin: rec.entry_zone_min,
          entryZoneMax: rec.entry_zone_max,
          targetZoneMin: rec.target_zone_min,
          targetZoneMax: rec.target_zone_max,
          stopLoss: rec.stop_loss,
          explanation: rec.explanation,
          createdAt: rec.created_at,
          actualOutcome: "Pending",
          wasCorrect: false,
          roiRealized: 0,
          edgeCaptured: 0,
          marketPriceAtRecommendation: estimatedMarketPrice,
          resolutionDate: new Date().toISOString(),
          entryPrice: estimatedMarketPrice,
          exitPrice: undefined,
          exitTimestamp: null,
          gradedByPriceHistory: false,
        };
      }
    });

    // Expose price history to the frontend for the chart
    const priceHistoryForResponse = priceHistory.map((p) => ({
      timestamp: new Date(p.ts).toISOString(),
      price: p.price,
    }));

    return NextResponse.json({
      market: marketInfo,
      recommendations: recommendationsWithOutcome,
      metrics: calculateMarketMetrics(recommendationsWithOutcome),
      agentSignals: agentSignals || [],
      priceHistory: priceHistoryForResponse,
    });
  } catch (error) {
    console.error("Error in market performance detail API:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

function generateMarketSlug(question: string, marketId: string): string {
  return (
    question
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 60) +
    "-" +
    marketId.substring(0, 8)
  );
}

function calculateMarketMetrics(recommendations: any[]) {
  if (recommendations.length === 0) {
    return {
      accuracy: {
        total: 0, correct: 0, percentage: 0,
        byConfidence: {
          high: { total: 0, correct: 0, percentage: 0 },
          moderate: { total: 0, correct: 0, percentage: 0 },
          low: { total: 0, correct: 0, percentage: 0 },
        },
      },
      roi: { total: 0, average: 0, best: 0, worst: 0, byRecommendation: [] },
    };
  }

  const tradeable = recommendations.filter((r) => r.direction !== "NO_TRADE");
  const correctCount = tradeable.filter((r) => r.wasCorrect).length;
  const accuracyPercentage =
    tradeable.length > 0 ? (correctCount / tradeable.length) * 100 : 0;

  const byConfidence = {
    high: { total: 0, correct: 0, percentage: 0 },
    moderate: { total: 0, correct: 0, percentage: 0 },
    low: { total: 0, correct: 0, percentage: 0 },
  };

  tradeable.forEach((rec) => {
    const conf = rec.confidence as "high" | "moderate" | "low";
    byConfidence[conf].total++;
    if (rec.wasCorrect) byConfidence[conf].correct++;
  });

  (Object.keys(byConfidence) as Array<"high" | "moderate" | "low">).forEach((k) => {
    if (byConfidence[k].total > 0)
      byConfidence[k].percentage =
        (byConfidence[k].correct / byConfidence[k].total) * 100;
  });

  const roiValues = tradeable.map((r) => r.roiRealized || 0);
  const totalROI = roiValues.reduce((s, v) => s + v, 0);
  const avgROI = roiValues.length > 0 ? totalROI / roiValues.length : 0;

  return {
    accuracy: {
      total: tradeable.length,
      correct: correctCount,
      percentage: Math.round(accuracyPercentage * 100) / 100,
      byConfidence,
    },
    roi: {
      total: Math.round(totalROI * 100) / 100,
      average: Math.round(avgROI * 100) / 100,
      best: roiValues.length > 0 ? Math.round(Math.max(...roiValues) * 100) / 100 : 0,
      worst: roiValues.length > 0 ? Math.round(Math.min(...roiValues) * 100) / 100 : 0,
      byRecommendation: tradeable.map((r) => ({ id: r.id, roi: r.roiRealized || 0 })),
    },
  };
}
