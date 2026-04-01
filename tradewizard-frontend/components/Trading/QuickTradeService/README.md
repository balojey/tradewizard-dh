# Quick Trade Service

The Quick Trade Service provides users with a streamlined way to execute trades based on AI recommendations with optimal entry and target zones.

## Features

### AI-Powered Trading Zones
- **Entry Zone**: Optimal price range for entering positions (BUY orders)
- **Target Zone**: Expected price targets for profit-taking (SELL orders)
- **Current Price**: Real-time market price with zone context (BUY orders)

### Smart Order Placement
- Pre-fills order modal with AI-recommended prices
- **Entry/Current zones**: Create BUY limit orders to enter positions
- **Target zone**: Creates SELL limit orders to take profits (requires existing position)
- **Auto-Target Feature**: Automatically creates sell target orders after successful **market buy orders only**
  - ⚠️ **Important**: Auto-target only works with market orders (immediate execution)
  - Limit orders may not fill immediately, so sell targets cannot be placed until shares are owned
- Visual indicators for optimal trading zones and auto-target status
- Risk warnings for high liquidity markets
- Potential return calculations

### Zone Status Indicators
- **ACTIVE**: Current price is within the AI entry zone
- **Above/Below Entry Zone**: Price context relative to optimal entry
- Color-coded zones (Green for entry, Purple for target, Blue for current)

## Usage

```tsx
import QuickTradeService from "@/components/Trading/QuickTradeService";

<QuickTradeService
  recommendation={aiRecommendation}
  marketTitle="Market Question"
  currentPrice={0.65}
  tokenId="token123"
  negRisk={false}
  outcomes={["Yes", "No"]}
  disabled={false}
/>
```

## Props

- `recommendation`: AI trade recommendation with entry/target zones
- `marketTitle`: Market question text
- `currentPrice`: Current market price (0-1 range)
- `tokenId`: Polymarket token identifier
- `negRisk`: Whether market uses negative risk tokens
- `outcomes`: Array of possible outcomes
- `disabled`: Whether trading is disabled (geoblocked, etc.)

## Integration

The component integrates with:
- `OrderPlacementModal` for trade execution
- `useTradeRecommendation` hook for AI data
- `TradingProvider` for wallet/client context

## Trade Flow

1. User sees AI recommendation with entry/target zones
2. **Auto-Target Toggle**: User can enable/disable automatic sell target creation (market orders only)
3. **Entry Zone**: Clicks to place BUY limit order at optimal entry price
   - Auto-target NOT available (limit orders may not fill immediately)
4. **Current Price**: Clicks to place BUY market order at current price
   - If auto-target enabled: Automatically creates SELL limit order at target price after buy order
5. **Target Zone**: Clicks to place SELL limit order for profit-taking (requires position)
6. Order modal opens pre-filled with recommended price and correct order side
7. User can toggle auto-target creation in the modal (only enabled for market orders)
8. User adjusts size and confirms trade
9. Order is placed on Polymarket orderbook
10. If auto-target enabled and market buy order successful: Second SELL order placed automatically

## Visual Design

- Gradient backgrounds with zone-specific colors
- Real-time status indicators
- Potential return calculations
- Risk warnings for liquidity issues
- Responsive grid layout for mobile/desktop