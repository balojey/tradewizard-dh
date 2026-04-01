"use client";

import Card from "@/components/shared/Card";
import PoliticalMarkets from "@/components/Trading/Markets";

export default function MarketTabs() {
  return (
    <Card className="p-6">

      {/* Markets Content */}
      <div>
        <PoliticalMarkets />
      </div>
    </Card>
  );
}
