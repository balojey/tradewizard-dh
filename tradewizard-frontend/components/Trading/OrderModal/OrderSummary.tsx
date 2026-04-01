import { formatCurrency, formatShares } from "@/utils/formatting";
import { calculateTotalCost } from "@/utils/order";
import { Receipt } from "lucide-react";

interface OrderSummaryProps {
  size: number;
  price: number;
  orderSide: "BUY" | "SELL";
  userPosition?: {
    size: number;
    avgPrice: number;
  } | null;
}

export default function OrderSummary({ size, price, orderSide, userPosition }: OrderSummaryProps) {
  if (size <= 0) return null;

  const isBuying = orderSide === "BUY";
  const totalCost = calculateTotalCost(size, price);
  
  if (isBuying) {
    const potentialPayout = size; // Since each share pays out $1 if successful
    const potentialProfit = potentialPayout - totalCost;
    const roi = totalCost > 0 ? (potentialProfit / totalCost) * 100 : 0;

    return (
      <div className="space-y-3 p-4 bg-white/[0.03] border border-white/5 rounded-xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          <Receipt className="w-3.5 h-3.5" />
          Buy Order Summary
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Entry Price</span>
            <span className="text-gray-200 font-mono">{formatCurrency(price, 3)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Est. Shares</span>
            <span className="text-gray-200 font-mono">{formatShares(size)}</span>
          </div>
          <div className="h-px bg-white/10 my-2" />
          <div className="flex justify-between items-end">
            <span className="text-sm text-gray-300 font-medium">Total Cost</span>
            <span className="text-xl font-bold text-white tracking-tight">{formatCurrency(totalCost)}</span>
          </div>

          {/* ROI Projection */}
          <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
            <span className="text-emerald-400">Potential Return</span>
            <div className="text-right">
              <span className="text-emerald-400 font-bold block">+{roi.toFixed(1)}%</span>
              <span className="text-emerald-500/60 block">Pay out: {formatCurrency(potentialPayout)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  } else {
    // Sell order summary
    const totalProceeds = totalCost; // For sells, this is what you receive
    const originalCost = userPosition ? userPosition.avgPrice * size : 0;
    const realizedPnL = totalProceeds - originalCost;
    const realizedPnLPercent = originalCost > 0 ? (realizedPnL / originalCost) * 100 : 0;

    return (
      <div className="space-y-3 p-4 bg-white/[0.03] border border-white/5 rounded-xl">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
          <Receipt className="w-3.5 h-3.5" />
          Sell Order Summary
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Exit Price</span>
            <span className="text-gray-200 font-mono">{formatCurrency(price, 3)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Shares to Sell</span>
            <span className="text-gray-200 font-mono">{formatShares(size)}</span>
          </div>
          {userPosition && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Avg. Cost Basis</span>
              <span className="text-gray-200 font-mono">{formatCurrency(userPosition.avgPrice, 3)}</span>
            </div>
          )}
          <div className="h-px bg-white/10 my-2" />
          <div className="flex justify-between items-end">
            <span className="text-sm text-gray-300 font-medium">Total Proceeds</span>
            <span className="text-xl font-bold text-white tracking-tight">{formatCurrency(totalProceeds)}</span>
          </div>

          {/* Realized P&L */}
          {userPosition && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between text-xs">
              <span className={realizedPnL >= 0 ? "text-emerald-400" : "text-red-400"}>
                Realized P&L
              </span>
              <div className="text-right">
                <span className={`font-bold block ${realizedPnL >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {realizedPnL >= 0 ? "+" : ""}{realizedPnLPercent.toFixed(1)}%
                </span>
                <span className={`block ${realizedPnL >= 0 ? "text-emerald-500/60" : "text-red-500/60"}`}>
                  {realizedPnL >= 0 ? "+" : ""}{formatCurrency(realizedPnL)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
