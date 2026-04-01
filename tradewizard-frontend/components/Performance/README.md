# Performance Dashboard

The Performance Dashboard provides comprehensive analytics on TradeWizard's AI recommendation accuracy for resolved prediction markets. This dashboard serves as a critical tool for quantifying the reliability and effectiveness of the multi-agent analysis system over time.

## Overview

The dashboard tracks and visualizes:
- **Win Rate**: Percentage of correct recommendations
- **ROI Performance**: Actual returns on investment for recommendations
- **Agent Performance**: Individual agent accuracy and signal quality
- **Category Analysis**: Performance breakdown by market categories
- **Temporal Trends**: Performance evolution over time

## Key Components

### 1. PerformanceMetrics.tsx
Displays high-level performance statistics including:
- Overall win rate with visual gauge
- Average ROI with trend indicators
- Edge capture analysis
- Performance by confidence level
- Trade direction breakdown (LONG_YES vs LONG_NO vs NO_TRADE)

### 2. PerformanceFilters.tsx
Provides filtering capabilities:
- **Timeframe**: All time, 30d, 90d, 1y
- **Category**: Filter by market event types
- **Confidence**: High, moderate, low confidence recommendations
- **Limit**: Number of markets to display

### 3. ClosedMarketsList.tsx
Detailed list of resolved markets showing:
- Market question and outcome
- Recommendation details (direction, confidence, entry zones)
- Performance metrics (ROI, edge captured)
- AI analysis explanation
- Agent consensus information
- Timeline from recommendation to resolution

### 4. PerformanceCharts.tsx
Visual analytics including:
- Monthly performance trends
- Category performance comparison
- Performance distribution across market types
- Simple bar charts for key metrics

### 5. AgentPerformanceTable.tsx
Agent-specific performance analysis:
- Individual agent win rates
- Signal accuracy vs recommendation accuracy
- Agent confidence and probability estimates
- Performance ranking and comparison
- Agent type categorization (event intelligence, polling, sentiment, etc.)

## Data Architecture

### Database Schema
The performance tracking relies on several key tables:

#### recommendation_outcomes
Tracks the performance of each recommendation against actual market outcomes:
- `recommendation_was_correct`: Boolean indicating if the recommendation was accurate
- `roi_realized`: Actual return on investment if the trade was executed
- `edge_captured`: Difference between fair probability and actual outcome
- `market_probability_at_recommendation`: Market price when recommendation was made

#### Performance Views
Several database views aggregate performance data:
- `v_performance_summary`: Overall performance statistics
- `v_performance_by_confidence`: Performance breakdown by confidence level
- `v_performance_by_agent`: Individual agent performance metrics
- `v_monthly_performance`: Temporal performance trends
- `v_closed_markets_performance`: Detailed closed market data with performance

### API Endpoints

#### `/api/tradewizard/performance`
Main endpoint for performance data with query parameters:
- `timeframe`: Filter by time period
- `category`: Filter by market category
- `confidence`: Filter by confidence level
- `limit`: Number of results to return

Returns comprehensive performance data including:
- Closed markets with performance metrics
- Aggregated performance summaries
- Agent performance breakdowns
- Monthly trends
- Category analysis

## Key Metrics Explained

### Win Rate
Percentage of recommendations that were correct based on actual market outcomes:
- **LONG_YES**: Correct if market resolved to YES
- **LONG_NO**: Correct if market resolved to NO
- **NO_TRADE**: Always considered "correct" (conservative approach)

### ROI (Return on Investment)
Calculated return assuming $100 investment at recommended entry price:
- **Winning trades**: Profit based on entry price vs resolution
- **Losing trades**: -$100 (full loss)
- **NO_TRADE**: $0 (no position taken)

### Edge Captured
Measures how much of the theoretical probability advantage was realized:
- Positive edge: AI probability estimate was better than market price
- Negative edge: Market was more accurate than AI estimate

### Agent Signal Accuracy
Individual agent performance separate from final recommendations:
- Tracks each agent's directional predictions
- Compares agent confidence with actual outcomes
- Identifies best-performing agent types

## Usage Patterns

### For Traders
- Assess overall system reliability before following recommendations
- Identify which confidence levels and categories perform best
- Understand historical performance trends
- Evaluate agent consensus as a signal quality indicator

### For System Operators
- Monitor AI system performance over time
- Identify underperforming agents or categories
- Track cost-effectiveness of recommendations
- Validate model improvements through A/B testing

### For Researchers
- Analyze prediction market efficiency
- Study multi-agent consensus formation
- Evaluate different agent architectures
- Measure information value of various data sources

## Performance Calculation Logic

### Automatic Updates
The system includes triggers that automatically calculate performance when markets resolve:
- `update_recommendation_outcomes()` function processes newly resolved markets
- Trigger on markets table updates when status changes to 'resolved'
- ROI calculation based on entry zone midpoint pricing

### Edge Calculation
Edge captured is calculated as:
```
edge = actual_outcome_probability - market_probability_at_recommendation
```
Where actual_outcome_probability is 1.0 for correct predictions, 0.0 for incorrect.

### Confidence Calibration
The dashboard enables analysis of confidence calibration:
- Do "high confidence" recommendations actually perform better?
- Are confidence levels properly calibrated to actual accuracy?
- How does agent consensus correlate with recommendation quality?

## Future Enhancements

### Planned Features
1. **Sharpe Ratio Calculation**: Risk-adjusted returns analysis
2. **Drawdown Analysis**: Maximum loss periods and recovery
3. **Market Efficiency Metrics**: How often AI beats market consensus
4. **Real-time Performance Tracking**: Live updates as markets resolve
5. **Comparative Analysis**: Performance vs other prediction sources
6. **Cost-Benefit Analysis**: LLM costs vs recommendation value

### Advanced Analytics
1. **Prediction Intervals**: Confidence bands around performance estimates
2. **Bayesian Updates**: Dynamic confidence adjustment based on track record
3. **Market Regime Analysis**: Performance in different market conditions
4. **Agent Ensemble Optimization**: Optimal agent weighting strategies

## Technical Implementation

### Performance Considerations
- Database views for efficient aggregation
- Caching of expensive calculations
- Pagination for large result sets
- Optimized queries with proper indexing

### Error Handling
- Graceful degradation when performance data is unavailable
- Fallback to basic metrics if advanced calculations fail
- Clear error states and loading indicators

### Responsive Design
- Mobile-optimized layouts
- Progressive disclosure of detailed information
- Touch-friendly interactions for mobile users

This performance dashboard represents a critical component of TradeWizard's commitment to transparency and continuous improvement in AI-powered prediction market analysis.