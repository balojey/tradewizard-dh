/**
 * CSV Export Utilities
 * 
 * This module provides CSV generation functionality for performance data export.
 * Uses dynamic import for papaparse to reduce bundle size.
 * 
 * @module csv-export
 */

import type { PerformanceExportData } from "@/components/Performance/ExportButton";

/**
 * Generate CSV content from performance data
 * 
 * Creates a comprehensive CSV file containing:
 * - Market information
 * - All recommendations with timestamps and metrics
 * - Calculated performance metrics
 * 
 * Requirements: 13.2, 13.3
 * 
 * @param data - Performance data to export
 * @returns CSV string ready for download
 * 
 * @example
 * ```typescript
 * const csv = await generatePerformanceCSV(performanceData);
 * // Download or save the CSV string
 * ```
 */
export async function generatePerformanceCSV(data: PerformanceExportData): Promise<string> {
  // Dynamic import to reduce bundle size
  const Papa = await import("papaparse");

  // Build CSV sections
  const sections: string[] = [];

  // Section 1: Market Information
  sections.push("# Market Information");
  sections.push(Papa.unparse([
    {
      "Market Title": data.marketInfo.title,
      "Condition ID": data.marketInfo.conditionId,
      "Resolved Outcome": data.marketInfo.resolvedOutcome,
      "Resolution Date": data.marketInfo.resolutionDate,
    },
  ]));
  sections.push(""); // Empty line

  // Section 2: Performance Summary
  sections.push("# Performance Summary");
  sections.push(Papa.unparse([
    {
      "Total Recommendations": data.metrics.accuracy.total,
      "Correct Predictions": data.metrics.accuracy.correct,
      "Accuracy (%)": data.metrics.accuracy.percentage.toFixed(2),
      "Total ROI (%)": data.metrics.roi.total.toFixed(2),
      "Average ROI (%)": data.metrics.roi.average.toFixed(2),
      "Best ROI (%)": data.metrics.roi.best.toFixed(2),
      "Worst ROI (%)": data.metrics.roi.worst.toFixed(2),
    },
  ]));
  sections.push(""); // Empty line

  // Section 3: Risk Metrics (if available)
  if (data.metrics.risk) {
    sections.push("# Risk Metrics");
    sections.push(Papa.unparse([
      {
        "Sharpe Ratio": data.metrics.risk.sharpeRatio !== null 
          ? data.metrics.risk.sharpeRatio.toFixed(3) 
          : "N/A",
        "Max Drawdown (%)": data.metrics.risk.maxDrawdown.toFixed(2),
        "Volatility (%)": data.metrics.risk.volatility.toFixed(2),
      },
    ]));
    sections.push(""); // Empty line
  }

  // Section 4: Detailed Recommendations
  sections.push("# Recommendations");
  const recommendationRows = data.recommendations.map((rec) => ({
    "Recommendation ID": rec.id,
    "Timestamp": rec.timestamp,
    "Direction": rec.direction,
    "Confidence": rec.confidence,
    "Fair Probability": rec.fairProbability.toFixed(4),
    "Market Price at Recommendation": rec.marketPriceAtRecommendation.toFixed(4),
    "Entry Zone Min": rec.entryZoneMin.toFixed(4),
    "Entry Zone Max": rec.entryZoneMax.toFixed(4),
    "Exit Price": rec.exitPrice !== undefined ? rec.exitPrice.toFixed(4) : "N/A",
    "Was Correct": rec.wasCorrect ? "Yes" : "No",
    "ROI Realized (%)": rec.roiRealized.toFixed(2),
  }));
  sections.push(Papa.unparse(recommendationRows));
  sections.push(""); // Empty line

  // Section 5: Export Metadata
  sections.push("# Export Information");
  sections.push(Papa.unparse([
    {
      "Export Date": new Date().toISOString(),
      "Export Source": "TradeWizard Performance Viewer",
    },
  ]));

  // Combine all sections
  return sections.join("\n");
}

/**
 * Sanitize filename for safe file system usage
 * 
 * Removes special characters and limits length to prevent issues
 * with different operating systems.
 * 
 * @param filename - Original filename
 * @param maxLength - Maximum length (default: 50)
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string, maxLength: number = 50): string {
  return filename
    .replace(/[^a-z0-9]/gi, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, maxLength);
}

/**
 * Format timestamp for filename
 * 
 * Converts ISO timestamp to filesystem-safe format
 * 
 * @param date - Date object or ISO string
 * @returns Formatted timestamp string
 */
export function formatTimestampForFilename(date: Date | string = new Date()): string {
  const dateObj = typeof date === "string" ? new Date(date) : date;
  return dateObj.toISOString().replace(/[:.]/g, "-").slice(0, -5);
}
