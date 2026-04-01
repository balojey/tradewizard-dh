# TradeWizard AI-Enhanced Market Details

This directory contains the enhanced market details page with comprehensive AI insights integration. The system transforms raw prediction market data into actionable intelligence through multi-agent analysis.

## Core Components

### Market Details Page (`MarketDetails.tsx`)
The main market details page featuring a tabbed interface with rich AI insights:

- **Overview Tab**: Basic market information and statistics
- **AI Insights Tab**: Comprehensive AI recommendation analysis
- **Sentiment Tab**: Market sentiment analysis from multiple sources
- **Agent Debate Tab**: Multi-agent debate and consensus building
- **Price Chart Tab**: Interactive price history with AI trading zones

### AI Insights Components

#### `AIInsightsPanel.tsx`
Comprehensive AI recommendation display featuring:
- **Recommendation Overview**: Action, expected value, win probability
- **Trading Zones**: Entry and target price ranges
- **Core Thesis**: AI-generated market analysis
- **Key Catalysts**: Factors supporting the recommendation
- **Risk Scenarios**: Potential failure modes
- **Market Intelligence**: Confidence bands, agent consensus, processing metrics

#### `MarketSentimentAnalysis.tsx`
Multi-source sentiment analysis including:
- **Overall Sentiment**: Bullish/bearish/neutral with confidence score
- **Source Breakdown**: News articles, social media, trading activity
- **Sentiment Trends**: 24-hour sentiment evolution
- **Key Mentions**: Recent influential mentions with sentiment classification

#### `PriceHistoryChart.tsx`
Interactive price chart with AI overlays:
- **Price History**: Configurable time ranges (1H, 4H, 1D, 7D, 30D)
- **AI Trading Zones**: Entry zone, target zone, fair price overlays
- **Market Events**: Price-moving events with impact analysis
- **Volume Analysis**: Trading volume correlation with price movements

#### `RealAgentDebatePanel.tsx`
Current agent analysis visualization:
- **Live Agent Positions**: Current recommendation from active agents
- **Consensus Metrics**: Agreement levels and probability estimates
- **Agent Signal Details**: Expandable views of individual agent analyses
- **Agent Positions**: Bull, bear, and neutral agent perspectives
- **Evidence Tracking**: Data sources and evidence weighting
- **Consensus Building**: Agreement levels and dissenting opinions
- **Argument Evolution**: How agent positions change over time

### Supporting Components

#### `AIInsightsBadge.tsx`
Compact badge showing AI insights availability:
- Shows on market cards to indicate AI analysis availability
- Different sizes and detail levels
- Real-time loading states

#### `RecommendationBadge.tsx`
Quick recommendation display:
- Action (BUY YES/NO/NO TRADE)
- Expected value and win probability
- Confidence indicators

## Data Flow Architecture

### 1. Market Data Ingestion
```
Polymarket API → Market Search → Market Details Page
```

### 2. AI Recommendation Pipeline
```
Market Condition ID → Supabase Query → Recommendation + Agent Signals → UI Display
```

### 3. Multi-Agent Analysis
```
Market Data → Agent Analysis → Debate Rounds → Consensus → Final Recommendation
```

## Key Features

### Explainable AI
- Every recommendation traces back to specific data and reasoning
- Agent debate process shows how consensus was reached
- Evidence weighting and source attribution

### Adversarial Reasoning
- Multiple agents with different perspectives (bull, bear, neutral)
- Cross-examination and counter-argument analysis
- Prevents groupthink and overconfidence

### Real-time Updates
- Live price data integration
- Sentiment analysis updates
- Agent recommendation refreshes

### Risk Assessment
- Liquidity risk evaluation
- Uncertainty quantification
- Failure scenario analysis

## Usage Examples

### Basic Market Details
```tsx
import MarketDetails from "@/components/Trading/Markets/MarketDetails";

<MarketDetails market={marketData} />
```

### Standalone AI Insights
```tsx
import AIInsightsPanel from "@/components/Trading/Markets/AIInsightsPanel";

<AIInsightsPanel 
  conditionId={market.conditionId}
  marketPrice={currentPrice}
  volume24h={volume}
  liquidity={liquidity}
/>
```

### Market Card with AI Badge
```tsx
import AIInsightsBadge from "@/components/Trading/Markets/AIInsightsBadge";

<AIInsightsBadge 
  conditionId={market.conditionId} 
  size="sm"
  showDetails={false}
/>
```

## Data Models

### TradeRecommendation
```typescript
interface TradeRecommendation {
  id: string;
  marketId: string;
  action: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  entryZone: [number, number];
  targetZone: [number, number];
  expectedValue: number;
  winProbability: number;
  liquidityRisk: 'low' | 'medium' | 'high';
  explanation: {
    summary: string;
    coreThesis: string;
    keyCatalysts: string[];
    failureScenarios: string[];
    uncertaintyNote?: string;
  };
  metadata: {
    consensusProbability: number;
    marketProbability: number;
    edge: number;
    confidenceBand: [number, number];
    disagreementIndex?: number;
    agentCount?: number;
  };
}
```

### AgentArgument
```typescript
interface AgentArgument {
  id: string;
  agentName: string;
  agentType: 'bull' | 'bear' | 'neutral';
  position: 'LONG_YES' | 'LONG_NO' | 'NO_TRADE';
  confidence: number;
  fairProbability: number;
  keyPoints: string[];
  counterArguments: string[];
  evidence: Evidence[];
}
```

## Performance Considerations

### Caching Strategy
- AI recommendations cached for 5 minutes
- Sentiment data cached for 10 minutes
- Price history cached for 1 minute
- Agent debates cached for 15 minutes

### Loading States
- Skeleton loading for all AI components
- Progressive enhancement (show basic market data first)
- Graceful degradation when AI services unavailable

### Error Handling
- Fallback to basic market data if AI services fail
- Retry logic with exponential backoff
- User-friendly error messages

## Integration Points

### Backend Services
- **TradeWizard Agents**: Multi-agent recommendation engine
- **Supabase**: Recommendation and agent signal storage
- **Polymarket API**: Market data and pricing
- **News APIs**: Sentiment analysis data sources

### Frontend Hooks
- `useTradeRecommendation`: Single recommendation fetching
- `useMarketInsights`: Comprehensive insights aggregation
- `useHasMarketInsights`: Availability checking

## Future Enhancements

### Planned Features
- Real-time agent debate streaming
- Historical recommendation performance tracking
- Custom agent configuration
- Portfolio-level AI insights
- Social sentiment integration
- Options pricing model integration

### Technical Improvements
- WebSocket integration for real-time updates
- Advanced charting with technical indicators
- Mobile-optimized layouts
- Accessibility improvements
- Performance monitoring and optimization

## Development Guidelines

### Adding New AI Components
1. Create component in this directory
2. Follow existing naming conventions
3. Include loading and error states
4. Add TypeScript interfaces
5. Update this README

### Testing Strategy
- Unit tests for data transformation logic
- Integration tests for API interactions
- Visual regression tests for UI components
- Performance tests for large datasets

### Code Quality
- TypeScript strict mode enabled
- ESLint and Prettier configured
- Component prop validation
- Accessibility compliance (WCAG 2.1)