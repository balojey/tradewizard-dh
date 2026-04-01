"use client";

import React, { useState, useRef, useEffect } from "react";
import { Search, X, Loader2, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import useMarketSearch from "@/hooks/useMarketSearch";
import MarketCard from "./MarketCard";
import { useTrading } from "@/providers/TradingProvider";
import useUserPositions from "@/hooks/useUserPositions";
import useMarketRecommendations from "@/hooks/useMarketRecommendations";
import { cn } from "@/utils/classNames";
import MarketStatusFilter, { MarketStatus } from "./MarketStatusFilter";

interface MarketSearchProps {
  onMarketSelect?: (market: any) => void;
  onOutcomeClick?: (
    marketTitle: string,
    outcome: string,
    price: number,
    tokenId: string,
    negRisk: boolean
  ) => void;
  className?: string;
}

const MarketSearch: React.FC<MarketSearchProps> = ({
  onMarketSelect,
  onOutcomeClick,
  className = "",
}) => {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MarketStatus>("all");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const { isGeoblocked, safeAddress } = useTrading();
  // kept for potential future usage or context, though not directly used in rendering right now
  const { data: positions } = useUserPositions(safeAddress as string | undefined);

  const { results, isSearching, hasResults, error } = useMarketSearch(query, {
    enabled: isOpen && query.length >= 2,
    minQueryLength: 2,
    debounceMs: 300,
    status,
    limit: 20,
  });

  // Get recommendations for search results
  const {
    isLoading: recommendationsLoading,
    getRecommendation,
  } = useMarketRecommendations(results.markets);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen || !hasResults) return;

      const totalResults = results.markets.length;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev =>
            prev < totalResults - 1 ? prev + 1 : 0
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : totalResults - 1
          );
          break;
        case "Enter":
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < totalResults) {
            const selectedMarket = results.markets[selectedIndex];
            handleMarketSelect(selectedMarket);
          }
          break;
        case "Escape":
          e.preventDefault();
          handleClose();
          break;
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, hasResults, results.markets, selectedIndex]);

  // Handle clicks outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        resultsRef.current &&
        !resultsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        // Don't close if clicking inside the filter dropdown (which is inside the container usually or portal)
        // But since filter is inside the wrapper, we need to be careful.
        // The filter component handles its own outside click, but if we click the filter button,
        // we don't want to close the search dropdown if it's open? 
        // Actually, often we want search results to stay open while filtering.
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setSelectedIndex(-1);

    if (value.length >= 2) {
      setIsOpen(true);
    } else {
      setIsOpen(false);
    }
  };

  const handleInputFocus = () => {
    if (query.length >= 2) {
      setIsOpen(true);
    }
  };

  const handleMarketSelect = (market: any) => {
    if (onMarketSelect) {
      onMarketSelect(market);
    }
    handleClose();
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    setQuery("");
    setIsOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  const handleOutcomeClick = (
    marketTitle: string,
    outcome: string,
    price: number,
    tokenId: string,
    negRisk: boolean
  ) => {
    if (onOutcomeClick) {
      onOutcomeClick(marketTitle, outcome, price, tokenId, negRisk);
    }
    handleClose();
  };

  return (
    <div className={cn("relative z-50", className)}>
      {/* Search Input Container */}
      <div className="relative group">
        {/* Animated Gradient Border/Glow */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 rounded-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm" />

        <div className="relative flex items-center bg-[#1C1C1E] rounded-xl border border-white/10 group-focus-within:border-white/20 transition-colors shadow-lg">
          {/* Search Icon */}
          <div className="pl-4 flex-shrink-0 pointer-events-none">
            <Search className="h-5 w-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
          </div>

          {/* Input field */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            placeholder="Search markets..."
            className="w-full bg-transparent border-none py-3.5 pl-3 pr-2 text-white placeholder-gray-500 focus:outline-none focus:ring-0 text-sm md:text-base font-medium"
          />

          {/* Controls Right */}
          <div className="flex items-center gap-2 pr-2">
            {/* Clear Button / Loading Spinner */}
            {isSearching ? (
              <div className="p-2">
                <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
              </div>
            ) : query ? (
              <button
                onClick={handleClear}
                className="p-2 text-gray-500 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}

            {/* Separator */}
            <div className="h-6 w-px bg-white/10 mx-1" />

            {/* Status Filter */}
            <div
              onMouseDown={(e) => e.stopPropagation()} /* Prevent closing when clicking filter */
            >
              <MarketStatusFilter
                currentStatus={status}
                onStatusChange={setStatus}
                className="z-[60]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Search Results Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={resultsRef}
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full left-0 right-0 mt-3 bg-[#1C1C1E]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl z-[50] max-h-[60vh] overflow-hidden flex flex-col ring-1 ring-white/5"
          >
            {/* Header / Stats */}
            {hasResults && (
              <div className="flex-shrink-0 px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2 text-xs font-medium text-gray-400">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                  <span>Found {results.markets.length} results</span>
                </div>
                <div className="text-[10px] bg-white/5 border border-white/5 rounded px-1.5 py-0.5 text-gray-500 font-mono uppercase tracking-wider">
                  {status}
                </div>
              </div>
            )}

            <div className="overflow-y-auto custom-scrollbar flex-1 relative min-h-[100px]">
              {/* Loading State (Overlay or standalone) */}
              {isSearching && !hasResults && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-[#1C1C1E]/50 backdrop-blur-[1px] z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mb-3" />
                  <p className="text-gray-400 text-sm">Searching the markets...</p>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                    <X className="h-5 w-5 text-red-400" />
                  </div>
                  <p className="text-white font-medium">Search failed</p>
                  <p className="text-gray-500 text-sm mt-1">Unable to load results. Please try again.</p>
                </div>
              )}

              {/* No Results */}
              {!isSearching && !hasResults && query.length >= 2 && !error && (
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Search className="h-8 w-8 text-gray-600" />
                  </div>
                  <p className="text-white font-medium text-lg">No markets found</p>
                  <p className="text-gray-500 text-sm mt-1 max-w-[200px]">
                    We couldn't find anything for "{query}" in {status} markets.
                  </p>
                </div>
              )}

              {/* Results Grid/List */}
              {hasResults && (
                <div className="p-2 space-y-1">
                  {results.markets.map((market, index) => {
                    const recommendation = getRecommendation(market.conditionId || null) || null;
                    const isSelected = index === selectedIndex;

                    return (
                      <motion.div
                        key={market.id}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03 }}
                        className={cn(
                          "rounded-xl transition-all duration-200 overflow-hidden",
                          isSelected
                            ? "bg-white/5 ring-1 ring-indigo-500/50"
                            : "hover:bg-white/5"
                        )}
                        onClick={() => handleMarketSelect(market)}
                      >
                        <div className="p-2">
                          <MarketCard
                            market={market}
                            disabled={isGeoblocked}
                            recommendation={recommendation}
                            recommendationLoading={recommendationsLoading}
                            onOutcomeClick={(...args) => {
                              // Wrap outcome click to close search too if needed, 
                              // or let handleOutcomeClick do it
                              handleOutcomeClick(...args);
                            }}
                            compact={true}
                          />
                        </div>
                      </motion.div>
                    );
                  })}

                  {/* Footer message if many results */}
                  {/* Since we limit to 20 in hook, maybe just show that */}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MarketSearch;