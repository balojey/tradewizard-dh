/**
 * Serper API Test Script
 *
 * Tests the Serper API client by performing:
 * 1. A web search query
 * 2. A webpage scrape of a URL from the search results
 *
 * Usage:
 *   npx tsx scripts/test-serper-api.ts
 *
 * Requires SERPER_API_KEY in .env
 */

import 'dotenv/config';
import { SerperClient } from '../src/utils/serper-client.js';

// ============================================================================
// Helpers
// ============================================================================

function separator(label: string): void {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}\n`);
}

function printJson(label: string, data: unknown): void {
  console.log(`${label}:`);
  console.log(JSON.stringify(data, null, 2));
  console.log();
}

// ============================================================================
// Main
// ============================================================================

async function main(): Promise<void> {
  // --- Check API key ---
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey || apiKey === 'your_serper_api_key_here') {
    console.error('ERROR: SERPER_API_KEY is not set or is still the placeholder value.');
    console.error('Set it in tradewizard-agents/.env before running this script.');
    process.exit(1);
  }

  console.log(`Serper API key loaded (first 8 chars): ${apiKey.substring(0, 8)}...`);

  // --- Instantiate client ---
  const client = new SerperClient({
    apiKey,
    searchUrl: process.env.SERPER_SEARCH_URL || 'https://google.serper.dev/search',
    scrapeUrl: process.env.SERPER_SCRAPE_URL || 'https://scrape.serper.dev',
    timeout: 30000,
  });

  // ========================================================================
  // TEST 1: Web Search
  // ========================================================================
  separator('TEST 1: Web Search');

  console.log('Searching for: "prediction markets 2026"');
  console.log(`Search URL: ${process.env.SERPER_SEARCH_URL || 'https://google.serper.dev/search'}`);
  console.log();

  let searchResponse;
  try {
    searchResponse = await client.search({
      q: 'prediction markets 2026',
      num: 5,
    });

    printJson('Search parameters', searchResponse.searchParameters);

    const organicCount = searchResponse.organic?.length ?? 0;
    console.log(`Organic results returned: ${organicCount}`);

    if (organicCount === 0) {
      console.warn('WARNING: Search returned 0 organic results. This may indicate an API issue.');
    }

    // Print first 3 results
    for (const [i, result] of (searchResponse.organic ?? []).slice(0, 3).entries()) {
      console.log(`\n--- Result ${i + 1} ---`);
      console.log(`  Title:    ${result.title}`);
      console.log(`  Link:     ${result.link}`);
      console.log(`  Snippet:  ${result.snippet?.substring(0, 120)}...`);
      console.log(`  Date:     ${result.date ?? 'N/A'}`);
      console.log(`  Position: ${result.position}`);
    }

    console.log('\n✅ Search test PASSED');
  } catch (err) {
    console.error('❌ Search test FAILED');
    console.error(err);
    // Continue to scrape test anyway
  }

  // ========================================================================
  // TEST 2: Webpage Scrape
  // ========================================================================
  separator('TEST 2: Webpage Scrape');

  // Pick a URL to scrape — use first search result if available, otherwise a known page
  const scrapeUrl =
    searchResponse?.organic?.[0]?.link ?? 'https://en.wikipedia.org/wiki/Prediction_market';

  console.log(`Scraping URL: ${scrapeUrl}`);
  console.log(`Scrape endpoint: ${process.env.SERPER_SCRAPE_URL || 'https://scrape.serper.dev'}`);
  console.log();

  try {
    const scrapeResponse = await client.scrape({ url: scrapeUrl });

    console.log(`Response URL:   ${scrapeResponse.url}`);
    console.log(`Response Title: ${scrapeResponse.title ?? '(none)'}`);
    console.log(`Text length:    ${scrapeResponse.text?.length ?? 0} chars`);

    if (scrapeResponse.metadata) {
      printJson('Metadata', scrapeResponse.metadata);
    }

    // Print first 500 chars of text
    if (scrapeResponse.text && scrapeResponse.text.length > 0) {
      console.log('\n--- Text preview (first 500 chars) ---');
      console.log(scrapeResponse.text.substring(0, 500));
      console.log('...');
      console.log('\n✅ Scrape test PASSED');
    } else {
      console.warn('WARNING: Scrape returned empty text. Checking full response...');
      printJson('Full scrape response', scrapeResponse);
      console.warn('⚠️  Scrape test returned no text — possible API issue');
    }
  } catch (err) {
    console.error('❌ Scrape test FAILED');
    console.error(err);
  }

  // ========================================================================
  // TEST 3: Key Rotation Stats
  // ========================================================================
  separator('TEST 3: Key Rotation Stats');

  const stats = client.getKeyRotationStats();
  printJson('Key rotation stats', stats);
  console.log('✅ Stats test PASSED');

  // ========================================================================
  // TEST 4: Raw fetch with INDIVIDUAL key (first key only)
  // ========================================================================
  separator('TEST 4: Raw fetch — search with first individual key');

  try {
    const rawSearchUrl = process.env.SERPER_SEARCH_URL || 'https://google.serper.dev/search';
    // Parse the first individual key (same way the client does)
    const firstKey = apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0)[0];
    console.log(`POST ${rawSearchUrl}`);
    console.log('Body: { "q": "test query", "num": 2 }');
    console.log(`Header: X-API-KEY: ${firstKey.substring(0, 8)}... (${firstKey.length} chars)`);
    console.log(`Full comma-separated env var length: ${apiKey.length} chars`);
    console.log(`Number of keys after split: ${apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0).length}`);
    console.log();

    const rawResp = await fetch(rawSearchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': firstKey,
      },
      body: JSON.stringify({ q: 'test query', num: 2 }),
    });

    console.log(`Status: ${rawResp.status} ${rawResp.statusText}`);
    console.log(`Content-Type: ${rawResp.headers.get('content-type')}`);

    const rawBody = await rawResp.text();
    console.log(`Response body length: ${rawBody.length} chars`);
    console.log(`Response body (first 500 chars):\n${rawBody.substring(0, 500)}`);

    if (rawResp.ok) {
      console.log('\n✅ Raw search fetch with individual key PASSED');
    } else {
      console.error(`\n❌ Raw search fetch with individual key returned HTTP ${rawResp.status}`);
    }
  } catch (err) {
    console.error('❌ Raw search fetch with individual key FAILED');
    console.error(err);
  }

  // ========================================================================
  // TEST 5: Raw fetch — search with FULL env var (all keys as one string)
  // ========================================================================
  separator('TEST 5: Raw fetch — search with full env var as key');

  try {
    const rawSearchUrl = process.env.SERPER_SEARCH_URL || 'https://google.serper.dev/search';
    console.log(`POST ${rawSearchUrl}`);
    console.log('Body: { "q": "test query", "num": 2 }');
    console.log(`Header: X-API-KEY: ${apiKey.substring(0, 8)}... (${apiKey.length} chars, FULL env var)`);
    console.log();

    const rawResp = await fetch(rawSearchUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({ q: 'test query', num: 2 }),
    });

    console.log(`Status: ${rawResp.status} ${rawResp.statusText}`);
    console.log(`Content-Type: ${rawResp.headers.get('content-type')}`);

    const rawBody = await rawResp.text();
    console.log(`Response body length: ${rawBody.length} chars`);
    console.log(`Response body (first 500 chars):\n${rawBody.substring(0, 500)}`);

    if (rawResp.ok) {
      console.log('\n✅ Raw search fetch with full env var PASSED');
    } else {
      console.error(`\n❌ Raw search fetch with full env var returned HTTP ${rawResp.status}`);
    }
  } catch (err) {
    console.error('❌ Raw search fetch with full env var FAILED');
    console.error(err);
  }

  // ========================================================================
  // TEST 6: Raw fetch — scrape with first individual key
  // ========================================================================
  separator('TEST 6: Raw fetch — scrape with first individual key');

  try {
    const rawScrapeUrl = process.env.SERPER_SCRAPE_URL || 'https://scrape.serper.dev';
    const targetUrl = 'https://en.wikipedia.org/wiki/Prediction_market';
    const firstKey = apiKey.split(',').map(k => k.trim()).filter(k => k.length > 0)[0];
    console.log(`POST ${rawScrapeUrl}`);
    console.log(`Body: { "url": "${targetUrl}" }`);
    console.log(`Header: X-API-KEY: ${firstKey.substring(0, 8)}... (${firstKey.length} chars)`);
    console.log();

    const rawResp = await fetch(rawScrapeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': firstKey,
      },
      body: JSON.stringify({ url: targetUrl }),
    });

    console.log(`Status: ${rawResp.status} ${rawResp.statusText}`);
    console.log(`Content-Type: ${rawResp.headers.get('content-type')}`);

    const rawBody = await rawResp.text();
    console.log(`Response body length: ${rawBody.length} chars`);
    console.log(`Response body (first 500 chars):\n${rawBody.substring(0, 500)}`);

    if (rawResp.ok) {
      try {
        const parsed = JSON.parse(rawBody);
        console.log(`\nResponse keys: ${Object.keys(parsed).join(', ')}`);
        if (parsed.text) {
          console.log(`text field length: ${parsed.text.length}`);
        } else {
          console.warn('WARNING: No "text" field in scrape response!');
        }
      } catch {
        console.warn('Response is not valid JSON');
      }
      console.log('\n✅ Raw scrape fetch with individual key PASSED');
    } else {
      console.error(`\n❌ Raw scrape fetch with individual key returned HTTP ${rawResp.status}`);
    }
  } catch (err) {
    console.error('❌ Raw scrape fetch with individual key FAILED');
    console.error(err);
  }

  separator('DONE');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
