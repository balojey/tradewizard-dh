"use client";

import useClobOrder from "@/hooks/useClobOrder";
import useTickSize from "@/hooks/useTickSize";
import { useState, useEffect, useRef } from "react";
import { useWallet } from "@/providers/WalletContext";

import Portal from "@/components/Portal";
import OrderForm from "@/components/Trading/OrderModal/OrderForm";
import OrderSummary from "@/components/Trading/OrderModal/OrderSummary";
import OrderTypeToggle from "@/components/Trading/OrderModal/OrderTypeToggle";

import { cn } from "@/utils/classNames";
import { MIN_ORDER_SIZE } from "@/constants/validation";
import type { ClobClient } from "@polymarket/clob-client";
import { isValidSize } from "@/utils/validation";
import { X, CheckCircle, AlertCircle, ArrowRight, Target, Zap } from "lucide-react";

function getDecimalPlaces(tickSize: number): number {
  if (tickSize >= 1) return 0;
  const str = tickSize.toString();
  const decimalPart = str.split(".")[1];
  return decimalPart ? decimalPart.length : 0;
}

function isValidTickPrice(price: number, tickSize: number): boolean {
  if (tickSize <= 0) return false;
  const multiplier = Math.round(price / tickSize);
  const expectedPrice = multiplier * tickSize;
  // Allow small floating point tolerance
  return Math.abs(price - expectedPrice) < 1e-10;
}

type OrderPlacementModalProps = {
  isOpen: boolean;
  onClose: () => void;
  marketTitle: string;
  outcome: string;
  currentPrice: number;
  tokenId: string;
  negRisk?: boolean;
  clobClient: ClobClient | null;
  orderSide?: "BUY" | "SELL";
  userPosition?: {
    size: number;
    avgPrice: number;
  } | null;
  quickTradeMode?: {
    zone: 'entry' | 'target' | 'current';
    recommendedPrice: number;
    entryZone: [number, number];
    targetZone: [number, number];
    stopLoss: number;
    autoCreateTarget?: boolean;
    preferredOrderType?: 'market' | 'limit';
  };
};

export default function OrderPlacementModal({
  isOpen,
  onClose,
  marketTitle,
  outcome,
  currentPrice,
  tokenId,
  negRisk = false,
  clobClient,
  orderSide = "BUY",
  userPosition = null,
  quickTradeMode,
}: OrderPlacementModalProps) {
  const [size, setSize] = useState<string>("");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [currentOrderSide, setCurrentOrderSide] = useState<"BUY" | "SELL">(orderSide);
  const [autoCreateTarget, setAutoCreateTarget] = useState<boolean>(quickTradeMode?.autoCreateTarget ?? true);

  const { eoaAddress } = useWallet();

  const modalRef = useRef<HTMLDivElement>(null);

  // Fetch tick size dynamically for this market
  const { tickSize, isLoading: isLoadingTickSize } = useTickSize(
    isOpen ? tokenId : null
  );
  const decimalPlaces = getDecimalPlaces(tickSize);

  const {
    submitOrder,
    isSubmitting,
    error: orderError,
    orderId,
  } = useClobOrder(clobClient, eoaAddress);

  useEffect(() => {
    if (isOpen) {
      setSize("");
      setLimitPrice("");
      setLocalError(null);
      setShowSuccess(false);
      setCurrentOrderSide(orderSide);
      setAutoCreateTarget(quickTradeMode?.autoCreateTarget ?? true);
      
      // Set default order type based on order side and quick trade mode
      if (quickTradeMode) {
        // Use preferred order type if provided, otherwise use defaults
        if (quickTradeMode.preferredOrderType) {
          setOrderType(quickTradeMode.preferredOrderType);
        } else {
          // For quick trade mode: market orders for buy, limit for sell (target)
          if (orderSide === "BUY") {
            setOrderType("market");
          } else {
            // Sell orders (targets) should be limit orders
            setOrderType("limit");
          }
        }
        // Pre-fill limit price for easy switching
        setLimitPrice(quickTradeMode.recommendedPrice.toFixed(4));
      } else {
        // For regular orders: market for buy, market for sell (user can change)
        setOrderType(orderSide === "BUY" ? "market" : "market");
      }
    }
  }, [isOpen, orderSide, quickTradeMode]);

  useEffect(() => {
    if (orderId && isOpen) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [orderId, isOpen, onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }

    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeNum = parseFloat(size) || 0;
  const limitPriceNum = parseFloat(limitPrice) || 0;
  const effectivePrice = orderType === "limit" ? limitPriceNum : currentPrice;

  // Determine colors based on outcome and order side
  const isYes = outcome.toLowerCase() === "yes";
  const isNo = outcome.toLowerCase() === "no";
  const isBuying = currentOrderSide === "BUY";
  
  // Color logic: Green for Yes/Buy, Red for No/Sell, Blue for other outcomes
  const accentColor = isYes 
    ? (isBuying ? "text-green-400" : "text-green-400") 
    : isNo 
    ? (isBuying ? "text-red-400" : "text-red-400") 
    : "text-blue-400";
  
  const bgAccent = isBuying
    ? (isYes ? "bg-green-500" : isNo ? "bg-red-500" : "bg-blue-500")
    : (isYes ? "bg-orange-500" : isNo ? "bg-purple-500" : "bg-indigo-500");

  const handlePlaceOrder = async () => {
    if (!isValidSize(sizeNum)) {
      setLocalError(`Size must be greater than ${MIN_ORDER_SIZE}`);
      return;
    }

    // Validate sell orders against user position
    if (currentOrderSide === "SELL") {
      if (!userPosition || userPosition.size <= 0) {
        setLocalError("You don't have any shares to sell");
        return;
      }
      
      if (sizeNum > userPosition.size) {
        setLocalError(`Cannot sell ${sizeNum} shares. You only own ${userPosition.size} shares.`);
        return;
      }
    }

    if (orderType === "limit") {
      if (!limitPrice || limitPriceNum <= 0) {
        setLocalError("Limit price is required");
        return;
      }

      if (limitPriceNum < tickSize || limitPriceNum > 1 - tickSize) {
        setLocalError(
          `Price must be between $${tickSize.toFixed(decimalPlaces)} and $${(1 - tickSize).toFixed(decimalPlaces)}`
        );
        return;
      }

      if (!isValidTickPrice(limitPriceNum, tickSize)) {
        setLocalError(`Price must be a multiple of tick size ($${tickSize})`);
        return;
      }
    }

    try {
      await submitOrder({
        tokenId,
        size: sizeNum,
        price: orderType === "limit" ? limitPriceNum : undefined,
        side: currentOrderSide,
        negRisk,
        isMarketOrder: orderType === "market",
      });

      // Auto-create target sell order for buy MARKET orders in quick trade mode
      // Note: Only for market orders since limit orders may not fill immediately
      if (autoCreateTarget && 
          currentOrderSide === "BUY" && 
          orderType === "market" &&
          quickTradeMode &&
          (quickTradeMode.zone === 'entry' || quickTradeMode.zone === 'current')) {
        
        // Calculate target price (midpoint of target zone)
        const targetPrice = (quickTradeMode.targetZone[0] + quickTradeMode.targetZone[1]) / 2;
        
        // Calculate stop-loss price (from recommendation)
        const stopLossPrice = quickTradeMode.stopLoss || (quickTradeMode.entryZone[0] - 0.03);
        
        // Small delay to ensure first order is processed
        setTimeout(async () => {
          try {
            // Create target sell order (take profit)
            await submitOrder({
              tokenId,
              size: sizeNum,
              price: targetPrice,
              side: "SELL",
              negRisk,
              isMarketOrder: false, // Always limit order for targets
            });
            
            // Create stop-loss sell order (risk management)
            // Additional delay to avoid rate limiting
            setTimeout(async () => {
              try {
                await submitOrder({
                  tokenId,
                  size: sizeNum,
                  price: Math.max(0.01, stopLossPrice), // Ensure minimum price
                  side: "SELL",
                  negRisk,
                  isMarketOrder: false, // Limit order at stop-loss price
                });
              } catch (stopLossError) {
                console.warn("Failed to create stop-loss order:", stopLossError);
                // Don't show error to user as main order succeeded
              }
            }, 500);
          } catch (targetError) {
            console.warn("Failed to create auto-target order:", targetError);
            // Don't show error to user as main order succeeded
          }
        }, 1000);
      }
    } catch (err) {
      console.error("Error placing order:", err);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <Portal>
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 transition-all duration-300"
        onClick={handleBackdropClick}
      >
        <div
          ref={modalRef}
          className="bg-[#0A0A0B] rounded-2xl max-w-[420px] w-full border border-white/10 shadow-2xl animate-modal-fade-in overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-white/5 bg-white/[0.02]">
            <div className="space-y-1 pr-4">
              <div className="flex items-center gap-2 text-sm text-gray-400 mb-1">
                {quickTradeMode && (
                  <>
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-indigo-500/20 text-indigo-400 rounded-full border border-indigo-500/30">
                      <Zap className="w-3 h-3" />
                      <span className="text-xs font-semibold">Quick Trade</span>
                    </div>
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
                <span>{currentOrderSide === "BUY" ? "Buying" : "Selling"}</span>
                <ArrowRight className="w-3 h-3" />
                <span className={cn("font-bold uppercase tracking-wide px-1.5 py-0.5 rounded text-[10px] bg-white/5", accentColor)}>
                  {outcome}
                </span>
                {currentOrderSide === "SELL" && userPosition && (
                  <span className="text-xs text-gray-500">
                    ({userPosition.size} owned)
                  </span>
                )}
              </div>
              <h3 className="text-base font-medium leading-snug line-clamp-2 text-gray-100">
                {marketTitle}
              </h3>
              {quickTradeMode && (
                <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                  <Target className="w-3 h-3" />
                  <span>
                    {quickTradeMode.zone === 'entry' && 'AI Entry Zone'}
                    {quickTradeMode.zone === 'target' && 'AI Target Zone'}
                    {quickTradeMode.zone === 'current' && 'Current Market Price'}
                  </span>
                  <span className="text-indigo-400 font-mono">
                    {(quickTradeMode.recommendedPrice * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 overflow-y-auto custom-scrollbar">
            {/* Success Message */}
            {showSuccess && (
              <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center gap-3 animate-slide-down">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <h4 className="font-bold text-green-400 text-sm">Order Successful</h4>
                  <p className="text-green-300/80 text-xs">Your order has been placed on the orderbook.</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {(localError || orderError) && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 animate-slide-down">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
                <div>
                  <h4 className="font-bold text-red-400 text-sm">Unable to Place Order</h4>
                  <p className="text-red-300/80 text-xs mt-0.5">
                    {localError || orderError?.message || "An unexpected error occurred."}
                  </p>
                </div>
              </div>
            )}

            {/* Buy/Sell Toggle */}
            {userPosition && userPosition.size > 0 && (
              <div className="mb-6">
                <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 relative">
                  {/* Sliding Background Indicator */}
                  <div
                    className={cn(
                      "absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg shadow-lg transition-all duration-300 ease-out",
                      currentOrderSide === "SELL" ? "translate-x-full left-1 bg-orange-600 shadow-orange-500/20" : "left-1 bg-green-600 shadow-green-500/20"
                    )}
                  />

                  <button
                    onClick={() => {
                      setCurrentOrderSide("BUY");
                      setLocalError(null);
                    }}
                    className={cn(
                      "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors duration-200",
                      currentOrderSide === "BUY" ? "text-white" : "text-gray-400 hover:text-gray-200"
                    )}
                  >
                    Buy More
                  </button>
                  <button
                    onClick={() => {
                      setCurrentOrderSide("SELL");
                      setLocalError(null);
                    }}
                    className={cn(
                      "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors duration-200",
                      currentOrderSide === "SELL" ? "text-white" : "text-gray-400 hover:text-gray-200"
                    )}
                  >
                    Sell Position
                  </button>
                </div>

                {/* Helper Text */}
                <p className="mt-2 text-xs text-center text-gray-500">
                  {currentOrderSide === "BUY"
                    ? "Purchase additional shares of this outcome"
                    : `Sell up to ${userPosition.size} shares you currently own`}
                </p>
              </div>
            )}

            {/* Quick Trade Mode Info */}
            {quickTradeMode && (
              <div className="mb-6 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="w-4 h-4 text-indigo-400" />
                  <span className="text-sm font-semibold text-indigo-400">Quick Trade Mode</span>
                </div>
                <p className="text-xs text-gray-300 mb-3">
                  {quickTradeMode.zone === 'entry' && currentOrderSide === "BUY" && 'Market buy at current price (AI entry zone guidance)'}
                  {quickTradeMode.zone === 'current' && currentOrderSide === "BUY" && 'Market buy at current market price'}
                  {quickTradeMode.zone === 'target' && 'Setting limit sell order for profit-taking'}
                  {quickTradeMode.zone === 'entry' && currentOrderSide === "SELL" && 'Limit sell at AI-recommended entry zone'}
                  {quickTradeMode.zone === 'current' && currentOrderSide === "SELL" && 'Limit sell at current market price'}
                </p>
                
                {/* Auto-target toggle for buy orders */}
                {(quickTradeMode.zone === 'entry' || quickTradeMode.zone === 'current') && currentOrderSide === "BUY" && (
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                    <div>
                      <div className="text-sm font-medium text-white">Auto-create sell target</div>
                      <div className="text-xs text-gray-400">
                        {orderType === "market" 
                          ? `Automatically place sell order at ${((quickTradeMode.targetZone[0] + quickTradeMode.targetZone[1]) / 2 * 100).toFixed(1)}¢ after buy executes`
                          : "Only available for market orders (immediate execution)"
                        }
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCreateTarget && orderType === "market"}
                        onChange={(e) => setAutoCreateTarget(e.target.checked)}
                        disabled={orderType !== "market"}
                        className="sr-only peer"
                      />
                      <div className={`w-11 h-6 ${orderType === "market" ? "bg-gray-600" : "bg-gray-700"} peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${orderType === "market" ? "peer-checked:bg-indigo-600" : "peer-checked:bg-gray-600"} ${orderType !== "market" ? "opacity-50" : ""}`}></div>
                    </label>
                  </div>
                )}
              </div>
            )}
            <OrderTypeToggle
              orderType={orderType}
              onChangeOrderType={(type) => {
                setOrderType(type);
                setLocalError(null);
              }}
            />

            <OrderForm
              size={size}
              onSizeChange={(value) => {
                setSize(value);
                setLocalError(null);
              }}
              limitPrice={limitPrice}
              onLimitPriceChange={(value) => {
                setLimitPrice(value);
                setLocalError(null);
              }}
              orderType={orderType}
              currentPrice={currentPrice}
              isSubmitting={isSubmitting}
              tickSize={tickSize}
              decimalPlaces={decimalPlaces}
              isLoadingTickSize={isLoadingTickSize}
              orderSide={currentOrderSide}
              userPosition={userPosition}
            />

            <OrderSummary 
              size={sizeNum} 
              price={effectivePrice} 
              orderSide={currentOrderSide}
              userPosition={userPosition}
            />

            {/* Submit Button */}
            <button
              onClick={handlePlaceOrder}
              disabled={isSubmitting || sizeNum <= 0 || !clobClient}
              className={cn(
                "w-full py-4 mt-2 text-white font-bold rounded-xl transition-all duration-300 shadow-lg relative overflow-hidden group disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none",
                bgAccent,
                "hover:brightness-110 active:scale-[0.98]"
              )}
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
              <span className="relative z-10 flex items-center justify-center gap-2">
                {isSubmitting ? (
                  <>Processing Order...</>
                ) : (
                  <>
                    Place {currentOrderSide === "BUY" ? "Buy" : "Sell"} Order
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </span>
            </button>

            {!clobClient && (
              <p className="text-xs text-yellow-500/80 mt-4 text-center bg-yellow-500/5 py-2 rounded-lg border border-yellow-500/10">
                ⚠️ Wallet not connected or authenticated
              </p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
