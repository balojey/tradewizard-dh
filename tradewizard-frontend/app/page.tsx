"use client";

import { useTrading } from "@/providers/TradingProvider";
import Header from "@/components/Header";
import MarketTabs from "@/components/Trading/MarketTabs";
import GeoBlockedBanner from "@/components/GeoBlockedBanner";
import BetaStatusBanner from "@/components/BetaStatusBanner";
import FeaturedQuickTrade from "@/components/Home/FeaturedQuickTrade";

export default function Home() {
  const {
    endTradingSession,
    isGeoblocked,
    isGeoblockLoading,
    geoblockStatus,
  } = useTrading();

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0A] text-white selection:bg-indigo-500/30">
      <Header onEndSession={endTradingSession} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-12 flex flex-col gap-10">
        {/* Show geoblock banner if user is in blocked region */}
        {isGeoblocked && !isGeoblockLoading && (
          <GeoBlockedBanner geoblockStatus={geoblockStatus} />
        )}

        {/* Beta status banner - shows for all users */}
        <BetaStatusBanner />

        <div className="flex flex-col gap-6">

          {/* Featured Trade Widget */}
          <FeaturedQuickTrade />

          <MarketTabs />
        </div>
      </main>
    </div>
  );
}
