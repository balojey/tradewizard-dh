# Closed Markets Feature

## Overview

The closed markets feature enables users to view and analyze resolved prediction markets to validate AI recommendation accuracy. This is crucial for building trust in the TradeWizard AI system.

## Key Components

### 1. API Enhancement (`/api/polymarket/markets`)
- Added `include_closed` parameter to fetch closed markets from Gamma API
- Enhanced filtering logic to handle both open and closed markets
- Improved sorting to prioritize open markets while showing closed markets by resolution date

### 2. Market Resolution Utilities (`utils/marketResolution.ts`)
- `enhanceMarketsWithResolutionData()`: Adds resolution data to closed markets
- `getResolutionStatus()`: Determines market resolution status
- `hasResolutionData()`: Checks if market has clear resolution outcome

### 3. UI Components

#### ResolutionBadge (`components/Trading/Markets/ResolutionBadge.tsx`)
- Shows resolution status for closed markets
- Displays winning outcome (Yes/No) with appropriate colors
- Includes resolution date when available

#### RecommendationAccuracy (`components/Trading/Markets/RecommendationAccuracy.tsx`)
- **Key Feature**: Compares AI recommendations against actual outcomes
- Shows "AI Correct" (green) when recommendation matched result
- Shows "AI Missed" (red) when recommendation was wrong
- Shows "AI Neutral" (yellow) for avoid/hold recommendations
- Displays confidence percentage from original recommendation

### 4. Market Status Filter Enhancement
- Updated `useMarkets` hook to accept `marketStatus` parameter
- Modified query key to include market status for proper caching
- Enhanced API calls to fetch closed markets when needed

## User Experience

### Market Status Filter
Users can now filter markets by:
- **Active** (Default): Shows only open, tradeable markets
- **All Markets**: Shows both open and closed markets
- **Closed**: Shows only resolved markets
- **Ending Soon**: Shows markets ending within 7 days

### Default Behavior
- **Active markets are shown by default** to focus users on tradeable opportunities
- Users can switch to "All" or "Closed" to analyze historical performance
- This provides the best user experience for active traders

### Closed Market Display
- **Resolution Badge**: Clear indication of market outcome
- **AI Accuracy Badge**: Shows whether AI recommendation was correct
- **Disabled Trading**: Outcome buttons are disabled for closed markets
- **Historical Context**: Users can see how AI performed on past markets

## Technical Implementation

### Data Flow
```
1. User selects "Closed" or "All" filter
2. Frontend passes marketStatus to useMarkets hook
3. Hook adds include_closed=true to API request
4. API fetches closed markets from Gamma API
5. Markets enhanced with resolution data
6. UI displays resolution badges and accuracy indicators
```

### Resolution Data Detection
Currently uses final market prices to determine winners (price > 0.9 = winner). In production, this could be enhanced with:
- CLOB API integration for official resolution data
- UMA Oracle resolution status
- Direct blockchain resolution queries

## Benefits for TradeWizard

1. **Trust Building**: Users can verify AI accuracy on historical markets
2. **Performance Tracking**: Clear metrics on AI recommendation success rate
3. **Learning Opportunity**: Users can analyze why certain predictions succeeded/failed
4. **Transparency**: Full visibility into AI performance over time

## Future Enhancements

1. **Accuracy Metrics Dashboard**: Aggregate AI performance statistics
2. **Resolution Timeline**: Show market resolution process and timing
3. **Recommendation History**: Track how AI recommendations evolved over time
4. **Performance Analytics**: Detailed breakdowns by market category, time period, etc.