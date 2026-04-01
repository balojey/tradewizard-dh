# Recommendation Time Travel Feature

## Overview

The Recommendation Time Travel feature allows users to navigate through historical recommendations for a market, compare them with current recommendations, and analyze potential profit/loss if they had traded on those recommendations.

## Components

### 1. RecommendationHistory.tsx
A compact sidebar component that shows:
- List of historical recommendations with timestamps
- Quick P&L indicators for each recommendation
- Expandable details showing entry/target zones, catalysts, and risks
- Summary statistics (win rate, average return, best return)

### 2. RecommendationTimeTravel.tsx
A comprehensive time travel interface with multiple views:
- **Timeline View**: Navigate through recommendations chronologically
- **Comparison View**: Side-by-side comparison of current vs previous recommendations
- **P&L View**: Detailed profit/loss analysis for all recommendations
- **Analytics View**: Comprehensive performance analytics and trends

### 3. RecommendationAnalytics.tsx
Advanced analytics dashboard showing:
- Performance overview with quality assessment
- Action and confidence distribution charts
- Performance trends and consistency scores
- Risk-adjusted returns and maximum drawdown analysis

## Hooks

### useHistoricalRecommendations
Fetches all historical recommendations for a market with options for:
- Limiting number of results
- Including/excluding agent signals
- Caching and error handling

### usePotentialPnL
Calculates potential profit/loss for historical recommendations based on:
- Entry price from recommendation zones
- Current market price
- Time held since recommendation
- Annualized returns

### useRecommendationComparison
Compares current recommendation with previous ones to identify:
- Action changes
- Probability deltas
- New/removed catalysts and risks
- Confidence level changes

### useRecommendationCount
Utility hook to determine if time travel features should be shown:
- Counts total recommendations for a market
- Returns boolean for showing time travel UI
- Used for conditional rendering

## Data Flow

```
Supabase Database
├── markets (condition_id → market_id mapping)
├── recommendations (historical recommendation data)
├── agent_signals (individual agent outputs)
└── analysis_history (execution metadata)
                ↓
Historical Recommendations Hook
                ↓
P&L Calculation (current price vs historical entry)
                ↓
Time Travel Components (navigation, comparison, analytics)
```

## Key Features

### 1. Time Navigation
- Navigate chronologically through recommendations
- See exact timestamps and relative time ("2 days ago")
- Visual indicators for latest vs historical recommendations

### 2. P&L Analysis
- Calculate potential returns if user had traded on each recommendation
- Show entry price, current price, and potential profit/loss
- Include annualized returns and days held
- Summary statistics across all recommendations

### 3. Recommendation Comparison
- Highlight changes between recommendations
- Show probability deltas and edge changes
- Track new/removed catalysts and risk factors
- Visual indicators for improvements/deteriorations

### 4. Performance Analytics
- Win rate calculation and trending
- Risk-adjusted return metrics
- Action and confidence distribution
- Quality assessment (excellent/good/fair/poor)
- Maximum drawdown analysis

### 5. Conditional Display
- Only show time travel features when multiple recommendations exist
- Graceful handling of markets with no recommendations
- Loading states and error handling

## Usage

The time travel feature is automatically available on market detail pages when:
1. The market has multiple recommendations in the database
2. The recommendations have valid timestamps and pricing data
3. Current market price is available for P&L calculations

Users can:
- Browse historical recommendations in the sidebar
- Access full time travel interface via the "Time Travel" tab
- Compare any two recommendations side-by-side
- Analyze overall recommendation performance
- See potential profits/losses from following AI recommendations

## Technical Implementation

### Database Queries
- Efficient queries using market_id foreign keys
- Proper indexing on created_at for chronological sorting
- Joins with agent_signals for detailed analysis
- Caching with React Query for performance

### P&L Calculations
- Handles both LONG_YES and LONG_NO positions correctly
- Uses midpoint of entry/target zones for calculations
- Accounts for position type when calculating current value
- Includes time-based metrics (days held, annualized returns)

### Performance Optimizations
- Lazy loading of detailed data
- Conditional rendering based on data availability
- Efficient React Query caching strategies
- Minimal re-renders with proper dependency arrays

## Future Enhancements

1. **Interactive Charts**: Visual timeline of recommendation changes
2. **Export Functionality**: Download P&L analysis as CSV/PDF
3. **Backtesting**: Simulate portfolio performance following all recommendations
4. **Alerts**: Notify users when recommendations change significantly
5. **Social Features**: Share interesting recommendation comparisons
6. **Advanced Filters**: Filter by date range, action type, or performance