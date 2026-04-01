"use client";

import React from "react";
import { Filter, Calendar, Tag, Target, SlidersHorizontal } from "lucide-react";
import { cn } from "@/utils/classNames";

interface PerformanceFilters {
  timeframe: "all" | "30d" | "90d" | "1y";
  category: string;
  confidence: "all" | "high" | "moderate" | "low";
  limit: number;
}

interface PerformanceFiltersProps {
  filters: PerformanceFilters;
  onFiltersChange: (filters: PerformanceFilters) => void;
  availableCategories: string[];
}

export default function PerformanceFilters({
  filters,
  onFiltersChange,
  availableCategories,
}: PerformanceFiltersProps) {
  const timeframeOptions = [
    { value: "all", label: "All Time" },
    { value: "30d", label: "Last 30 Days" },
    { value: "90d", label: "Last 90 Days" },
    { value: "1y", label: "Last Year" },
  ];

  const confidenceOptions = [
    { value: "all", label: "All Confidence" },
    { value: "high", label: "High Only" },
    { value: "moderate", label: "Moderate Only" },
    { value: "low", label: "Low Only" },
  ];

  const limitOptions = [
    { value: 25, label: "25 Items" },
    { value: 50, label: "50 Items" },
    { value: 100, label: "100 Items" },
    { value: 200, label: "200 Items" },
  ];

  const handleFilterChange = (key: keyof PerformanceFilters, value: string | number) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    });
  };

  return (
    <div className="p-4 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
          <SlidersHorizontal className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Filter Analysis</h3>
          <p className="text-xs text-gray-400">Refine the performance data view</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Timeframe Filter */}
        <FilterSelect
          icon={Calendar}
          label="Time Period"
          value={filters.timeframe}
          options={timeframeOptions}
          onChange={(val: string) => handleFilterChange("timeframe", val as PerformanceFilters["timeframe"])}
        />

        {/* Category Filter */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 ml-1">
            <Tag className="w-3 h-3" />
            Category
          </label>
          <div className="relative group">
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange("category", e.target.value)}
              className="w-full appearance-none px-4 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-black/60 hover:border-white/20 transition-all cursor-pointer"
            >
              <option value="all" className="bg-gray-900 text-gray-300">All Categories</option>
              {availableCategories.map((category) => (
                <option key={category} value={category} className="bg-gray-900 text-gray-300">
                  {category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 group-hover:text-gray-300 transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
            </div>
          </div>
        </div>

        {/* Confidence Filter */}
        <FilterSelect
          icon={Target}
          label="Confidence"
          value={filters.confidence}
          options={confidenceOptions}
          onChange={(val: string) => handleFilterChange("confidence", val as PerformanceFilters["confidence"])}
        />

        {/* Limit Filter */}
        <FilterSelect
          icon={Filter}
          label="Display Limit"
          value={filters.limit}
          options={limitOptions}
          onChange={(val: string) => handleFilterChange("limit", parseInt(val))}
        />
      </div>

      {/* Active Filters Summary - Only show if functionality is needed, stylistically subtle */}
      <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap gap-2">
        {filters.timeframe !== "all" && <FilterBadge label={timeframeOptions.find(o => o.value === filters.timeframe)?.label} onClear={() => handleFilterChange("timeframe", "all")} />}
        {filters.category !== "all" && <FilterBadge label={filters.category.replace(/_/g, " ")} onClear={() => handleFilterChange("category", "all")} />}
        {filters.confidence !== "all" && <FilterBadge label={confidenceOptions.find(o => o.value === filters.confidence)?.label} onClear={() => handleFilterChange("confidence", "all")} />}
      </div>
    </div>
  );
}

interface FilterSelectProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string }>;
  onChange: (value: string) => void;
}

function FilterSelect({ icon: Icon, label, value, options, onChange }: FilterSelectProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 ml-1">
        <Icon className="w-3 h-3" />
        {label}
      </label>
      <div className="relative group">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-4 py-2.5 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 hover:bg-black/60 hover:border-white/20 transition-all cursor-pointer"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-gray-900 text-gray-300">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 group-hover:text-gray-300 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </div>
      </div>
    </div>
  )
}

function FilterBadge({ label, onClear }: { label?: string, onClear: () => void }) {
  if (!label) return null;
  return (
    <button
      onClick={onClear}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-medium hover:bg-indigo-500/30 transition-colors"
    >
      {label}
      <div className="hover:text-white"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg></div>
    </button>
  );
}