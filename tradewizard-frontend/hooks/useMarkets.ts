import { useInfiniteQuery } from "@tanstack/react-query";
import { useTrading } from "@/providers/TradingProvider";
import { Side } from "@polymarket/clob-client";
import type { CategoryId, Category } from "@/constants/categories";
import type { MarketStatus } from "@/components/Trading/Markets/MarketStatusFilter";
import usePublicMarketPrices from "@/hooks/usePublicMarketPrices";
import { enhanceMarketsWithResolutionData } from "@/utils/marketResolution";

export type PolymarketMarket = {
  id: string;
  question: string;
  description?: string;
  slug: string;
  active: boolean;
  closed: boolean;
  icon?: string;
  image?: string;
  volume?: string;
  volume24hr?: string | number;
  liquidity?: string | number;
  spread?: string;
  outcomes?: string;
  outcomePrices?: string;
  clobTokenIds?: string;
  conditionId?: string;
  endDate?: string;
  endDateIso?: string;
  gameStartTime?: string;
  events?: any[];
  eventTitle?: string;
  eventSlug?: string;
  eventId?: string;
  eventIcon?: string;
  negRisk?: boolean;
  // Resolution data for closed markets
  winningOutcome?: string;
  winningTokenId?: string;
  resolvedAt?: string;
  realtimePrices?: Record<
    string,
    {
      bidPrice: number;
      askPrice: number;
      midPrice: number;
      spread: number;
    }
  >;
  [key: string]: any;
};

interface UseMarketsOptions {
  pageSize?: number;
  categoryId?: CategoryId;
  tagId?: number | null;
  categories?: Category[];
  marketStatus?: MarketStatus;
}

export default function useMarkets(options: UseMarketsOptions = {}) {
  const { pageSize = 20, categoryId = "trending", tagId, categories = [], marketStatus = "active" } = options;
  const { clobClient, eoaAddress } = useTrading();

  const marketsQuery = useInfiniteQuery({
    queryKey: ["political-markets", pageSize, categoryId, tagId, marketStatus, !!clobClient],
    queryFn: async ({ pageParam = 0 }): Promise<PolymarketMarket[]> => {
      let url = `/api/polymarket/markets?limit=${pageSize}&offset=${pageParam}`;
      let targetTagId = tagId;

      // If no explicit tagId provided, get it from the category
      if (targetTagId === undefined && categories.length > 0) {
        const category = categories.find(c => c.id === categoryId);
        targetTagId = category?.tagId ?? 2; // Default to politics tag (2)
      }

      // Always ensure we're filtering by politics (tag 2) or its subcategories
      if (targetTagId) {
        url += `&tag_id=${targetTagId}`;
      } else {
        url += `&tag_id=2`; // Default to politics
      }

      // Include closed markets when status is "closed" or "all"
      if (marketStatus === "closed" || marketStatus === "all") {
        url += `&include_closed=true`;
      }

      // Add category-specific parameters
      if (categoryId === "trending") {
        // Trending uses volume-based sorting (default behavior)
        url += `&order=volume24hr&ascending=false`;
      } else if (categoryId === "all") {
        // All category uses liquidity-based sorting for better market discovery
        url += `&order=liquidity&ascending=false`;
      }

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch political markets");
      }

      const markets: PolymarketMarket[] = await response.json();

      // Enhance closed markets with resolution data
      const enhancedMarkets = await enhanceMarketsWithResolutionData(markets);

      // Fetch realtime prices from CLOB if client is available (authenticated users)
      if (clobClient) {
        await Promise.all(
          enhancedMarkets.map(async (market) => {
            try {
              const tokenIds = market.clobTokenIds
                ? JSON.parse(market.clobTokenIds)
                : [];

              const priceMap: Record<string, any> = {};

              await Promise.all(
                tokenIds.map(async (tokenId: string) => {
                  try {
                    const [bidResponse, askResponse] = await Promise.all([
                      clobClient.getPrice(tokenId, Side.BUY),
                      clobClient.getPrice(tokenId, Side.SELL),
                    ]);

                    const bidPrice = parseFloat(bidResponse.price);
                    const askPrice = parseFloat(askResponse.price);

                    if (
                      !isNaN(bidPrice) &&
                      !isNaN(askPrice) &&
                      bidPrice > 0 &&
                      bidPrice < 1 &&
                      askPrice > 0 &&
                      askPrice < 1
                    ) {
                      priceMap[tokenId] = {
                        bidPrice,
                        askPrice,
                        midPrice: (bidPrice + askPrice) / 2,
                        spread: askPrice - bidPrice,
                      };
                    }
                  } catch (error) {
                    console.warn(
                      `Error fetching price for token ${tokenId}:`,
                      error
                    );
                  }
                })
              );

              market.realtimePrices = priceMap;
            } catch (error) {
              console.warn(
                `Failed to fetch prices for market ${market.id}:`,
                error
              );
            }
          })
        );
      }

      return enhancedMarkets;
    },
    getNextPageParam: (lastPage, allPages) => {
      // If the last page has fewer markets than pageSize, we've reached the end
      if (lastPage.length < pageSize) {
        return undefined;
      }
      // Return the offset for the next page
      return allPages.length * pageSize;
    },
    initialPageParam: 0,
    staleTime: 2_000,
    refetchInterval: 10_000, // Reduced frequency for infinite queries
    refetchIntervalInBackground: false, // Disable background refetch for infinite queries
    refetchOnWindowFocus: false, // Disable refetch on window focus for infinite queries
  });

  // Get all markets from all pages for public price fetching
  const allMarkets = marketsQuery.data?.pages.flat() || [];
  
  // Fetch public prices for unauthenticated users
  const publicPricesQuery = usePublicMarketPrices(allMarkets);

  // If user is authenticated, return markets as-is
  if (clobClient && eoaAddress) {
    return marketsQuery;
  }

  // For unauthenticated users, enhance markets with public prices
  const enhancedData = marketsQuery.data ? {
    ...marketsQuery.data,
    pages: marketsQuery.data.pages.map(page => 
      page.map(market => {
        // If we have public prices, merge them in
        if (publicPricesQuery.data && market.clobTokenIds) {
          try {
            const tokenIds = JSON.parse(market.clobTokenIds);
            const priceMap: Record<string, any> = {};

            tokenIds.forEach((tokenId: string) => {
              const publicPrice = publicPricesQuery.data![tokenId];
              if (publicPrice) {
                priceMap[tokenId] = {
                  bidPrice: publicPrice.bidPrice,
                  askPrice: publicPrice.askPrice,
                  midPrice: publicPrice.midPrice,
                  spread: publicPrice.spread,
                };
              }
            });

            if (Object.keys(priceMap).length > 0) {
              console.log(`Enhanced market ${market.question} with ${Object.keys(priceMap).length} prices`);
              return {
                ...market,
                realtimePrices: priceMap,
              };
            }
          } catch (error) {
            console.warn(`Failed to parse token IDs for market ${market.id}`);
          }
        }

        return market;
      })
    ),
  } : undefined;

  return {
    ...marketsQuery,
    data: enhancedData,
  };
}

