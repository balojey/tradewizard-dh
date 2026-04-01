import React from "react";
import {
  type RecommendationStatus,
  STATUS_BADGE_MAP,
} from "@/utils/performanceHelpers";

interface RecommendationStatusBadgeProps {
  status: RecommendationStatus;
}

/**
 * Renders a colored badge for an active-market recommendation status.
 * Always includes a text label (not color-only) for accessibility.
 * Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 10.3
 */
export default function RecommendationStatusBadge({
  status,
}: RecommendationStatusBadgeProps) {
  const { label, colorClass, bgClass } = STATUS_BADGE_MAP[status];

  return (
    <span
      className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${bgClass} ${colorClass}`}
    >
      {label}
    </span>
  );
}
