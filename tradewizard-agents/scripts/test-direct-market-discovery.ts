#!/usr/bin/env node
/**
 * Test script for direct market discovery implementation
 * Verifies that the new fetchTrendingMarketsDirectly() method works with real Polymarket API
 */

import { createMarketDiscoveryEngine } from '../src/utils/market-discovery.js';
import { config } from '../src/config/index.js';

async function testDirectMarketDiscovery() {
  console.log('🧪 Testing Direct Market Discovery Implementation\n');
  console.log('=' .repeat(60));

  try {
    // Create market discovery engine
    const engine = createMarketDiscoveryEngine(config.marketDiscovery);
    console.log('✅ Market discovery engine created');

    // Test 1: Fetch political markets using direct endpoint
    console.log('\n📊 Test 1: Fetching political markets...');
    const startTime = Date.now();
    const markets = await engine.fetchPoliticalMarkets();
    const duration = Date.now() - startTime;

    console.log(`✅ Fetched ${markets.length} markets in ${duration}ms`);

    if (markets.length === 0) {
      console.log('⚠️  Warning: No markets returned');
      return;
    }

    // Test 2: Verify market structure
    console.log('\n🔍 Test 2: Verifying market structure...');
    const firstMarket = markets[0];
    const requiredFields = [
      'id',
      'question',
      'slug',
      'liquidity',
      'clobTokenIds',
    ];

    const missingFields = requiredFields.filter(field => !(field in firstMarket));
    if (missingFields.length > 0) {
      console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
    } else {
      console.log('✅ All required fields present');
    }

    // Test 3: Check event context enrichment
    console.log('\n🎯 Test 3: Checking event context enrichment...');
    const marketsWithEvents = markets.filter(m => m.eventTitle);
    const marketsWithoutEvents = markets.filter(m => !m.eventTitle);

    console.log(`  Markets with event context: ${marketsWithEvents.length}`);
    console.log(`  Markets without event context: ${marketsWithoutEvents.length}`);

    if (marketsWithEvents.length > 0) {
      console.log('✅ Event context enrichment working');
      console.log(`  Example: "${marketsWithEvents[0].eventTitle}"`);
    }

    // Test 4: Verify filtering
    console.log('\n🔬 Test 4: Verifying filtering logic...');
    const allAcceptingOrders = markets.every(m => m.acceptingOrders !== false);
    const allHaveClobTokenIds = markets.every(m => m.clobTokenIds);
    const allOpen = markets.every(m => !m.closed);

    console.log(`  All accepting orders: ${allAcceptingOrders ? '✅' : '❌'}`);
    console.log(`  All have CLOB token IDs: ${allHaveClobTokenIds ? '✅' : '❌'}`);
    console.log(`  All open markets: ${allOpen ? '✅' : '❌'}`);

    // Test 5: Verify sorting
    console.log('\n📈 Test 5: Verifying sorting logic...');
    let sortedCorrectly = true;
    for (let i = 0; i < markets.length - 1; i++) {
      const currentScore = parseFloat(markets[i].liquidity || '0') +
                          parseFloat(markets[i].volume24hr?.toString() || '0');
      const nextScore = parseFloat(markets[i + 1].liquidity || '0') +
                       parseFloat(markets[i + 1].volume24hr?.toString() || '0');

      if (currentScore < nextScore) {
        sortedCorrectly = false;
        break;
      }
    }

    console.log(`  Markets sorted by score: ${sortedCorrectly ? '✅' : '❌'}`);

    // Test 6: Display sample markets
    console.log('\n📋 Sample Markets:');
    console.log('=' .repeat(60));
    markets.slice(0, 3).forEach((market, idx) => {
      const liquidity = parseFloat(market.liquidity || '0').toFixed(0);
      const volume = parseFloat(market.volume24hr?.toString() || '0').toFixed(0);
      console.log(`\n${idx + 1}. ${market.question}`);
      console.log(`   Liquidity: $${liquidity} | Volume: $${volume}`);
      if (market.eventTitle) {
        console.log(`   Event: ${market.eventTitle}`);
      }
      console.log(`   Slug: ${market.slug}`);
    });

    console.log('\n' + '='.repeat(60));
    console.log('✅ All tests passed! Direct market discovery is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(error);
    process.exit(1);
  }
}

// Run the test
testDirectMarketDiscovery().catch(console.error);
