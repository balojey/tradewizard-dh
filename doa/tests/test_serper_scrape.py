#!/usr/bin/env python3
"""
Test script for Serper scrape API to understand response format.
"""
import asyncio
import json
from tools.serper_client import SerperClient, SerperScrapeParams
from config import load_config


async def test_scrape():
    """Test the Serper scrape API with various URLs."""
    
    # Load config
    config = load_config()
    
    if not config.serper or not config.serper.api_key:
        print("❌ Serper API key not configured")
        return
    
    # Initialize client
    client = SerperClient(config.serper)
    
    # Test URLs
    test_urls = [
        "https://www.reuters.com/business/energy/hormuz-shutdown-worsens-after-us-hits-iranian-warship-tankers-stranded-fifth-day-2026-03-04/",
        "https://www.bbc.com/news",
        "https://www.nytimes.com",
    ]
    
    print("🔍 Testing Serper Scrape API\n")
    print("=" * 80)
    
    for url in test_urls:
        print(f"\n📄 Testing URL: {url}")
        print("-" * 80)
        
        try:
            params = SerperScrapeParams(url=url)
            result = await client.scrape(params)
            
            print(f"✅ Success!")
            print(f"   URL in response: {result.url}")
            print(f"   Title: {result.title}")
            print(f"   Text length: {len(result.text) if result.text else 0} chars")
            print(f"   Metadata: {json.dumps(result.metadata, indent=2) if result.metadata else 'None'}")
            
            # Show first 200 chars of text
            if result.text:
                preview = result.text[:200].replace('\n', ' ')
                print(f"   Text preview: {preview}...")
            
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            print(f"   Error type: {type(e).__name__}")
    
    print("\n" + "=" * 80)
    print("✨ Test complete!")


if __name__ == "__main__":
    asyncio.run(test_scrape())
