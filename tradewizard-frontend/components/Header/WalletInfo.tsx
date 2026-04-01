import { useState, useRef, useEffect } from "react";
import { useWallet } from "@/providers/WalletContext";
import useAddressCopy from "@/hooks/useAddressCopy";
import useSafeDeployment from "@/hooks/useSafeDeployment";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Copy, Check, LogOut, Wallet, Shield, AlertTriangle } from "lucide-react";
import { formatAddress } from "@/utils/formatting";

export default function WalletInfo({
  onDisconnect,
  mode = "dropdown"
}: {
  onDisconnect: () => void;
  mode?: "dropdown" | "inline";
}) {
  const { eoaAddress } = useWallet();
  const { derivedSafeAddressFromEoa } = useSafeDeployment(eoaAddress);
  const { copied: copiedSafe, copyAddress: copySafeAddress } = useAddressCopy(
    derivedSafeAddressFromEoa || null
  );

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        mode === "dropdown"
      ) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mode]);

  return (
    <div className={`relative ${mode === "inline" ? "w-full" : ""}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex items-center gap-3 pl-1 pr-4 py-1 rounded-full border transition-all duration-300 ${isOpen
            ? "bg-white/10 border-white/20 text-white shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            : "bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
          } ${mode === "inline" ? "w-full justify-between py-2" : ""}`}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform duration-300">
            {eoaAddress?.slice(2, 4)}
          </div>
          <div className="flex flex-col">
            <span className="font-mono text-sm font-medium tracking-wide">
              {eoaAddress && formatAddress(eoaAddress)}
            </span>
            {derivedSafeAddressFromEoa && (
              <span className="text-xs text-green-400 font-medium">
                Trading Wallet Ready
              </span>
            )}
          </div>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isOpen ? "rotate-180 text-white" : "group-hover:text-white"}`}
        />
      </button>

      {/* Dropdown/Inline Content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={mode === "dropdown"
              ? { opacity: 0, y: 10, scale: 0.95 }
              : { opacity: 0, height: 0 }
            }
            animate={mode === "dropdown"
              ? { opacity: 1, y: 0, scale: 1 }
              : { opacity: 1, height: "auto" }
            }
            exit={mode === "dropdown"
              ? { opacity: 0, y: 10, scale: 0.95 }
              : { opacity: 0, height: 0 }
            }
            transition={{ duration: 0.2 }}
            className={mode === "dropdown"
              ? "absolute right-0 mt-3 w-80 bg-[#0F0F0F] rounded-2xl border border-white/10 shadow-2xl p-5 z-50 ring-1 ring-white/5"
              : "w-full bg-white/5 rounded-2xl mt-2 overflow-hidden"
            }
          >
            <div className={`flex flex-col gap-5 ${mode === "inline" ? "p-4" : ""}`}>
              {/* EOA Wallet */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                    <Wallet className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Login Wallet
                    </span>
                    <span className="text-[10px] text-gray-500 font-medium">
                      For authentication only
                    </span>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/5 rounded-xl px-4 py-3 font-mono text-sm text-gray-300 break-all select-all hover:bg-white/[0.07] transition-colors">
                  {eoaAddress}
                </div>
              </div>

              {/* Safe Wallet */}
              {derivedSafeAddressFromEoa && (
                <div className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/20">
                        <Shield className="w-3.5 h-3.5 text-green-400" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-green-400/90 uppercase tracking-wider">
                          Trading Wallet
                        </span>
                        <span className="text-[10px] text-green-400/70 font-medium">
                          Send funds here
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={copySafeAddress}
                      className="flex items-center gap-1.5 text-xs font-medium text-green-400 hover:text-green-300 transition-colors bg-green-500/10 hover:bg-green-500/20 px-2 py-1 rounded-md border border-green-500/10"
                    >
                      {copiedSafe ? (
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
                  <div className="bg-green-500/5 ring-1 ring-green-500/10 rounded-xl px-4 py-3 font-mono text-sm text-green-200/90 break-all select-all hover:bg-green-500/10 transition-colors">
                    {derivedSafeAddressFromEoa}
                  </div>
                  <div className="mt-2 bg-green-500/5 border border-green-500/10 rounded-lg p-3">
                    <p className="text-xs text-green-200/80 leading-relaxed">
                      <span className="font-semibold text-green-200 block mb-1">
                        💰 For Trading
                      </span>
                      Send USDC to this address to start trading. This is your secure Smart Contract wallet.
                    </p>
                  </div>
                </div>
              )}

              {/* Warning / Info */}
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 flex gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500/80 shrink-0" />
                <p className="text-xs text-amber-200/70 leading-relaxed">
                  <span className="font-semibold text-amber-200/90 block mb-1">
                    Please Note
                  </span>
                  This account is separate from your main Polymarket.com account.
                  Funds cannot be shared directly.
                </p>
              </div>

              {/* Actions */}
              <div className="pt-2 border-t border-white/10">
                <button
                  onClick={onDisconnect}
                  className="w-full group/logout flex items-center justify-center gap-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 rounded-xl px-4 py-3 transition-all duration-200 cursor-pointer text-sm font-medium text-red-400 hover:text-red-300"
                >
                  <LogOut className="w-4 h-4 transition-transform group-hover/logout:-translate-x-1" />
                  Sign Out
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
