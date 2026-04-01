# External Data Sources Setup

This guide covers setting up external data sources for the Advanced Agent League.

## Overview

The Advanced Agent League integrates with external data sources to provide agents with real-time information:

- **News APIs**: Breaking news and media coverage
- **Polling APIs**: Election polling data
- **Social Media APIs**: Social sentiment and discourse

## News APIs

### NewsAPI

**Purpose**: General news aggregation

**Setup**:

1. Sign up at https://newsapi.org
2. Get API key from dashboard
3. Configure in `.env`:

```bash
NEWS_API_PROVIDER=newsapi
NEWS_API_KEY=your_key_here
NEWS_API_CACHE_TTL=900  # 15 minutes
NEWS_API_MAX_ARTICLES=50
```

**Pricing**:
- Free: 100 requests/day
- Developer: $449/month (250,000 requests)
- Business: Custom pricing

**Rate Limits**:
- Free: 100 requests/day
- Developer: 250,000 requests/month

### Perplexity API

**Purpose**: AI-powered news search and summarization

**Setup**:

1. Sign up at https://www.perplexity.ai
2. Get API key from settings
3. Configure in `.env`:

```bash
NEWS_API_PROVIDER=perplexity
PERPLEXITY_API_KEY=your_key_here
NEWS_API_CACHE_TTL=900
NEWS_API_MAX_ARTICLES=20
```

**Pricing**:
- Pay-as-you-go: $0.001 per request
- Pro: $20/month (unlimited)

**Rate Limits**:
- Free: 5 requests/hour
- Pro: Unlimited


### Custom News Aggregator

**Purpose**: Use your own news aggregation service

**Setup**:

1. Implement the `NewsProvider` interface:

```typescript
interface NewsProvider {
  fetchNews(query: string, timeWindow: number): Promise<NewsArticle[]>;
}
```

2. Register your provider:

```typescript
import { registerNewsProvider } from './utils/data-integration';

registerNewsProvider('custom', new CustomNewsProvider());
```

3. Configure in `.env`:

```bash
NEWS_API_PROVIDER=custom
NEWS_API_BASE_URL=https://your-api.com
NEWS_API_KEY=your_key_here
```

## Polling APIs

### FiveThirtyEight

**Purpose**: Election polling aggregation and forecasting

**Setup**:

1. Access via public API (no key required for basic access)
2. Configure in `.env`:

```bash
POLLING_API_PROVIDER=538
POLLING_API_CACHE_TTL=3600  # 1 hour
```

**Data Available**:
- Presidential polls
- Congressional polls
- Governor polls
- Generic ballot polls

**Rate Limits**:
- Public API: 100 requests/hour

**Note**: FiveThirtyEight may require API key for commercial use.

### RealClearPolitics

**Purpose**: Polling averages and political analysis

**Setup**:

1. Access via web scraping (no official API)
2. Configure in `.env`:

```bash
POLLING_API_PROVIDER=rcp
POLLING_API_CACHE_TTL=3600
```

**Data Available**:
- Presidential approval ratings
- Generic congressional ballot
- State-level polls
- International polls

**Rate Limits**:
- Respect robots.txt
- Implement polite scraping (1 request/second)

**Note**: Web scraping may violate terms of service. Use with caution.


### Polymarket Polling Data

**Purpose**: Prediction market-based polling

**Setup**:

1. Use existing Polymarket client
2. Configure in `.env`:

```bash
POLLING_API_PROVIDER=polymarket
POLLING_API_CACHE_TTL=3600
```

**Data Available**:
- Market prices as probability estimates
- Volume-weighted averages
- Historical price data

**Rate Limits**:
- Same as Polymarket API limits

### Custom Polling Provider

**Purpose**: Use your own polling data source

**Setup**:

1. Implement the `PollingProvider` interface:

```typescript
interface PollingProvider {
  fetchPollingData(market: string): Promise<PollingData>;
}
```

2. Register your provider:

```typescript
import { registerPollingProvider } from './utils/data-integration';

registerPollingProvider('custom', new CustomPollingProvider());
```

3. Configure in `.env`:

```bash
POLLING_API_PROVIDER=custom
POLLING_API_BASE_URL=https://your-api.com
POLLING_API_KEY=your_key_here
```

## Social Media APIs

### Twitter/X API

**Purpose**: Social sentiment and viral narrative detection

**Setup**:

1. Apply for Twitter Developer account at https://developer.twitter.com
2. Create app and get API credentials
3. Configure in `.env`:

```bash
SOCIAL_API_PROVIDERS=twitter
TWITTER_API_KEY=your_key_here
TWITTER_API_SECRET=your_secret_here
TWITTER_BEARER_TOKEN=your_token_here
SOCIAL_API_CACHE_TTL=300  # 5 minutes
SOCIAL_API_MAX_MENTIONS=100
```

**Pricing**:
- Free: 1,500 tweets/month
- Basic: $100/month (10,000 tweets/month)
- Pro: $5,000/month (1M tweets/month)

**Rate Limits**:
- Free: 1,500 tweets/month
- Basic: 10,000 tweets/month
- Pro: 1M tweets/month


### Reddit API

**Purpose**: Community sentiment and discussion analysis

**Setup**:

1. Create Reddit app at https://www.reddit.com/prefs/apps
2. Get client ID and secret
3. Configure in `.env`:

```bash
SOCIAL_API_PROVIDERS=reddit
REDDIT_CLIENT_ID=your_client_id
REDDIT_CLIENT_SECRET=your_secret
REDDIT_USER_AGENT=TradeWizard/1.0
SOCIAL_API_CACHE_TTL=300
SOCIAL_API_MAX_MENTIONS=100
```

**Pricing**:
- Free: 100 requests/minute
- Premium: Contact Reddit for enterprise pricing

**Rate Limits**:
- Free: 60 requests/minute
- OAuth: 100 requests/minute

### Multiple Social Providers

**Purpose**: Aggregate sentiment across platforms

**Setup**:

Configure multiple providers:

```bash
SOCIAL_API_PROVIDERS=twitter,reddit
TWITTER_API_KEY=your_key
REDDIT_CLIENT_ID=your_id
# ... other credentials
```

The system will:
- Fetch data from all configured providers
- Aggregate sentiment across platforms
- Weight by platform volume and reliability

## Data Integration Configuration

### Caching Strategy

Configure cache TTLs based on data freshness requirements:

```bash
# Fast-moving data (social media)
SOCIAL_API_CACHE_TTL=300  # 5 minutes

# Medium-moving data (news)
NEWS_API_CACHE_TTL=900  # 15 minutes

# Slow-moving data (polling)
POLLING_API_CACHE_TTL=3600  # 1 hour
```

### Rate Limiting

Configure rate limits to stay within API quotas:

```bash
# Requests per minute
NEWS_API_RATE_LIMIT=10
POLLING_API_RATE_LIMIT=5
SOCIAL_API_RATE_LIMIT=20
```

The system implements token bucket algorithm for rate limiting.


### Fallback Strategy

Configure fallback behavior when data sources are unavailable:

```bash
# Use stale cached data as fallback
DATA_INTEGRATION_USE_STALE_CACHE=true

# Maximum staleness (seconds)
DATA_INTEGRATION_MAX_STALENESS=7200  # 2 hours

# Skip agents if no data available
DATA_INTEGRATION_SKIP_ON_UNAVAILABLE=true
```

## Testing Data Integration

### Test News API

```bash
npm run cli -- test-data-source news --query "election 2026"
```

### Test Polling API

```bash
npm run cli -- test-data-source polling --market "presidential-election"
```

### Test Social API

```bash
npm run cli -- test-data-source social --query "candidate X"
```

### Test All Sources

```bash
npm run cli -- test-data-sources --all
```

## Monitoring

### Data Source Health

Monitor data source availability:

```typescript
// Check data source status
const status = await checkDataSourceHealth();

console.log(status);
// {
//   news: { available: true, latency: 150, lastFetch: 1234567890 },
//   polling: { available: true, latency: 200, lastFetch: 1234567890 },
//   social: { available: false, error: 'Rate limit exceeded' }
// }
```

### Cache Statistics

Monitor cache performance:

```typescript
// Get cache statistics
const stats = getCacheStatistics();

console.log(stats);
// {
//   news: { hits: 150, misses: 50, hitRate: 0.75 },
//   polling: { hits: 80, misses: 20, hitRate: 0.80 },
//   social: { hits: 200, misses: 100, hitRate: 0.67 }
// }
```

### Rate Limit Status

Monitor rate limit usage:

```typescript
// Check rate limit status
const limits = getRateLimitStatus();

console.log(limits);
// {
//   news: { used: 80, limit: 100, resetAt: 1234567890 },
//   polling: { used: 45, limit: 60, resetAt: 1234567890 },
//   social: { used: 95, limit: 100, resetAt: 1234567890 }
// }
```


## Best Practices

### API Key Security

1. **Never commit API keys** to version control
2. **Use environment variables** for all credentials
3. **Rotate keys regularly** (quarterly recommended)
4. **Use separate keys** for dev/staging/production
5. **Monitor key usage** for unauthorized access

### Cost Optimization

1. **Enable caching** with appropriate TTLs
2. **Set rate limits** to avoid overages
3. **Monitor API usage** via provider dashboards
4. **Use free tiers** for development
5. **Batch requests** when possible

### Reliability

1. **Implement fallback** to cached data
2. **Handle rate limits** gracefully
3. **Retry failed requests** with exponential backoff
4. **Monitor data source health**
5. **Alert on prolonged outages**

### Data Quality

1. **Validate data** against expected schemas
2. **Filter low-quality** or irrelevant data
3. **Flag stale data** in agent signals
4. **Monitor data freshness**
5. **Review data quality** regularly

## Troubleshooting

### API Connection Failures

**Symptoms**: Unable to fetch data from external source

**Causes**:
- Invalid API key
- Network connectivity issues
- API service outage
- Rate limit exceeded

**Solutions**:
1. Verify API key configuration
2. Check network connectivity
3. Review API provider status page
4. Check rate limit status
5. Use cached data as fallback

### Stale Data

**Symptoms**: Data is outdated

**Causes**:
- Cache TTL too long
- API source not updating
- Fallback to old cached data

**Solutions**:
1. Reduce cache TTL
2. Verify API source is updating
3. Clear cache and refetch
4. Check data source health

### Rate Limit Exceeded

**Symptoms**: API requests failing with 429 errors

**Causes**:
- Too many requests
- Rate limit configuration too high
- Multiple instances sharing key

**Solutions**:
1. Reduce request rate
2. Increase cache TTL
3. Upgrade API plan
4. Use separate keys per instance
5. Implement request queuing

## Support

For data integration issues:
- Review this documentation
- Check API provider documentation
- Monitor data source health
- Review Opik traces for errors
- Check application logs

---

**Last Updated:** January 2026

