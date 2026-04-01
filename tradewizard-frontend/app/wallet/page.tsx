"use client";

import { useTrading } from "@/providers/TradingProvider";
import Header from "@/components/Header";
import PolygonAssets from "@/components/PolygonAssets";

export default function WalletPage() {
    const { endTradingSession } = useTrading();

    return (
        <div className="min-h-screen flex flex-col">
            <Header onEndSession={endTradingSession} />

            <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col gap-8 pb-20">
                <h1 className="text-3xl font-bold text-white mb-4">My Wallet</h1>
                <PolygonAssets />
            </main>
        </div>
    );
}
