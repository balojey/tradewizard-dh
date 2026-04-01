"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { useWallet } from "@/providers/WalletContext";
import WalletInfo from "@/components/Header/WalletInfo";
import SearchShortcut from "@/components/shared/SearchShortcut";
import { BUTTON_BASE, BUTTON_VARIANTS } from "@/constants/ui";
import { cn } from "@/utils/classNames";

export default function Header({
  onEndSession,
}: {
  onEndSession?: () => void;
}) {
  const { eoaAddress, connect, disconnect } = useWallet();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  const navItems = [
    { label: "Markets", href: "/" },
    { label: "History", href: "/history" },
    { label: "Positions", href: "/positions" },
    { label: "Orders", href: "/orders" },
    { label: "Wallet", href: "/wallet" },
    { label: "Account", href: "/account" },
  ];

  const handleDisconnect = async () => {
    try {
      onEndSession?.();
      await disconnect();
    } catch (error) {
      console.error("Disconnect error:", error);
    }
  };

  return (
    <>
      <header
        className={cn(
          "sticky top-0 z-50 w-full transition-all duration-300 border-b",
          isScrolled
            ? "bg-black/40 backdrop-blur-xl border-white/5 supports-[backdrop-filter]:bg-black/20"
            : "bg-transparent border-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          {/* Brand */}
          <div className="flex items-center gap-3 select-none z-50 relative">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500 blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
                <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-gray-900 to-black border border-white/10 flex items-center justify-center font-bold text-white text-xl shadow-xl group-hover:scale-105 transition-transform duration-300">
                  <span className="bg-gradient-to-br from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                    T
                  </span>
                </div>
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-white to-gray-400">
                TradeWizard
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1 bg-white/5 rounded-full p-1.5 border border-white/5 backdrop-blur-md">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "relative px-5 py-2 rounded-full text-sm font-medium transition-colors duration-200 z-10",
                    isActive
                      ? "text-white"
                      : "text-gray-400 hover:text-white"
                  )}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-white/10 rounded-full border border-white/5 shadow-sm"
                      transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                    />
                  )}
                  <span className="relative z-10">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-4">
            <SearchShortcut />
            {eoaAddress ? (
              <WalletInfo onDisconnect={handleDisconnect} />
            ) : (
              <button
                className={cn(
                  BUTTON_BASE,
                  "relative group overflow-hidden bg-white text-black hover:text-black px-6 py-2.5 font-semibold text-sm rounded-full transition-all duration-300 hover:shadow-[0_0_20px_rgba(255,255,255,0.3)]"
                )}
                onClick={connect}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 opacity-0 group-hover:opacity-10 transition-opacity duration-300" />
                <span className="relative z-10 flex items-center gap-2">
                  Log In / Sign Up
                  <svg className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                </span>
              </button>
            )}
          </div>

          {/* Mobile Menu Toggle */}
          <button
            className="md:hidden relative z-50 p-2 text-white/70 hover:text-white transition-colors"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed inset-0 z-40 bg-black/95 backdrop-blur-2xl md:hidden pt-24 px-6 overflow-y-auto"
          >
            <nav className="flex flex-col gap-2 pb-10">
              {/* Mobile Search */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 }}
                className="mb-4"
              >
                <SearchShortcut className="w-full justify-start" />
              </motion.div>

              {navItems.map((item, idx) => {
                const isActive = pathname === item.href;
                return (
                  <motion.div
                    key={item.href}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + idx * 0.05 }}
                  >
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center justify-between p-4 rounded-xl text-lg font-medium transition-all duration-200 border",
                        isActive
                          ? "bg-white/10 text-white border-white/10"
                          : "bg-transparent text-gray-400 border-transparent hover:bg-white/5 hover:text-white"
                      )}
                    >
                      {item.label}
                      {isActive && (
                        <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
                      )}
                    </Link>
                  </motion.div>
                );
              })}

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-6 pt-6 border-t border-white/10"
              >
                {eoaAddress ? (
                  <div className="flex flex-col gap-4">
                    <div className="text-sm text-gray-400 font-medium px-2">Connected Wallet</div>
                    <WalletInfo onDisconnect={handleDisconnect} mode="inline" />
                  </div>
                ) : (
                  <button
                    onClick={connect}
                    className="w-full bg-white text-black font-bold py-4 rounded-xl active:scale-[0.98] transition-transform"
                  >
                    Log In / Sign Up
                  </button>
                )}
              </motion.div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
