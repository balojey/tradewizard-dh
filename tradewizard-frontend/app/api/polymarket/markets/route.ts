import { NextRequest, NextResponse } from "next/server";
import { GAMMA_API_URL } from "@/constants/api";

const MIN_LIQUIDITY_USD = 1000;
const MIN_LIQUIDITY_NON_EVERGREEN_USD = 5000;

const EVERGREEN_TAG_IDS = [2, 21, 120, 596, 1401, 100265, 100639];

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limit = searchParams.get("limit") || "20";
  const offset = searchParams.get("offset") || "0";
  const tagId = searchParams.get("tag_id");
  const includeClosed = searchParams.get("include_closed") === "true";

  try {
    const requestedLimit = parseInt(limit);
    const requestedOffset = parseInt(offset);
    
    // Fetch more than requested to account for filtering
    const fetchLimit = Math.max(requestedLimit * 3, 100);
    const fetchOffset = Math.floor(requestedOffset * 1.5); // Approximate offset accounting for filtering

    // Include closed markets if requested, otherwise default to open markets only
    let url = `${GAMMA_API_URL}/events?closed=${includeClosed ? 'true' : 'false'}&order=volume24hr&ascending=false&limit=${fetchLimit}&offset=${fetchOffset}`;

    if (tagId) {
      url += `&tag_id=${tagId}&related_tags=true`;
    }

    const response = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      console.error("Gamma API error:", response.status);
      throw new Error(`Gamma API error: ${response.status}`);
    }

    const events = await response.json();

    if (!Array.isArray(events)) {
      console.error("Invalid response structure:", events);
      return NextResponse.json(
        { error: "Invalid API response" },
        { status: 500 }
      );
    }

    const allMarkets: any[] = [];

    for (const event of events) {
      // For closed markets, we want to include ended/closed events
      if (!includeClosed && (event.ended || event.closed || !event.active)) continue;

      const markets = event.markets || [];

      for (const market of markets) {
        allMarkets.push({
          ...market,
          eventTitle: event.title,
          eventSlug: event.slug,
          eventId: event.id,
          eventIcon: event.image || event.icon,
          negRisk: event.negRisk || false,
        });
      }
    }

    const validMarkets = allMarkets.filter((market: any) => {
      // Basic validation that applies to all markets
      if (!market.clobTokenIds) return false;

      // For closed markets, we have more relaxed validation criteria
      if (market.closed === true) {
        // If we're not including closed markets, filter them out
        if (!includeClosed) return false;
        
        // For closed markets, skip liquidity and price checks
        return true;
      }

      // Validation for open markets
      if (market.acceptingOrders === false) return false;

      if (market.outcomePrices) {
        try {
          const prices = JSON.parse(market.outcomePrices);
          const hasTradeablePrice = prices.some((price: string) => {
            const priceNum = parseFloat(price);
            return priceNum >= 0.05 && priceNum <= 0.95;
          });
          if (!hasTradeablePrice) return false;
        } catch {
          return false;
        }
      }

      const marketTagIds =
        market.tags?.map((t: any) => parseInt(t.id)) || [];
      const hasEvergreenTag = EVERGREEN_TAG_IDS.some((id) =>
        marketTagIds.includes(id)
      );

      const liquidity = parseFloat(market.liquidity || "0");

      if (!hasEvergreenTag && liquidity < MIN_LIQUIDITY_NON_EVERGREEN_USD) {
        return false;
      }
      if (liquidity < MIN_LIQUIDITY_USD) return false;

      return true;
    });

    const sortedMarkets = validMarkets.sort((a: any, b: any) => {
      // Sort closed markets by end date (most recent first), then by volume
      if (a.closed && b.closed) {
        const aEndDate = new Date(a.endDateIso || a.endDate || 0).getTime();
        const bEndDate = new Date(b.endDateIso || b.endDate || 0).getTime();
        if (aEndDate !== bEndDate) {
          return bEndDate - aEndDate; // Most recent first
        }
        // If same end date, sort by volume
        const aVolume = parseFloat(a.volume24hr || a.volume || "0");
        const bVolume = parseFloat(b.volume24hr || b.volume || "0");
        return bVolume - aVolume;
      }

      // If one is closed and one is open, prioritize open markets
      if (a.closed && !b.closed) return 1;
      if (!a.closed && b.closed) return -1;

      // For open markets, use the original scoring logic
      const aScore =
        parseFloat(a.liquidity || "0") +
        parseFloat(a.volume24hr || a.volume || "0");
      const bScore =
        parseFloat(b.liquidity || "0") +
        parseFloat(b.volume24hr || b.volume || "0");
      return bScore - aScore;
    });

    // Apply client-side pagination after filtering and sorting
    const startIndex = requestedOffset;
    const endIndex = startIndex + requestedLimit;
    const paginatedMarkets = sortedMarkets.slice(startIndex, endIndex);

    return NextResponse.json(paginatedMarkets);
  } catch (error) {
    console.error("Error fetching markets:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch markets",
      },
      { status: 500 }
    );
  }
}
