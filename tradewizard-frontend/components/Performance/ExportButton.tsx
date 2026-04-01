"use client";

import React, { useState, useCallback } from "react";
import { Download, Loader2 } from "lucide-react";
import { generatePerformanceCSV } from "@/lib/csv-export";

interface ExportButtonProps {
  marketTitle: string;
  performanceData: PerformanceExportData;
}

/**
 * Data structure for CSV export
 */
export interface PerformanceExportData {
  marketInfo: {
    title: string;
    conditionId: string;
    resolvedOutcome: string;
    resolutionDate: string;
  };
  recommendations: Array<{
    id: string;
    timestamp: string;
    direction: string;
    confidence: string;
    fairProbability: number;
    marketPriceAtRecommendation: number;
    entryZoneMin: number;
    entryZoneMax: number;
    exitPrice?: number;
    wasCorrect: boolean;
    roiRealized: number;
  }>;
  metrics: {
    accuracy: {
      total: number;
      correct: number;
      percentage: number;
    };
    roi: {
      total: number;
      average: number;
      best: number;
      worst: number;
    };
    risk?: {
      sharpeRatio: number | null;
      maxDrawdown: number;
      volatility: number;
    };
  };
}

/**
 * ExportButton Component
 * 
 * Provides CSV export functionality for performance data.
 * Generates a comprehensive CSV file with all performance metrics,
 * recommendations, prices, and calculated metrics.
 * 
 * Requirements: 13.1, 13.2, 13.3, 13.4, 13.5
 * 
 * @example
 * ```tsx
 * <ExportButton
 *   marketTitle="Will Trump win 2024?"
 *   performanceData={performanceData}
 * />
 * ```
 */
export default function ExportButton({ marketTitle, performanceData }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize export handler to avoid re-creating on every render
  const handleExport = useCallback(async () => {
    try {
      setIsExporting(true);
      setError(null);

      // Generate CSV content
      const csv = await generatePerformanceCSV(performanceData);

      // Create filename with market title and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, -5);
      const sanitizedTitle = marketTitle
        .replace(/[^a-z0-9]/gi, "-")
        .replace(/-+/g, "-")
        .toLowerCase()
        .slice(0, 50); // Limit filename length
      const filename = `${sanitizedTitle}-performance-${timestamp}.csv`;

      // Trigger browser download
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);

      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }, [marketTitle, performanceData]);

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleExport}
        disabled={isExporting}
        className="flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-all duration-300 shadow-lg hover:shadow-indigo-500/50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#0A0A0B]"
        aria-label={isExporting ? "Exporting performance data to CSV file" : "Export performance data to CSV file"}
        aria-busy={isExporting}
      >
        {isExporting ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Exporting...</span>
          </>
        ) : (
          <>
            <Download className="w-5 h-5" />
            <span>Export to CSV</span>
          </>
        )}
      </button>

      {error && (
        <div className="text-sm text-red-400 text-center" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
