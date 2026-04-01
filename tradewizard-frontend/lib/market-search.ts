import { GAMMA_API_URL } from "@/constants/api";

const MIN_LIQUIDITY_USD = 1000;
const MIN_LIQUIDITY_NON_EVERGREEN_USD = 5000;
const EVERGREEN_TAG_IDS = [2, 21, 120, 596, 1401, 100265, 100639];

export async function findMarketBySlug(slug: string) {
  try {
    // First, try to find the market by ID (if slug is actually an ID)
    if (slug.match(/^[0-9]+$/)) {
      try {
        const marketResponse = await fetch(`${GAMMA_API_URL}/markets/${slug}`, {
          headers: { "Content-Type": "application/json" },
          next: { revalidate: 60 },
        });

        if (marketResponse.ok) {
          const market = await marketResponse.json();
          
          // Enrich with event data if available
          if (market.events && market.events.length > 0) {
            const event = market.events[0];
            return {
              ...market,
              eventTitle: event.title,
              eventSlug: event.slug,
              eventId: event.id,
              eventIcon: event.image || event.icon,
              description: event.description,
              tags: event.tags,
              negRisk: event.negRisk || false,
            };
          }

          return market;
        }
      } catch (error) {
        // Continue to other search methods
      }
    }

    // Try to find market directly by slug
    try {
      const marketResponse = await fetch(`${GAMMA_API_URL}/markets?slug=${slug}`, {
        headers: { "Content-Type": "application/json" },
        next: { revalidate: 60 },
      });

      if (marketResponse.ok) {
        const markets = await marketResponse.json();
        
        if (Array.isArray(markets) && markets.length > 0) {
          const market = markets[0];
          
          // Enrich with event data if available
          if (market.events && market.events.length > 0) {
            const event = market.events[0];
            return {
              ...market,
              eventTitle: event.title,
              eventSlug: event.slug,
              eventId: event.id,
              eventIcon: event.image || event.icon,
              description: event.description,
              tags: event.tags,
              negRisk: event.negRisk || false,
            };
          }

          return market;
        }
      }
    } catch (error) {
      // Continue to other search methods
    }

    // Try to find by event slug first (most common case for event-based markets)
    const eventsResponse = await fetch(`${GAMMA_API_URL}/events?slug=${slug}`, {
      headers: { "Content-Type": "application/json" },
      next: { revalidate: 60 },
    });

    if (eventsResponse.ok) {
      const events = await eventsResponse.json();

      if (Array.isArray(events) && events.length > 0) {
        const event = events[0];
        const market = event.markets?.[0]; // Taking the first market of the event

        if (market) {
          return {
            ...market,
            eventTitle: event.title,
            eventSlug: event.slug,
            eventId: event.id,
            eventIcon: event.image || event.icon,
            description: event.description,
            tags: event.tags,
            negRisk: event.negRisk || false,
          };
        }
      }
    }

    // Search through events to find markets with matching slugs
    // Limit search to prevent excessive API calls
    for (let page = 0; page < 5; page++) {
      const offset = page * 100;
      
      const eventsResponse = await fetch(
        `${GAMMA_API_URL}/events?closed=false&limit=100&offset=${offset}`,
        {
          headers: { "Content-Type": "application/json" },
          next: { revalidate: 60 },
        }
      );

      if (!eventsResponse.ok) break;

      const events = await eventsResponse.json();

      if (!Array.isArray(events) || events.length === 0) break;

      // Process events and extract markets
      for (const event of events) {
        if (event.ended || event.closed || !event.active) continue;

        const markets = event.markets || [];

        for (const market of markets) {
          // Check if market slug matches exactly
          if (market.slug === slug || market.id === slug) {
            // Apply the same filtering logic as the markets API
            if (market.acceptingOrders === false) continue;
            if (market.closed === true) continue;
            if (!market.clobTokenIds) continue;

            if (market.outcomePrices) {
              try {
                const prices = JSON.parse(market.outcomePrices);
                const hasTradeablePrice = prices.some((price: string) => {
                  const priceNum = parseFloat(price);
                  return priceNum >= 0.05 && priceNum <= 0.95;
                });
                if (!hasTradeablePrice) continue;
              } catch {
                continue;
              }
            }

            const marketTagIds = market.tags?.map((t: any) => parseInt(t.id)) || [];
            const hasEvergreenTag = EVERGREEN_TAG_IDS.some((id) =>
              marketTagIds.includes(id)
            );

            const liquidity = parseFloat(market.liquidity || "0");

            if (!hasEvergreenTag && liquidity < MIN_LIQUIDITY_NON_EVERGREEN_USD) {
              continue;
            }
            if (liquidity < MIN_LIQUIDITY_USD) continue;

            // Return the enriched market
            return {
              ...market,
              eventTitle: event.title,
              eventSlug: event.slug,
              eventId: event.id,
              eventIcon: event.image || event.icon,
              negRisk: event.negRisk || false,
            };
          }
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error finding market by slug:", error);
    return null;
  }
}