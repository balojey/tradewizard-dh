import { Suspense } from "react";
import { notFound } from "next/navigation";
import MarketDetails from "@/components/Trading/Markets/MarketDetails";
import LoadingState from "@/components/shared/LoadingState";
import Header from "@/components/Header";
import { findMarketBySlug } from "@/lib/market-search";

async function getMarketBySlug(slug: string) {
    try {
        const market = await findMarketBySlug(slug);
        return market;
    } catch (error) {
        console.error("Error fetching market by slug:", error);
        return null;
    }
}

interface PageProps {
    params: Promise<{ slug: string }>;
}

export default async function MarketPage({ params }: PageProps) {
    const { slug } = await params;
    const market = await getMarketBySlug(slug);

    if (!market) {
        notFound();
    }

    return (
        <div className="min-h-screen flex flex-col">
            <Header />
            
            <main className="flex-1">
                <div className="container mx-auto px-4 py-8">
                    <Suspense fallback={<LoadingState message="Loading market details..." />}>
                        <MarketDetails market={market} />
                    </Suspense>
                </div>
            </main>
        </div>
    );
}
