"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp, ChevronRight } from "lucide-react";
import { useMultipleRecommendations } from "@/hooks/useTradeRecommendation";
import QuickTradeService from "@/components/Trading/QuickTradeService";
import { useTrading } from "@/providers/TradingProvider";
import useUserPositions from "@/hooks/useUserPositions";
import { findUserPosition } from "@/utils/positionHelpers";

// Hardcoded condition ID for a popular/active market to feature
// In a real app, this would be fetched dynamically from a "featured" endpoint
const FEATURED_CONDITION_ID = "0xc00f723652db7936a720641042f61a123"; // Valid example ID or placeholder

export default function FeaturedQuickTrade() {
    const { data: recommendations } = useMultipleRecommendations([FEATURED_CONDITION_ID]);
    const recommendation = recommendations?.[FEATURED_CONDITION_ID];
    const { clobClient, safeAddress } = useTrading();
    const { data: positions } = useUserPositions(safeAddress as string | undefined);

    // We need the market details too, which we can get from a hook or pass down
    // For this widget, we might want to fetch the specific market data if not available in recommendation
    // But recommendation usually has what we need except maybe pricing

    if (!recommendation || recommendation.action === 'NO_TRADE') return null;

    return (
        <div className="relative overflow-hidden rounded-3xl bg-[#0A0A0A] border border-white/10 p-1">
            <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-b from-indigo-500/20 via-purple-500/10 to-transparent blur-3xl opacity-40 -z-10" />

            <div className="grid md:grid-cols-2 gap-8 p-8 backdrop-blur-xl">
                <div className="flex flex-col justify-center space-y-6">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-sm font-medium text-indigo-300 w-fit">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        <span>Degen AI • Trade of the Day</span>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-3xl md:text-5xl font-bold text-white tracking-tight leading-tight">
                            Recommended: <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
                                {recommendation.action === 'LONG_YES' ? 'Vote Yes' : 'Vote No'}
                            </span> on this market
                        </h2>
                        <p className="text-gray-400 text-lg max-w-lg leading-relaxed">
                            Our AI agents have analyzed this market and identified a significant edge with a {(recommendation.winProbability * 100).toFixed(0)}% probability.
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        <Link
                            href={`/market/${recommendation.marketId}`}
                            className="group inline-flex items-center gap-2 text-white font-semibold hover:text-indigo-400 transition-colors"
                        >
                            Read Full Analysis
                            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>
                </div>

                <div className="relative">
                    {/* Decorative glow behind the card */}
                    <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full transform scale-90" />

                    <div className="relative z-10 transform md:scale-105 md:-rotate-1 transition-transform hover:rotate-0 duration-500">
                        <QuickTradeService
                            recommendation={recommendation}
                            marketTitle="Featured Market Question is loading..." // Ideally fetch this
                            currentPrice={0.50} // Needs real price
                            tokenId="token_placeholder"
                            negRisk={false}
                            disabled={!clobClient}
                            userPosition={null}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
