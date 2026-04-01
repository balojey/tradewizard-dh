/**
 * Agent Context Formatter Utility
 * 
 * Formats market data, news, and agent signals for LLM consumption with human-readable timestamps.
 * This module provides the formatting layer at the boundary between LangGraph state and agent prompts.
 * 
 * Feature Flag Support:
 * - When ENABLE_HUMAN_READABLE_TIMESTAMPS=true: Timestamps are formatted as human-readable strings
 * - When ENABLE_HUMAN_READABLE_TIMESTAMPS=false: Timestamps are returned in ISO 8601 format
 * - The feature flag is checked in timestamp-formatter module, no additional logic needed here
 */

import type {
  MarketBriefingDocument,
  AgentSignal,
} from '../models/types.js';
import type { GraphStateType } from '../models/state.js';
import { formatTimestamp, getConfig } from './timestamp-formatter.js';

/**
 * Check if human-readable timestamp formatting is enabled
 * 
 * Queries the global configuration to determine if timestamp formatting is active.
 * Useful for conditional logic or debugging.
 * 
 * @returns true if formatting is enabled, false otherwise
 * 
 * @example
 * if (isTimestampFormattingEnabled()) {
 *   console.log('Using human-readable timestamps');
 * } else {
 *   console.log('Using ISO 8601 timestamps');
 * }
 */
export function isTimestampFormattingEnabled(): boolean {
  return getConfig().enabled;
}

/**
 * Extract comprehensive web research document from agent signals
 * 
 * Searches through agent signals for the web_research agent's signal
 * and extracts the researchSummary from its metadata.
 * 
 * @param agentSignals - Array of agent signals from state
 * @returns Comprehensive research document string, or null if not available
 * 
 * @example
 * const signals = [{
 *   agentName: 'web_research',
 *   metadata: {
 *     researchSummary: 'Comprehensive research document...'
 *   }
 * }];
 * 
 * const research = extractWebResearchContext(signals);
 * // Returns: 'Comprehensive research document...'
 */
export function extractWebResearchContext(
  agentSignals: Readonly<AgentSignal[]> | undefined
): string | null {
  if (!agentSignals || agentSignals.length === 0) {
    return null;
  }
  
  // Find web research signal
  const webResearchSignal = agentSignals.find(
    signal => signal.agentName === 'web_research'
  );
  
  if (!webResearchSignal || !webResearchSignal.metadata) {
    return null;
  }
  
  // Extract research_summary from metadata
  const researchSummary = webResearchSignal.metadata.researchSummary;
  
  // Validate that it's a substantial string
  if (
    typeof researchSummary === 'string' &&
    researchSummary.length > 50
  ) {
    return researchSummary;
  }
  
  return null;
}

/**
 * Format Market Briefing Document for agent consumption
 * Converts all timestamps to human-readable format
 * 
 * This function transforms the Market Briefing Document (MBD) into a formatted
 * string suitable for LLM agent prompts. All timestamps are converted to
 * human-readable format while the original state remains unchanged.
 * 
 * Formatted sections include:
 * - Market overview (question, IDs, event type)
 * - Market expiry (human-readable timestamp)
 * - Resolution criteria
 * - Market metrics (probability, liquidity, spread, volatility, volume)
 * - Event context (if available)
 * - Keywords
 * - Key catalysts (with human-readable timestamps)
 * - Ambiguity flags
 * - Key insights
 * - Primary risk factors
 * - Top opportunities
 * - Market position
 * - Web research context (if available) - CRITICAL for comprehensive external context
 * 
 * @param mbd - Market Briefing Document from state (readonly)
 * @param webResearchContext - Optional comprehensive web research document
 * @returns Formatted string for LLM prompt with human-readable timestamps
 * 
 * @example
 * const mbd = {
 *   question: "Will Biden win the 2024 election?",
 *   marketId: "0x123...",
 *   conditionId: "0xabc...",
 *   expiryTimestamp: 1705330200000,
 *   currentProbability: 0.65,
 *   // ... other fields
 * };
 * 
 * const webResearch = "Comprehensive research document...";
 * const formatted = formatMarketBriefingForAgent(mbd, webResearch);
 * // Returns multi-line string:
 * // === MARKET OVERVIEW ===
 * // Question: Will Biden win the 2024 election?
 * // Market ID: 0x123...
 * // ...
 * // Market Expires: January 20, 2025 at 11:59 PM EST
 * // ...
 * // === WEB RESEARCH CONTEXT ===
 * // Comprehensive research document...
 */
export function formatMarketBriefingForAgent(
  mbd: Readonly<MarketBriefingDocument>,
  webResearchContext?: string | null
): string {
  const lines: string[] = [];
  
  // Core Market Data
  lines.push('=== MARKET OVERVIEW ===');
  lines.push(`Question: ${mbd.question}`);
  lines.push(`Market ID: ${mbd.marketId}`);
  lines.push(`Condition ID: ${mbd.conditionId}`);
  lines.push(`Event Type: ${mbd.eventType}`);
  lines.push('');
  
  // Market Expiry with human-readable timestamp
  const expiryFormatted = formatTimestamp(mbd.expiryTimestamp);
  lines.push(`Market Expires: ${expiryFormatted.formatted}`);
  lines.push('');
  
  // Resolution Criteria
  lines.push('=== RESOLUTION CRITERIA ===');
  lines.push(mbd.resolutionCriteria);
  lines.push('');
  
  // Market Metrics
  lines.push('=== MARKET METRICS ===');
  lines.push(`Current Probability: ${(mbd.currentProbability * 100).toFixed(1)}%`);
  lines.push(`Liquidity Score: ${mbd.liquidityScore.toFixed(1)}/10`);
  lines.push(`Bid-Ask Spread: ${mbd.bidAskSpread.toFixed(2)} cents`);
  lines.push(`Volatility Regime: ${mbd.volatilityRegime}`);
  lines.push(`24h Volume: $${mbd.volume24h.toLocaleString()}`);
  lines.push('');
  
  // Event Context (if available)
  if (mbd.eventContext) {
    lines.push('=== EVENT CONTEXT ===');
    lines.push(`Event: ${mbd.eventContext.eventTitle}`);
    lines.push(`Event ID: ${mbd.eventContext.eventId}`);
    lines.push(`Description: ${mbd.eventContext.eventDescription}`);
    lines.push(`Total Markets in Event: ${mbd.eventContext.totalMarkets}`);
    lines.push(`This Market's Rank: #${mbd.eventContext.marketRank} by volume`);
    lines.push(`Related Markets: ${mbd.eventContext.relatedMarketCount}`);
    lines.push(`Event Total Volume: $${mbd.eventContext.totalVolume.toLocaleString()}`);
    lines.push(`Event Total Liquidity: $${mbd.eventContext.totalLiquidity.toLocaleString()}`);
    lines.push('');
  }
  
  // Keywords (if available)
  if (mbd.keywords && mbd.keywords.length > 0) {
    lines.push('=== KEYWORDS ===');
    lines.push(mbd.keywords.join(', '));
    lines.push('');
  }
  
  // Key Catalysts with human-readable timestamps
  if (mbd.metadata.keyCatalysts && mbd.metadata.keyCatalysts.length > 0) {
    lines.push('=== KEY CATALYSTS ===');
    mbd.metadata.keyCatalysts.forEach((catalyst, index) => {
      const catalystTime = formatTimestamp(catalyst.timestamp);
      lines.push(`${index + 1}. ${catalyst.event} (${catalystTime.formatted})`);
    });
    lines.push('');
  }
  
  // Ambiguity Flags
  if (mbd.metadata.ambiguityFlags && mbd.metadata.ambiguityFlags.length > 0) {
    lines.push('=== AMBIGUITY FLAGS ===');
    mbd.metadata.ambiguityFlags.forEach((flag, index) => {
      lines.push(`${index + 1}. ${flag}`);
    });
    lines.push('');
  }
  
  // Key Insights (if available)
  if (mbd.metadata.keyInsights && mbd.metadata.keyInsights.length > 0) {
    lines.push('=== KEY INSIGHTS ===');
    mbd.metadata.keyInsights.forEach((insight, index) => {
      lines.push(`${index + 1}. ${insight}`);
    });
    lines.push('');
  }
  
  // Primary Risk Factors (if available)
  if (mbd.metadata.primaryRiskFactors && mbd.metadata.primaryRiskFactors.length > 0) {
    lines.push('=== PRIMARY RISK FACTORS ===');
    mbd.metadata.primaryRiskFactors.forEach((risk, index) => {
      lines.push(`${index + 1}. ${risk}`);
    });
    lines.push('');
  }
  
  // Top Opportunities (if available)
  if (mbd.metadata.topOpportunities && mbd.metadata.topOpportunities.length > 0) {
    lines.push('=== TOP OPPORTUNITIES ===');
    mbd.metadata.topOpportunities.forEach((opportunity, index) => {
      lines.push(`${index + 1}. ${opportunity}`);
    });
    lines.push('');
  }
  
  // Market Position (if available)
  if (mbd.metadata.marketPosition) {
    lines.push('=== MARKET POSITION ===');
    lines.push(`Volume Rank: #${mbd.metadata.marketPosition.volumeRank}`);
    lines.push(`Liquidity Rank: #${mbd.metadata.marketPosition.liquidityRank}`);
    lines.push(`Competitive Score: ${mbd.metadata.marketPosition.competitiveScore.toFixed(2)}`);
    lines.push(`Dominant Market: ${mbd.metadata.marketPosition.isDominantMarket ? 'Yes' : 'No'}`);
    lines.push('');
  }
  
  // Web Research Context (CRITICAL: Provides comprehensive external research)
  if (webResearchContext) {
    lines.push('=== WEB RESEARCH CONTEXT ===');
    lines.push('');
    lines.push('The following comprehensive research document was gathered from web sources to provide');
    lines.push('detailed background, current status, and recent developments related to this market:');
    lines.push('');
    lines.push('---');
    lines.push(webResearchContext);
    lines.push('---');
    lines.push('');
    lines.push('**IMPORTANT**: Use this web research context to inform your analysis. It contains');
    lines.push('factual information from authoritative sources that should guide your assessment.');
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Format external data (news, polling, social) for agent consumption
 * Converts all timestamps to human-readable format
 * 
 * This function formats external data sources (news articles, polling data,
 * social media sentiment) into a human-readable string for LLM agents.
 * All timestamps are converted to natural language format.
 * 
 * Formatted sections include:
 * - News articles (title, source, published time, sentiment, relevance, summary, URL)
 * - Polling data (aggregated probability, momentum, bias adjustment, individual polls)
 * - Social media sentiment (overall sentiment, narrative velocity, platform breakdown)
 * - Data freshness (last update times for each source)
 * 
 * @param externalData - External data from state (readonly)
 * @returns Formatted string for LLM prompt, or empty string if no data
 * 
 * @example
 * const externalData = {
 *   news: [{
 *     title: "Biden announces new policy",
 *     source: "CNN",
 *     publishedAt: 1705330200000,
 *     sentiment: "positive",
 *     relevanceScore: 0.85,
 *     summary: "President Biden announced...",
 *     url: "https://..."
 *   }],
 *   polling: {
 *     aggregatedProbability: 0.52,
 *     momentum: "stable",
 *     biasAdjustment: 0.02,
 *     polls: [...]
 *   },
 *   dataFreshness: {
 *     news: 1705330200000,
 *     polling: 1705330100000
 *   }
 * };
 * 
 * const formatted = formatExternalDataForAgent(externalData);
 * // Returns multi-line string:
 * // === NEWS ARTICLES ===
 * // 1. Biden announces new policy
 * //    Source: CNN
 * //    Published: 2 hours ago
 * //    Sentiment: positive
 * //    Relevance: 85%
 * //    Summary: President Biden announced...
 * //    URL: https://...
 * // ...
 */
export function formatExternalDataForAgent(
  externalData: Readonly<GraphStateType['externalData']>
): string {
  if (!externalData) {
    return '';
  }
  
  const lines: string[] = [];
  
  // News Articles
  if (externalData.news && externalData.news.length > 0) {
    lines.push('=== NEWS ARTICLES ===');
    externalData.news.forEach((article, index) => {
      const publishedTime = formatTimestamp(article.publishedAt);
      lines.push(`${index + 1}. ${article.title}`);
      lines.push(`   Source: ${article.source}`);
      lines.push(`   Published: ${publishedTime.formatted}`);
      lines.push(`   Sentiment: ${article.sentiment}`);
      lines.push(`   Relevance: ${(article.relevanceScore * 100).toFixed(0)}%`);
      lines.push(`   Summary: ${article.summary}`);
      lines.push(`   URL: ${article.url}`);
      lines.push('');
    });
  }
  
  // Polling Data
  if (externalData.polling) {
    lines.push('=== POLLING DATA ===');
    lines.push(`Aggregated Probability: ${(externalData.polling.aggregatedProbability * 100).toFixed(1)}%`);
    lines.push(`Momentum: ${externalData.polling.momentum}`);
    lines.push(`Bias Adjustment: ${externalData.polling.biasAdjustment.toFixed(2)}`);
    lines.push('');
    
    if (externalData.polling.polls && externalData.polling.polls.length > 0) {
      lines.push('Recent Polls:');
      externalData.polling.polls.forEach((poll, index) => {
        const pollDate = formatTimestamp(poll.date);
        lines.push(`${index + 1}. ${poll.pollster} (${pollDate.formatted})`);
        lines.push(`   Sample Size: ${poll.sampleSize.toLocaleString()}`);
        lines.push(`   Yes: ${poll.yesPercentage.toFixed(1)}%, No: ${poll.noPercentage.toFixed(1)}%`);
        lines.push(`   Margin of Error: ±${poll.marginOfError.toFixed(1)}%`);
        lines.push(`   Methodology: ${poll.methodology}`);
        lines.push('');
      });
    }
  }
  
  // Social Media Data
  if (externalData.social) {
    lines.push('=== SOCIAL MEDIA SENTIMENT ===');
    lines.push(`Overall Sentiment: ${externalData.social.overallSentiment.toFixed(2)}`);
    lines.push(`Narrative Velocity: ${externalData.social.narrativeVelocity.toFixed(2)}`);
    lines.push('');
    
    if (externalData.social.platforms) {
      lines.push('Platform Breakdown:');
      Object.entries(externalData.social.platforms).forEach(([platform, data]) => {
        lines.push(`${platform}:`);
        lines.push(`  Volume: ${data.volume.toLocaleString()}`);
        lines.push(`  Sentiment: ${data.sentiment.toFixed(2)}`);
        lines.push(`  Viral Score: ${data.viralScore.toFixed(2)}`);
        lines.push(`  Top Keywords: ${data.topKeywords.join(', ')}`);
        lines.push('');
      });
    }
  }
  
  // Data Freshness
  if (externalData.dataFreshness && Object.keys(externalData.dataFreshness).length > 0) {
    lines.push('=== DATA FRESHNESS ===');
    Object.entries(externalData.dataFreshness).forEach(([source, timestamp]) => {
      const freshnessTime = formatTimestamp(timestamp);
      lines.push(`${source}: ${freshnessTime.formatted}`);
    });
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Format agent signals for agent consumption (for memory context)
 * Converts all timestamps to human-readable format
 * 
 * This function formats historical agent signals into a human-readable string
 * for LLM agents. Useful for providing memory context about previous analysis.
 * All timestamps are converted to natural language format.
 * 
 * Formatted information includes:
 * - Agent name
 * - Signal timestamp (human-readable)
 * - Direction (bullish/bearish)
 * - Confidence level
 * - Fair probability estimate
 * - Key drivers
 * - Risk factors
 * 
 * @param signals - Array of agent signals (readonly)
 * @returns Formatted string for LLM prompt, or empty string if no signals
 * 
 * @example
 * const signals = [{
 *   agentName: "NewsAgent",
 *   timestamp: 1705330200000,
 *   direction: "bullish",
 *   confidence: 0.75,
 *   fairProbability: 0.68,
 *   keyDrivers: ["Positive polling", "Strong fundraising"],
 *   riskFactors: ["Economic uncertainty"]
 * }];
 * 
 * const formatted = formatAgentSignalsForAgent(signals);
 * // Returns multi-line string:
 * // === HISTORICAL AGENT SIGNALS ===
 * // 1. NewsAgent (2 hours ago)
 * //    Direction: bullish
 * //    Confidence: 75.0%
 * //    Fair Probability: 68.0%
 * //    Key Drivers: Positive polling, Strong fundraising
 * //    Risk Factors: Economic uncertainty
 */
export function formatAgentSignalsForAgent(
  signals: Readonly<AgentSignal[]>
): string {
  if (!signals || signals.length === 0) {
    return '';
  }
  
  const lines: string[] = [];
  lines.push('=== HISTORICAL AGENT SIGNALS ===');
  
  signals.forEach((signal, index) => {
    const signalTime = formatTimestamp(signal.timestamp);
    lines.push(`${index + 1}. ${signal.agentName} (${signalTime.formatted})`);
    lines.push(`   Direction: ${signal.direction}`);
    lines.push(`   Confidence: ${(signal.confidence * 100).toFixed(1)}%`);
    lines.push(`   Fair Probability: ${(signal.fairProbability * 100).toFixed(1)}%`);
    
    if (signal.keyDrivers && signal.keyDrivers.length > 0) {
      lines.push(`   Key Drivers: ${signal.keyDrivers.join(', ')}`);
    }
    
    if (signal.riskFactors && signal.riskFactors.length > 0) {
      lines.push(`   Risk Factors: ${signal.riskFactors.join(', ')}`);
    }
    
    lines.push('');
  });
  
  return lines.join('\n');
}

/**
 * Format complete market context for agent
 * Combines MBD, external data, and memory context with human-readable timestamps
 * 
 * This is the main integration function that combines all context sources into
 * a single formatted string for LLM agent prompts. It includes:
 * - Market Briefing Document (with human-readable timestamps)
 * - External data (news, polling, social media)
 * - Agent's own historical signals (memory context)
 * - Other agents' signals
 * 
 * All timestamps are converted to human-readable format. The original state
 * remains unchanged (immutable).
 * 
 * @param state - LangGraph state (readonly)
 * @param agentName - Name of the agent receiving the context
 * @returns Formatted context string for LLM prompt with all relevant data
 * 
 * @example
 * const state = {
 *   mbd: { ... }, // Market Briefing Document
 *   externalData: { ... }, // News, polling, social
 *   memoryContext: new Map([
 *     ['NewsAgent', {
 *       historicalSignals: [...]
 *     }]
 *   ]),
 *   agentSignals: [...]
 * };
 * 
 * const context = formatMarketContextForAgent(state, 'NewsAgent');
 * // Returns comprehensive formatted string:
 * // === MARKET OVERVIEW ===
 * // Question: Will Biden win the 2024 election?
 * // ...
 * // Market Expires: January 20, 2025 at 11:59 PM EST
 * // ...
 * // === NEWS ARTICLES ===
 * // 1. Biden announces new policy
 * //    Published: 2 hours ago
 * // ...
 * // === YOUR PREVIOUS ANALYSIS ===
 * // You have analyzed this market 3 time(s) before.
 * // ...
 * // === OTHER AGENT SIGNALS ===
 * // 1. PollingAgent (1 day ago)
 * // ...
 * 
 * @example
 * // Use in agent node
 * import { formatMarketContextForAgent } from '../utils/agent-context-formatter.js';
 * 
 * const marketContext = formatMarketContextForAgent(state, 'NewsAgent');
 * const messages = [
 *   { role: 'system', content: systemPrompt },
 *   { role: 'user', content: `Analyze this market:\n\n${marketContext}` }
 * ];
 */
export function formatMarketContextForAgent(
  state: Readonly<GraphStateType>,
  agentName: string
): string {
  const sections: string[] = [];
  
  // Extract web research context (CRITICAL: Provides comprehensive external research)
  const webResearchContext = extractWebResearchContext(state.agentSignals);
  if (webResearchContext) {
    console.log(`[${agentName}] Including web research context (${webResearchContext.length} chars)`);
  }
  
  // Market Briefing Document with web research context
  if (state.mbd) {
    sections.push(formatMarketBriefingForAgent(state.mbd, webResearchContext));
  }
  
  // External Data
  if (state.externalData) {
    const externalDataFormatted = formatExternalDataForAgent(state.externalData);
    if (externalDataFormatted) {
      sections.push(externalDataFormatted);
    }
  }
  
  // Memory Context (historical signals for this agent)
  if (state.memoryContext) {
    const agentMemory = state.memoryContext.get(agentName);
    if (agentMemory && agentMemory.historicalSignals && agentMemory.historicalSignals.length > 0) {
      sections.push('=== YOUR PREVIOUS ANALYSIS ===');
      sections.push(`You have analyzed this market ${agentMemory.historicalSignals.length} time(s) before.`);
      sections.push('');
      
      // Convert HistoricalSignal to AgentSignal format for formatting
      const agentSignals = agentMemory.historicalSignals.map(signal => ({
        agentName: signal.agentName,
        timestamp: signal.timestamp.getTime(),
        confidence: signal.confidence,
        direction: signal.direction,
        fairProbability: signal.fairProbability,
        keyDrivers: signal.keyDrivers,
        riskFactors: [], // HistoricalSignal doesn't have riskFactors
        metadata: signal.metadata,
      }));
      
      sections.push(formatAgentSignalsForAgent(agentSignals));
    }
  }
  
  // Other Agent Signals (if available)
  if (state.agentSignals && state.agentSignals.length > 0) {
    const otherSignals = state.agentSignals.filter(s => s.agentName !== agentName);
    if (otherSignals.length > 0) {
      sections.push('=== OTHER AGENT SIGNALS ===');
      sections.push(formatAgentSignalsForAgent(otherSignals));
    }
  }
  
  return sections.join('\n\n');
}
