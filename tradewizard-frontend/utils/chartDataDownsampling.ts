/**
 * Chart Data Downsampling Utility
 * 
 * Provides efficient downsampling of large datasets for chart rendering performance.
 * Limits data points to a maximum threshold while preserving data distribution.
 */

export interface DataPoint {
  timestamp: number;
  [key: string]: any;
}

/**
 * Downsamples an array of data points to a maximum number of points.
 * Uses uniform sampling by taking every nth point.
 * 
 * @param data - Array of data points with timestamp property
 * @param maxPoints - Maximum number of points to return (default: 200)
 * @returns Downsampled array of data points
 * 
 * @example
 * ```typescript
 * const priceData = [...]; // 1000 points
 * const downsampled = downsampleData(priceData, 200); // Returns ~200 points
 * ```
 */
export function downsampleData<T extends DataPoint>(
  data: T[],
  maxPoints: number = 200
): T[] {
  // Return original data if already within limit
  if (data.length <= maxPoints) {
    return data;
  }

  // Calculate step size for uniform sampling
  const step = Math.ceil(data.length / maxPoints);
  
  // Sample every nth point
  return data.filter((_, index) => index % step === 0);
}

/**
 * Downsamples price history data specifically for chart rendering.
 * Transforms raw price points into chart-ready format with downsampling applied.
 * 
 * @param priceHistory - Array of price history points
 * @param maxPoints - Maximum number of points to return (default: 200)
 * @returns Downsampled array of chart data points
 */
export function downsamplePriceData(
  priceHistory: Array<{ timestamp: string; price: number }>,
  maxPoints: number = 200
): Array<{ timestamp: number; price: number; formattedDate: string }> {
  if (!priceHistory || priceHistory.length === 0) {
    return [];
  }

  // Transform to chart format
  const chartData = priceHistory.map((point) => ({
    timestamp: new Date(point.timestamp).getTime(),
    price: point.price,
    formattedDate: new Date(point.timestamp).toLocaleDateString(),
  }));

  // Apply downsampling
  return downsampleData(chartData, maxPoints);
}

/**
 * Get optimal max points for chart rendering based on device type.
 * Mobile devices get fewer points for better performance.
 * 
 * @param isMobile - Whether the device is mobile
 * @returns Optimal max points for the device
 */
export function getOptimalMaxPoints(isMobile: boolean): number {
  return isMobile ? 100 : 200;
}
