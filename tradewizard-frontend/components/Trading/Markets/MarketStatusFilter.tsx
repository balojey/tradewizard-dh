"use client";

import { useState, useRef, useEffect } from "react";
import { SlidersHorizontal, CheckIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/classNames";

export type MarketStatus = "all" | "active" | "closed" | "ending-soon";

interface MarketStatusFilterProps {
  currentStatus: MarketStatus;
  onStatusChange: (status: MarketStatus) => void;
  marketCounts?: {
    all: number;
    active: number;
    closed: number;
    endingSoon: number;
  };
  className?: string;
}

const STATUS_OPTIONS = [
  { value: "all" as const, label: "All Markets", icon: "🏛️" },
  { value: "active" as const, label: "Active", icon: "🟢" },
  { value: "closed" as const, label: "Closed", icon: "🔴" },
  { value: "ending-soon" as const, label: "Ending Soon", icon: "⏰" },
];

export default function MarketStatusFilter({
  currentStatus,
  onStatusChange,
  marketCounts,
  className,
}: MarketStatusFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getCountForStatus = (status: MarketStatus) => {
    if (!marketCounts) return null;
    switch (status) {
      case "all": return marketCounts.all;
      case "active": return marketCounts.active;
      case "closed": return marketCounts.closed;
      case "ending-soon": return marketCounts.endingSoon;
      default: return null;
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 outline-none",
          isOpen
            ? "bg-white text-black"
            : "bg-[#1C1C1E] border border-white/5 hover:bg-[#2C2C2E] text-gray-400 hover:text-white"
        )}
      >
        <SlidersHorizontal className="w-4 h-4" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute right-0 top-full mt-2 w-60 bg-[#1C1C1E]/95 backdrop-blur-xl border border-white/10 
                       rounded-2xl shadow-2xl overflow-hidden z-50 p-2"
          >
            {STATUS_OPTIONS.map((option) => {
              const count = getCountForStatus(option.value);
              const isSelected = option.value === currentStatus;

              return (
                <button
                  key={option.value}
                  onClick={() => {
                    onStatusChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-3 py-2.5 text-sm rounded-xl transition-all duration-200 group",
                    isSelected
                      ? "bg-white/10 text-white"
                      : "text-gray-400 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base leading-none opacity-80">{option.icon}</span>
                    <span className={cn("font-medium", isSelected ? "text-white" : "text-gray-400 group-hover:text-gray-200")}>
                      {option.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {count !== null && (
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded-full transition-colors",
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-white/5 group-hover:bg-white/10 text-gray-500 group-hover:text-gray-400"
                      )}>
                        {count}
                      </span>
                    )}
                    {isSelected && <CheckIcon className="w-3.5 h-3.5 text-white" />}
                  </div>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}