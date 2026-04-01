#!/usr/bin/env tsx
/**
 * Integration Test: Direct Market Discovery
 * 
 * Tests the backend implementation with real Polymarket API
 * Validates: Requirements 1.1, 1.5, 3.1, 6.1
 */

import { PolymarketDiscoveryEngine } from '../src/utils/market-discovery.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
  data?: any;
}

const results: TestResult[] = [];

function logTest(name: string, passed: boolean, details: string, data?: any) {
  results.push({ name, passed, details, data });
  const status = passed ? '✓' : '✗';
  console.log(`${status} ${name}`);
  console.log(`  ${details}`);
  if (data) {
    console.log(`  Data:`, JSON.stringify(data, null, 2));
  }
  console.log();
}

async function testBackendIntegration() {
  console.log('='.repeat(80));
  console.log('Integration Test: Backend Direct Market Discovery');
  console.log('='.repeat(80));
  console.log();

  try {
    // Create discovery engine with minimal config
    const engineConfig = {
      gammaApiUrl: process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com',
      politicsTagId: parseInt(process.env.POLYMARKET_POLITICS_TAG_ID || '2'),
      maxRetries: parseInt(process.env.POLYMARKET_MAX_RETRIES || '3'),
    };
    
    const engine = new PolymarketDiscoveryEngine(engineConfig);
    
    // Test 1: Fetch trending markets and verify results
    console.log('Test 1: Fetch trending markets from real Polymarket API');
    console.log('-'.repeat(80));
    
    const startTime = Date.now();
    const markets = await engine.fetchPoliticalMarkets();
    const fetchTime = Date.now() - startTime;
    
    if (markets.length === 0) {
      logTest(
        'Fetch trending markets',
        false,
        'No markets returned from API',
        { fetchTime: `${fetchTime}ms` }
      );
    } else {
      logTest(
        'Fetch trending markets',
        true,
        `Successfully fetched ${markets.length} markets in ${fetchTime}ms`,
        { 
          marketCount: markets.length,
          fetchTime: `${fetchTime}ms`,
          sampleMarket: {
            question: markets[0].question,
            slug: markets[0].slug,
            liquidity: markets[0].liquidity,
            volume24hr: markets[0].volume24hr,
          }
        }
      );
    }

    // Test 2: Verify event context enrichment works
    console.log('Test 2: Verify event context enrichment');
    console.log('-'.repeat(80));
    
    const marketsWithEvents = markets.filter(m => m.eventTitle);
    const marketsWithoutEvents = markets.filter(m => !m.eventTitle);
    
    logTest(
      'Event context enrichment',
      marketsWithEvents.length > 0,
      `${marketsWithEvents.length} markets have event context, ${marketsWithoutEvents.length} without`,
      {
        withEvents: marketsWithEvents.length,
        withoutEvents: marketsWithoutEvents.length,
        sampleWithEvent: marketsWithEvents.length > 0 ? {
          question: marketsWithEvents[0].question,
          eventTitle: marketsWithEvents[0].eventTitle,
          eventSlug: marketsWithEvents[0].eventSlug,
          eventId: marketsWithEvents[0].eventId,
        } : null,
        sampleWithoutEvent: marketsWithoutEvents.length > 0 ? {
          question: marketsWithoutEvents[0].question,
          eventTitle: marketsWithoutEvents[0].eventTitle,
        } : null,
      }
    );

    // Test 3: Verify filtering removes invalid markets
    console.log('Test 3: Verify filtering removes invalid markets');
    console.log('-'.repeat(80));
    
    const validationResults = {
      allHaveClobTokenIds: markets.every(m => m.clobTokenIds),
      allAcceptingOrders: markets.every(m => m.acceptingOrders !== false),
      allNotClosed: markets.every(m => m.closed !== true),
      allHaveTradeablePrices: markets.filter(m => {
        if (!m.outcomePrices && !m.outcome_prices) return true;
        try {
          const pricesStr = m.outcomePrices || m.outcome_prices;
          const prices = typeof pricesStr === 'string' ? JSON.parse(pricesStr) : pricesStr;
          return prices.some((price: string) => {
            const priceNum = parseFloat(price);
            return priceNum >= 0.05 && priceNum <= 0.95;
          });
        } catch {
          return false;
        }
      }).length === markets.length,
      allMeetLiquidityThreshold: markets.every(m => {
        const liquidity = parseFloat(m.liquidity || '0');
        return liquidity >= 1000;
      }),
    };
    
    const allFiltersPassed = Object.values(validationResults).every(v => v);
    
    logTest(
      'Filtering validation',
      allFiltersPassed,
      allFiltersPassed 
        ? 'All markets pass filtering criteria'
        : 'Some markets do not meet filtering criteria',
      validationResults
    );

    // Test 4: Verify sorting produces expected order
    console.log('Test 4: Verify sorting produces expected order');
    console.log('-'.repeat(80));
    
    const scores = markets.slice(0, 10).map(m => {
      const liquidity = parseFloat(m.liquidity || '0');
      const volume = parseFloat(m.volume24hr?.toString() || m.volume_24h?.toString() || m.volume || '0');
      return {
        question: m.question?.substring(0, 50) + '...',
        liquidity,
        volume,
        combinedScore: liquidity + volume,
      };
    });
    
    const isSortedDescending = scores.every((score, i) => {
      if (i === 0) return true;
      return score.combinedScore <= scores[i - 1].combinedScore;
    });
    
    logTest(
      'Sorting validation',
      isSortedDescending,
      isSortedDescending
        ? 'Markets are correctly sorted by combined score (descending)'
        : 'Markets are NOT correctly sorted',
      { top10Scores: scores }
    );

    // Test 5: Verify data structure completeness
    console.log('Test 5: Verify data structure completeness');
    console.log('-'.repeat(80));
    
    const requiredFields = [
      'question', 'slug', 'liquidity', 'clobTokenIds',
      'conditionId', 'condition_id', 'market_slug'
    ];
    
    const fieldCoverage = requiredFields.map(field => ({
      field,
      coverage: markets.filter(m => m[field] !== undefined && m[field] !== null).length,
      percentage: ((markets.filter(m => m[field] !== undefined && m[field] !== null).length / markets.length) * 100).toFixed(1),
    }));
    
    const allFieldsPresent = fieldCoverage.every(f => parseFloat(f.percentage) > 95);
    
    logTest(
      'Data structure completeness',
      allFieldsPresent,
      allFieldsPresent
        ? 'All required fields present in >95% of markets'
        : 'Some required fields missing',
      { fieldCoverage }
    );

    // Test 6: Performance metrics
    console.log('Test 6: Performance metrics');
    console.log('-'.repeat(80));
    
    const performanceAcceptable = fetchTime < 10000; // 10 seconds
    
    logTest(
      'Performance metrics',
      performanceAcceptable,
      performanceAcceptable
        ? `API response time (${fetchTime}ms) is acceptable`
        : `API response time (${fetchTime}ms) exceeds threshold`,
      {
        fetchTime: `${fetchTime}ms`,
        threshold: '10000ms',
        marketsPerSecond: ((markets.length / fetchTime) * 1000).toFixed(2),
      }
    );

  } catch (error) {
    logTest(
      'Integration test execution',
      false,
      `Test failed with error: ${error instanceof Error ? error.message : String(error)}`,
      { error: error instanceof Error ? error.stack : String(error) }
    );
  }

  // Summary
  console.log('='.repeat(80));
  console.log('Test Summary');
  console.log('='.repeat(80));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);
  
  console.log(`Passed: ${passed}/${total} (${percentage}%)`);
  console.log();
  
  results.forEach(result => {
    const status = result.passed ? '✓' : '✗';
    console.log(`${status} ${result.name}`);
  });
  
  console.log();
  console.log('='.repeat(80));
  
  // Exit with appropriate code
  process.exit(passed === total ? 0 : 1);
}

// Run the test
testBackendIntegration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
