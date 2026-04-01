"use client";

import { useState } from "react";
import { useWallet } from "@/providers/WalletContext";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import usePolygonBalances from "@/hooks/usePolygonBalances";

import { cn } from "@/utils/classNames";
import { BUTTON_BASE, BUTTON_VARIANTS } from "@/constants/ui";

import Card from "@/components/shared/Card";
import Badge from "@/components/shared/Badge";
import TransferModal from "@/components/PolygonAssets/TransferModal";

export default function PolygonAssets() {
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);

  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  const { formattedUsdcBalance, isLoading, isError } = usePolygonBalances(
    derivedSafeAddressFromEoa
  );

  if (!derivedSafeAddressFromEoa) {
    return null;
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4 text-white">Trading Balance</h2>
        <div className="h-32 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="p-6 border-red-500/20">
        <h2 className="text-xl font-bold mb-4 text-white">Trading Balance</h2>
        <p className="text-center text-red-400">Error loading balance</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 transition-all duration-300 hover:shadow-indigo-500/10 hover:border-indigo-500/30">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <span className="w-2 h-6 bg-indigo-500 rounded-full" />
          Trading Balance
        </h2>
        <button
          onClick={() => setIsTransferModalOpen(true)}
          className={cn(
            BUTTON_BASE,
            BUTTON_VARIANTS.secondary,
            "px-4 py-2 text-sm shadow-sm"
          )}
        >
          Transfer Funds
        </button>
      </div>

      <div className="bg-black/20 rounded-xl p-8 text-center border border-black/10 shadow-inner">
        <div className="flex items-center justify-center gap-3 mb-3">
          <h3 className="text-lg font-medium text-gray-400">USDC (Polygon)</h3>
        </div>

        <p className="text-5xl font-bold text-white tracking-tight drop-shadow-lg">
          ${formattedUsdcBalance}
        </p>

        {/* Low Balance Warning */}
        {parseFloat(formattedUsdcBalance) < 10 && (
          <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-semibold text-amber-300">Fund Your Trading Wallet</span>
            </div>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              Send USDC to your Trading Wallet address to start trading. 
              <br />
              <span className="font-medium">Do not send funds to your Login Wallet.</span>
            </p>
          </div>
        )}
      </div>

      <TransferModal
        isOpen={isTransferModalOpen}
        onClose={() => setIsTransferModalOpen(false)}
      />
    </Card>
  );
}
