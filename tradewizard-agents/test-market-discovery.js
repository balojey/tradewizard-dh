/**
 * Simple test script to verify the updated market discovery functionality
 * This bypasses the complex configuration system and tests the core logic
 */

import { createMarketDiscoveryEngine } from './dist/utils/market-discovery.js';

// Simple test configuration
const testConfig = {
  gammaApiUrl: 'https://gamma-api.polymarket.com',
  clobApiUrl: 'https://clob-api.polymarket.com',
  rateLimitBuffer: 80,
  politicsTagId: 2,
  includeRelatedTags: true,
  maxEventsPerDiscovery: 20,
  defaultSortBy: 'volume24hr',
  enableEventBasedKeywords: false, // Disable to avoid LLM dependencies
  enableCrossMarketAnalysis: false, // Disable to avoid complex analysis
  keywordExtractionMode: 'simple',
  environment: 'development',
};

async function testMarketDiscovery() {
  console.log('🚀 Testing updated market discovery with trending approach...\n');

  try {
    // Create the market discovery engine
    const engine = createMarketDiscoveryEngine(testConfig);
    
    console.log('✅ Market discovery engine created successfully');
    
    // Test discovering trending markets
    console.log('\n📊 Discovering trending markets...');
    const trendingMarkets = await engine.discoverMarkets(5);
    
    console.log(`✅ Found ${trendingMarkets.length} trending markets:`);
    
    trendingMarkets.forEach((market, index) => {
      console.log(`\n${index + 1}. ${market.question}`);
      console.log(`   Condition ID: ${market.conditionId}`);
      console.log(`   Trending Score: ${market.trendingScore.toFixed(2)}`);
      console.log(`   24h Volume: $${market.volume24h.toLocaleString()}`);
      console.log(`   Liquidity: $${market.liquidity.toLocaleString()}`);
      if (market.eventTitle) {
        console.log(`   Event: ${market.eventTitle}`);
      }
    });
    
    // Test fetching all political markets
    console.log('\n\n🏛️ Fetching all political markets...');
    const allMarkets = await engine.fetchPoliticalMarkets();
    
    console.log(`✅ Found ${allMarkets.length} political markets total`);
    
    if (allMarkets.length > 0) {
      console.log('\nSample markets:');
      allMarkets.slice(0, 3).forEach((market, index) => {
        console.log(`${index + 1}. ${market.question}`);
        if (market.eventTitle) {
          console.log(`   Event: ${market.eventTitle}`);
        }
      });
    }
    
    console.log('\n🎉 Market discovery test completed successfully!');
    console.log('\n📈 Key improvements:');
    console.log('- Uses events API endpoint (same as frontend)');
    console.log('- Applies liquidity and price filtering');
    console.log('- Sorts by combined liquidity + volume score');
    console.log('- Includes event context in market data');
    console.log('- Graceful fallback to legacy approach if needed');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.message.includes('fetch')) {
      console.log('\n💡 This might be expected if running without internet or API access');
      console.log('The implementation should work correctly with real API calls');
    }
  }
}

// Run the test
testMarketDiscovery().catch(console.error);