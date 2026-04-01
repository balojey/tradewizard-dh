import { isValidDecimalInput } from "@/utils/validation";
import { cn } from "@/utils/classNames";
import { DollarSign, Hash } from "lucide-react";

interface OrderFormProps {
  size: string;
  onSizeChange: (value: string) => void;
  limitPrice: string;
  onLimitPriceChange: (value: string) => void;
  orderType: "market" | "limit";
  currentPrice: number;
  isSubmitting: boolean;
  tickSize: number;
  decimalPlaces: number;
  isLoadingTickSize: boolean;
  orderSide: "BUY" | "SELL";
  userPosition?: {
    size: number;
    avgPrice: number;
  } | null;
}

const isValidPriceInput = (value: string, maxDecimals: number): boolean => {
  if (value === "" || value === "0" || value === "0.") return true;
  const regex = new RegExp(`^(0?\\.[0-9]{0,${maxDecimals}}|0)$`);
  return regex.test(value);
};

const QUICK_AMOUNTS = [10, 50, 100, 500];

export default function OrderForm({
  size,
  onSizeChange,
  limitPrice,
  onLimitPriceChange,
  orderType,
  currentPrice,
  isSubmitting,
  tickSize,
  decimalPlaces,
  isLoadingTickSize,
  orderSide,
  userPosition,
}: OrderFormProps) {
  const handleSizeChange = (value: string) => {
    if (isValidDecimalInput(value)) {
      onSizeChange(value);
    }
  };

  const handleLimitPriceChange = (value: string) => {
    if (isValidPriceInput(value, decimalPlaces)) {
      onLimitPriceChange(value);
    }
  };

  const priceInCents = Math.round(currentPrice * 100);
  const safeTickSize =
    typeof tickSize === "number" && !isNaN(tickSize) ? tickSize : 0.01;
  const tickSizeDisplay = safeTickSize.toFixed(decimalPlaces);
  const maxPriceDisplay = (1 - safeTickSize).toFixed(decimalPlaces);

  // Helper to convert explicit dollar amount to share size based on current price
  const handleQuickAmount = (amount: number) => {
    // If buying $10 worth at current price $0.50, we get 20 shares.
    // Cost = price * shares => shares = cost / price
    if (currentPrice > 0) {
      const estimatedShares = Math.floor(amount / currentPrice);
      handleSizeChange(estimatedShares.toString());
    }
  };

  return (
    <>
      {/* Current Price Banner */}
      <div className="mb-6 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-indigo-300 font-medium mb-0.5 uppercase tracking-wide">Market Price</p>
          <p className="text-2xl font-bold text-white tracking-tight">{priceInCents}¢</p>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
            Live
          </span>
        </div>
      </div>

      {/* Size Input */}
      <div className="mb-6 space-y-3">
        <label className="text-sm font-medium text-gray-300 flex justify-between">
          <span>Shares to {orderSide === "BUY" ? "Buy" : "Sell"}</span>
          <span className="text-xs text-gray-500">
            {orderSide === "BUY" ? "How many outcomes?" : `Max: ${userPosition?.size || 0}`}
          </span>
        </label>

        <div className="relative group">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            <Hash className="h-5 w-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
          </div>
          <input
            type="text"
            value={size}
            onChange={(e) => handleSizeChange(e.target.value)}
            placeholder="0"
            className="block w-full pl-11 pr-4 py-4 bg-[#141416] border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-white placeholder-gray-600 transition-all font-mono text-lg"
            disabled={isSubmitting}
          />
        </div>

        {/* Quick Amount Buttons - Different for Buy vs Sell */}
        {orderSide === "BUY" ? (
          <div className="flex gap-2">
            {QUICK_AMOUNTS.map((amt) => (
              <button
                key={amt}
                onClick={() => handleQuickAmount(amt)}
                disabled={currentPrice <= 0 || isSubmitting}
                className="flex-1 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ${amt}
              </button>
            ))}
          </div>
        ) : (
          userPosition && userPosition.size > 0 && (
            <div className="flex gap-2">
              {[25, 50, 75, 100].map((percentage) => {
                const shares = Math.floor((userPosition.size * percentage) / 100);
                return (
                  <button
                    key={percentage}
                    onClick={() => handleSizeChange(shares.toString())}
                    disabled={isSubmitting || shares <= 0}
                    className="flex-1 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg text-gray-400 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {percentage}%
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Limit Price Input */}
      {orderType === "limit" && (
        <div className="mb-6 space-y-3 animate-slide-down">
          <label className="text-sm font-medium text-gray-300 flex justify-between">
            <span>Limit Price</span>
            {isLoadingTickSize && (
              <span className="text-xs text-indigo-400 animate-pulse">
                Syncing...
              </span>
            )}
          </label>

          <div className="relative group">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <DollarSign className="h-5 w-5 text-gray-500 group-focus-within:text-indigo-400 transition-colors" />
            </div>
            <input
              type="text"
              inputMode="decimal"
              value={limitPrice}
              onChange={(e) => handleLimitPriceChange(e.target.value)}
              placeholder={tickSizeDisplay}
              className="block w-full pl-11 pr-4 py-4 bg-[#141416] border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 text-white placeholder-gray-600 transition-all font-mono text-lg"
              disabled={isSubmitting || isLoadingTickSize}
            />
          </div>

          <div className="flex justify-between items-center text-xs text-gray-500 px-1">
            <span>Step: ${tickSizeDisplay}</span>
            <span>Max: ${maxPriceDisplay}</span>
          </div>
        </div>
      )}
    </>
  );
}
