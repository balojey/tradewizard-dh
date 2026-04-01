"use client";

import React, { useState, useMemo, useCallback } from "react";
import { useTrading } from "@/providers/TradingProvider";
import useMarkets from "@/hooks/useMarkets";
import useUserPositions from "@/hooks/useUserPositions";
import { findUserPosition } from "@/utils/positionHelpers";
import usePoliticalCategories from "@/hooks/usePoliticalCategories";
import useInfiniteScroll from "@/hooks/useInfiniteScroll";
import useMarketRecommendations from "@/hooks/useMarketRecommendations";
import { type CategoryId, DEFAULT_CATEGORY } from "@/constants/categories";
import { filterMarketsByStatus, getMarketStatusCounts } from "@/utils/marketFilters";

import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import MarketCard from "@/components/Trading/Markets/MarketCard";
import MarketSearch from "@/components/Trading/Markets/MarketSearch";
import CategoryTabs from "@/components/Trading/Markets/CategoryTabs";
import MarketStatusFilter, { type MarketStatus } from "@/components/Trading/Markets/MarketStatusFilter";
import OrderPlacementModal from "@/components/Trading/OrderModal";

const PoliticalMarkets = React.memo(function PoliticalMarkets() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryId>(DEFAULT_CATEGORY);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>("active");
  const [selectedOutcome, setSelectedOutcome] = useState<{
    marketTitle: string;
    outcome: string;
    price: number;
    tokenId: string;
    negRisk: boolean;
  } | null>(null);

  const { clobClient, isGeoblocked, safeAddress } = useTrading();
  const { data: positions } = useUserPositions(safeAddress as string | undefined);

  // Fetch dynamic political categories
  const {
    data: categories = [],
    isLoading: categoriesLoading,
    error: categoriesError
  } = usePoliticalCategories();

  // Get current active category details - memoized
  const activeCategoryObj = useMemo(() => 
    categories.find(c => c.id === activeCategory), 
    [categories, activeCategory]
  );
  
  const activeTagId = activeCategoryObj?.tagId ?? 2; // Default to politics tag

  // Fetch markets for the active category with infinite query
  const {
    data,
    isLoading: marketsLoading,
    error: marketsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMarkets({
    pageSize: 20,
    categoryId: activeCategory,
    tagId: activeTagId,
    categories,
    marketStatus,
  });

  // Flatten all pages into a single array - properly memoized
  const allMarkets = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flat();
  }, [data?.pages]);

  // Filter markets by status - memoized
  const markets = useMemo(() => {
    return filterMarketsByStatus(allMarkets, marketStatus);
  }, [allMarkets, marketStatus]);

  // Batch fetch recommendations for all visible markets
  const {
    recommendations,
    isLoading: recommendationsLoading,
    getRecommendation,
    getRecommendationCount
  } = useMarketRecommendations(markets);

  // Calculate market counts for filter display - memoized
  const marketCounts = useMemo(() => {
    return getMarketStatusCounts(allMarkets);
  }, [allMarkets]);

  const isLoading = categoriesLoading || marketsLoading;
  const error = categoriesError || marketsError;

  // Infinite scroll callback - stable reference
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Infinite scroll hook with optimized settings for mobile
  const { targetRef, resetFetching } = useInfiniteScroll(loadMore, {
    threshold: 0.1,
    rootMargin: "100px", // Reduced from 200px for better mobile performance
    delay: 200, // Increased debounce for mobile
  });

  // Reset fetching state when new data arrives - use useEffect instead of useMemo
  React.useEffect(() => {
    if (!isFetchingNextPage) {
      resetFetching();
    }
  }, [isFetchingNextPage, resetFetching]);

  // Helper to get consistent label - memoized
  const categoryLabel = useMemo(() => 
    activeCategoryObj?.label || "Political", 
    [activeCategoryObj?.label]
  );

  // Stable callback references
  const handleOutcomeClick = useCallback((
    marketTitle: string,
    outcome: string,
    price: number,
    tokenId: string,
    negRisk: boolean
  ) => {
    setSelectedOutcome({ marketTitle, outcome, price, tokenId, negRisk });
    setIsModalOpen(true);
  }, []);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setSelectedOutcome(null);
  }, []);

  const handleCategoryChange = useCallback((categoryId: CategoryId) => {
    setActiveCategory(categoryId);
  }, []);

  const handleStatusChange = useCallback((status: MarketStatus) => {
    setMarketStatus(status);
  }, []);

  return (
    <>
      <div className="space-y-4 sm:space-y-6">
        {/* Search Bar */}
        <div className="w-full max-w-2xl">
          <MarketSearch
            onOutcomeClick={handleOutcomeClick}
            className="w-full"
          />
        </div>

        {/* Main Toolbar - Responsive Layout */}
        <div className="flex flex-col gap-4 sm:gap-6 md:gap-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
            {/* Scrollable Tabs - Full width on mobile */}
            {categories.length > 0 && (
              <div className="flex-1 min-w-0 order-1 sm:order-none">
                <CategoryTabs
                  categories={categories}
                  activeCategory={activeCategory}
                  onCategoryChange={handleCategoryChange}
                />
              </div>
            )}

            {/* Right Actions - Responsive positioning */}
            <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 order-2 sm:order-none sm:pl-2">
              {/* AI Badge - Show on mobile with different styling */}
              {getRecommendationCount() > 0 && (
                <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-indigo-500/10 rounded-full border border-indigo-500/20">
                  <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(129,140,248,0.5)]" />
                  <span className="text-xs font-semibold text-indigo-300">
                    <span className="sm:hidden">{getRecommendationCount()}</span>
                    <span className="hidden sm:inline">{getRecommendationCount()} Picks</span>
                  </span>
                </div>
              )}

              <MarketStatusFilter
                currentStatus={marketStatus}
                onStatusChange={handleStatusChange}
                marketCounts={marketCounts}
              />
            </div>
          </div>
        </div>

        {/* Loading State - Initial Load */}
        {isLoading && markets.length === 0 && (
          <LoadingState message={`Loading ${categoryLabel.toLowerCase()} markets...`} />
        )}

        {/* Error State */}
        {error && !isLoading && markets.length === 0 && (
          <ErrorState error={error} title="Error loading political markets" />
        )}

        {/* Empty State */}
        {!isLoading && !error && markets.length === 0 && allMarkets.length > 0 && (
          <EmptyState
            title={`No ${marketStatus === "all" ? "" : marketStatus.charAt(0).toUpperCase() + marketStatus.slice(1).replace("-", " ")} Markets`}
            message={`No ${categoryLabel.toLowerCase()} markets match the selected filter.`}
          />
        )}

        {/* Empty State - No markets at all */}
        {!isLoading && !error && allMarkets.length === 0 && (
          <EmptyState
            title="No Political Markets Available"
            message={`No active ${categoryLabel.toLowerCase()} markets found.`}
          />
        )}

        {/* Market Cards - Optimized Responsive Grid */}
        {markets.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
            {markets.map((market, index) => {
              const recommendation = getRecommendation(market.conditionId || null) || null;
              return (
                <MarketCard
                  key={`${market.id}-${index}`} // Include index to handle potential duplicates
                  market={market}
                  disabled={isGeoblocked}
                  recommendation={recommendation}
                  recommendationLoading={recommendationsLoading}
                  onOutcomeClick={handleOutcomeClick}
                />
              );
            })}

            {/* Infinite Scroll Trigger */}
            {hasNextPage && (
              <div ref={targetRef} className="col-span-full py-4 flex justify-center">
                {isFetchingNextPage ? (
                  <LoadingState message="Loading more markets..." />
                ) : (
                  <div className="text-gray-400 text-sm text-center">
                    Scroll down to load more markets
                  </div>
                )}
              </div>
            )}

            {/* End of Results Indicator */}
            {!hasNextPage && markets.length > 20 && (
              <div className="col-span-full py-4 text-center text-gray-400 text-sm">
                You've reached the end of available markets
              </div>
            )}
          </div>
        )}
      </div>

      {/* Order Placement Modal */}
      {selectedOutcome && (
        <OrderPlacementModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          marketTitle={selectedOutcome.marketTitle}
          outcome={selectedOutcome.outcome}
          currentPrice={selectedOutcome.price}
          tokenId={selectedOutcome.tokenId}
          negRisk={selectedOutcome.negRisk}
          clobClient={clobClient}
          orderSide="BUY"
          userPosition={findUserPosition(positions, selectedOutcome.tokenId)}
        />
      )}
    </>
  );
});

export default PoliticalMarkets;
