/**
 * Tools Module - Barrel Export
 *
 * This module exports all tool-related functionality for autonomous agents.
 * It provides a centralized entry point for importing tools, types, and utilities.
 *
 * Requirements: 1.1
 */

// ============================================================================
// Polling Tools Exports
// ============================================================================

// Export main tool creation function
export { createPollingTools } from './polling-tools.js';

// Export tool context and audit types
export type {
  ToolContext as PollingToolContext,
  ToolAuditEntry as PollingToolAuditEntry,
  ToolResult as PollingToolResult,
  ToolError as PollingToolError,
} from './polling-tools.js';

// Export tool input schemas
export {
  FetchRelatedMarketsInputSchema,
  FetchHistoricalPricesInputSchema,
  FetchCrossMarketDataInputSchema,
  AnalyzeMarketMomentumInputSchema,
  DetectSentimentShiftsInputSchema,
} from './polling-tools.js';

// Export tool input types
export type {
  FetchRelatedMarketsInput,
  FetchHistoricalPricesInput,
  FetchCrossMarketDataInput,
  AnalyzeMarketMomentumInput,
  DetectSentimentShiftsInput,
} from './polling-tools.js';

// Export tool output types
export type {
  FetchRelatedMarketsOutput,
  FetchHistoricalPricesOutput,
  FetchCrossMarketDataOutput,
  AnalyzeMarketMomentumOutput,
  DetectSentimentShiftsOutput,
} from './polling-tools.js';

// Export tool utility functions
export {
  executeToolWithWrapper,
  isToolError,
  validateToolInput,
  createToolError,
  logToolCall,
  getToolUsageSummary,
} from './polling-tools.js';

// Export individual tool functions (for testing and direct use)
export {
  fetchRelatedMarkets,
  fetchHistoricalPrices,
  fetchCrossMarketData,
  analyzeMarketMomentum,
  detectSentimentShifts,
} from './polling-tools.js';

// ============================================================================
// NewsData Tools Exports
// ============================================================================

// Export tool context and audit types
export type {
  ToolContext as NewsToolContext,
  ToolAuditEntry as NewsToolAuditEntry,
  ToolResult as NewsToolResult,
  ToolError as NewsToolError,
} from './newsdata-tools.js';

// Export NewsArticle type
export type { NewsArticle } from './newsdata-tools.js';

// Export tool input schemas
export {
  FetchLatestNewsInputSchema,
  FetchArchiveNewsInputSchema,
  FetchCryptoNewsInputSchema,
  FetchMarketNewsInputSchema,
} from './newsdata-tools.js';

// Export tool input types
export type {
  FetchLatestNewsInput,
  FetchArchiveNewsInput,
  FetchCryptoNewsInput,
  FetchMarketNewsInput,
} from './newsdata-tools.js';

// Export tool utility functions
export {
  executeToolWithWrapper as executeNewsToolWithWrapper,
  isToolError as isNewsToolError,
  validateToolInput as validateNewsToolInput,
  createToolError as createNewsToolError,
  logToolCall as logNewsToolCall,
  getToolUsageSummary as getNewsToolUsageSummary,
  transformNewsDataArticle,
  generateCacheKey,
} from './newsdata-tools.js';

// Export individual tool functions (for testing and direct use)
export {
  fetchLatestNews,
  createFetchLatestNewsTool,
  fetchArchiveNews,
  createFetchArchiveNewsTool,
  fetchCryptoNews,
  createFetchCryptoNewsTool,
  fetchMarketNews,
  createFetchMarketNewsTool,
} from './newsdata-tools.js';
