"use client";

import React from "react";
import { cn } from "@/utils/classNames";
import { LucideIcon } from "lucide-react";

export interface Tab {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
}

interface TabNavigationProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

/**
 * TabNavigation - Reusable tab navigation component
 * 
 * Provides a consistent tab interface for switching between different views
 * without page navigation. Supports icons, badges, and active state styling.
 * 
 * @param tabs - Array of tab configurations with id, label, optional icon and badge
 * @param activeTab - Currently active tab ID
 * @param onTabChange - Callback when tab is clicked
 * @param className - Optional additional CSS classes
 * 
 * Requirements: 3.3
 * 
 * @example
 * ```tsx
 * const tabs = [
 *   { id: 'overview', label: 'Overview', icon: Info },
 *   { id: 'performance', label: 'Performance', icon: TrendingUp, badge: '5' }
 * ];
 * 
 * <TabNavigation
 *   tabs={tabs}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 * />
 * ```
 */
export default function TabNavigation({
  tabs,
  activeTab,
  onTabChange,
  className,
}: TabNavigationProps) {
  return (
    <div className={cn("border-b border-white/10", className)}>
      <div className="flex overflow-x-auto no-scrollbar gap-3 sm:gap-6 pb-1 -mx-1 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "group relative flex items-center gap-2 pb-3 sm:pb-4 text-sm font-medium transition-all whitespace-nowrap flex-shrink-0",
                isActive ? "text-white" : "text-gray-500 hover:text-gray-300"
              )}
              aria-current={isActive ? "page" : undefined}
              role="tab"
              aria-selected={isActive}
            >
              {Icon && (
                <div
                  className={cn(
                    "p-1.5 sm:p-1.5 rounded-lg transition-colors",
                    isActive
                      ? "bg-white/10 text-indigo-400"
                      : "bg-transparent group-hover:bg-white/5"
                  )}
                >
                  <Icon className="w-4 h-4 sm:w-4 sm:h-4" />
                </div>
              )}
              
              <span className="text-sm sm:text-sm">{tab.label}</span>
              
              {tab.badge && (
                <span
                  className={cn(
                    "px-1.5 py-0.5 text-xs font-semibold rounded-full",
                    isActive
                      ? "bg-indigo-500/20 text-indigo-400"
                      : "bg-white/5 text-gray-400"
                  )}
                >
                  {tab.badge}
                </span>
              )}

              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
