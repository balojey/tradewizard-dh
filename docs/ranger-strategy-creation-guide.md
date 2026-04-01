# Ranger Earn — Strategy Creation Guide

> Source: [docs.ranger.finance](https://docs.ranger.finance)

This guide covers everything you need to create, configure, and operate a yield-generating strategy on Ranger Earn — from prerequisites through to going live.

---

## Table of Contents

1. [What Is Ranger Earn?](#1-what-is-ranger-earn)
2. [Key Concepts](#2-key-concepts)
3. [Prerequisites](#3-prerequisites)
4. [Phase 1 — Create Your Vault](#4-phase-1--create-your-vault)
5. [Phase 2 — Set Up LP Token Metadata](#5-phase-2--set-up-lp-token-metadata)
6. [Phase 3 — Add Adaptors & Initialize Strategies](#6-phase-3--add-adaptors--initialize-strategies)
7. [Phase 4 — Allocate Funds](#7-phase-4--allocate-funds)
8. [Phase 5 — Automate Operations](#8-phase-5--automate-operations)
9. [Phase 6 — Monitor Your Vault](#9-phase-6--monitor-your-vault)
10. [Phase 7 — Go to Market](#10-phase-7--go-to-market)
11. [Fee Structure & Accounting](#11-fee-structure--accounting)
12. [Updating Vault Configuration](#12-updating-vault-configuration)
13. [Deployed Program Addresses](#13-deployed-program-addresses)
14. [Reference Links](#14-reference-links)

---

## 1. What Is Ranger Earn?

Ranger Earn is an on-chain yield infrastructure protocol on Solana. It lets vault managers create smart contract vaults that accept single-asset deposits (e.g. USDC, SOL) and deploy those funds into one or more DeFi strategies to generate yield. Depositors receive LP tokens representing their proportional share of the vault.

### The Vault Lifecycle

1. Users deposit assets → receive LP tokens
2. Vault managers allocate funds into DeFi protocols via adaptors
3. Yield is automatically compounded and tracked
4. Managers rebalance between protocols as yields shift
5. Profits and losses are reflected in LP token value

---

## 2. Key Concepts

### Vault
An on-chain smart contract that accepts a single asset, manages LP token issuance, and routes funds to strategies.

### Adaptor
An on-chain program that knows how to interact with a specific category of DeFi protocol (e.g. the Kamino adaptor handles all Kamino interactions). Adaptors are modular and permissionless.

### Strategy
A specific deployment target within an adaptor — e.g. "lend USDC on Kamino Main Market." A vault can have multiple strategies across multiple adaptors.

> **Important**: Vault creation ≠ Strategy initialization. A newly created vault has no strategies and cannot earn yield until strategies are initialized.

### Idle vs. Deployed Funds

| Type | Description |
|------|-------------|
| Idle Funds | Assets in the vault's idle token account — not earning yield |
| Deployed Funds | Assets actively working in strategies (lending, trading, LP) |
| Total Assets | Sum of idle + deployed funds |

Fund flow:
```
User Deposits → Vault Idle Account → Strategy Accounts
Strategy Accounts → Vault Idle Account → User Withdrawals
```

### Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| Admin | Add/remove adaptors, initialize strategies, update vault config, calibrate high water mark |
| Manager | Allocate funds between strategies, claim protocol rewards |

---

## 3. Prerequisites

### 3.1 SOL for Fees
You need approximately **0.15 SOL** for vault creation (account rent) plus additional SOL for ongoing transaction fees (strategy initialization, fund allocation, etc.).

### 3.2 Solana RPC Endpoint
A reliable RPC endpoint is required for all on-chain operations. Recommended providers:
- [Helius](https://helius.dev/)
- [Triton](https://triton.one/)
- [QuickNode](https://quicknode.com/)

### 3.3 Admin and Manager Keypairs
Keep these separate — admin controls vault structure, manager controls fund allocation.

### 3.4 Asset Token Mint Address
Know the SPL token mint your vault will accept. Example — USDC mainnet mint:
```
EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
```

### 3.5 SDK Installation
```bash
npm install @voltr/vault-sdk @solana/web3.js @coral-xyz/anchor @solana/spl-token
```

---

## 4. Phase 1 — Create Your Vault

You can create a vault via the UI (fastest) or via the SDK (full control).

### Option A: Via UI

1. Navigate to [vaults.ranger.finance/create](https://vaults.ranger.finance/create)
2. Connect your wallet
3. Fill in vault parameters (name, fees, cap, etc.)
4. Click "Initialize Vault" and approve the transaction
5. Save the vault public key — you'll need it for everything else

After creation, manage your vault at:
```
https://vaults.ranger.finance/manage/<VAULT_PUBKEY>
```

From the manage page you can view/add/remove adaptors and update vault configuration.

> Note: Strategy initialization and fund allocation require the SDK or protocol-specific scripts — the UI does not cover these steps.

### Option B: Via SDK

#### Step 1 — Import dependencies
```typescript
import { BN } from "@coral-xyz/anchor";
import { VaultConfig, VaultParams, VoltrClient } from "@voltr/vault-sdk";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import fs from "fs";
```

#### Step 2 — Prepare vault configuration
```typescript
const vaultConfig: VaultConfig = {
  maxCap: new BN("18446744073709551615"), // Uncapped (u64 max)
  startAtTs: new BN(0),                   // 0 = activate immediately
  lockedProfitDegradationDuration: new BN(86400), // 24 hours in seconds
  managerPerformanceFee: 1000,  // 10% in basis points
  adminPerformanceFee: 500,     // 5% in basis points
  managerManagementFee: 50,     // 0.5% in basis points
  adminManagementFee: 25,       // 0.25% in basis points
  redemptionFee: 10,            // 0.1% in basis points
  issuanceFee: 10,              // 0.1% in basis points
  withdrawalWaitingPeriod: new BN(0), // 0 = immediate withdrawals
};

const vaultParams: VaultParams = {
  config: vaultConfig,
  name: "My Ranger Earn Vault",          // Max 32 characters
  description: "Short vault description", // Max 64 characters
};
```

#### Step 3 — Define variables and load keypairs
```typescript
const adminKp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("/path/to/admin.json", "utf-8")))
);
const managerKp = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync("/path/to/manager.json", "utf-8")))
);

const vaultKp = Keypair.generate(); // Generate a new vault keypair
const connection = new Connection("your-solana-rpc-url");
const client = new VoltrClient(connection);
```

#### Step 4 — Create and send the vault initialization transaction
```typescript
const createVaultIx = await client.createInitializeVaultIx(
  vaultParams,
  {
    vault: vaultKp,
    vaultAssetMint: new PublicKey("your-asset-mint-address"),
    admin: adminKp.publicKey,
    manager: managerKp.publicKey,
    payer: adminKp.publicKey,
  }
);

const txSig = await sendAndConfirmTransaction(
  [createVaultIx],
  connection,
  [adminKp, vaultKp]
);

console.log("Vault created:", vaultKp.publicKey.toBase58());
console.log("Transaction:", txSig);
```

> **Save your vault public key** — it is required for all subsequent operations.

### Vault Account Structure

```typescript
interface Vault {
  name: string;           // Max 32 bytes
  description: string;    // Max 64 bytes
  asset: {
    mint: PublicKey;      // Token mint address
    idleAuth: PublicKey;  // Idle token authority
    totalValue: BN;       // Total assets in vault
  };
  vaultConfiguration: {
    maxCap: BN;
    startAtTs: BN;
    lockedProfitDegradationDuration: BN;
    withdrawalWaitingPeriod: BN;
  };
  feeConfiguration: {
    managerPerformanceFee: number; // In basis points
    adminPerformanceFee: number;
    managerManagementFee: number;
    adminManagementFee: number;
    redemptionFee: number;
    issuanceFee: number;
  };
  admin: PublicKey;
  manager: PublicKey;
}
```

---

## 5. Phase 2 — Set Up LP Token Metadata

When users deposit into your vault they receive LP tokens. Without metadata, wallets display them as "Unknown Token." Setting metadata is required before token verification on Jupiter.

### Step 1 — Host a metadata JSON file

Host a JSON file at a publicly accessible URL:
```json
{
  "name": "My Vault LP",
  "symbol": "mvLP",
  "description": "LP token for My Vault on Ranger Earn",
  "image": "https://your-domain.com/vault-logo.png"
}
```

Hosting options:

| Option | Pros | Cons |
|--------|------|------|
| GitHub repository | Free, version controlled | Public repo required |
| Arweave/IPFS | Permanent, decentralized | Small cost, immutable |
| Your own domain | Full control | Requires hosting |

### Step 2 — Attach metadata on-chain
```typescript
const metadataIx = await client.createCreateLpMetadataIx(
  {
    name: "My Vault LP",
    symbol: "mvLP",
    uri: "https://your-domain.com/metadata.json",
  },
  {
    vault: new PublicKey("your-vault-pubkey"),
    admin: adminKp.publicKey,
    payer: adminKp.publicKey,
  }
);

await sendAndConfirmTransaction([metadataIx], connection, [adminKp]);
```

---

## 6. Phase 3 — Add Adaptors & Initialize Strategies

This is a two-step process: first add the adaptor program to your vault, then initialize each specific strategy.

### Available Adaptors

| Adaptor | Program ID | Protocols |
|---------|-----------|-----------|
| Lending Adaptor | `aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz` | Kamino, Marginfi, Save, Drift Spot, Jupiter Lend |
| Drift Adaptor | `EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP` | Drift Protocol (Lend + Perps) |
| Kamino Adaptor | `to6Eti9CsC5FGkAtqiPphvKD2hiQiLsS8zWiDBqBPKR` | Kamino Vaults, Kamino Lending Market |
| Raydium Adaptor | `A5a3Xo2JaKbXNShSHHP4Fe1LxcxNuCZs97gy3FJMSzkM` | All Raydium CLMM Pools |
| Jupiter Adaptor | `EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM` | SPL-Tokens (Jupiter Swap), Jupiter Lend |
| Trustful Adaptor | `3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ` | Centralised Exchanges (CEX, OTC, MPC) |

### Available Strategy Types

| Strategy Type | Adaptor | Protocols |
|--------------|---------|-----------|
| Lending | Lending Adaptor | Kamino, Marginfi, Save, Drift Spot, Jupiter Lend |
| Drift Perps/JLP | Drift Adaptor | Drift Protocol |
| Raydium CLMM | Raydium Adaptor | Raydium |
| Off-chain | Trustful Adaptor | CEX, OTC, MPC |

### Step 1 — Add the Adaptor (one-time per adaptor type)
```typescript
import { VoltrClient } from "@voltr/vault-sdk";
import {
  Connection, Keypair, PublicKey, sendAndConfirmTransaction,
} from "@solana/web3.js";

const connection = new Connection("your-rpc-url");
const client = new VoltrClient(connection);

const vault = new PublicKey("your-vault-pubkey");
const adaptorProgramId = new PublicKey("adaptor-program-id"); // from table above

const addAdaptorIx = await client.createAddAdaptorIx({
  vault,
  admin: adminKp.publicKey,
  payer: adminKp.publicKey,
  adaptorProgram: adaptorProgramId,
});

await sendAndConfirmTransaction([addAdaptorIx], connection, [adminKp]);
console.log("Adaptor added");
```

> You can also add adaptors via the manage page UI at `vaults.ranger.finance/manage/<VAULT_PUBKEY>`.

### Step 2 — Initialize the Strategy

Strategy initialization is protocol-specific. Each protocol requires different remaining accounts and an `instructionDiscriminator`.

#### Generic initialization pattern (Lending Adaptor example)
```typescript
import { VoltrClient, SEEDS, LENDING_ADAPTOR_PROGRAM_ID } from "@voltr/vault-sdk";

// Derive the strategy PDA from the counterparty token account
const counterPartyTa = new PublicKey("protocol-token-account");

const [strategy] = PublicKey.findProgramAddressSync(
  [SEEDS.STRATEGY, counterPartyTa.toBuffer()],
  LENDING_ADAPTOR_PROGRAM_ID
);

const initStrategyIx = await client.createInitializeStrategyIx(
  {},
  {
    payer: adminKp.publicKey,
    vault,
    manager: adminKp.publicKey,
    strategy,
    remainingAccounts: [
      { pubkey: protocolProgram, isSigner: false, isWritable: false },
      // Additional protocol-specific accounts...
    ],
  }
);

await sendAndConfirmTransaction([initStrategyIx], connection, [adminKp]);
```

#### Required account structure for strategy initialization

1. **Core Accounts**: `payer`, `vault`, `manager`, `strategy`, `protocolProgram`
2. **Protocol-Specific Accounts**: protocol state accounts, token accounts and authorities, system accounts (RENT, etc.)

### Protocol-Specific Initialization Scripts

Use the official scripts for each protocol — they handle the correct remaining accounts automatically:

| Protocol / Adaptor | Initialization Scripts |
|--------------------|----------------------|
| Kamino Adaptor | [Kamino Vault](https://github.com/voltrxyz/kamino-scripts/blob/main/src/scripts/manager-initialize-kvault.ts), [Kamino Lending Market](https://github.com/voltrxyz/kamino-scripts/blob/main/src/scripts/manager-initialize-market.ts) |
| Drift Adaptor | [Drift Lend](https://github.com/voltrxyz/drift-scripts/blob/main/src/scripts/manager-init-earn.ts), [Drift Perps](https://github.com/voltrxyz/drift-scripts/blob/main/src/scripts/manager-init-user.ts) |
| Jupiter Adaptor | [Spot via Jupiter Swap](https://github.com/voltrxyz/spot-scripts/blob/main/src/scripts/manager-initialize-spot.ts), [Jupiter Lend](https://github.com/voltrxyz/spot-scripts/blob/main/src/scripts/manager-initialize-earn.ts) |
| Trustful Adaptor | [Centralised Exchanges](https://github.com/voltrxyz/trustful-scripts/blob/main/src/scripts/manager-initialize-arbitrary.ts) |

### Best Practices for Strategy Initialization
- Choose strategies that match your vault's asset (e.g. USDC vault → USDC lending strategies)
- A vault can have multiple strategies across multiple adaptors
- Initialize all strategies before allocating funds

---

## 7. Phase 4 — Allocate Funds

Once strategies are initialized, the manager can deploy idle funds into them.

### Prerequisites for Allocation
- Manager keypair with SOL for transaction fees
- Manager role confirmed on the vault (`vault.manager === managerKp.publicKey`)
- At least one initialized strategy

### Setup
```typescript
import {
  Connection, Keypair, PublicKey, TransactionInstruction,
} from "@solana/web3.js";
import { VoltrClient, LENDING_ADAPTOR_PROGRAM_ID, SEEDS } from "@voltr/vault-sdk";
import { BN } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

const managerKp = Keypair.fromSecretKey(/* ... */);
const connection = new Connection("your-rpc-url");
const client = new VoltrClient(connection);
const vault = new PublicKey("your-vault-address");
const vaultAssetMint = new PublicKey("your-asset-mint");
```

### Depositing Funds into a Strategy

#### Step 1 — Account setup
```typescript
const counterPartyTa = new PublicKey("protocol-token-account");

const [strategy] = PublicKey.findProgramAddressSync(
  [SEEDS.STRATEGY, counterPartyTa.toBuffer()],
  LENDING_ADAPTOR_PROGRAM_ID
);

const { vaultStrategyAuth } = client.findVaultStrategyAddresses(vault, strategy);

const vaultStrategyAssetAta = getAssociatedTokenAddressSync(
  vaultAssetMint,
  vaultStrategyAuth,
  true
);

let transactionIxs: TransactionInstruction[] = [];

// Create ATA if it doesn't exist yet
try {
  await getAccount(connection, vaultStrategyAssetAta);
} catch {
  transactionIxs.push(
    createAssociatedTokenAccountInstruction(
      managerKp.publicKey,
      vaultStrategyAssetAta,
      vaultStrategyAuth,
      vaultAssetMint
    )
  );
}
```

#### Step 2 — Create deposit instruction
```typescript
const depositAmount = new BN("1000000"); // 1 USDC = 1_000_000 (6 decimals)

const depositIx = await client.createDepositStrategyIx(
  { depositAmount },
  {
    manager: managerKp.publicKey,
    vault,
    vaultAssetMint,
    assetTokenProgram: TOKEN_PROGRAM_ID,
    strategy,
    remainingAccounts: [
      { pubkey: counterPartyTa, isSigner: false, isWritable: true },
      { pubkey: protocolProgram, isSigner: false, isWritable: false },
      // Additional protocol-specific accounts...
    ],
  }
);

transactionIxs.push(depositIx);
await sendAndConfirmOptimisedTx(transactionIxs, "your-rpc-url", managerKp);
```

### Withdrawing Funds from a Strategy

#### Step 1 — Account setup
```typescript
const counterPartyTaAuth = await getAccount(connection, counterPartyTa, "confirmed")
  .then((account) => account.owner);

let transactionIxs: TransactionInstruction[] = [];
// Create ATA if needed (same pattern as deposit)
```

#### Step 2 — Create withdrawal instruction
```typescript
const withdrawAmount = new BN("500000"); // 0.5 USDC

const withdrawIx = await client.createWithdrawStrategyIx(
  { withdrawAmount },
  {
    manager: managerKp.publicKey,
    vault,
    vaultAssetMint,
    assetTokenProgram: TOKEN_PROGRAM_ID,
    strategy,
    remainingAccounts: [
      { pubkey: counterPartyTaAuth, isSigner: false, isWritable: true },
      { pubkey: counterPartyTa, isSigner: false, isWritable: true },
      { pubkey: protocolProgram, isSigner: false, isWritable: false },
    ],
  }
);

transactionIxs.push(withdrawIx);
await sendAndConfirmOptimisedTx(transactionIxs, "your-rpc-url", managerKp);
```

### Protocol-Specific Deposit/Withdraw Scripts

| Protocol / Adaptor | Deposit Scripts | Withdraw Scripts |
|--------------------|----------------|-----------------|
| Kamino Adaptor | [Kamino Vault](https://github.com/voltrxyz/kamino-scripts/blob/main/src/scripts/manager-deposit-kvault.ts), [Kamino Market](https://github.com/voltrxyz/kamino-scripts/blob/main/src/scripts/manager-deposit-market.ts) | [Kamino Vault](https://github.com/voltrxyz/kamino-scripts/blob/main/src/scripts/manager-withdraw-kvault.ts), [Kamino Market](https://github.com/voltrxyz/kamino-scripts/blob/main/src/scripts/manager-withdraw-market.ts) |
| Drift Adaptor | [Drift Lend](https://github.com/voltrxyz/drift-scripts/blob/main/src/scripts/manager-deposit-earn.ts), [Drift Perps](https://github.com/voltrxyz/drift-scripts/blob/main/src/scripts/manager-deposit-user.ts) | [Drift Lend](https://github.com/voltrxyz/drift-scripts/blob/main/src/scripts/manager-withdraw-earn.ts), [Drift Perps](https://github.com/voltrxyz/drift-scripts/blob/main/src/scripts/manager-withdraw-user.ts) |
| Jupiter Adaptor | [Jupiter Swap](https://github.com/voltrxyz/spot-scripts/blob/main/src/scripts/manager-buy-spot.ts), [Jupiter Lend](https://github.com/voltrxyz/spot-scripts/blob/main/src/scripts/manager-deposit-earn.ts) | [Jupiter Swap](https://github.com/voltrxyz/spot-scripts/blob/main/src/scripts/manager-sell-spot.ts), [Jupiter Lend](https://github.com/voltrxyz/spot-scripts/blob/main/src/scripts/manager-withdraw-earn.ts) |
| Trustful Adaptor | [CEX](https://github.com/voltrxyz/trustful-scripts/blob/main/src/scripts/manager-deposit-arbitrary.ts) | [CEX](https://github.com/voltrxyz/trustful-scripts/blob/main/src/scripts/manager-withdraw-arbitrary.ts) |

### Allocation Best Practices
- **Keep idle reserves**: Never deploy 100% of funds — leave a buffer for user withdrawals
- **Batch operations**: Combine ATA creation and allocation in a single transaction
- **Monitor allocations**: Track how funds are distributed across strategies
- **Automate**: Use bots/scripts for regular rebalancing

### Allocation Troubleshooting

| Issue | Solution |
|-------|----------|
| Transaction too large | Use Lookup Tables |
| Insufficient funds | Check idle balance, ensure enough SOL for gas |
| Authority error | Verify manager keypair matches vault's manager field |
| ATA not found | Create the ATA before the allocation instruction |

---

## 8. Phase 5 — Automate Operations

Vault operations require automation for optimal performance. Manual management will miss yield opportunities and leave rewards uncollected.

### Why Automation Is Needed

| Task | Why It Needs Automation |
|------|------------------------|
| Rebalancing | Yield rates change frequently; manual rebalancing misses optimal allocations |
| Reward claiming | Protocol rewards accrue continuously; manual claiming leaves value uncollected |
| Reward swapping | Claimed reward tokens need to be swapped to base asset to compound |
| Position monitoring | Raydium CLMM positions go out-of-range; Drift positions need risk monitoring |
| Fee harvesting | Accumulated fees should be harvested periodically |

### Script Repositories

| Repository | Use Case |
|-----------|----------|
| [lend-scripts](https://github.com/voltrxyz/lend-scripts) | Lending strategy init (Project0, Save) |
| [kamino-scripts](https://github.com/voltrxyz/kamino-scripts) | Kamino strategy init, rewards claiming |
| [drift-scripts](https://github.com/voltrxyz/drift-scripts) | Drift vaults/lend/perps strategy init, position management |
| [spot-scripts](https://github.com/voltrxyz/spot-scripts) | Jupiter Swap/Lend strategy init |
| [client-raydium-clmm-scripts](https://github.com/voltrxyz/client-raydium-clmm-scripts) | Raydium CLMM strategy init |
| [trustful-scripts](https://github.com/voltrxyz/trustful-scripts) | Trustful adaptor strategy init |
| [rebalance-bot-template](https://github.com/voltrxyz/rebalance-bot-template) | Production-ready rebalance bot |

### Rebalance Bot Template (Recommended)

The [rebalance-bot-template](https://github.com/voltrxyz/rebalance-bot-template) is a production-ready bot that handles the core automation tasks. It distributes funds equally across lending strategies on a fixed schedule and includes:

- **Rebalance loop** — equal-weight allocation across all strategies, triggered on interval and on new deposits
- **Refresh loop** — keeps on-chain receipt values up to date
- **Harvest fee loop** — collects protocol/admin/manager fees
- **Claim reward loops** — claims Kamino farm rewards and swaps them back via Jupiter

Supports Drift, Jupiter Lend, Kamino Market, and Kamino Vault strategies out of the box.

```bash
git clone https://github.com/voltrxyz/rebalance-bot-template.git
cd rebalance-bot-template
pnpm install
cp .env.example .env   # fill in your vault addresses and keypair
pnpm run build && pnpm start
```

### Basic Rebalancing Script Pattern
```typescript
import { VoltrClient } from "@voltr/vault-sdk";
import { Connection, Keypair } from "@solana/web3.js";

async function main() {
  const connection = new Connection(process.env.RPC_URL!);
  const client = new VoltrClient(connection);

  const managerKp = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(process.env.MANAGER_KEY!))
  );

  // 1. Check current allocations
  const vaultData = await client.getVault(vaultPubkey);
  const idleBalance = vaultData.asset.totalValue;

  // 2. Check strategy yields (via API or protocol SDKs)
  // 3. Determine optimal allocation
  // 4. Execute rebalance transactions

  console.log("Rebalance complete");
}

main().catch(console.error);
```

### Automation Key Considerations
- **Gas budget**: Ensure your manager wallet has enough SOL for all automated transactions — monitor and top up regularly
- **Error handling**: Scripts should handle transaction failures gracefully (retry logic, alerting)
- **Rate limiting**: Respect RPC provider rate limits — use exponential backoff on failures
- **Idempotency**: Design scripts to be safely re-runnable in case of partial failures

---

## 9. Phase 6 — Monitor Your Vault

### Ranger Earn API

The Ranger Earn API provides read-only endpoints for querying vault data. Recommended for dashboards and user-facing applications.

- **Base URL**: `https://api.voltr.xyz`
- **Full docs**: [api.voltr.xyz/docs](https://api.voltr.xyz/docs)

> Note: API services are only available for indexed vaults. Contact the Ranger team to get your vault enabled.

### SDK Query Methods

Use SDK queries when you need real-time data or data not available through the API.

```typescript
import { VoltrClient } from "@voltr/vault-sdk";
import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection("your-rpc-url");
const client = new VoltrClient(connection);
const vault = new PublicKey("your-vault-address");

// Vault state
const vaultData = await client.getVault(vault);
console.log("Total assets:", vaultData.asset.totalValue.toString());

// Fee information
const adminFees = await client.getAccumulatedAdminFeesForVault(vault);
const managerFees = await client.getAccumulatedManagerFeesForVault(vault);

// High water mark
const hwm = await client.getHighWaterMarkForVault(vault);
console.log("Highest asset per LP:", hwm.highestAssetPerLp);

// Current share price
const assetPerLp = await client.getCurrentAssetPerLpForVault(vault);

// LP supply breakdown
const lpBreakdown = await client.getVaultLpSupplyBreakdown(vault);
console.log("Circulating LP:", lpBreakdown.circulating.toString());
console.log("Unharvested fees:", lpBreakdown.unharvestedFees.toString());
console.log("Total LP:", lpBreakdown.total.toString());
```

### Recommended Monitoring Approach

| Use Case | Recommended Tool |
|----------|-----------------|
| Dashboard / UI showing vault data | Ranger Earn API |
| Monitoring vault APY over time | Ranger Earn API |
| User deposit/withdraw UI | Ranger Earn API |
| Checking fees before harvesting | SDK (real-time) |
| Automation scripts (rebalancing) | SDK |

### Key Metrics to Track
- **Share price trend** — is the vault generating positive yield?
- **Total assets vs. idle assets** — what percentage is deployed vs. idle?
- **APY** — is performance meeting expectations?
- **Fee accumulation** — are fees ready to harvest?
- **Strategy health** — are all strategies performing as expected?

### Recommended Alert Triggers
- Share price decreasing (potential loss event)
- Idle balance dropping below threshold (withdrawal pressure)
- Strategy returning errors
- SOL balance running low on admin/manager wallets

---

## 10. Phase 7 — Go to Market

### Go-To-Market Checklist

- [ ] Vault created with correct configuration
- [ ] LP token metadata set up (name, symbol, logo)
- [ ] Strategies initialized and funds allocated
- [ ] Automation running (rebalancing, reward claiming)
- [ ] LP token verified on Jupiter to avoid wallet warnings
- [ ] Contact Ranger team for indexing and listing

### Token Verification on Jupiter

Verifying your LP token on Jupiter prevents wallet warnings and makes your token discoverable on aggregators. Prerequisites:
- LP token metadata must be set up first
- Token must be active on-chain

### Indexing & Listing on Ranger

Contact the Ranger team to get your vault indexed and listed on the Ranger Earn platform. Tips for a smooth listing:
- Ensure your LP token has proper metadata
- Verify your LP token on Jupiter
- Have automation running before requesting listing

---

## 11. Fee Structure & Accounting

Fee parameters are configured at vault creation and can be updated by the admin at any time.

### Fee Types

| Fee | Trigger | Description |
|-----|---------|-------------|
| Performance Fee | On profit realization | Charged only on profits exceeding the high water mark |
| Management Fee | Continuously (time-based) | Charged as a percentage of AUM over time |
| Issuance Fee | On user deposit | Deducted from LP tokens minted to depositor |
| Redemption Fee | On user withdrawal | Deducted from assets returned to withdrawer |

### High Water Mark

Fees are only applied to profits that exceed the vault's historical peak (high water mark). This protects depositors from paying fees on recovered losses.

```
Eligible Profit = (current_asset_per_lp - high_water_mark) × total_shares
                  (only when current > high water mark, else 0)
```

### Locked Profit

To prevent sandwich attacks on gains, newly realized profit is initially locked and degrades over time:

```
Locked Profit = ((degradation_duration - time_elapsed) / degradation_duration) × previous_locked_profit
```

### Fee Splitting

Performance fees are split between admin and manager proportionally to their configured basis points:

```
Admin Share  = fee_amount × (admin_bps / (admin_bps + manager_bps))
Manager Share = fee_amount - admin_share
```

### Issuance Fee Formula
```
LP Minted = (deposit_amount × (10000 - issuance_fee_bps) / 10000) × (total_lp_supply / total_assets)
```

### Redemption Fee Formula
```
Assets Received = proportional_assets × (10000 - redemption_fee_bps) / 10000
```

### Harvesting Fees via SDK
```typescript
const harvestIx = await client.createHarvestFeeIx({
  harvester: harvesterPubkey,
  vaultManager: vaultManagerPubkey,
  vaultAdmin: vaultAdminPubkey,
  protocolAdmin: protocolAdminPubkey,
  vault: vaultPubkey,
});
```

### Calibrating the High Water Mark
```typescript
// Admin can reset the performance fee baseline
const calibrateIx = await client.createCalibrateHighWaterMarkIx({
  vault: vaultPubkey,
  admin: adminPubkey,
});
```

---

## 12. Updating Vault Configuration

After creation, the admin can update most configuration parameters. The vault name, description, and asset mint are immutable.

### What Can Be Updated

| Parameter | Updatable | Updated By |
|-----------|-----------|-----------|
| Max cap | Yes | Admin |
| Locked profit degradation duration | Yes | Admin |
| Withdrawal waiting period | Yes | Admin |
| Performance fees (admin/manager) | Yes | Admin |
| Management fees (admin/manager) | Yes | Admin |
| Issuance fee | Yes | Admin |
| Redemption fee | Yes | Admin |
| Manager | Yes | Admin |
| Vault name | No | — |
| Vault description | No | — |
| Asset mint | No | — |

### Via UI
```
https://vaults.ranger.finance/manage/<VAULT_PUBKEY>
```
Connect with the admin wallet and use the configuration update form.

### Via SDK

The `createUpdateVaultConfigIx` method updates one field at a time using the `VaultConfigField` enum.

#### Update a fee (u16 field)
```typescript
import { VaultConfigField } from "@voltr/vault-sdk";

const newFee = 1500; // 15% in basis points
const feeData = Buffer.alloc(2);
feeData.writeUInt16LE(newFee, 0);

const updateFeeIx = await client.createUpdateVaultConfigIx(
  VaultConfigField.ManagerPerformanceFee,
  feeData,
  { vault, admin: adminKp.publicKey }
);

await sendAndConfirmTransaction([updateFeeIx], connection, [adminKp]);
```

#### Update max cap (u64 field)
```typescript
const newMaxCap = new BN("1000000000000"); // 1M USDC (6 decimals)
const data = newMaxCap.toArrayLike(Buffer, "le", 8);

const updateMaxCapIx = await client.createUpdateVaultConfigIx(
  VaultConfigField.MaxCap,
  data,
  { vault, admin: adminKp.publicKey }
);
```

#### Update manager (PublicKey field)
```typescript
const newManager = new PublicKey("new-manager-pubkey");
const managerData = newManager.toBuffer();

const updateManagerIx = await client.createUpdateVaultConfigIx(
  VaultConfigField.Manager,
  managerData,
  { vault, admin: adminKp.publicKey }
);
```

### VaultConfigField Serialization Reference

| Field | Data Type | Serialization |
|-------|-----------|--------------|
| `MaxCap` | u64 | `new BN(value).toArrayLike(Buffer, "le", 8)` |
| `StartAtTs` | u64 | `new BN(value).toArrayLike(Buffer, "le", 8)` |
| `LockedProfitDegradationDuration` | u64 | `new BN(value).toArrayLike(Buffer, "le", 8)` |
| `WithdrawalWaitingPeriod` | u64 | `new BN(value).toArrayLike(Buffer, "le", 8)` |
| `ManagerPerformanceFee` | u16 | `Buffer.alloc(2); buf.writeUInt16LE(value, 0)` |
| `AdminPerformanceFee` | u16 | `Buffer.alloc(2); buf.writeUInt16LE(value, 0)` |
| `ManagerManagementFee` | u16 | `Buffer.alloc(2); buf.writeUInt16LE(value, 0)` |
| `AdminManagementFee` | u16 | `Buffer.alloc(2); buf.writeUInt16LE(value, 0)` |
| `RedemptionFee` | u16 | `Buffer.alloc(2); buf.writeUInt16LE(value, 0)` |
| `IssuanceFee` | u16 | `Buffer.alloc(2); buf.writeUInt16LE(value, 0)` |
| `Manager` | PublicKey | `new PublicKey("...").toBuffer()` |

---

## 13. Deployed Program Addresses

All programs are deployed on Solana Mainnet:

| Program | Address |
|---------|---------|
| Vault | `vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8` |
| Lending Adaptor | `aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz` |
| Drift Adaptor | `EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP` |
| Raydium Adaptor | `A5a3Xo2JaKbXNShSHHP4Fe1LxcxNuCZs97gy3FJMSzkM` |
| Kamino Adaptor | `to6Eti9CsC5FGkAtqiPphvKD2hiQiLsS8zWiDBqBPKR` |
| Jupiter Adaptor | `EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM` |
| Trustful Adaptor | `3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ` |

**Upgrade Authority (Multi-sig)**: `7p4d84NuXbuDhaAq9H3Yp3vpBSDLQWousp1a4jBVoBgU`

---

## 14. Reference Links

| Resource | URL |
|----------|-----|
| Ranger Earn Docs | https://docs.ranger.finance |
| Vault SDK Docs | https://voltrxyz.github.io/vault-sdk/ |
| Vault Creation UI | https://vaults.ranger.finance/create |
| Vault Manage UI | https://vaults.ranger.finance/manage/<VAULT_PUBKEY> |
| Ranger Earn API | https://api.voltr.xyz |
| API Docs | https://api.voltr.xyz/docs |
| Base Scripts | https://github.com/voltrxyz/base-scripts |
| Rebalance Bot Template | https://github.com/voltrxyz/rebalance-bot-template |
| Kamino Scripts | https://github.com/voltrxyz/kamino-scripts |
| Drift Scripts | https://github.com/voltrxyz/drift-scripts |
| Jupiter/Spot Scripts | https://github.com/voltrxyz/spot-scripts |
| Lend Scripts | https://github.com/voltrxyz/lend-scripts |
| Raydium CLMM Scripts | https://github.com/voltrxyz/client-raydium-clmm-scripts |
| Trustful Scripts | https://github.com/voltrxyz/trustful-scripts |
