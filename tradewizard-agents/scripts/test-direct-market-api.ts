#!/usr/bin/env tsx
/**
 * Integration Test: Direct Market Discovery API
 * 
 * Tests the direct /markets endpoint with real Polymarket API
 * Validates: Requirements 1.1, 1.5, 3.1, 6.1
 */

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

async function fetchTrendingMarketsDirectly(limit: number = 100) {
  const GAMMA_API_URL = process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com';
  const POLITICS_TAG_ID = process.env.POLYMARKET_POLITICS_TAG_ID || '2';
  const MIN_LIQUIDITY_USD = 1000;
  const MIN_LIQUIDITY_NON_EVERGREEN_USD = 5000;
  const EVERGREEN_TAG_IDS = [2, 21, 120, 596, 1401, 100265, 100639];

  const fetchLimit = Math.max(limit * 3, 100);
  let url = `${GAMMA_API_URL}/markets?closed=false&order=volume24hr&ascending=false&limit=${fetchLimit}&offset=0`;
  url += `&tag_id=${POLITICS_TAG_ID}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const markets = await response.json();

  if (!Array.isArray(markets)) {
    throw new Error('Invalid API response: expected array of markets');
  }

  // Enrich markets with event context
  const enrichedMarkets = markets.map((market: any) => {
    if (market.events && Array.isArray(market.events) && market.events.length > 0) {
      const event = market.events[0];
      return {
        ...market,
        eventTitle: event.title,
        eventSlug: event.slug,
        eventId: event.id,
        eventIcon: event.image || event.icon,
      };
    }
    return market;
  });

  // Apply filtering logic
  const validMarkets = enrichedMarkets.filter((market: any) => {
    if (market.acceptingOrders === false) return false;
    if (market.closed === true) return false;
    if (!market.clobTokenIds) return false;

    // Check tradeable prices
    if (market.outcomePrices || market.outcome_prices) {
      try {
        const pricesStr = market.outcomePrices || market.outcome_prices;
        const prices = typeof pricesStr === 'string' ? JSON.parse(pricesStr) : pricesStr;
        const hasTradeablePrice = prices.some((price: string) => {
          const priceNum = parseFloat(price);
          return priceNum >= 0.05 && priceNum <= 0.95;
        });
        if (!hasTradeablePrice) return false;
      } catch {
        return false;
      }
    }

    // Apply liquidity filtering
    const marketTagIds = market.tags?.map((t: any) => parseInt(t.id)) || [];
    const hasEvergreenTag = EVERGREEN_TAG_IDS.some((id) => marketTagIds.includes(id));
    const liquidity = parseFloat(market.liquidity || '0');

    if (!hasEvergreenTag && liquidity < MIN_LIQUIDITY_NON_EVERGREEN_USD) {
      return false;
    }
    if (liquidity < MIN_LIQUIDITY_USD) return false;

    return true;
  });

  // Sort by combined liquidity + volume score
  const sortedMarkets = validMarkets.sort((a: any, b: any) => {
    const aScore = parseFloat(a.liquidity || '0') +
                  parseFloat(a.volume24hr?.toString() || a.volume_24h?.toString() || a.volume || '0');
    const bScore = parseFloat(b.liquidity || '0') +
                  parseFloat(b.volume24hr?.toString() || b.volume_24h?.toString() || b.volume || '0');
    return bScore - aScore;
  });

  return {
    raw: markets,
    enriched: enrichedMarkets,
    filtered: validMarkets,
    sorted: sortedMarkets,
  };
}

async function testBackendIntegration() {
  console.log('='.repeat(80));
  console.log('Integration Test: Backend Direct Market Discovery');
  console.log('='.repeat(80));
  console.log();

  try {
    // Test 1: Fetch trending markets and verify results
    console.log('Test 1: Fetch trending markets from real Polymarket API');
    console.log('-'.repeat(80));
    
    const startTime = Date.now();
    const result = await fetchTrendingMarketsDirectly(100);
    const fetchTime = Date.now() - startTime;
    
    if (result.sorted.length === 0) {
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
        `Successfully fetched ${result.sorted.length} markets in ${fetchTime}ms`,
        { 
          rawCount: result.raw.length,
          enrichedCount: result.enriched.length,
          filteredCount: result.filtered.length,
          sortedCount: result.sorted.length,
          fetchTime: `${fetchTime}ms`,
          sampleMarket: {
            question: result.sorted[0].question,
            slug: result.sorted[0].slug,
            liquidity: result.sorted[0].liquidity,
            volume24hr: result.sorted[0].volume24hr,
          }
        }
      );
    }

    // Test 2: Verify event context enrichment works
    console.log('Test 2: Verify event context enrichment');
    console.log('-'.repeat(80));
    
    const marketsWithEvents = result.sorted.filter((m: any) => m.eventTitle);
    const marketsWithoutEvents = result.sorted.filter((m: any) => !m.eventTitle);
    
    logTest(
      'Event context enrichment',
      marketsWithEvents.length > 0,
      `${marketsWithEvents.length} markets have event context, ${marketsWithoutEvents.length} without`,
      {
        withEvents: marketsWithEvents.length,
        withoutEvents: marketsWithoutEvents.length,
        percentageWithEvents: ((marketsWithEvents.length / result.sorted.length) * 100).toFixed(1) + '%',
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
    
    const filteringStats = {
      rawMarkets: result.raw.length,
      afterFiltering: result.filtered.length,
      filtered: result.raw.length - result.filtered.length,
      filterRate: (((result.raw.length - result.filtered.length) / result.raw.length) * 100).toFixed(1) + '%',
    };
    
    const validationResults = {
      allHaveClobTokenIds: result.sorted.every((m: any) => m.clobTokenIds),
      allAcceptingOrders: result.sorted.every((m: any) => m.acceptingOrders !== false),
      allNotClosed: result.sorted.every((m: any) => m.closed !== true),
      allMeetLiquidityThreshold: result.sorted.every((m: any) => {
        const liquidity = parseFloat(m.liquidity || '0');
        return liquidity >= 1000;
      }),
    };
    
    const allFiltersPassed = Object.values(validationResults).every(v => v);
    
    logTest(
      'Filtering validation',
      allFiltersPassed && filteringStats.filtered > 0,
      allFiltersPassed 
        ? `All markets pass filtering criteria. Filtered out ${filteringStats.filtered} markets (${filteringStats.filterRate})`
        : 'Some markets do not meet filtering criteria',
      { ...filteringStats, ...validationResults }
    );

    // Test 4: Verify sorting produces expected order
    console.log('Test 4: Verify sorting produces expected order');
    console.log('-'.repeat(80));
    
    const scores = result.sorted.slice(0, 10).map((m: any) => {
      const liquidity = parseFloat(m.liquidity || '0');
      const volume = parseFloat(m.volume24hr?.toString() || m.volume_24h?.toString() || m.volume || '0');
      return {
        question: m.question?.substring(0, 50) + '...',
        liquidity: liquidity.toFixed(2),
        volume: volume.toFixed(2),
        combinedScore: (liquidity + volume).toFixed(2),
      };
    });
    
    const isSortedDescending = scores.every((score, i) => {
      if (i === 0) return true;
      return parseFloat(score.combinedScore) <= parseFloat(scores[i - 1].combinedScore);
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
      'question', 'slug', 'liquidity', 'clobTokenIds', 'id'
    ];
    
    const fieldCoverage = requiredFields.map(field => ({
      field,
      coverage: result.sorted.filter((m: any) => m[field] !== undefined && m[field] !== null).length,
      percentage: ((result.sorted.filter((m: any) => m[field] !== undefined && m[field] !== null).length / result.sorted.length) * 100).toFixed(1),
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
        marketsPerSecond: ((result.sorted.length / fetchTime) * 1000).toFixed(2),
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
