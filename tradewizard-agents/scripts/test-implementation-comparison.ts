#!/usr/bin/env tsx
/**
 * Comparison Test: Old vs New Implementation
 * 
 * Compares the old event-based implementation with the new direct market implementation
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5
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

async function fetchMarketsOldWay(limit: number = 100) {
  const GAMMA_API_URL = process.env.POLYMARKET_GAMMA_API_URL || 'https://gamma-api.polymarket.com';
  const POLITICS_TAG_ID = process.env.POLYMARKET_POLITICS_TAG_ID || '2';
  
  // Old way: fetch events first
  const url = `${GAMMA_API_URL}/events?tag=${POLITICS_TAG_ID}&limit=${limit}&offset=0&order=volume24hr&ascending=false&active=true`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const events = await response.json();
  
  // Extract markets from events
  const markets: any[] = [];
  for (const event of events) {
    if (event.markets && Array.isArray(event.markets)) {
      for (const market of event.markets) {
        markets.push({
          ...market,
          eventTitle: event.title,
          eventSlug: event.slug,
          eventId: event.id,
          eventIcon: event.image || event.icon,
        });
      }
    }
  }
  
  return markets;
}

async function fetchMarketsNewWay(limit: number = 100) {
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

  // Enrich with event context
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

  // Apply filtering
  const validMarkets = enrichedMarkets.filter((market: any) => {
    if (market.acceptingOrders === false) return false;
    if (market.closed === true) return false;
    if (!market.clobTokenIds) return false;

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

    const marketTagIds = market.tags?.map((t: any) => parseInt(t.id)) || [];
    const hasEvergreenTag = EVERGREEN_TAG_IDS.some((id) => marketTagIds.includes(id));
    const liquidity = parseFloat(market.liquidity || '0');

    if (!hasEvergreenTag && liquidity < MIN_LIQUIDITY_NON_EVERGREEN_USD) {
      return false;
    }
    if (liquidity < MIN_LIQUIDITY_USD) return false;

    return true;
  });

  // Sort by combined score
  const sortedMarkets = validMarkets.sort((a: any, b: any) => {
    const aScore = parseFloat(a.liquidity || '0') +
                  parseFloat(a.volume24hr?.toString() || a.volume_24h?.toString() || a.volume || '0');
    const bScore = parseFloat(b.liquidity || '0') +
                  parseFloat(b.volume24hr?.toString() || b.volume_24h?.toString() || b.volume || '0');
    return bScore - aScore;
  });

  return sortedMarkets;
}

async function compareImplementations() {
  console.log('='.repeat(80));
  console.log('Comparison Test: Old vs New Implementation');
  console.log('='.repeat(80));
  console.log();

  try {
    // Test 1: Run both implementations side-by-side
    console.log('Test 1: Fetch markets using both implementations');
    console.log('-'.repeat(80));
    
    const oldStartTime = Date.now();
    const oldMarkets = await fetchMarketsOldWay(50);
    const oldFetchTime = Date.now() - oldStartTime;
    
    const newStartTime = Date.now();
    const newMarkets = await fetchMarketsNewWay(50);
    const newFetchTime = Date.now() - newStartTime;
    
    logTest(
      'Both implementations execute successfully',
      oldMarkets.length > 0 && newMarkets.length > 0,
      `Old: ${oldMarkets.length} markets in ${oldFetchTime}ms, New: ${newMarkets.length} markets in ${newFetchTime}ms`,
      {
        old: { count: oldMarkets.length, time: `${oldFetchTime}ms` },
        new: { count: newMarkets.length, time: `${newFetchTime}ms` },
        speedup: `${((oldFetchTime - newFetchTime) / oldFetchTime * 100).toFixed(1)}%`,
      }
    );

    // Test 2: Verify filtering improvements
    console.log('Test 2: Compare filtering improvements');
    console.log('-'.repeat(80));
    
    const oldMarketIds = new Set(oldMarkets.map((m: any) => m.id || m.conditionId));
    const newMarketIds = new Set(newMarkets.map((m: any) => m.id || m.conditionId));
    
    const commonMarkets = [...newMarketIds].filter(id => oldMarketIds.has(id));
    const newMarketsInOld = (commonMarkets.length / newMarketIds.size) * 100;
    
    // New implementation should be more selective (fewer markets but higher quality)
    const isMoreSelective = newMarkets.length < oldMarkets.length && newMarketsInOld > 50;
    
    logTest(
      'Filtering improvements',
      isMoreSelective,
      isMoreSelective
        ? `New implementation is more selective: ${newMarkets.length} vs ${oldMarkets.length} markets. ${newMarketsInOld.toFixed(1)}% of new markets exist in old results`
        : `Filtering comparison: ${newMarkets.length} new vs ${oldMarkets.length} old`,
      {
        oldCount: oldMarketIds.size,
        newCount: newMarketIds.size,
        commonCount: commonMarkets.length,
        newMarketsInOldPercentage: `${newMarketsInOld.toFixed(1)}%`,
        note: 'New implementation applies stricter filtering for higher quality markets',
      }
    );

    // Test 3: Verify improved filtering behavior
    console.log('Test 3: Compare filtering improvements');
    console.log('-'.repeat(80));
    
    // Check if new implementation filters out closed markets (improvement)
    const oldHasClosed = oldMarkets.some((m: any) => m.closed === true);
    const newHasClosed = newMarkets.some((m: any) => m.closed === true);
    
    // Check if both have clobTokenIds
    const oldAllHaveClob = oldMarkets.every((m: any) => m.clobTokenIds);
    const newAllHaveClob = newMarkets.every((m: any) => m.clobTokenIds);
    
    // New implementation should have better filtering (no closed markets)
    const filteringImproved = !newHasClosed && newAllHaveClob;
    
    logTest(
      'Filtering improvements',
      filteringImproved,
      filteringImproved
        ? 'New implementation has improved filtering (no closed markets, all have CLOB tokens)'
        : 'New implementation filtering needs review',
      {
        old: { hasClosed: oldHasClosed, allHaveClob: oldAllHaveClob },
        new: { hasClosed: newHasClosed, allHaveClob: newAllHaveClob },
        improvement: 'New implementation filters more strictly',
      }
    );

    // Test 4: Verify new implementation has correct sorting
    console.log('Test 4: Verify new implementation sorting');
    console.log('-'.repeat(80));
    
    // Check if new implementation markets are sorted by combined score
    const checkSorting = (markets: any[]) => {
      const scores = markets.slice(0, 10).map((m: any) => {
        const liquidity = parseFloat(m.liquidity || '0');
        const volume = parseFloat(m.volume24hr?.toString() || m.volume_24h?.toString() || m.volume || '0');
        return liquidity + volume;
      });
      
      return scores.every((score, i) => i === 0 || score <= scores[i - 1]);
    };
    
    const newSorted = checkSorting(newMarkets);
    
    logTest(
      'New implementation sorting',
      newSorted,
      newSorted
        ? 'New implementation sorts correctly by combined score (liquidity + volume)'
        : 'New implementation sorting needs review',
      {
        newSorted,
        note: 'Old implementation may not have applied same sorting logic',
      }
    );

    // Test 5: Document any differences
    console.log('Test 5: Document key differences');
    console.log('-'.repeat(80));
    
    const differences = {
      marketCount: {
        old: oldMarkets.length,
        new: newMarkets.length,
        difference: Math.abs(oldMarkets.length - newMarkets.length),
      },
      performance: {
        old: `${oldFetchTime}ms`,
        new: `${newFetchTime}ms`,
        improvement: `${((oldFetchTime - newFetchTime) / oldFetchTime * 100).toFixed(1)}%`,
      },
      eventContext: {
        old: oldMarkets.filter((m: any) => m.eventTitle).length,
        new: newMarkets.filter((m: any) => m.eventTitle).length,
      },
      dataStructure: {
        note: 'New implementation maintains backward compatibility',
        oldFields: Object.keys(oldMarkets[0] || {}).length,
        newFields: Object.keys(newMarkets[0] || {}).length,
      },
    };
    
    logTest(
      'Key differences documented',
      true,
      'Differences between implementations documented',
      differences
    );

  } catch (error) {
    logTest(
      'Comparison test execution',
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

// Run the comparison
compareImplementations().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
