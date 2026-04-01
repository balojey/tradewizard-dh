"use client";

import { useState } from "react";
import { Brain, Sparkles, X, Info, TrendingUp } from "lucide-react";

interface BetaStatusBannerProps {
  className?: string;
}

export default function BetaStatusBanner({ className }: BetaStatusBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) return null;

  return (
    <div className={`bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 mb-6 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="relative">
            <Brain className="w-5 h-5 text-indigo-400" />
            <Sparkles className="w-3 h-3 text-purple-400 absolute -top-1 -right-1" />
          </div>
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-indigo-300 font-semibold text-sm">
              TradeWizard Beta
            </h3>
            <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 text-xs font-medium rounded-full">
              Limited Analysis
            </span>
          </div>
          
          <p className="text-indigo-200/80 text-sm mb-2 leading-relaxed">
            We're currently analyzing the <strong>top 10 trending markets</strong> to optimize costs during our beta phase. 
            Markets without AI recommendations will receive analysis as we expand coverage.
          </p>
          
          <div className="flex items-center gap-4 text-xs text-indigo-200/60">
            <div className="flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>Trending markets prioritized</span>
            </div>
            <div className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              <span>Full coverage coming soon</span>
            </div>
          </div>
        </div>
        
        <button
          onClick={() => setIsDismissed(true)}
          className="flex-shrink-0 p-1 text-indigo-400/60 hover:text-indigo-400 hover:bg-indigo-500/10 rounded transition-colors"
          aria-label="Dismiss beta notice"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}