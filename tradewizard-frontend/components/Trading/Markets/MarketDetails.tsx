"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";
import { ChevronLeft, Brain, Activity, Users, TrendingUp, BarChart3, Clock, Wallet, Info } from "lucide-react";
import { useTrading } from "@/providers/TradingProvider";
import { formatVolume } from "@/utils/formatting";
import type { PolymarketMarket } from "@/hooks/useMarkets";
import useUserPositions from "@/hooks/useUserPositions";
import { findUserPosition } from "@/utils/positionHelpers";
import { isMarketEndingSoon } from "@/utils/marketFilters";
import { useTradeRecommendation } from "@/hooks/useTradeRecommendation";
import { useShowTimeTravel } from "@/hooks/useRecommendationCount";

import Card from "@/components/shared/Card";
import OutcomeButtons from "@/components/Trading/Markets/OutcomeButtons";
import RecommendationBadge from "@/components/Trading/Markets/RecommendationBadge";
import OrderPlacementModal from "@/components/Trading/OrderModal";
import AIInsightsPanel from "@/components/Trading/Markets/AIInsightsPanel";
import RealAgentDebatePanel from "@/components/Trading/Markets/RealAgentDebatePanel";
import AgentWorkflowDiagram from "@/components/Trading/Markets/AgentWorkflowDiagram";
import AgentInteractionNetwork from "@/components/Trading/Markets/AgentInteractionNetwork";
import AgentOutputComparison from "@/components/Trading/Markets/AgentOutputComparison";
import QuickTradeService from "@/components/Trading/QuickTradeService";
import RecommendationHistory from "@/components/Trading/Markets/RecommendationHistory";
import RecommendationTimeTravel from "@/components/Trading/Markets/RecommendationTimeTravel";
import PriceHistoryChart from "@/components/Trading/Markets/PriceHistoryChart";
import TabNavigation, { Tab } from "@/components/shared/TabNavigation";
import PerformanceTab from "@/components/Trading/Markets/PerformanceTab";

interface MarketDetailsProps {
    market: PolymarketMarket;
}

type TabType = 'overview' | 'ai-insights' | 'debate' | 'data-flow' | 'chart' | 'time-travel' | 'performance';

export default function MarketDetails({ market }: MarketDetailsProps) {
    const { clobClient, isGeoblocked, safeAddress } = useTrading();
    const { data: positions } = useUserPositions(safeAddress as string | undefined);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('ai-insights');
    const [selectedOutcome, setSelectedOutcome] = useState<{
        marketTitle: string;
        outcome: string;
        price: number;
        tokenId: string;
        negRisk: boolean;
    } | null>(null);

    const { data: recommendation } = useTradeRecommendation(market.conditionId || null, {
        enabled: !!market.conditionId,
    });

    const { shouldShow: shouldShowTimeTravel, recommendationCount } = useShowTimeTravel(market.conditionId || null);

    const volumeUSD = parseFloat(
        String(market.volume24hr || market.volume || "0")
    );
    const liquidityUSD = parseFloat(String(market.liquidity || "0"));
    const isClosed = market.closed;
    const isActive = market.active && !market.closed;
    const isEndingSoon = isActive && isMarketEndingSoon(market);
    const disabled = isGeoblocked || !clobClient || isClosed;

    const outcomes = market.outcomes ? JSON.parse(market.outcomes) : [];
    const tokenIds = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : [];
    const negRisk = market.negRisk || false;

    // Calculate outcome prices similar to MarketCard
    const outcomePrices = useMemo(() => {
        return tokenIds.map((tokenId: string) => {
            const realtimePrice = market.realtimePrices?.[tokenId]?.bidPrice;
            if (realtimePrice && realtimePrice > 0) {
                return realtimePrice;
            }

            if (market.outcomePrices) {
                try {
                    const staticPrices = JSON.parse(market.outcomePrices);
                    const tokenIndex = tokenIds.indexOf(tokenId);
                    if (tokenIndex !== -1 && staticPrices[tokenIndex]) {
                        return parseFloat(staticPrices[tokenIndex]);
                    }
                } catch (error) {
                    console.warn(`Failed to parse static prices for market ${market.id}`);
                }
            }
            return 0;
        });
    }, [market.realtimePrices, market.outcomePrices, market.id, tokenIds]);

    const yesIndex = outcomes.findIndex((o: string) => o.toLowerCase() === "yes");
    const noIndex = outcomes.findIndex((o: string) => o.toLowerCase() === "no");
    const yesPrice = yesIndex !== -1 ? (outcomePrices?.[yesIndex] || 0) : 0;
    const noPrice = noIndex !== -1 ? (outcomePrices?.[noIndex] || 0) : (1 - yesPrice);
    
    // Determine which token price to display based on AI recommendation
    const getDisplayTokenInfo = () => {
        if (recommendation?.action === 'LONG_YES') {
            return {
                price: yesPrice,
                label: 'Yes Price',
                chance: Math.round(Number(yesPrice) * 100)
            };
        } else if (recommendation?.action === 'LONG_NO') {
            return {
                price: noPrice,
                label: 'No Price', 
                chance: Math.round(Number(noPrice) * 100)
            };
        }
        // Default to YES token if no recommendation or NO_TRADE
        return {
            price: yesPrice,
            label: 'Yes Price',
            chance: Math.round(Number(yesPrice) * 100)
        };
    };

    const displayToken = getDisplayTokenInfo();

    // Build tabs array dynamically based on market state
    const tabs: Tab[] = [
        { id: 'overview', label: 'Overview', icon: BarChart3 },
        { id: 'ai-insights', label: 'AI Insights', icon: Brain },
        { id: 'chart', label: 'Price Chart', icon: TrendingUp },
        { id: 'debate', label: 'Agent Debate', icon: Users },
        { id: 'data-flow', label: 'Data Flow', icon: Activity },
        { id: 'performance', label: 'Performance', icon: BarChart3 },
        ...(shouldShowTimeTravel ? [{ id: 'time-travel' as const, label: `Time Travel (${recommendationCount})`, icon: Clock }] : []),
    ];

    const handleOutcomeClick = (
        marketTitle: string,
        outcome: string,
        price: number,
        tokenId: string,
        negRisk: boolean
    ) => {
        setSelectedOutcome({ marketTitle, outcome, price, tokenId, negRisk });
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setSelectedOutcome(null);
    };

    return (
        <div className="max-w-7xl mx-auto pb-8 sm:pb-12">
            {/* Back Navigation */}
            <div className="mb-6 sm:mb-8 pt-4">
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-gray-500 hover:text-white transition-colors group"
                >
                    <div className="p-1 rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                        <ChevronLeft className="w-4 h-4" />
                    </div>
                    <span className="font-medium text-sm">Back to Markets</span>
                </Link>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 lg:gap-8">
                {/* Main Content */}
                <div className="xl:col-span-8 space-y-6 sm:space-y-8">
                    {/* Market Header Card - Responsive */}
                    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0A0A0A]">
                        {/* Background gradient effect */}
                        <div className="absolute top-0 right-0 w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] bg-gradient-to-b from-indigo-500/10 via-purple-500/5 to-transparent blur-3xl opacity-50 -z-10" />

                        <div className="p-4 sm:p-6 lg:p-8">
                            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                                {(market.icon || market.image || market.eventIcon) && (
                                    <div className="relative order-1 sm:order-none">
                                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl overflow-hidden ring-1 ring-white/10 shadow-2xl">
                                            <img
                                                src={market.icon || market.image || market.eventIcon}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        {isActive && (
                                            <div className="absolute -bottom-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full border-[3px] border-[#0A0A0A]" />
                                        )}
                                    </div>
                                )}

                                <div className="flex-1 min-w-0 pt-0 sm:pt-1 order-2 sm:order-none">
                                    <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-3 leading-tight tracking-tight">
                                        {market.question}
                                    </h1>

                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                        <RecommendationBadge
                                            conditionId={market.conditionId || null}
                                            size="md"
                                            showDetails={true}
                                        />

                                        {isEndingSoon && (
                                            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 bg-yellow-500/10 text-yellow-400 text-xs font-semibold rounded-full border border-yellow-500/20">
                                                <Clock className="w-3 h-3" />
                                                Ending Soon
                                            </div>
                                        )}

                                        {isClosed && (
                                            <>
                                                <div className="px-2 sm:px-3 py-1 bg-gray-800 text-gray-400 text-xs font-semibold rounded-full border border-gray-700">
                                                    Market Closed
                                                </div>
                                                {market.winningOutcome && (
                                                    <div className="px-2 sm:px-3 py-1 bg-indigo-500/20 text-indigo-300 text-xs font-semibold rounded-full border border-indigo-500/30">
                                                        Resolved: {market.winningOutcome}
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {negRisk && (
                                            <div className="px-2 sm:px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-semibold rounded-full border border-blue-500/20">
                                                Neg Risk
                                            </div>
                                        )}

                                        {market.events?.[0]?.tags?.slice(0, 3).map((tag: any) => (
                                            <span
                                                key={tag.id}
                                                className="px-2 sm:px-2.5 py-1 bg-white/5 text-gray-400 text-xs font-medium rounded-full border border-white/5 hover:bg-white/10 hover:text-gray-200 transition-colors cursor-default"
                                            >
                                                {tag.label}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Key Metrics Grid - Responsive */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t border-white/5">
                                <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors">
                                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs font-medium mb-1.5">
                                        <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                        <span>{displayToken.label}</span>
                                        {recommendation && (
                                            <div className="ml-1 w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
                                        )}
                                    </div>
                                    <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                                        {displayToken.chance}¢
                                    </div>
                                </div>

                                <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors">
                                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs font-medium mb-1.5">
                                        <Activity className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                        <span>24h Volume</span>
                                    </div>
                                    <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                                        {formatVolume(volumeUSD)}
                                    </div>
                                </div>

                                <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors">
                                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs font-medium mb-1.5">
                                        <Wallet className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                        <span>Liquidity</span>
                                    </div>
                                    <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                                        {formatVolume(liquidityUSD)}
                                    </div>
                                </div>

                                <div className="p-3 sm:p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.07] transition-colors">
                                    <div className="flex items-center gap-1.5 sm:gap-2 text-gray-400 text-xs font-medium mb-1.5">
                                        <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                        <span>End Date</span>
                                    </div>
                                    <div className="text-lg sm:text-xl font-bold text-white tracking-tight truncate">
                                        {market.endDate ? format(new Date(market.endDate), "MMM d") : "TBD"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Content Tabs - Responsive */}
                    <div className="space-y-4 sm:space-y-6">
                        <TabNavigation
                            tabs={tabs}
                            activeTab={activeTab}
                            onTabChange={(tabId) => setActiveTab(tabId as TabType)}
                        />

                        <div className="min-h-[300px] sm:min-h-[400px]">
                            {activeTab === 'overview' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    {market.description ? (
                                        <div className="prose prose-invert max-w-none">
                                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                                                <Info className="w-4 h-4 text-indigo-400" />
                                                About This Market
                                            </h3>
                                            <div className="p-4 sm:p-6 rounded-2xl bg-white/5 border border-white/5 text-gray-300 leading-relaxed text-sm sm:text-base">
                                                {market.description}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center justify-center py-16 sm:py-20 text-gray-500 bg-white/5 rounded-2xl border border-dashed border-white/10">
                                            <Info className="w-8 h-8 mb-3 opacity-50" />
                                            <p>No description available for this market.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === 'ai-insights' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <AIInsightsPanel
                                        conditionId={market.conditionId || null}
                                        marketPrice={yesPrice}
                                        volume24h={volumeUSD}
                                        liquidity={liquidityUSD}
                                    />
                                </div>
                            )}

                            {activeTab === 'chart' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <PriceHistoryChart
                                        conditionId={market.conditionId || null}
                                        tokenId={yesIndex !== -1 ? tokenIds[yesIndex] : tokenIds[0] || null}
                                        currentPrice={yesPrice}
                                        outcomes={outcomes}
                                        tokenIds={tokenIds}
                                        outcomePrices={outcomePrices}
                                        recommendedTokenId={
                                            recommendation?.action === 'LONG_YES' 
                                                ? (yesIndex !== -1 ? tokenIds[yesIndex] : null)
                                                : recommendation?.action === 'LONG_NO'
                                                ? (outcomes.findIndex((o: string) => o.toLowerCase() === 'no') !== -1 
                                                    ? tokenIds[outcomes.findIndex((o: string) => o.toLowerCase() === 'no')] 
                                                    : null)
                                                : null
                                        }
                                        aiRecommendation={recommendation ? {
                                            entryZone: [
                                                Math.max(0.01, yesPrice * 0.95), // 5% below current price
                                                Math.min(0.99, yesPrice * 1.05)  // 5% above current price
                                            ],
                                            targetZone: [
                                                recommendation.action === 'LONG_YES' 
                                                    ? Math.min(0.99, yesPrice * 1.1)  // 10% above for long
                                                    : Math.max(0.01, yesPrice * 0.9), // 10% below for short
                                                recommendation.action === 'LONG_YES'
                                                    ? Math.min(0.99, yesPrice * 1.2)  // 20% above for long
                                                    : Math.max(0.01, yesPrice * 0.8)  // 20% below for short
                                            ],
                                            consensusProbability: recommendation.metadata.consensusProbability || yesPrice
                                        } : undefined}
                                    />
                                </div>
                            )}

                            {activeTab === 'debate' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <RealAgentDebatePanel
                                        conditionId={market.conditionId || null}
                                        marketQuestion={market.question}
                                    />
                                </div>
                            )}

                            {activeTab === 'data-flow' && (
                                <div className="space-y-6 sm:space-y-8 animate-in fade-in-from-bottom-2 duration-500">
                                    <AgentWorkflowDiagram
                                        conditionId={market.conditionId || null}
                                        marketQuestion={market.question}
                                    />
                                    <AgentInteractionNetwork
                                        conditionId={market.conditionId || null}
                                        marketQuestion={market.question}
                                        recommendationId={recommendation?.id || null}
                                    />
                                    <AgentOutputComparison
                                        conditionId={market.conditionId || null}
                                        marketQuestion={market.question}
                                        recommendationId={recommendation?.id || null}
                                    />
                                </div>
                            )}

                            {activeTab === 'time-travel' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <RecommendationTimeTravel
                                        conditionId={market.conditionId || null}
                                        currentMarketPrice={displayToken.price}
                                        yesPrice={yesPrice}
                                        noPrice={noPrice}
                                    />
                                </div>
                            )}

                            {activeTab === 'performance' && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    <PerformanceTab
                                        conditionId={market.conditionId || null}
                                        isResolved={market.closed}
                                        winningOutcome={market.winningOutcome}
                                        endDate={market.endDate}
                                        currentMarketPrice={yesPrice}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar: Trading Panel - Responsive */}
                <div className="xl:col-span-4 space-y-4 sm:space-y-6">
                    <div className="xl:sticky xl:top-6 space-y-4 sm:space-y-6">
                        {/* Quick Trade Service - Prioritized */}
                        {recommendation && recommendation.action !== 'NO_TRADE' && (() => {
                            // Determine the correct outcome index and price based on recommendation
                            const isLongYes = recommendation.action === 'LONG_YES';
                            const targetOutcomeIndex = isLongYes ? yesIndex : outcomes.findIndex((o: string) => o.toLowerCase() === "no");
                            const targetPrice = targetOutcomeIndex !== -1 ? (outcomePrices?.[targetOutcomeIndex] || 0) : 0;
                            const targetTokenId = targetOutcomeIndex !== -1 ? tokenIds[targetOutcomeIndex] : tokenIds[0];
                            
                            return (
                                <QuickTradeService
                                    recommendation={recommendation}
                                    marketTitle={market.question}
                                    currentPrice={targetPrice}
                                    tokenId={targetTokenId}
                                    negRisk={negRisk}
                                    disabled={disabled}
                                    userPosition={findUserPosition(positions, targetTokenId)}
                                />
                            );
                        })()}

                        {/* Recommendation History - Only show if there are recommendations */}
                        {shouldShowTimeTravel && (
                            <RecommendationHistory
                                conditionId={market.conditionId || null}
                                currentMarketPrice={yesPrice}
                            />
                        )}

                        <Card className="p-4 sm:p-6 border-indigo-500/20 shadow-[0_0_50px_-12px_rgba(79,70,229,0.1)]">
                            <div className="flex items-center justify-between mb-6 sm:mb-8">
                                <h3 className="font-bold text-lg sm:text-xl text-white">Place Order</h3>
                                {yesIndex !== -1 && (
                                    <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-white/5 rounded-full border border-white/10">
                                        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                                        <span className="text-xs font-medium text-gray-400">{isActive ? 'Live' : 'Closed'}</span>
                                    </div>
                                )}
                            </div>

                            {isClosed && (
                                <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                                    <div className="flex items-center gap-2 text-gray-400 mb-2">
                                        <Info className="w-4 h-4" />
                                        <span className="font-medium text-sm">Trading Disabled</span>
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        This market has been resolved and is no longer accepting trades.
                                        {market.winningOutcome && ` Final outcome: ${market.winningOutcome}`}
                                    </p>
                                </div>
                            )}

                            <OutcomeButtons
                                outcomes={outcomes}
                                outcomePrices={outcomePrices}
                                tokenIds={tokenIds}
                                isClosed={isClosed}
                                negRisk={negRisk}
                                marketQuestion={market.question}
                                disabled={disabled}
                                onOutcomeClick={handleOutcomeClick}
                                layout="vertical"
                            />

                            <div className="mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-white/10">
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-400">Your Balance</span>
                                        <span className="text-white font-mono">$0.00</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-gray-400">Liquidity Depth</span>
                                        <span className="text-green-400 font-mono">High</span>
                                    </div>
                                </div>
                                {!safeAddress && (
                                    <button className="w-full mt-4 sm:mt-6 py-3 sm:py-3.5 bg-white/5 border border-white/10 rounded-xl text-sm font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                                        <Wallet className="w-4 h-4" />
                                        Log in to Trade
                                    </button>
                                )}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            {/* Order Modal */}
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
        </div>
    );
}