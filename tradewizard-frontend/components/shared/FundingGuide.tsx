"use client";

import { useState } from "react";
import { useWallet } from "@/providers/WalletContext";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import useAddressCopy from "@/hooks/useAddressCopy";
import { Copy, Check, Shield, Wallet, ArrowRight, ExternalLink } from "lucide-react";
import { formatAddress } from "@/utils/formatting";
import Card from "@/components/shared/Card";

export default function FundingGuide() {
  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  const { copied, copyAddress } = useAddressCopy(derivedSafeAddressFromEoa || null);

  if (!derivedSafeAddressFromEoa) {
    return null;
  }

  return (
    <Card className="p-6 bg-gradient-to-br from-green-500/5 to-blue-500/5 border-green-500/20">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
          <Shield className="w-5 h-5 text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">How to Fund Your Trading Wallet</h3>
      </div>

      <div className="space-y-4">
        {/* Step 1 */}
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center text-sm font-bold text-green-300">
            1
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-white mb-2">Copy Your Trading Wallet Address</h4>
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-green-400 uppercase tracking-wider">
                  Trading Wallet (Safe)
                </span>
                <button
                  onClick={copyAddress}
                  className="flex items-center gap-1.5 text-xs font-medium text-green-400 hover:text-green-300 transition-colors bg-green-500/10 hover:bg-green-500/20 px-2 py-1 rounded-md border border-green-500/10"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <div className="font-mono text-sm text-green-200 break-all select-all bg-green-500/5 rounded p-2">
                {derivedSafeAddressFromEoa}
              </div>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="flex gap-4">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center text-sm font-bold text-blue-300">
            2
          </div>
          <div className="flex-1">
            <h4 className="font-medium text-white mb-2">Send USDC on Polygon Network</h4>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <ul className="text-sm text-blue-200/80 space-y-1">
                <li>• Use any wallet (MetaMask, Coinbase, etc.)</li>
                <li>• Send USDC on <strong>Polygon network</strong></li>
                <li>• Paste the Trading Wallet address above</li>
                <li>• Minimum recommended: $10 USDC</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 p-1 rounded bg-amber-500/20">
              <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <h5 className="font-semibold text-amber-300 mb-1">Important</h5>
              <p className="text-xs text-amber-200/80 leading-relaxed">
                <strong>Do not send funds to your Login Wallet</strong> ({formatAddress(eoaAddress || "")}). 
                Only send funds to your Trading Wallet address shown above.
              </p>
            </div>
          </div>
        </div>

        {/* External Resources */}
        <div className="pt-4 border-t border-white/10">
          <h5 className="text-sm font-medium text-gray-300 mb-2">Need help getting USDC on Polygon?</h5>
          <div className="flex flex-wrap gap-2">
            <a
              href="https://wallet.polygon.technology/polygon/bridge"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded border border-blue-500/10"
            >
              Polygon Bridge
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="https://app.uniswap.org/#/swap"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 hover:bg-blue-500/20 px-2 py-1 rounded border border-blue-500/10"
            >
              Uniswap
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}