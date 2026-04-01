"use client";

import { useTrading } from "@/providers/TradingProvider";
import Header from "@/components/Header";
import TradingSession from "@/components/TradingSession";
import GeoBlockedBanner from "@/components/GeoBlockedBanner";

export default function AccountPage() {
    const {
        tradingSession,
        currentStep,
        sessionError,
        isTradingSessionComplete,
        initializeTradingSession,
        endTradingSession,
        isGeoblocked,
        isGeoblockLoading,
        geoblockStatus,
    } = useTrading();

    return (
        <div className="min-h-screen flex flex-col">
            <Header onEndSession={endTradingSession} />

            <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 flex flex-col gap-8 pb-20">
                <h1 className="text-3xl font-bold text-white mb-4">Account & Trading Session</h1>

                {/* Show geoblock banner if user is in blocked region */}
                {isGeoblocked && !isGeoblockLoading && (
                    <GeoBlockedBanner geoblockStatus={geoblockStatus} />
                )}

                {/* Hide trading session initialization when geoblocked */}
                {!isGeoblocked && (
                    <TradingSession
                        session={tradingSession}
                        currentStep={currentStep}
                        error={sessionError}
                        isComplete={isTradingSessionComplete}
                        initialize={initializeTradingSession}
                        endSession={endTradingSession}
                    />
                )}

                {isGeoblocked && (
                    <div className="p-6 bg-red-900/20 border border-red-500/30 rounded-xl text-red-200">
                        Trading features are restricted in your region.
                    </div>
                )}
            </main>
        </div>
    );
}
