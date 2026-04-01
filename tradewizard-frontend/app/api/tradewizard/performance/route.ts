import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { CLOB_API_URL } from "@/constants/api";

/**
 * Fetch market details from Polymarket CLOB API using condition_id
 */
async function fetchMarketDetailsByConditionId(conditionId: string): Promise<any | null> {
  try {
    const response = await fetch(
      `${CLOB_API_URL}/markets/${conditionId}`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        next: { revalidate: 300 }, // Cache for 5 minutes
      }
    );

    if (!response.ok) {
      console.warn(`Failed to fetch market details for condition ${conditionId}: ${response.status}`);
      return null;
    }

    const market = await response.json();
    return market;
  } catch (error) {
    console.warn(`Error fetching market details for condition ${conditionId}:`, error);
    return null;
  }
}

/**
 * Enrich closed markets with Polymarket details (slug, etc.)
 * Fetches market details from CLOB API for each market using condition_id
 */
async function enrichMarketsWithPolymarketDetails(markets: any[]): Promise<any[]> {
  const enrichedMarkets = await Promise.all(
    markets.map(async (market) => {
      if (!market.condition_id) {
        console.warn(`Market ${market.market_id} missing condition_id`);
        return market;
      }

      const polymarketDetails = await fetchMarketDetailsByConditionId(market.condition_id);
      
      if (polymarketDetails) {
        return {
          ...market,
          slug: polymarketDetails.market_slug || polymarketDetails.slug,
          polymarket_question: polymarketDetails.question,
          outcomes: polymarketDetails.outcomes,
          clob_token_ids: polymarketDetails.clob_token_ids,
          end_date: polymarketDetails.end_date_iso,
          image: polymarketDetails.image,
        };
      }

      // Fallback: if CLOB API fails, return market without enrichment
      console.warn(`Could not enrich market ${market.market_id} with Polymarket details`);
      return market;
    })
  );

  return enrichedMarkets;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const timeframe = searchParams.get("timeframe") || "all"; // all, 30d, 90d, 1y
  const category = searchParams.get("category") || "all";
  const confidence = searchParams.get("confidence") || "all";
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = parseInt(searchParams.get("offset") || "0");

  try {
    // First, get total count for pagination
    let countQuery = supabase
      .from("v_closed_markets_performance")
      .select("*", { count: "exact", head: true });

    // Apply same filters to count query
    if (timeframe !== "all") {
      const daysAgo = timeframe === "30d" ? 30 : timeframe === "90d" ? 90 : 365;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
      countQuery = countQuery.gte("resolution_date", cutoffDate.toISOString());
    }

    if (category !== "all") {
      countQuery = countQuery.eq("event_type", category);
    }

    if (confidence !== "all") {
      countQuery = countQuery.eq("confidence", confidence);
    }

    const { count: totalCount, error: countError } = await countQuery;

    if (countError) {
      console.error("Error fetching count:", countError);
    }

    // Build the base query for closed markets with performance data
    // Note: We don't filter by recommendation_was_correct to show all resolved markets
    // even if outcome calculation hasn't run yet
    let query = supabase
      .from("v_closed_markets_performance")
      .select("*")
      .order("resolution_date", { ascending: false });

    // Apply timeframe filter
    if (timeframe !== "all") {
      const daysAgo = timeframe === "30d" ? 30 : timeframe === "90d" ? 90 : 365;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
      query = query.gte("resolution_date", cutoffDate.toISOString());
    }

    // Apply category filter
    if (category !== "all") {
      query = query.eq("event_type", category);
    }

    // Apply confidence filter
    if (confidence !== "all") {
      query = query.eq("confidence", confidence);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: closedMarkets, error: marketsError } = await query;

    if (marketsError) {
      console.error("Error fetching closed markets:", marketsError);
      return NextResponse.json(
        { error: "Failed to fetch closed markets performance data" },
        { status: 500 }
      );
    }

    // Enrich markets with Polymarket details (slug, etc.) from CLOB API
    let enrichedMarkets = closedMarkets || [];
    if (enrichedMarkets.length > 0) {
      console.log(`Enriching ${enrichedMarkets.length} markets with Polymarket details...`);
      enrichedMarkets = await enrichMarketsWithPolymarketDetails(enrichedMarkets);
    }

    // Fetch performance summary
    const { data: performanceSummary, error: summaryError } = await supabase
      .from("v_performance_summary")
      .select("*")
      .single();

    if (summaryError) {
      console.error("Error fetching performance summary:", summaryError);
    }

    // Fetch performance by confidence
    const { data: performanceByConfidence, error: confidenceError } = await supabase
      .from("v_performance_by_confidence")
      .select("*");

    if (confidenceError) {
      console.error("Error fetching performance by confidence:", confidenceError);
    }

    // Fetch performance by agent
    const { data: performanceByAgent, error: agentError } = await supabase
      .from("v_performance_by_agent")
      .select("*")
      .order("win_rate_pct", { ascending: false });

    if (agentError) {
      console.error("Error fetching performance by agent:", agentError);
    }

    // Fetch monthly performance trends
    const { data: monthlyPerformance, error: monthlyError } = await supabase
      .from("v_monthly_performance")
      .select("*")
      .order("month", { ascending: false })
      .limit(12);

    if (monthlyError) {
      console.error("Error fetching monthly performance:", monthlyError);
    }

    // Fetch performance by category
    const { data: performanceByCategory, error: categoryError } = await supabase
      .from("v_performance_by_category")
      .select("*")
      .order("win_rate_pct", { ascending: false });

    if (categoryError) {
      console.error("Error fetching performance by category:", categoryError);
    }

    // Derive metrics from the authoritative aggregate views (cover ALL recommendations,
    // not just the most-recent-per-market slice used for the market grid).
    const metrics = calculatePerformanceMetrics(
      performanceSummary,
      performanceByCategory || []
    );

    return NextResponse.json({
      closedMarkets: enrichedMarkets,
      summary: performanceSummary || null,
      performanceByConfidence: performanceByConfidence || [],
      performanceByAgent: performanceByAgent || [],
      monthlyPerformance: monthlyPerformance || [],
      performanceByCategory: performanceByCategory || [],
      calculatedMetrics: metrics,
      filters: {
        timeframe,
        category,
        confidence,
        limit,
      },
      pagination: {
        total: totalCount || 0,
        offset,
        limit,
        hasMore: totalCount ? offset + limit < totalCount : false,
      },
    });
  } catch (error) {
    console.error("Error in performance API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * Derive calculated metrics from the authoritative aggregate views.
 * These views cover ALL recommendations across all resolved markets —
 * not just the most-recent-per-market slice used for the market grid.
 */
function calculatePerformanceMetrics(
  summary: any | null,
  byCategory: any[]
) {
  if (!summary) {
    return {
      totalMarkets: 0,
      winRate: 0,
      avgROI: 0,
      totalProfit: 0,
      avgDaysToResolution: 0,
      bestPerformingCategory: null,
      worstPerformingCategory: null,
      categoryBreakdown: [],
    };
  }

  // Category stats already computed by v_performance_by_category (all recommendations)
  const categoryStats = byCategory
    .filter((c) => c.total_recommendations >= 3)
    .map((c) => ({
      category: c.event_type,
      winRate: c.win_rate_pct,
      avgROI: c.avg_roi,
      totalMarkets: c.total_recommendations,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  return {
    // total unique markets is approximated by the closed-markets view count;
    // for the stat cards we use total_resolved_recommendations from the summary.
    totalMarkets: summary.total_resolved_recommendations,
    winRate: summary.win_rate_pct,
    avgROI: summary.avg_roi,
    // total profit = sum of all ROIs (proxy; no position sizing)
    totalProfit: Math.round(
      (summary.avg_roi * summary.total_resolved_recommendations) * 100
    ) / 100,
    avgDaysToResolution: 0, // not tracked in aggregate views
    bestPerformingCategory: categoryStats[0] || null,
    worstPerformingCategory: categoryStats[categoryStats.length - 1] || null,
    categoryBreakdown: categoryStats,
  };
}