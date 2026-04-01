"use client";

import { useTrading } from "@/providers/TradingProvider";
import Header from "@/components/Header";
import ActiveOrders from "@/components/Trading/Orders";
import GeoBlockedBanner from "@/components/GeoBlockedBanner";
import Card from "@/components/shared/Card";

export default function OrdersPage() {
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

        <div className="flex flex-col gap-6">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-1">Open Orders</h1>
              <p className="text-gray-400 text-sm">
                View and manage your active limit orders.
              </p>
            </div>
          </div>

          <Card className="p-6">
            <ActiveOrders />
          </Card>
        </div>
      </main>
    </div>
  );
}