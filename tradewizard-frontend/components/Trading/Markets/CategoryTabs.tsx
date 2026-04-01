"use client";

import { useRef, useState, useEffect } from "react";
import { type CategoryId, type Category } from "@/constants/categories";
import { cn } from "@/utils/classNames";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

interface CategoryTabsProps {
  categories: Category[];
  activeCategory: CategoryId;
  onCategoryChange: (categoryId: CategoryId) => void;
}

export default function CategoryTabs({
  categories,
  activeCategory,
  onCategoryChange,
}: CategoryTabsProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showRightFade, setShowRightFade] = useState(true);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowRightFade(scrollLeft + clientWidth < scrollWidth - 10);
    }
  };

  const handleScrollRight = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: 200, behavior: "smooth" });
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [categories]);

  return (
    <div className="relative flex-1 min-w-0 group">
      <div
        ref={scrollContainerRef}
        onScroll={checkScroll}
        className="overflow-x-auto flex items-center gap-2 sm:gap-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] pb-1"
      >
        {categories.map((category) => {
          const isActive = activeCategory === category.id;
          return (
            <button
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              className={cn(
                "relative transition-colors duration-200 rounded-full whitespace-nowrap outline-none select-none flex-shrink-0",
                // Responsive padding and text sizing - increased for better mobile readability
                "px-4 py-2 sm:px-4 sm:py-2 text-sm sm:text-sm font-medium",
                // Touch-friendly minimum size on mobile
                "min-h-[40px] sm:min-h-[auto]",
                isActive ? "text-white" : "text-gray-400 hover:text-gray-200"
              )}
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {isActive && (
                <motion.div
                  layoutId="activeCategoryTab"
                  className="absolute inset-0 bg-white/10 rounded-full"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{category.label}</span>
            </button>
          );
        })}
        {/* Spacer to prevent cut-off on the right */}
        <div className="w-8 sm:w-8 shrink-0" />
      </div>

      {/* Right Fade & Chevron Indicator - Responsive */}
      {showRightFade && (
        <div className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 bg-gradient-to-l from-[#0A0A0B] via-[#0A0A0B]/80 to-transparent pointer-events-none flex items-center justify-end pr-0">
          <button
            onClick={handleScrollRight}
            className="bg-white/5 border border-white/5 rounded-full shadow-lg backdrop-blur-md pointer-events-auto hidden sm:flex items-center justify-center hover:bg-white/10 transition-colors p-1.5 mr-1"
          >
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      )}
    </div>
  );
}
