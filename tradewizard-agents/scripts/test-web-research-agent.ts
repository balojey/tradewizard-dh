/**
 * Web Research Agent Test Script
 *
 * Tests the full web research agent node by:
 * 1. Loading config from .env (Serper + LLM keys)
 * 2. Constructing a minimal MBD (Market Briefing Document)
 * 3. Invoking the agent node
 * 4. Inspecting the returned signal, audit log, and errors
 *
 * Usage:
 *   npx tsx scripts/test-web-research-agent.ts
 *
 * Requires in .env:
 *   - SERPER_API_KEY (at least one valid key with credits)
 *   - At least one LLM provider key (GOOGLE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY)
 */

import 'dotenv/config';
import { loadConfig } from '../src/config/index.js';
import { createWebResearchAgentNode } from '../src/nodes/web-research-agent.js';
import type { GraphStateType } from '../src/models/state.js';
import type { MarketBriefingDocument } from '../src/models/types.js';

// ============================================================================
// Helpers
// ============================================================================

function separator(label: string): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}\n`);
}

function printJson(label: string, data: unknown, maxLength = 2000): void {
  const raw = JSON.stringify(data, null, 2);
  const display = raw.length > maxLength
    ? raw.substring(0, maxLength) + `\n... (truncated, ${raw.length} chars total)`
    : raw;
  console.log(`${label}:`);
  console.log(display);
  console.log();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  separator('Loading configuration');

  // --- Load config ---
  let config;
  try {
    config = loadConfig();
    console.log('Config loaded successfully.');
  } catch (err) {
    console.error('Failed to load config:', err);
    process.exit(1);
  }

  // --- Check prerequisites ---
  if (!config.serper?.apiKey) {
    console.error('ERROR: SERPER_API_KEY is not set. Cannot run web research agent.');
    process.exit(1);
  }
  console.log(`Serper API key: ${config.serper.apiKey.substring(0, 8)}...`);

  const llmProvider = config.llm.singleProvider
    || (config.llm.google ? 'google' : config.llm.openai ? 'openai' : config.llm.anthropic ? 'anthropic' : 'none');
  if (llmProvider === 'none') {
    console.error('ERROR: No LLM provider configured. Set at least one of GOOGLE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.');
    process.exit(1);
  }
  console.log(`LLM provider: ${llmProvider}`);
  console.log(`Web research timeout: ${config.webResearch?.timeout ?? 60000}ms`);
  console.log(`Max tool calls: ${config.webResearch?.maxToolCalls ?? 8}`);

  // --- Build a minimal MBD ---
  separator('Building test Market Briefing Document');

  const testMbd: MarketBriefingDocument = {
    marketId: 'test-web-research-001',
    conditionId: 'test-condition-001',
    eventType: 'geopolitical',
    question: 'Will the US and China reach a trade deal by end of 2026?',
    resolutionCriteria: 'Resolves YES if a formal trade agreement is signed by both parties before December 31, 2026.',
    expiryTimestamp: Math.floor(new Date('2026-12-31').getTime() / 1000),
    currentProbability: 0.35,
    liquidityScore: 7.2,
    bidAskSpread: 3,
    volatilityRegime: 'medium',
    volume24h: 125000,
    keywords: ['US China trade', 'trade deal', 'tariffs', 'trade agreement 2026'],
    metadata: {
      ambiguityFlags: [],
      keyCatalysts: [],
    },
  };

  printJson('Test MBD', {
    question: testMbd.question,
    eventType: testMbd.eventType,
    keywords: testMbd.keywords,
    currentProbability: testMbd.currentProbability,
  });

  // --- Build minimal graph state ---
  const testState: Partial<GraphStateType> = {
    conditionId: testMbd.conditionId,
    mbd: testMbd,
    agentSignals: [],
    agentErrors: [],
    auditLog: [],
  };

  // --- Create and invoke the agent node ---
  separator('Invoking Web Research Agent');

  const startTime = Date.now();
  console.log(`Start time: ${new Date(startTime).toISOString()}`);
  console.log('Running agent... (this may take 30-90 seconds)\n');

  const agentNode = createWebResearchAgentNode(config);

  let result: Partial<GraphStateType>;
  try {
    result = await agentNode(testState as GraphStateType);
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ Agent node threw an unhandled error after ${elapsed}s:`);
    console.error(err);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`Agent completed in ${elapsed}s\n`);

  // --- Inspect results ---
  separator('Results: Agent Signals');

  const signals = result.agentSignals ?? [];
  if (signals.length === 0) {
    console.warn('⚠️  No agent signals returned.');
  } else {
    for (const signal of signals) {
      console.log(`Agent:          ${signal.agentName}`);
      console.log(`Confidence:     ${signal.confidence}`);
      console.log(`Direction:      ${signal.direction}`);
      console.log(`Fair Prob:      ${signal.fairProbability}`);
      console.log(`Key Drivers:    ${signal.keyDrivers.length} items`);
      for (const [i, driver] of signal.keyDrivers.entries()) {
        const preview = driver.length > 120 ? driver.substring(0, 120) + '...' : driver;
        console.log(`  [${i + 1}] ${preview}`);
      }
      console.log(`Risk Factors:   ${signal.riskFactors.length} items`);
      for (const [i, risk] of signal.riskFactors.entries()) {
        const preview = risk.length > 120 ? risk.substring(0, 120) + '...' : risk;
        console.log(`  [${i + 1}] ${preview}`);
      }
      console.log();

      // Metadata summary
      const meta = signal.metadata as Record<string, unknown>;
      console.log('Metadata:');
      console.log(`  Tools called:     ${meta.toolsCalled ?? 'N/A'}`);
      console.log(`  Total tool time:  ${typeof meta.totalToolTime === 'number' ? (meta.totalToolTime / 1000).toFixed(1) + 's' : 'N/A'}`);
      console.log(`  Cache hits:       ${meta.cacheHits ?? 'N/A'}`);
      console.log(`  Cache misses:     ${meta.cacheMisses ?? 'N/A'}`);
      console.log(`  Tool breakdown:   ${JSON.stringify(meta.toolBreakdown ?? {})}`);
      console.log(`  Salvaged:         ${meta.salvaged ?? false}`);
      console.log(`  Parse error:      ${meta.parseError ?? false}`);

      if (meta.searchQueriesUsed) {
        console.log(`  Search queries:   ${JSON.stringify(meta.searchQueriesUsed)}`);
      }
      if (meta.urlsScraped) {
        console.log(`  URLs scraped:     ${JSON.stringify(meta.urlsScraped)}`);
      }

      // Research summary preview
      const summary = (meta.researchSummary as string) ?? '';
      if (summary.length > 0) {
        console.log(`\n  Research summary (${summary.length} chars, first 500):`);
        console.log(`  ${summary.substring(0, 500).replace(/\n/g, '\n  ')}...`);
      }
    }
  }

  separator('Results: Agent Errors');

  const errors = result.agentErrors ?? [];
  if (errors.length === 0) {
    console.log('✅ No agent errors.');
  } else {
    for (const err of errors) {
      console.error(`❌ [${err.agentName}] ${err.type}: ${err.error?.message ?? err.error}`);
    }
  }

  separator('Results: Audit Log');

  const auditEntries = result.auditLog ?? [];
  for (const entry of auditEntries) {
    const data = entry.data as Record<string, unknown>;
    console.log(`Stage:     ${entry.stage}`);
    console.log(`Success:   ${data.success}`);
    console.log(`Duration:  ${typeof data.duration === 'number' ? (data.duration / 1000).toFixed(1) + 's' : 'N/A'}`);
    if (data.salvaged) console.log(`Salvaged:  true`);
    if (data.error) console.log(`Error:     ${data.error}`);
    if (data.toolUsage) {
      printJson('Tool usage', data.toolUsage);
    }
  }

  // --- Final verdict ---
  separator('Verdict');

  const hasSignal = signals.length > 0;
  const hasError = errors.length > 0;
  const wasSalvaged = signals.some(s => (s.metadata as any)?.salvaged);
  const hadParseError = signals.some(s => (s.metadata as any)?.parseError);
  const toolsCalled = signals.reduce((sum, s) => sum + ((s.metadata as any)?.toolsCalled ?? 0), 0);

  if (hasSignal && !hasError && !wasSalvaged && !hadParseError && toolsCalled > 0) {
    console.log('✅ PASSED — Agent produced a clean signal with tool calls and valid JSON output.');
  } else if (hasSignal && wasSalvaged) {
    console.log('⚠️  PARTIAL — Agent errored but salvaged research from tool calls.');
  } else if (hasSignal && hadParseError) {
    console.log('⚠️  PARTIAL — Agent completed but LLM output was not valid JSON (fallback extraction used).');
  } else if (hasSignal && toolsCalled === 0) {
    console.log('⚠️  DEGRADED — Agent returned a signal but made no tool calls (graceful degradation).');
  } else if (hasError) {
    console.log('❌ FAILED — Agent returned errors with no usable signal.');
  } else {
    console.log('❌ FAILED — No signals and no errors returned (unexpected).');
  }

  console.log(`\nElapsed: ${elapsed}s | Signals: ${signals.length} | Errors: ${errors.length} | Tools: ${toolsCalled}`);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
