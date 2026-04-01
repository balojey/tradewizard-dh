"use client";

import { useState } from "react";
import { Zap, Target, AlertTriangle, Sparkles } from "lucide-react";
import { useTrading } from "@/providers/TradingProvider";
import type { TradeRecommendation } from "@/hooks/useTradeRecommendation";
import { useQuickTrade } from "@/hooks/useQuickTrade";
import Card from "@/components/shared/Card";
import OrderPlacementModal from "@/components/Trading/OrderModal";

interface QuickTradeServiceProps {
    recommendation: TradeRecommendation;
    marketTitle: string;
    currentPrice: number;
    tokenId: string;
    negRisk: boolean;
    disabled?: boolean;
    userPosition?: {
        size: number;
        avgPrice: number;
    } | null;
}

export default function QuickTradeService({
    recommendation,
    marketTitle,
    currentPrice,
    tokenId,
    negRisk,
    disabled = false,
    userPosition = null
}: QuickTradeServiceProps) {
    const { clobClient } = useTrading();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [autoCreateTarget, setAutoCreateTarget] = useState(true);
    const [preferredOrderType, setPreferredOrderType] = useState<'market' | 'limit'>('market');

    const {
        analysis,
        selectedZone,
        selectZone,
        clearSelection,
        getZone,
        shouldTrade
    } = useQuickTrade({ recommendation, currentPrice });

    const recommendedOutcome = recommendation.action === 'LONG_YES' ? 'Yes' :
        recommendation.action === 'LONG_NO' ? 'No' : null;

    const hasPosition = userPosition && userPosition.size > 0;

    const handleQuickTrade = (zoneType: 'entry' | 'target' | 'current', preferredOrderType?: 'market' | 'limit') => {
        if (!recommendedOutcome || !shouldTrade) return;
        selectZone(zoneType);
        if (preferredOrderType) {
            setPreferredOrderType(preferredOrderType);
        }
        setIsModalOpen(true);
    };

    const getOrderSide = (zoneType: 'entry' | 'target' | 'current'): 'BUY' | 'SELL' => {
        return zoneType === 'target' ? 'SELL' : 'BUY';
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        clearSelection();
        setAutoCreateTarget(true);
        setPreferredOrderType('market'); // Reset to default
    };

    if (!shouldTrade) {
        return (
            <Card className="relative overflow-hidden group p-5 border-white/5 bg-white/5 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/5 rounded-full text-gray-500 group-hover:bg-white/10 transition-colors">
                        <Zap className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-300">No Active Signal</h3>
                        <p className="text-xs text-gray-500">AI is monitoring this market...</p>
                    </div>
                </div>
            </Card>
        );
    }

    const entryZone = getZone('entry')!;
    const targetZone = getZone('target')!;

    // Visualizing the price range
    const rangeMin = Math.min(entryZone.price, currentPrice) * 0.9;
    const rangeMax = Math.max(targetZone.price, currentPrice) * 1.1;
    const getPercentPos = (val: number) => ((val - rangeMin) / (rangeMax - rangeMin)) * 100;

    return (
        <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl opacity-30 group-hover:opacity-60 blur-md transition-opacity duration-500" />

            <Card className="relative p-0 overflow-hidden border-white/10 bg-[#0A0A0A] backdrop-blur-xl">
                {/* Header Section */}
                <div className="p-5 border-b border-white/5 bg-gradient-to-b from-white/5 to-transparent">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="w-4 h-4 text-indigo-400" />
                                <h3 className="font-bold text-white tracking-wide">Smart Execution</h3>
                            </div>
                            <p className="text-xs text-gray-400">AI-optimized entry & exit zones</p>
                        </div>
                        <div className={`px-2.5 py-1 rounded-lg border text-xs font-bold tracking-wider ${analysis.potentialReturn > 0
                            ? 'bg-green-500/10 border-green-500/20 text-green-400'
                            : 'bg-gray-500/10 border-gray-500/20 text-gray-400'
                            }`}>
                            +{analysis.potentialReturn.toFixed(1)}% Pot.
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="p-2.5 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                            <span className="text-xs text-gray-400">Signal</span>
                            <span className={`text-sm font-bold ${recommendedOutcome === 'Yes' ? 'text-green-400' : 'text-red-400'}`}>
                                Buy {recommendedOutcome}
                            </span>
                        </div>
                        <div className="p-2.5 bg-white/5 rounded-lg border border-white/5 flex items-center justify-between">
                            <span className="text-xs text-gray-400">Win Rate</span>
                            <span className="text-sm font-bold text-white">{(recommendation.winProbability * 100).toFixed(0)}%</span>
                        </div>
                    </div>
                </div>

                {/* Trading Visualizer */}
                <div className="p-6 space-y-6">

                    {/* Horizontal zone bar */}
                    {(() => {
                        const stop      = recommendation.stopLoss;
                        const entryLow  = recommendation.entryZone[0];
                        const entryHigh = recommendation.entryZone[1];
                        const target    = targetZone.price;

                        // Pad the visible range slightly beyond stop and target
                        const pad       = (target - stop) * 0.08;
                        const visMin    = stop - pad;
                        const visMax    = target + pad;
                        const span      = visMax - visMin;
                        const toX       = (p: number) => ((p - visMin) / span) * 100;

                        const stopX      = toX(stop);
                        const entryLowX  = toX(entryLow);
                        const entryHighX = toX(entryHigh);
                        const targetX    = toX(target);
                        const currX      = toX(Math.min(Math.max(currentPrice, visMin), visMax));
                        const entryCx    = (entryLowX + entryHighX) / 2;

                        const entryMid   = (entryLow + entryHigh) / 2;
                        const riskPct    = Math.abs((entryMid - stop) / entryMid * 100);
                        const rewardPct  = Math.abs((target - entryMid) / entryMid * 100);
                        const rrRatio    = riskPct > 0 ? (rewardPct / riskPct).toFixed(1) : '—';

                        return (
                            <div className="space-y-1">
                                {/* ── Top labels (above the bar) ── */}
                                <div className="relative h-8">
                                    {/* Stop label — above, left-anchored to marker */}
                                    <div
                                        className="absolute flex flex-col items-center"
                                        style={{ left: `${stopX}%`, transform: 'translateX(-50%)' }}
                                    >
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/70 whitespace-nowrap">Stop</span>
                                        <span className="text-xs font-bold font-mono text-red-400 leading-tight">{(stop * 100).toFixed(1)}¢</span>
                                    </div>

                                    {/* Entry label — centered over the entry band */}
                                    <div
                                        className="absolute flex flex-col items-center"
                                        style={{ left: `${entryCx}%`, transform: 'translateX(-50%)' }}
                                    >
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400/70 whitespace-nowrap">Entry Zone</span>
                                        <span className="text-xs font-bold font-mono text-emerald-300 leading-tight whitespace-nowrap">
                                            {(entryLow * 100).toFixed(1)}–{(entryHigh * 100).toFixed(1)}¢
                                        </span>
                                    </div>

                                    {/* Target label — above, right-anchored to marker */}
                                    <div
                                        className="absolute flex flex-col items-center"
                                        style={{ left: `${targetX}%`, transform: 'translateX(-50%)' }}
                                    >
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-purple-400/70 whitespace-nowrap">Target</span>
                                        <span className="text-xs font-bold font-mono text-purple-300 leading-tight">{(target * 100).toFixed(1)}¢</span>
                                    </div>
                                </div>

                                {/* ── The bar ── */}
                                <div className="relative h-4 rounded-full bg-white/5 overflow-hidden">
                                    {/* Risk zone: stop → entry low */}
                                    <div
                                        className="absolute top-0 h-full bg-red-500/25"
                                        style={{ left: `${stopX}%`, width: `${entryLowX - stopX}%` }}
                                    />
                                    {/* Entry zone: entry low → entry high */}
                                    <div
                                        className="absolute top-0 h-full bg-emerald-500/50"
                                        style={{ left: `${entryLowX}%`, width: `${entryHighX - entryLowX}%` }}
                                    />
                                    {/* Profit zone: entry high → target */}
                                    <div
                                        className="absolute top-0 h-full bg-purple-500/30"
                                        style={{ left: `${entryHighX}%`, width: `${targetX - entryHighX}%` }}
                                    />

                                    {/* Stop marker — left edge tick */}
                                    <div
                                        className="absolute top-0 h-full w-0.5 bg-red-500"
                                        style={{ left: `${stopX}%` }}
                                    />
                                    {/* Target marker — right edge tick */}
                                    <div
                                        className="absolute top-0 h-full w-0.5 bg-purple-400"
                                        style={{ left: `${targetX}%` }}
                                    />

                                    {/* Current price dot — sits on the bar */}
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.7)] z-10 transition-all duration-700"
                                        style={{ left: `${currX}%` }}
                                    />
                                </div>

                                {/* ── Bottom: current price label pinned under the dot ── */}
                                <div className="relative h-6">
                                    <div
                                        className="absolute flex flex-col items-center transition-all duration-700"
                                        style={{ left: `${currX}%`, transform: 'translateX(-50%)' }}
                                    >
                                        <div className="w-px h-1.5 bg-white/30" />
                                        <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-[10px] font-bold font-mono text-indigo-300 whitespace-nowrap leading-tight">
                                            {(currentPrice * 100).toFixed(1)}¢
                                        </span>
                                    </div>
                                </div>

                                {/* ── Risk / Reward strip ── */}
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <div className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-red-400/60">Risk</span>
                                        <span className="text-sm font-bold font-mono text-red-400">−{riskPct.toFixed(1)}%</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-white/5 border border-white/5">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-gray-500">R:R</span>
                                        <span className="text-sm font-bold font-mono text-white">1:{rrRatio}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5 p-2 rounded-lg bg-purple-500/5 border border-purple-500/10">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-purple-400/60">Reward</span>
                                        <span className="text-sm font-bold font-mono text-purple-400">+{rewardPct.toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })()}

                    {/* Primary Action Button */}
                    {!hasPosition ? (
                        <div className="space-y-4">
                            <button
                                onClick={() => handleQuickTrade('current', 'market')}
                                disabled={disabled || !clobClient}
                                className={`w-full group relative overflow-hidden rounded-xl p-4 transition-all duration-300 ${analysis.isInEntryZone
                                    ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:scale-[1.02] shadow-lg shadow-green-500/20'
                                    : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:scale-[1.02] shadow-lg shadow-indigo-500/20'
                                    } cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
                            >
                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="text-left">
                                        <div className="text-xs font-medium text-white/80 uppercase tracking-widest mb-1">
                                            {analysis.isInEntryZone ? 'Perfect Entry Range' : 'Market Entry'}
                                        </div>
                                        <div className="text-2xl font-bold text-white">
                                            Buy {recommendedOutcome}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-medium text-white/90">@ {(currentPrice * 100).toFixed(1)}¢</div>
                                    </div>
                                </div>

                                {/* Animated sheen effect */}
                                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000" />
                            </button>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => handleQuickTrade('entry', 'limit')}
                                    className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 text-xs text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                >
                                    <Target className="w-3.5 h-3.5" />
                                    Set Limit @ {(entryZone.price * 100).toFixed(1)}¢
                                </button>
                                <div className="px-3 py-2.5 rounded-lg bg-white/5 border border-white/5 text-xs text-gray-500 flex items-center justify-center gap-2 cursor-help" title="Profit Target">
                                    <Target className="w-3.5 h-3.5 text-purple-400" />
                                    Target: {(targetZone.price * 100).toFixed(1)}¢
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-between">
                                <div>
                                    <div className="text-xs text-purple-300 font-medium uppercase tracking-wider mb-1">Your Position</div>
                                    <div className="text-xl font-bold text-white">{userPosition.size.toFixed(0)} Shares</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-purple-300 font-medium uppercase tracking-wider mb-1">Unrealized P/L</div>
                                    <div className="text-xl font-bold text-green-400">+0.0%</div>
                                </div>
                            </div>

                            <button
                                onClick={() => handleQuickTrade('target', 'limit')}
                                disabled={disabled || !clobClient}
                                className="w-full relative overflow-hidden rounded-xl p-4 bg-gradient-to-r from-purple-600 to-indigo-600 hover:scale-[1.02] transition-all shadow-lg shadow-purple-500/20 group cursor-pointer"
                            >
                                <div className="relative z-10 flex items-center justify-between">
                                    <div className="text-left">
                                        <div className="text-xs font-medium text-white/80 uppercase tracking-widest mb-1">Take Profit</div>
                                        <div className="text-xl font-bold text-white">
                                            Set Sell Target
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-medium text-white/90">@ {(targetZone.price * 100).toFixed(1)}¢</div>
                                    </div>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* Auto Target Toggle - Mini */}
                    {!hasPosition && (
                        <div className="flex items-center gap-3 pt-3 border-t border-white/5">
                            <div className="flex items-center h-5">
                                <input
                                    id="auto-target"
                                    type="checkbox"
                                    checked={autoCreateTarget}
                                    onChange={(e) => setAutoCreateTarget(e.target.checked)}
                                    className="w-4 h-4 text-indigo-500 bg-white/5 border-white/10 rounded focus:ring-indigo-500 focus:ring-offset-gray-900"
                                />
                            </div>
                            <label htmlFor="auto-target" className="text-xs text-gray-400 select-none cursor-pointer">
                                Auto-create <span className="text-purple-400 font-semibold">Exit Plan</span> (Target @ {(targetZone.price * 100).toFixed(1)}¢ + Stop-Loss @ {(recommendation.stopLoss * 100).toFixed(1)}¢)
                            </label>
                        </div>
                    )}
                </div>
            </Card>

            {/* Warning if High Risk */}
            {analysis.riskLevel === 'high' && (
                <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-yellow-500/10 text-yellow-500 text-xs border border-yellow-500/20">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>High slippage warning: Limit orders recommended due to low liquidity.</p>
                </div>
            )}

            {/* Order Modal */}
            {selectedZone && recommendedOutcome && (
                <OrderPlacementModal
                    isOpen={isModalOpen}
                    onClose={handleCloseModal}
                    marketTitle={marketTitle}
                    outcome={recommendedOutcome}
                    currentPrice={getZone(selectedZone)?.price || currentPrice}
                    tokenId={tokenId}
                    negRisk={negRisk}
                    clobClient={clobClient}
                    orderSide={getOrderSide(selectedZone)}
                    userPosition={userPosition}
                    quickTradeMode={{
                        zone: selectedZone,
                        recommendedPrice: getZone(selectedZone)?.price || currentPrice,
                        entryZone: recommendation.entryZone,
                        targetZone: recommendation.targetZone,
                        stopLoss: recommendation.stopLoss,
                        autoCreateTarget: selectedZone !== 'target' ? autoCreateTarget : false,
                        preferredOrderType: preferredOrderType,
                    }}
                />
            )}
        </div>
    );
}