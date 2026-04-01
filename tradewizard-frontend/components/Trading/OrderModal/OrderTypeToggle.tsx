import { cn } from "@/utils/classNames";
import { MousePointer2, Target } from "lucide-react";

interface OrderTypeToggleProps {
  orderType: "market" | "limit";
  onChangeOrderType: (type: "market" | "limit") => void;
}

export default function OrderTypeToggle({
  orderType,
  onChangeOrderType,
}: OrderTypeToggleProps) {
  return (
    <div className="mb-6">
      <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 relative">
        {/* Sliding Background Indicator */}
        <div
          className={cn(
            "absolute top-1 bottom-1 w-[calc(50%-4px)] bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/20 transition-all duration-300 ease-out",
            orderType === "limit" ? "translate-x-full left-1" : "left-1"
          )}
        />

        <button
          onClick={() => onChangeOrderType("market")}
          className={cn(
            "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors duration-200",
            orderType === "market" ? "text-white" : "text-gray-400 hover:text-gray-200"
          )}
        >
          <MousePointer2 className="w-4 h-4" />
          Market
        </button>
        <button
          onClick={() => onChangeOrderType("limit")}
          className={cn(
            "flex-1 relative z-10 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors duration-200",
            orderType === "limit" ? "text-white" : "text-gray-400 hover:text-gray-200"
          )}
        >
          <Target className="w-4 h-4" />
          Limit
        </button>
      </div>

      {/* Helper Text */}
      <p className="mt-2 text-xs text-center text-gray-500">
        {orderType === "market"
          ? "Buy immediately at the best available price"
          : "Set a specific maximum price you are willing to pay"}
      </p>
    </div>
  );
}
