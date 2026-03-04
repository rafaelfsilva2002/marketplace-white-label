# Crypto Rails Design — Marketplace FTM

> **Task**: 3.1 Crypto rails (Ethereum/Polygon/Solana)
> **Date**: 2026-03-03
> **Status**: Approved

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Custody model | Hybrid MPC via provider | Security + UX balance |
| Provider | Dfns | Cost-effective, API-first, good TS SDK |
| Chains | Ethereum + Polygon + Solana | Full coverage from day 1 |
| Use case | Payments + On/Off ramp | Both crypto payments and BRL conversion |
| Balance model | Dual wallet | BRL (existing) + crypto balances per token |
| Architecture | CryptoGateway abstraction | Adapter pattern, swap providers without code changes |

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  NestJS API                      │
│  ┌───────────────────────────────────────────┐  │
│  │           CryptoModule                     │  │
│  │  ┌──────────┐  ┌───────────┐  ┌────────┐ │  │
│  │  │ Crypto   │  │ Crypto    │  │ OnOff  │ │  │
│  │  │Controller│  │ Service   │  │ Ramp   │ │  │
│  │  └──────────┘  └─────┬─────┘  │Service │ │  │
│  │                      │        └────┬───┘ │  │
│  └──────────────────────┼─────────────┼─────┘  │
│                         │             │         │
│  ┌──────────────────────▼─────────────▼─────┐  │
│  │          CryptoGateway (Interface)        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌────────────┐ │  │
│  │  │  Dfns   │ │  Mock   │ │  Future    │ │  │
│  │  │ Adapter │ │ Adapter │ │  Adapter   │ │  │
│  │  └─────────┘ └─────────┘ └────────────┘ │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │                          │
    ┌────▼────┐              ┌──────▼──────┐
    │  Dfns   │              │  Existing   │
    │  API    │              │  Wallet +   │
    │ (MPC)   │              │  Ledger     │
    └─────────┘              └─────────────┘
```

### Components

1. **CryptoGateway** (`packages/crypto-gateway/`) — monorepo package
   - `CryptoGatewayInterface` — contract
   - `DfnsAdapter` — Dfns SDK implementation
   - `MockAdapter` — tests and local dev

2. **CryptoModule** (`apps/api/src/modules/crypto/`) — NestJS module
   - `CryptoController` — REST endpoints
   - `CryptoService` — orchestrates gateway + wallet/ledger
   - `OnOffRampService` — BRL<->crypto conversion

3. **Integration with existing system:**
   - Same outbox pattern for events
   - Same audit log with correlationId
   - Same fee model (10% platform)
   - Crypto balances parallel to BRL wallet

---

## Data Model

### Updated: crypto_wallets

```sql
CREATE TABLE crypto_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,              -- 'ethereum' | 'polygon' | 'solana'
  address TEXT NOT NULL,
  dfns_wallet_id TEXT UNIQUE,       -- Dfns MPC wallet ID
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, chain)
);
```

### Updated: crypto_transactions

```sql
CREATE TABLE crypto_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES crypto_wallets(id) ON DELETE CASCADE,
  tx_hash TEXT,
  chain TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  amount TEXT NOT NULL,              -- BigNumber string
  token TEXT NOT NULL,               -- 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC'
  token_decimals INT DEFAULT 18,
  amount_brl INT,                    -- equivalent BRL in cents at tx time
  status TEXT DEFAULT 'pending',     -- pending | confirming | confirmed | failed | reverted
  block_number INT,
  confirmations INT DEFAULT 0,
  required_confirmations INT DEFAULT 12,
  gas_fee TEXT,
  dfns_transfer_id TEXT,
  idempotency_key TEXT UNIQUE,
  correlation_id UUID,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### New: crypto_balances

```sql
CREATE TABLE crypto_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,               -- 'USDT' | 'USDC' | 'ETH' | 'MATIC' | 'SOL'
  chain TEXT NOT NULL,
  balance TEXT NOT NULL DEFAULT '0', -- BigNumber string
  version INT DEFAULT 1,            -- optimistic locking
  updated_at TIMESTAMP DEFAULT now(),
  UNIQUE(user_id, token, chain)
);
```

### New: crypto_ledger

```sql
CREATE TABLE crypto_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  token TEXT NOT NULL,
  chain TEXT NOT NULL,
  type TEXT NOT NULL,                -- 'credit' | 'debit'
  amount TEXT NOT NULL,              -- BigNumber string
  balance_before TEXT NOT NULL,
  balance_after TEXT NOT NULL,
  reference_type TEXT,               -- 'payment' | 'withdrawal' | 'ramp_in' | 'ramp_out'
  reference_id UUID,
  idempotency_key TEXT UNIQUE,
  correlation_id UUID,
  created_at TIMESTAMP DEFAULT now()
);
```

---

## API Endpoints

```typescript
// Crypto Wallet Management
POST   /crypto/wallets                    // Create MPC wallet (Dfns) for chain
GET    /crypto/wallets                    // List user wallets (all chains)
GET    /crypto/wallets/:chain             // Wallet detail by chain

// Crypto Balances
GET    /crypto/balances                   // Balances per token/chain
GET    /crypto/balances/:token            // Specific token balance

// Crypto Payments (user -> professional)
POST   /crypto/payments                   // Initiate crypto payment
GET    /crypto/payments/:id               // Payment status
GET    /crypto/payments/history           // Transaction history

// On/Off Ramp
POST   /crypto/ramp/quote                // BRL<->crypto quote
POST   /crypto/ramp/buy                  // Buy crypto with BRL (on-ramp)
POST   /crypto/ramp/sell                 // Sell crypto for BRL (off-ramp)

// Withdrawals
POST   /crypto/withdraw                  // Withdraw crypto to external wallet
```

---

## CryptoGateway Interface

```typescript
export interface CryptoGateway {
  // Wallet Management
  createWallet(params: CreateWalletParams): Promise<CryptoWallet>;
  getWallet(walletId: string): Promise<CryptoWallet>;
  getBalance(address: string, chain: Chain, token?: string): Promise<TokenBalance>;

  // Transactions
  transfer(params: TransferParams): Promise<TransferResult>;
  getTransferStatus(transferId: string): Promise<TransferStatus>;

  // On/Off Ramp
  getQuote(params: QuoteParams): Promise<RampQuote>;
  executeRamp(params: RampParams): Promise<RampResult>;
}

export type Chain = 'ethereum' | 'polygon' | 'solana';
export type Token = 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';

export interface TransferParams {
  fromWalletId: string;
  toAddress: string;
  chain: Chain;
  token: Token;
  amount: string;           // BigNumber
  idempotencyKey: string;
  correlationId: string;
}
```

---

## Payment Flow (Crypto)

```
1. User: POST /crypto/payments
   { profileId, amount: "100", token: "USDT", chain: "polygon" }

2. CryptoService:
   - Validate user has USDT balance >= 100
   - Calculate fee: 10 USDT (10% platform)
   - Professional receives: 90 USDT

3. CryptoGateway.transfer():
   - Dfns: user wallet -> platform wallet (100 USDT)
   - Dfns: platform wallet -> professional wallet (90 USDT)
   - Platform retains 10 USDT fee

4. Database (in transaction):
   - crypto_ledger: debit user 100 USDT
   - crypto_ledger: credit professional 90 USDT
   - crypto_balances: update both
   - crypto_transactions: record tx
   - outbox: 'marketplace.crypto_payment.succeeded'

5. EventDispatcher polls and dispatches event
```

---

## On/Off Ramp Flow

```
ON-RAMP (BRL -> Crypto):
1. User: POST /crypto/ramp/quote { from: "BRL", to: "USDT", amount: 100 }
2. Get exchange rate from API (Mercado Bitcoin / Binance)
3. Return quote: { rate, amount_crypto, fees, expires_at }
4. User: POST /crypto/ramp/buy { quoteId }
5. Debit BRL wallet -> credit crypto balance

OFF-RAMP (Crypto -> BRL):
1. Professional: POST /crypto/ramp/sell { token: "USDT", amount: "50" }
2. Get exchange rate
3. Return quote
4. Professional: POST /crypto/ramp/sell { quoteId }
5. Debit crypto balance -> credit BRL wallet
```

---

## Key Patterns

- **Idempotency**: All crypto operations use idempotency keys (same as BRL wallet)
- **Optimistic locking**: crypto_balances.version field (same as wallets)
- **Outbox pattern**: All crypto events go through outbox
- **CorrelationId**: Tracked through all operations
- **Audit log**: All crypto operations logged
- **BigNumber**: All crypto amounts as strings to avoid precision loss
