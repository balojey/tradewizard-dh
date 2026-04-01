# Order Modal - Buy/Sell Implementation

## Overview

The OrderPlacementModal has been comprehensively updated to handle both BUY and SELL operations, providing a unified interface for all trading actions in TradeWizard.

## Key Features Added

### 1. Buy/Sell Toggle
- **Dynamic Order Side Selection**: Users can switch between buying more shares and selling existing positions
- **Conditional Display**: Toggle only appears when user has existing positions
- **Visual Feedback**: Different colors and animations for buy vs sell modes

### 2. Position Validation
- **Sell Limits**: Prevents users from selling more shares than they own
- **Real-time Validation**: Checks position size against order size
- **Clear Error Messages**: Informative feedback when validation fails

### 3. Enhanced UI/UX

#### Header Updates
- Shows "Buying" or "Selling" context
- Displays owned share count for sell orders
- Dynamic color schemes based on order type

#### Form Enhancements
- **Buy Mode**: Dollar amount quick buttons ($10, $50, $100, $500)
- **Sell Mode**: Percentage quick buttons (25%, 50%, 75%, 100%)
- Context-aware labels and placeholders

#### Order Summary
- **Buy Orders**: Shows total cost, potential ROI, and payout projections
- **Sell Orders**: Shows total proceeds, realized P&L, and cost basis comparison

### 4. Technical Implementation

#### Props Added
```typescript
orderSide?: "BUY" | "SELL"
userPosition?: {
  size: number;
  avgPrice: number;
} | null
```

#### Components Updated
- `OrderPlacementModal`: Main modal with buy/sell logic
- `OrderForm`: Handles different input modes and validation
- `OrderSummary`: Shows appropriate calculations for each order type
- `Positions`: Now uses modal for selling instead of direct API calls

#### Helper Utilities
- `positionHelpers.ts`: Utility functions for position lookups and validation
- Clean separation of concerns between position management and UI

## Usage Examples

### Buy Order (New Shares)
```typescript
<OrderPlacementModal
  isOpen={true}
  onClose={handleClose}
  marketTitle="Will Trump win 2024?"
  outcome="Yes"
  currentPrice={0.65}
  tokenId="0x123..."
  orderSide="BUY"
  userPosition={null}
  clobClient={clobClient}
/>
```

### Sell Order (Existing Position)
```typescript
<OrderPlacementModal
  isOpen={true}
  onClose={handleClose}
  marketTitle="Will Trump win 2024?"
  outcome="Yes"
  currentPrice={0.65}
  tokenId="0x123..."
  orderSide="SELL"
  userPosition={{ size: 100, avgPrice: 0.45 }}
  clobClient={clobClient}
/>
```

## Integration Points

### Market Cards
- Buy orders triggered from outcome buttons
- Automatically detects user positions for buy/sell toggle

### Position Management
- Sell orders now use the unified modal
- Consistent UX across all trading interfaces

### Order Processing
- Uses existing `useClobOrder` hook
- Supports both market and limit orders for buy/sell
- Proper error handling and validation

## Benefits

1. **Unified Experience**: Single modal for all trading operations
2. **Better UX**: Context-aware interface with appropriate controls
3. **Safety**: Position validation prevents overselling
4. **Flexibility**: Supports both market and limit orders for selling
5. **Consistency**: Same look and feel across buy and sell operations

## Future Enhancements

- Advanced order types (stop-loss, take-profit)
- Batch selling across multiple positions
- Portfolio-level position management
- Integration with AI trading recommendations