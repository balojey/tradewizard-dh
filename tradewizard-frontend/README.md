# TradeWizard Frontend

> Next.js 16 web application for AI-powered prediction market trading on Polymarket

## Overview

TradeWizard transforms prediction markets from speculative guessing into guided, intelligence-driven trading. The frontend provides a Bloomberg Terminal-style interface featuring AI-powered trade recommendations, real-time market data, and seamless trading execution.

### Key Features

- 🤖 **AI-Powered Recommendations**: Multi-agent analysis with explainable reasoning
- 📊 **Market Intelligence**: Real-time pricing, analytics, and trend analysis
- 💰 **Seamless Trading**: Direct Polymarket CLOB API integration
- 🔐 **Secure Wallets**: Magic Link authentication with Safe multi-sig deployment
- 📈 **Professional Analytics**: Bloomberg Terminal-style market interface
- ⚡ **Real-time Updates**: Supabase subscriptions for live data

## Quick Start

### Prerequisites

- Node.js 18+
- Supabase account with TradeWizard database
- Magic Link API key
- Polymarket API access

### Setup (5 minutes)

```bash
# 1. Install dependencies
cd tradewizard-frontend
npm install

# 2. Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys

# 3. Generate database types
npx supabase gen types typescript --local > lib/database.types.ts

# 4. Start development server
npm run dev
```

Visit `http://localhost:3000`

### Environment Variables

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Magic Link
NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY=your_magic_publishable_key

# Polymarket
NEXT_PUBLIC_POLYMARKET_API_URL=https://clob.polymarket.com
```

## Tech Stack

### Core
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS 4
- **State Management**: React Query (@tanstack/react-query)

### Web3 & Authentication
- **Wallet**: Magic Link SDK for email-based authentication
- **Blockchain**: ethers.js v5 and viem
- **Trading**: @polymarket/clob-client for order execution
- **Smart Contracts**: Safe for multi-sig wallet deployment

### Data & UI
- **Database**: Supabase with real-time subscriptions
- **Visualization**: Recharts for charts
- **Icons**: Lucide React
- **Animations**: Framer Motion
- **Validation**: Zod for runtime type checking

## Architecture

### Data Flow

```
TradeWizard Agents (Backend)
    ↓ (Stores recommendations)
Supabase Database
    ↓ (Real-time queries)
Frontend Hooks (React Query)
    ↓ (Caching & updates)
UI Components
    ↓ (User interaction)
Polymarket CLOB API
    ↓ (Order execution)
Blockchain
```

### Database Integration

The frontend connects to the same Supabase database as the backend:

```typescript
// Key Tables
- markets: Market metadata and analysis status
- recommendations: AI-generated trade recommendations
- agent_signals: Individual agent analysis results
- analysis_history: Audit trail of analysis runs
```

### Project Structure

```
tradewizard-frontend/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page
│   ├── markets/           # Market discovery pages
│   ├── analysis/          # Analysis pages
│   └── api/               # API routes
├── components/
│   ├── Trading/           # Trading components
│   │   ├── Markets/       # Market discovery
│   │   ├── TradeRecommendation/  # AI recommendations
│   │   ├── Orders/        # Order management
│   │   └── Positions/     # Position tracking
│   └── shared/            # Reusable UI components
├── hooks/                 # Custom React hooks
├── lib/                   # Utilities (Supabase, Magic, etc.)
├── providers/             # React context providers
├── types/                 # TypeScript types
├── utils/                 # Pure utility functions
└── styles/                # Global styles
```

## Key Features

### AI Recommendation Integration

The frontend seamlessly integrates with TradeWizard agents backend:

1. **Automatic Loading**: Recommendations fetched when viewing markets
2. **Real-time Updates**: React Query caching with background updates
3. **Detailed Analysis**: Full breakdown of agent reasoning, catalysts, risks
4. **Visual Indicators**: Clear action signals (BUY YES, BUY NO, NO TRADE) with expected value

**Usage:**

```typescript
import { useTradeRecommendation } from '@/hooks/useTradeRecommendation';

export function MarketCard({ conditionId }: { conditionId: string }) {
  const { data: recommendation, isLoading } = useTradeRecommendation(conditionId);
  
  return (
    <div>
      {isLoading && <LoadingState />}
      {recommendation && (
        <RecommendationBadge 
          action={recommendation.action}
          expectedValue={recommendation.expectedValue}
        />
      )}
    </div>
  );
}
```

### Market Intelligence

- **Smart Filtering**: Filter by categories, tags, market status
- **Trend Analysis**: Volume and liquidity trending
- **Event Grouping**: Related markets grouped by events
- **Real-time Pricing**: Live bid/ask spreads and mid prices

### Trading Execution

- **One-Click Trading**: Direct integration from recommendations to orders
- **Risk Management**: Liquidity risk assessment and position sizing
- **Order Management**: Track active orders and positions
- **Safe Integration**: Secure multi-sig wallet deployment

## Development

### Custom Hooks

```typescript
// Fetch AI recommendation for a market
useTradeRecommendation(conditionId: string)

// Batch fetch multiple recommendations
useMultipleRecommendations(conditionIds: string[])

// Market discovery with filtering
useMarkets(options: MarketFilterOptions)

// Complete trading session management
useTradingSession()

// Authenticated Polymarket CLOB client
useClobClient()

// User API credentials derivation
useUserApiCredentials()
```

### Component Patterns

**Smart Components** (data fetching):
```typescript
export function MarketList() {
  const { data: markets } = useMarkets();
  return <MarketGrid markets={markets} />;
}
```

**Presentation Components** (pure UI):
```typescript
export function MarketCard({ market }: { market: Market }) {
  return <div>{market.question}</div>;
}
```

**Shared Components** (reusable):
```typescript
<Card>
  <Badge variant="success">BUY YES</Badge>
  <LoadingState />
</Card>
```

### Build & Development

```bash
# Development with hot-reload
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Linting
npm run lint

# Type checking
npm run type-check
```

## Integration with Backend

The frontend works seamlessly with TradeWizard agents:

1. **Shared Database**: Both use same Supabase instance
2. **Real-time Sync**: Frontend reflects backend analysis results automatically
3. **Type Safety**: Shared TypeScript types ensure consistency
4. **Graceful Degradation**: Handles missing recommendations gracefully

### Backend Workflow

When a market is analyzed by the backend:

1. Backend fetches market data from Polymarket
2. Agents analyze in parallel (news, sentiment, polling, etc.)
3. Results stored in Supabase `recommendations` table
4. Frontend subscribes to real-time updates
5. UI automatically displays new recommendations

## Deployment

### Vercel (Recommended)

```bash
# Deploy to Vercel
vercel deploy

# Set environment variables in Vercel dashboard
```

### Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t tradewizard-frontend .
docker run -p 3000:3000 --env-file .env.local tradewizard-frontend
```

### Environment-Specific Configuration

**Development:**
```bash
NEXT_PUBLIC_LOG_LEVEL=debug
NEXT_PUBLIC_ENABLE_DEVTOOLS=true
```

**Production:**
```bash
NEXT_PUBLIC_LOG_LEVEL=info
NEXT_PUBLIC_ENABLE_DEVTOOLS=false
```

## Code Quality

### Standards

- TypeScript strict mode (no `any` types)
- ESLint + Prettier for formatting
- Proper error handling and loading states
- Async operation handling with React Query
- Real Supabase data for testing

### Testing

```bash
# Run tests
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Supabase connection fails | Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Magic Link not working | Check `NEXT_PUBLIC_MAGIC_PUBLISHABLE_KEY` and network connectivity |
| Recommendations not loading | Verify backend is running and storing recommendations in Supabase |
| Real-time updates not working | Check Supabase real-time subscriptions are enabled |
| Type errors after schema changes | Regenerate types: `npx supabase gen types typescript --local > lib/database.types.ts` |

## Documentation

### Core Documentation
- **[Next.js Documentation](https://nextjs.org/docs)** - Framework reference
- **[Tailwind CSS](https://tailwindcss.com/docs)** - Styling guide
- **[React Query](https://tanstack.com/query/latest)** - Data fetching
- **[Supabase](https://supabase.com/docs)** - Database and auth

### Integration Guides
- **[Magic Link Setup](https://magic.link/docs)** - Wallet authentication
- **[Polymarket CLOB API](https://docs.polymarket.com/)** - Trading API
- **[ethers.js](https://docs.ethers.org/v5/)** - Web3 library
- **[viem](https://viem.sh/)** - Modern Ethereum utilities

## Contributing

1. Follow established component patterns
2. Use TypeScript strictly (no `any` types)
3. Implement proper error handling
4. Add loading states for async operations
5. Test with real Supabase data
6. Update documentation for new features

## License

This project is part of the TradeWizard platform for AI-powered prediction market trading.

---

**Built with ❤️ using Next.js and Supabase**
