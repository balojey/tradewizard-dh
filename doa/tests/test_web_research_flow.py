#!/usr/bin/env python3
"""
Test the full web research agent flow to debug issues.
"""
import asyncio
import json
from tools.serper_client import SerperClient, SerperSearchParams, SerperScrapeParams
from config import load_config


async def test_full_flow():
    """Test search + scrape flow like the agent does."""
    
    # Load config
    config = load_config()
    
    if not config.serper or not config.serper.api_key:
        print("❌ Serper API key not configured")
        return
    
    # Initialize client
    client = SerperClient(config.serper)
    
    print("🔍 Testing Full Web Research Flow\n")
    print("=" * 80)
    
    # Step 1: Search
    print("\n📡 Step 1: Searching for 'Strait of Hormuz crisis 2026'")
    print("-" * 80)
    
    try:
        search_params = SerperSearchParams(
            q="Strait of Hormuz crisis 2026",
            num=3
        )
        search_result = await client.search(search_params)
        
        print(f"✅ Search successful!")
        print(f"   Total results: {len(search_result.organic) if search_result.organic else 0}")
        
        if search_result.organic:
            for i, result in enumerate(search_result.organic[:3], 1):
                print(f"\n   Result {i}:")
                print(f"      Title: {result.title}")
                print(f"      URL: {result.link}")
                print(f"      Snippet: {result.snippet[:100]}...")
            
            # Step 2: Scrape first result
            first_url = search_result.organic[0].link
            print(f"\n\n📄 Step 2: Scraping first result")
            print("-" * 80)
            print(f"   URL: {first_url}")
            
            try:
                scrape_params = SerperScrapeParams(url=first_url)
                scrape_result = await client.scrape(scrape_params)
                
                print(f"\n✅ Scrape successful!")
                print(f"   URL in response: {scrape_result.url}")
                print(f"   Title: {scrape_result.title}")
                print(f"   Text length: {len(scrape_result.text) if scrape_result.text else 0} chars")
                
                if scrape_result.text:
                    preview = scrape_result.text[:300].replace('\n', ' ')
                    print(f"   Text preview: {preview}...")
                
                # Check if URL field exists
                print(f"\n   ✓ URL field present: {scrape_result.url is not None}")
                print(f"   ✓ URL matches request: {scrape_result.url == first_url}")
                
            except Exception as e:
                print(f"\n❌ Scrape failed: {str(e)}")
                print(f"   Error type: {type(e).__name__}")
                import traceback
                traceback.print_exc()
        
    except Exception as e:
        print(f"❌ Search failed: {str(e)}")
        print(f"   Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 80)
    print("✨ Test complete!")


if __name__ == "__main__":
    asyncio.run(test_full_flow())
