# AML Compliance Design — Marketplace FTM

> **Task**: 3.2 Compliance AML para transacoes cripto
> **Date**: 2026-03-03
> **Status**: Approved

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Hybrid (internal + future provider) | AmlProvider interface, InternalAdapter now, Chainalysis later |
| Screening | Async via BullMQ worker | Avoids sync bottleneck on payment path |
| Blacklists | Database table with CRUD | Hardcoded arrays are fragile, admins need management |
| Travel Rule | Implemented for txs > $1000 | Regulatory requirement for crypto |
| Rate Limiting | Per-user + per-wallet | Multiple wallets per user need independent limits |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    NestJS API                        │
│  ┌───────────────────────────────────────────────┐  │
│  │           AML Compliance Module                │  │
│  │                                                │  │
│  │  ┌──────────┐  ┌───────────┐  ┌────────────┐ │  │
│  │  │AmlCheck  │  │ Review    │  │ SAR        │ │  │
│  │  │Guard     │  │ Queue Svc │  │ Service    │ │  │
│  │  └────┬─────┘  └───────────┘  └────────────┘ │  │
│  │       │                                        │  │
│  │  ┌────▼─────────────────────────────────────┐ │  │
│  │  │        AmlProvider (Interface)            │ │  │
│  │  │  ┌──────────┐  ┌───────────────────────┐ │ │  │
│  │  │  │ Internal │  │ Future: Chainalysis   │ │ │  │
│  │  │  │ Adapter  │  │ Adapter               │ │ │  │
│  │  │  └──────────┘  └───────────────────────┘ │ │  │
│  │  └──────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────▼────────────────────────┐  │
│  │          AML Screening Worker (BullMQ)         │  │
│  │  - Async screening for pending transactions    │  │
│  │  - Cross-check with fraud scores               │  │
│  │  - Auto-generate SARs for high/critical        │  │
│  └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Flow: Async Screening

```
1. User: POST /crypto/payments
2. AmlCheckGuard:
   a. Quick checks (blacklist lookup, basic velocity)
   b. If blacklisted → block immediately (403)
   c. Otherwise → create transaction with status 'pending_aml'
   d. Enqueue AML screening job (BullMQ)
   e. Return { status: 'pending_aml', transactionId }

3. AML Worker processes job:
   a. AmlProvider.screenTransaction() (full screening)
   b. Cross-check with fraud scores (profile risk)
   c. Persist screening result to aml_screenings
   d. If approved + low risk → update tx status 'confirmed', process payment
   e. If requiresManualReview → add to review queue
   f. If critical → block tx, generate SAR, notify admin
   g. Outbox event: 'marketplace.aml.screening_completed'

4. Moderator reviews flagged transactions:
   a. GET /aml/queue → see pending reviews
   b. POST /aml/queue/:id/approve → release payment
   c. POST /aml/queue/:id/reject → refund user
```

---

## Data Model

### New Tables

```sql
-- aml_screenings: persist all screening results
CREATE TABLE aml_screenings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES crypto_transactions(id),
  user_id UUID NOT NULL REFERENCES users(id),
  risk_level TEXT NOT NULL,        -- 'low' | 'medium' | 'high' | 'critical'
  score FLOAT NOT NULL,            -- 0.0 - 1.0
  approved BOOLEAN NOT NULL,
  requires_manual_review BOOLEAN DEFAULT false,
  factors JSONB NOT NULL,          -- [{ type, description, weight }]
  provider TEXT DEFAULT 'internal', -- 'internal' | 'chainalysis' | 'elliptic'
  travel_rule_data JSONB,          -- { originator, beneficiary } for txs > $1000
  correlation_id UUID,
  created_at TIMESTAMP DEFAULT now()
);

-- suspicious_activity_reports: SAR persistence
CREATE TABLE suspicious_activity_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id UUID REFERENCES aml_screenings(id),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_id UUID,
  report_type TEXT NOT NULL,       -- 'auto' | 'manual'
  severity TEXT NOT NULL,          -- 'high' | 'critical'
  summary TEXT NOT NULL,
  details JSONB NOT NULL,
  status TEXT DEFAULT 'pending',   -- 'pending' | 'reviewed' | 'filed' | 'dismissed'
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  filed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

-- aml_review_queue: manual review for flagged transactions
CREATE TABLE aml_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screening_id UUID NOT NULL REFERENCES aml_screenings(id),
  user_id UUID NOT NULL REFERENCES users(id),
  transaction_id UUID,
  reason TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',  -- 'normal' | 'high' | 'urgent'
  status TEXT DEFAULT 'pending',   -- 'pending' | 'in_review' | 'approved' | 'rejected'
  assigned_to UUID REFERENCES users(id),
  notes TEXT,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

-- aml_blacklists: managed blacklisted addresses
CREATE TABLE aml_blacklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address TEXT NOT NULL,
  chain TEXT,                      -- null = all chains
  reason TEXT NOT NULL,
  source TEXT DEFAULT 'manual',    -- 'manual' | 'ofac' | 'chainalysis'
  added_by UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT now(),
  UNIQUE(address, chain)
);

-- aml_rate_limits: per-wallet rate tracking
CREATE TABLE aml_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  chain TEXT NOT NULL,
  tx_count INT DEFAULT 0,
  total_amount_usd FLOAT DEFAULT 0,
  window_start TIMESTAMP DEFAULT now(),
  window_hours INT DEFAULT 24,
  UNIQUE(wallet_address, chain)
);
```

### Update crypto_transactions

```sql
ALTER TABLE crypto_transactions
  ADD COLUMN risk_level TEXT,
  ADD COLUMN aml_screening_id UUID REFERENCES aml_screenings(id),
  ADD COLUMN aml_status TEXT DEFAULT 'pending_aml';
  -- aml_status: 'pending_aml' | 'approved' | 'rejected' | 'manual_review'
```

---

## AmlProvider Interface

```typescript
export const AML_PROVIDER = Symbol('AML_PROVIDER');

export interface AmlProvider {
  screenTransaction(params: ScreeningParams): Promise<ScreeningResult>;
  screenWallet(address: string, chain: Chain): Promise<WalletRiskResult>;
  isBlacklisted(address: string, chain?: Chain): Promise<boolean>;
}

export interface ScreeningParams {
  userId: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  amountUsd: number;
  token: string;
  chain: Chain;
  correlationId: string;
}

export interface ScreeningResult {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  score: number;
  approved: boolean;
  requiresManualReview: boolean;
  factors: RiskFactor[];
  travelRuleRequired: boolean;
}

export interface RiskFactor {
  type: string;
  description: string;
  weight: number;
}

export interface WalletRiskResult {
  address: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  isBlacklisted: boolean;
  factors: RiskFactor[];
}
```

---

## InternalAmlAdapter Screening Logic

```
Score calculation (0.0 - 1.0):

1. Blacklist check          → if match: score = 1.0, block immediately
2. Velocity (per user)      → > 5 txs / 24h: +0.25
3. Velocity (per wallet)    → > 10 txs / 24h: +0.20
4. Large TX                 → > $10,000 USD: +0.20
5. New account              → < 7 days + > $1,000: +0.20
6. Cross-check fraud score  → profile risk > 0.5: +0.15
7. Travel rule trigger      → > $1,000 USD: flag travelRuleRequired

Risk levels:
  - 0.0 - 0.3: low    → approved, no review
  - 0.3 - 0.5: medium → approved, logged
  - 0.5 - 0.7: high   → approved, manual review required, SAR generated
  - 0.7 - 1.0: critical → blocked, SAR generated, admin notified
```

---

## API Endpoints

```typescript
// AML Review Queue (moderator/admin only)
GET    /aml/queue                    // List pending reviews (paginated, filterable)
GET    /aml/queue/:id                // Review detail
POST   /aml/queue/:id/approve        // Approve → releases payment
POST   /aml/queue/:id/reject         // Reject → refunds user
POST   /aml/queue/:id/assign         // Assign to moderator

// SARs (admin only)
GET    /aml/sars                     // List SARs (paginated)
GET    /aml/sars/:id                 // SAR detail
PATCH  /aml/sars/:id                 // Update status (reviewed/filed/dismissed)

// Blacklists (admin only)
GET    /aml/blacklists               // List blacklisted addresses
POST   /aml/blacklists               // Add address to blacklist
DELETE /aml/blacklists/:id           // Remove from blacklist

// Screenings (admin, read-only)
GET    /aml/screenings               // Screening history
GET    /aml/screenings/:id           // Screening detail
```

---

## Travel Rule Implementation

For transactions > $1,000 USD equivalent:

```typescript
interface TravelRuleData {
  originator: {
    name: string;
    accountId: string;    // wallet address
    institution?: string; // platform name
  };
  beneficiary: {
    name: string;
    accountId: string;    // wallet address
    institution?: string;
  };
  amount: string;
  currency: string;
  timestamp: string;
}
```

- Stored in `aml_screenings.travel_rule_data`
- Collected from user profile data (name, verified identity)
- Required before transaction can be approved

---

## Key Patterns

- **Async screening**: BullMQ worker processes AML, doesn't block payment API
- **Idempotency**: screening_id linked to transaction, one screening per tx
- **Outbox events**: all AML decisions go through outbox pattern
- **Audit trail**: every screening, SAR, and review action logged
- **Cross-check**: combines profile fraud scores with transaction-level AML
- **Rate limiting**: per-user AND per-wallet address, sliding window in DB
