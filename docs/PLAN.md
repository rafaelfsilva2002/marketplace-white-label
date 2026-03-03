# SDD Plan — Marketplace AI-Native

> **Projeto**: Marketplace de servicos profissionais (inspirado Fatal Model)
> **Stack**: NestJS + PostgreSQL + Drizzle + Next.js 14 + shadcn/ui + Redis + BullMQ
> **Foco**: MVP com IA nativa desde o dia 1

---

## Visao

Marketplace que conecta profissionais de servicos a clientes com inteligencia artificial
embutida em toda a experiencia — busca semantica, recomendacao, moderacao automatica,
deteccao de fraude e precificacao dinâmica.

## Diferenciais IA

| # | Feature | O que faz | Tecnologia |
|---|---------|-----------|-----------|
| 1 | **Busca Semantica** | Encontra profissionais por intencao, nao so palavras-chave | pgvector + embeddings |
| 2 | **Recomendacao Inteligente** | Recomenda perfis similares baseado em comportamento real | embeddings + collaborative filtering |
| 3 | **Moderacao de Fotos** | Detecta conteudo improprio ou duplicado antes da aprovacao | Vision API (OpenAI/Anthropic) |
| 4 | **Deteccao de Fraude** | Identifica perfis falsos por padroes de comportamento | ML anomaly detection |
| 5 | **Analise de Sentimento** | Extrai insights das avaliacoes dos clientes | NLP sentiment analysis |
| 6 | **Precificacao Dinamica** | Sugere melhor plano baseado em historico de visualizacoes | Analytics + ML |

---

## Arquitetura

```
┌─────────────────────────────────────────┐
│              Next.js 14                  │
│         (App Router + shadcn/ui)         │
│         Server Components + RSC          │
└──────────────┬──────────────────────────┘
               │ REST API
┌──────────────▼──────────────────────────┐
│              NestJS API                  │
│         (Fastify adapter)                │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────────┐ │
│  │ Auth │ │Profile│ │Search│ │Payment │ │
│  └──────┘ └──────┘ └──────┘ └────────┘ │
│  ┌──────┐ ┌──────┐ ┌──────────────────┐ │
│  │Audit │ │Events│ │   AI Gateway     │ │
│  └──────┘ └──────┘ └──────────────────┘ │
└──────┬───────────────┬──────────────────┘
       │               │
┌──────▼──────┐ ┌──────▼──────┐
│ PostgreSQL  │ │    Redis    │
│ + pgvector  │ │  + BullMQ   │
└─────────────┘ └─────────────┘
```

### Monorepo
```
marketplace/
├── apps/
│   ├── web/           → Next.js 14 + shadcn/ui
│   ├── api/           → NestJS (Fastify)
│   └── workers/       → BullMQ jobs (embeddings, moderacao, fraude)
├── packages/
│   ├── database/      → Drizzle schema + migrations
│   ├── shared/        → Types, DTOs, event schemas
│   ├── ai-gateway/    → Router multi-provider IA
│   └── ui/            → shadcn/ui components
├── infra/
│   └── docker/        → Docker Compose (PostgreSQL, Redis)
└── docs/
    └── PLAN.md        → Este arquivo
```

---

## Fases

### Fase 0 — Alicerce (Semana 1-2)
Setup do projeto, auth, eventos, observabilidade.

| # | Task | Depende de |
|---|------|-----------|
| 0.1 | Setup monorepo (Turborepo + pnpm) | - |
| 0.2 | Docker Compose (PostgreSQL 16 + pgvector + Redis) | - |
| 0.3 | NestJS API com Fastify + Drizzle ORM | 0.1 |
| 0.4 | Next.js 14 com App Router + shadcn/ui | 0.1 |
| 0.5 | Schema base: users, profiles | 0.3 |
| 0.6 | Auth: JWT + refresh token rotativo | 0.5 |
| 0.7 | RBAC: guards (admin, moderator, professional, user) | 0.6 |
| 0.8 | Rate limiter (per user, per operation) | 0.6 |
| 0.9 | Audit log (append-only) | 0.5 |
| 0.10 | Outbox pattern + event dispatcher | 0.5 |
| 0.11 | Envelope de eventos + validacao schema | - |
| 0.12 | CorrelationId em logs e eventos | - |
| 0.13 | Testes de integracao (banco real) | todos |

### Fase 1 — MVP Core (Semana 3-5)
Perfis, busca, pagamentos basicos, UI.

| # | Task | Depende de |
|---|------|-----------|
| 1.1 | Entidade Profile (name, description, location, services, photos, isVerified) | fase-0 |
| 1.2 | CRUD de profiles (com upload de fotos) | 1.1 |
| 1.3 | Busca full-text (Algolia ou PostgreSQL FTS) | 1.1 |
| 1.4 | Busca por geolocalizacao (PostGIS) | 1.1 |
| 1.5 | Frontend: paginas de busca, perfil, cadastro com shadcn/ui | 1.2, 1.3 |
| 1.6 | Sistema de avaliacoes (ratings + reviews) | 1.2 |
| 1.7 | Verificacao de perfil por moderadores | 1.2 |
| 1.8 | Stripe Connect: onboarding de profissionais | fase-0 |
| 1.9 | Pagamento basico (PaymentIntent + webhook) | 1.8 |
| 1.10 | Wallet com saldo derivado de ledger | 1.9 |
| 1.11 | Saques para profissionais via Stripe Transfer | 1.10 |
| 1.12 | Planos de assinatura para profissionais | 1.8 |
| 1.13 | Testes de integracao | todos |

### Fase 2 — IA Nativa (Semana 6-8)
Diferenciais de IA que fazem o marketplace se destacar.

| # | Task | Depende de |
|---|------|-----------|
| 2.1 | AI Gateway: router multi-provider (OpenAI/Anthropic/Ollama) | fase-0 |
| 2.2 | PII sanitizer no AI Gateway | 2.1 |
| 2.3 | Embedding sync worker (profiles → pgvector via outbox events) | 2.1, fase-1 |
| 2.4 | Busca semantica: "quero alguem pra cortar cabelo estilo coreano" → perfis relevantes | 2.3 |
| 2.5 | Recomendacao inteligente: "quem viu X tambem viu Y" | 2.3 |
| 2.6 | Moderacao automatica de fotos (Vision API) | 2.1 |
| 2.7 | Deteccao de fraude: identificar perfis falsos por padroes | 2.1 |
| 2.8 | Analise de sentimento das avaliacoes | 2.1, 1.6 |
| 2.9 | Precificacao dinamica: sugerir plano ideal por profissional | 2.1, 1.12 |
| 2.10 | Cache semantico (pgvector, similaridade > 0.95) | 2.1 |
| 2.11 | Metricas de custo de IA por operacao | 2.1 |
| 2.12 | Testes de integracao | todos |

### Fase 3 — Escala (Semana 9+)
Crypto, compliance, orquestracao.

| # | Task | Depende de |
|---|------|-----------|
| 3.1 | Crypto rails: adaptadores Ethereum/Polygon/Solana | fase-1 |
| 3.2 | Compliance AML para transacoes cripto | 3.1 |
| 3.3 | Orquestracao com Temporal (workflows longos) | fase-0 |
| 3.4 | Agentes IA com estado persistido | fase-2 |
| 3.5 | A/B testing de modelos e prompts | fase-2 |
| 3.6 | Decision delegation (autonomia gradual) | 3.4 |

---

## Stack Detalhada

| Camada | Tecnologia | Por que |
|--------|-----------|---------|
| Frontend | Next.js 14 + shadcn/ui + Tailwind | SSR/SSG, componentes acessiveis, App Router |
| Backend | NestJS + Fastify | Modular, decorators, DI nativo, rapido |
| ORM | Drizzle | SQL-first, queries tipadas, zero abstracao |
| DB | PostgreSQL 16 + pgvector | Vetores pra IA, JSONB, extensivel |
| Cache | Redis | Rate limiting, cache, session |
| Filas | BullMQ | Jobs async (embeddings, moderacao, fraude) |
| IA | AI Gateway (OpenAI, Anthropic, Ollama) | Multi-provider, PII sanitizer, cache semantico |
| Pagamentos | Stripe Connect | Marketplace splits, onboarding |
| Monorepo | Turborepo + pnpm | Build rapido, workspaces |

## Regras de Implementacao

1. **TDD obrigatorio** — Red → Green → Refactor
2. **Banco real nos testes** — testcontainers ou PostgreSQL de teste
3. **Sem abstracoes sobre NestJS/Drizzle** — usar direto
4. **Rule of Three** — so abstrair na terceira repeticao
5. **CorrelationId em todo log** — rastreabilidade ponta a ponta
6. **Outbox pattern** — nunca publicar evento direto no broker
7. **AI Gateway** — toda chamada a LLM passa pelo gateway
8. **Idempotencia** — toda operacao financeira com chave unica

## Roles

| Role | Descricao |
|------|-----------|
| `admin` | Administrador da plataforma |
| `moderator` | Modera perfis, fotos, disputas |
| `professional` | Oferece servicos, gerencia perfil |
| `user` | Busca e contrata profissionais |

---

## Modelo de Dados Detalhado

### Entidades Core

```sql
-- Tabela: users (Fase 0.5)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'user', -- admin, moderator, professional, user
  name TEXT,
  phone TEXT,
  document_number TEXT UNIQUE, -- CPF/CNPJ com hash para busca
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  metadata JSONB DEFAULT '{}', -- dados extras (preferencias, configuracoes)
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  deleted_at TIMESTAMP -- soft delete
);

-- Tabela: profiles (Fase 1.1)
CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  bio TEXT,
  description TEXT, -- versao longa
  location GEOGRAPHY(POINT), -- PostGIS
  address TEXT, -- endereco textual para fallback
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'BR',
  services TEXT[], -- array de servicos oferecidos
  price_range INT4RANGE, -- ex: [100,500]
  photos TEXT[], -- array de URLs S3
  photo_embeddings vector(1536), -- pgvector para busca visual
  is_verified BOOLEAN DEFAULT false,
  verified_by UUID REFERENCES users(id), -- moderator
  verified_at TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  views_count INT DEFAULT 0,
  search_score FLOAT DEFAULT 0, -- score para ranking
  embedding vector(1536), -- embedding do perfil para busca semantica
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Indices para performance
CREATE INDEX idx_profiles_location ON profiles USING GIST (location);
CREATE INDEX idx_profiles_embedding ON profiles USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_profiles_services ON profiles USING GIN (services);

-- Tabela: profile_views (para recomendacoes e analytics)
CREATE TABLE profile_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id TEXT, -- para visitantes nao logados
  view_duration INT, -- segundos
  viewed_at TIMESTAMP DEFAULT now(),
  source TEXT -- 'search', 'recommendation', 'direct'
);

-- Tabela: reviews (Fase 1.6)
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  sentiment_score FLOAT, -- -1 a 1 (negativo a positivo)
  sentiment_label TEXT, -- 'positive', 'neutral', 'negative'
  is_moderated BOOLEAN DEFAULT false,
  moderated_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Tabela: audit_log (Fase 0.9)
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT, -- 'profile', 'user', 'payment'
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address INET,
  user_agent TEXT,
  correlation_id TEXT,
  created_at TIMESTAMP DEFAULT now()
);

-- Tabela: outbox (Fase 0.10)
CREATE TABLE outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processed, failed
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  processed_at TIMESTAMP
);
```

### Entidades de Pagamento (Fase 1.8-1.12)

```sql
-- Tabela: stripe_accounts (vinculacao com Stripe Connect)
CREATE TABLE stripe_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  stripe_account_id TEXT UNIQUE NOT NULL,
  charges_enabled BOOLEAN DEFAULT false,
  payouts_enabled BOOLEAN DEFAULT false,
  details_submitted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- Tabela: wallets (Fase 1.10)
CREATE TABLE wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  balance INT NOT NULL DEFAULT 0, -- em centavos
  currency TEXT DEFAULT 'BRL',
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  version INT DEFAULT 1 -- para optimistic locking
);

-- Tabela: ledger_entries (contabilidade)
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  type TEXT NOT NULL, -- 'credit', 'debit'
  reason TEXT, -- 'payment', 'withdrawal', 'refund'
  reference_id UUID, -- id da transacao relacionada
  metadata JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- Tabela: subscriptions (Fase 1.12)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  plan_type TEXT NOT NULL, -- 'basic', 'premium', 'enterprise'
  status TEXT NOT NULL, -- 'active', 'canceled', 'past_due'
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### Entidades de IA (Fase 2)

```sql
-- Tabela: embedding_cache (Fase 2.10)
CREATE TABLE embedding_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_hash TEXT UNIQUE NOT NULL, -- hash do texto de entrada
  input_text TEXT,
  embedding vector(1536) NOT NULL,
  model TEXT NOT NULL, -- 'text-embedding-3-small', etc
  created_at TIMESTAMP DEFAULT now(),
  last_accessed TIMESTAMP DEFAULT now(),
  access_count INT DEFAULT 1
);

-- Tabela: moderation_queue (Fase 2.6)
CREATE TABLE moderation_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  photo_url TEXT,
  ai_score FLOAT, -- probabilidade de ser improprio (0-1)
  ai_labels TEXT[], -- categorias detectadas
  status TEXT DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

-- Tabela: fraud_scores (Fase 2.7)
CREATE TABLE fraud_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  risk_score FLOAT NOT NULL, -- 0-1 (maior = mais arriscado)
  risk_factors JSONB, -- detalhes dos fatores
  model_version TEXT,
  created_at TIMESTAMP DEFAULT now(),
  expires_at TIMESTAMP DEFAULT now() + INTERVAL '7 days'
);
```

---

## APIs e Endpoints Detalhados

### Estrutura de Modulos (NestJS)

```
apps/api/src/modules/
├── auth/
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   └── oauth.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── token.service.ts
│   └── strategies/
├── users/
├── profiles/
├── search/
├── payments/
├── reviews/
├── moderation/
├── ai-gateway-client/  # Cliente do pacote ai-gateway
└── webhooks/
```

### Endpoints Core (REST + OpenAPI)

```typescript
// Auth Module
POST   /auth/register          // Registro com email/senha
POST   /auth/login             // Login (retorna JWT + refresh)
POST   /auth/refresh           // Refresh token
POST   /auth/logout            // Logout
GET    /auth/me                // Usuario atual
POST   /auth/verify-email      // Verificacao de email
POST   /auth/forgot-password   // Recuperacao de senha
POST   /auth/reset-password    // Reset de senha

// Profiles Module
GET    /profiles               // Listar perfis (com filtros)
POST   /profiles               // Criar perfil
GET    /profiles/:id           // Detalhe do perfil
PATCH  /profiles/:id           // Atualizar perfil
DELETE /profiles/:id           // Deletar perfil (soft delete)
POST   /profiles/:id/photos    // Upload de fotos
DELETE /profiles/:id/photos/:photoId // Remover foto
POST   /profiles/:id/verify    // Solicitar verificacao
GET    /profiles/:id/views     // Estatisticas de views

// Search Module (Fase 1.3 + 2.4)
GET    /search                 // Busca full-text (fallback)
POST   /search/semantic        // Busca semantica (embedding)
GET    /search/suggest         // Autocomplete

// Recommendations Module (Fase 2.5)
GET    /recommendations/similar/:profileId  // Perfis similares
GET    /recommendations/for-you/:userId     // Recomendacoes personalizadas

// Reviews Module
POST   /reviews                // Criar avaliacao
GET    /reviews/profile/:profileId // Listar avaliacoes de um perfil
PATCH  /reviews/:id            // Atualizar avaliacao
DELETE /reviews/:id            // Deletar avaliacao

// Payments Module
POST   /payments/create-account // Criar conta Stripe Connect
GET    /payments/account-status // Status da conta
POST   /payments/create-payment // Criar intencao de pagamento
POST   /payments/confirm        // Confirmar pagamento
GET    /payments/history        // Historico de transacoes
POST   /payments/withdraw       // Solicitar saque
GET    /payments/wallet         // Saldo da wallet

// Subscriptions Module
POST   /subscriptions           // Criar assinatura
GET    /subscriptions/:id       // Detalhe da assinatura
PATCH  /subscriptions/:id       // Atualizar/upgrade/downgrade
DELETE /subscriptions/:id       // Cancelar assinatura

// Moderation Module (Admin/Moderator)
GET    /moderation/queue        // Fila de moderacao
POST   /moderation/queue/:id/approve // Aprovar
POST   /moderation/queue/:id/reject  // Rejeitar com motivo
GET    /moderation/reports       // Denuncias de usuarios
POST   /moderation/reports/:id/resolve // Resolver denuncia

// Admin Module
GET    /admin/stats              // Estatisticas da plataforma
GET    /admin/users              // Listar usuarios
PATCH  /admin/users/:id/role     // Alterar papel
POST   /admin/profiles/:id/feature // Destacar perfil
GET    /admin/audit-logs         // Logs de auditoria
```

---

## AI Gateway Detalhado

### Arquitetura do Gateway

```
┌─────────────────────────────────────┐
│         AI Gateway Service           │
├─────────────────────────────────────┤
│  Router Multi-Provider               │
│  ├── OpenAI (GPT-4, embeddings)     │
│  ├── Anthropic (Claude)             │
│  └── Ollama (fallback local)        │
├─────────────────────────────────────┤
│  Middleware                          │
│  ├── PII Sanitizer                   │
│  ├── Rate Limiter (por usuario)      │
│  ├── Cache (Redis + pgvector)        │
│  ├── Circuit Breaker                 │
│  └── Cost Tracking                   │
├─────────────────────────────────────┤
│  Interfaces                          │
│  ├── Completion (chat)               │
│  ├── Embedding                       │
│  └── Vision (imagem)                 │
└─────────────────────────────────────┘
```

### Interface do Gateway

```typescript
// packages/ai-gateway/src/interfaces/ai-gateway.interface.ts

export interface AIGateway {
  // Chat/Completion
  complete(params: CompletionParams): Promise<CompletionResponse>;
  completeStream(params: CompletionParams): AsyncIterable<CompletionChunk>;

  // Embeddings
  createEmbedding(params: EmbeddingParams): Promise<EmbeddingResponse>;

  // Vision
  analyzeImage(params: VisionParams): Promise<VisionResponse>;

  // Moderations
  moderateContent(params: ModerationParams): Promise<ModerationResponse>;
}

export interface CompletionParams {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  model?: string; // 'gpt-4', 'claude-3', etc
  temperature?: number;
  maxTokens?: number;
  userId?: string; // para rate limiting e custo
  correlationId: string;
  skipCache?: boolean;
  provider?: 'openai' | 'anthropic' | 'ollama'; // opcional, senao usa router
}

export interface EmbeddingParams {
  input: string | string[];
  model?: 'text-embedding-3-small' | 'text-embedding-3-large' | 'local';
  userId?: string;
  correlationId: string;
}
```

### Cache Semantico

```typescript
// Estrategia de cache para embeddings
async function getOrCreateEmbedding(text: string): Promise<number[]> {
  // 1. Verificar cache exato (hash)
  const hash = createHash('sha256').update(text).digest('hex');
  const exact = await db.query.embedding_cache.findFirst({
    where: (cache, { eq }) => eq(cache.input_hash, hash)
  });

  if (exact) return exact.embedding;

  // 2. Busca semantica por similaridade (cache aproximado)
  const similar = await db.execute(sql`
    SELECT embedding, 1 - (embedding <=> ${text}::vector) as similarity
    FROM embedding_cache
    WHERE 1 - (embedding <=> ${text}::vector) > 0.95
    ORDER BY similarity DESC
    LIMIT 1
  `);

  if (similar.length > 0) {
    return similar[0].embedding;
  }

  // 3. Gerar novo embedding via provider
  const embedding = await aiGateway.createEmbedding({ input: text });

  // 4. Salvar no cache
  await db.insert(embedding_cache).values({
    input_hash: hash,
    input_text: text,
    embedding: embedding
  });

  return embedding;
}
```

---

## Workers e Jobs (BullMQ)

### Filas Configuradas

```typescript
// apps/workers/src/queues.ts

export const Queues = {
  EMBEDDING: 'embedding',
  MODERATION: 'moderation',
  FRAUD_DETECTION: 'fraud-detection',
  SENTIMENT_ANALYSIS: 'sentiment-analysis',
  NOTIFICATION: 'notification',
  REPORT_GENERATION: 'report-generation'
} as const;

export const QueueConfig = {
  default: {
    connection: {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT)
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000
      },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  }
};
```

### Embedding Worker (Fase 2.3)

```typescript
// Atualiza embeddings quando perfil e criado/atualizado
// Escuta eventos do outbox: 'profile.created', 'profile.updated'

async function processProfileEmbedding(job: Job) {
  const { profileId } = job.data;

  const profile = await db.query.profiles.findFirst({
    where: (profiles, { eq }) => eq(profiles.id, profileId)
  });

  if (!profile) return;

  // Construir texto para embedding
  const textForEmbedding = `
    ${profile.displayName}
    ${profile.bio || ''}
    ${profile.description || ''}
    Servicos: ${profile.services?.join(', ') || ''}
    Local: ${profile.city} - ${profile.state}
  `.trim();

  const embedding = await aiGateway.createEmbedding({
    input: textForEmbedding,
    correlationId: job.data.correlationId
  });

  await db.update(profiles)
    .set({ embedding, updated_at: new Date() })
    .where(eq(profiles.id, profileId));
}
```

### Moderation Worker (Fase 2.6)

```typescript
// Processa fotos para moderacao automatica

async function processPhotoModeration(job: Job) {
  const { profileId, photoUrl } = job.data;

  const result = await aiGateway.analyzeImage({
    imageUrl: photoUrl,
    categories: ['explicit', 'violent', 'suggestive'],
    correlationId: job.data.correlationId
  });

  if (result.scores.explicit > 0.7 || result.scores.violent > 0.5) {
    await db.insert(moderation_queue).values({
      profile_id: profileId,
      photo_url: photoUrl,
      ai_score: Math.max(result.scores.explicit, result.scores.violent),
      ai_labels: result.labels,
      status: 'pending'
    });

    await notificationQueue.add('notify-moderators', {
      type: 'new-moderation',
      profileId,
      photoUrl
    });
  } else {
    logger.info(`Photo auto-approved for profile ${profileId}`);
  }
}
```

### Fraud Detection Worker (Fase 2.7)

```typescript
// Detecta padroes suspeitos em novos perfis

async function detectFraud(job: Job) {
  const { userId, profileId } = job.data;

  const user = await db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, userId),
    with: { profiles: true, views: { limit: 100 } }
  });

  if (!user) return;

  const features = {
    accountAgeDays: daysBetween(user.created_at, new Date()),
    profileCount: user.profiles.length,
    hasVerifiedEmail: user.is_verified,
    hasPhone: !!user.phone,
  };

  const riskScore = await mlService.predictFraud(features);

  if (riskScore > 0.8) {
    await db.update(profiles)
      .set({ is_active: false })
      .where(eq(profiles.id, profileId));

    await db.insert(fraud_scores).values({
      user_id: userId,
      profile_id: profileId,
      risk_score: riskScore,
      risk_factors: { features },
      model_version: 'v1.0'
    });

    await notificationQueue.add('notify-admin', {
      type: 'high-risk-fraud',
      userId,
      profileId,
      riskScore
    });
  }
}
```

---

## Frontend Components (shadcn/ui + Tailwind)

### Paginas Principais

```tsx
// apps/web/src/app/(marketplace)/page.tsx
// Home page com busca e recomendacoes

export default async function HomePage() {
  const featuredProfiles = await api.get('/profiles', {
    params: { featured: true, limit: 6 }
  });

  const recommendations = await api.get('/recommendations/for-you', {
    headers: { cookie }
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <HeroSearch />

      <section className="mt-12">
        <h2 className="text-2xl font-bold mb-6">Profissionais em Destaque</h2>
        <ProfileGrid profiles={featuredProfiles} />
      </section>

      {recommendations.length > 0 && (
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-6">Recomendados para Voce</h2>
          <ProfileGrid profiles={recommendations} />
        </section>
      )}
    </div>
  );
}
```

### Busca Semantica (Client Component)

```tsx
// apps/web/src/components/search/SemanticSearch.tsx
'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebounce } from '@/hooks/useDebounce';

export function SemanticSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebounce(query, 500);

  useEffect(() => {
    if (!debouncedQuery) return;

    async function search() {
      setLoading(true);
      try {
        const response = await fetch('/api/search/semantic', {
          method: 'POST',
          body: JSON.stringify({ query: debouncedQuery }),
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();
        setResults(data);
      } finally {
        setLoading(false);
      }
    }

    search();
  }, [debouncedQuery]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <Input
          type="text"
          placeholder="Busque em linguagem natural... ex: 'quero alguem pra cortar cabelo estilo coreano'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          <Search className="w-4 h-4 mr-2" />
          Buscar
        </Button>
      </div>

      {loading && (
        <div className="absolute top-full left-0 right-0 mt-2 p-4 bg-white rounded-lg shadow-lg">
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
            <span>Buscando com IA...</span>
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {results.map((profile) => (
            <SearchResultItem key={profile.id} profile={profile} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### Assistente IA (Client Component)

```tsx
// apps/web/src/components/ai/AIAssistant.tsx
'use client';

import { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useStreamingChat } from '@/hooks/useStreamingChat';

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const { messages, sendMessage, isLoading } = useStreamingChat();

  return (
    <>
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 rounded-full w-12 h-12 shadow-lg"
        >
          <MessageCircle />
        </Button>
      )}

      {isOpen && (
        <Card className="fixed bottom-4 right-4 w-96 h-[500px] shadow-xl flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold">Assistente IA</h3>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4">
            {messages.map((msg, i) => (
              <div key={i} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                <div className={`inline-block p-3 rounded-lg ${
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}>
                  {msg.content}
                </div>
              </div>
            ))}
          </ScrollArea>

          <div className="p-4 border-t">
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const message = formData.get('message') as string;
              if (message.trim()) {
                sendMessage(message);
                e.currentTarget.reset();
              }
            }} className="flex gap-2">
              <Input name="message" placeholder="Digite sua mensagem..." disabled={isLoading} />
              <Button type="submit" disabled={isLoading}>Enviar</Button>
            </form>
          </div>
        </Card>
      )}
    </>
  );
}
```

---

## Testes e Qualidade

### Estrategia de Testes

```typescript
// apps/api/test/profile.service.spec.ts
// Teste de integracao com banco real

import { Test } from '@nestjs/testing';
import { ProfileService } from '../src/modules/profiles/profile.service';
import { DatabaseModule } from '../src/database/database.module';
import { createTestDb, closeTestDb } from './utils/test-db';

describe('ProfileService', () => {
  let service: ProfileService;
  let db: any;

  beforeAll(async () => {
    db = await createTestDb(); // PostgreSQL em container

    const module = await Test.createTestingModule({
      imports: [DatabaseModule.forTest(db)],
      providers: [ProfileService]
    }).compile();

    service = module.get(ProfileService);
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  it('should create a profile', async () => {
    const profile = await service.create({
      userId: '123',
      displayName: 'Joao Silva',
      bio: 'Cabeleireiro profissional'
    });

    expect(profile).toHaveProperty('id');
    expect(profile.displayName).toBe('Joao Silva');

    const saved = await db.query.profiles.findFirst({
      where: (profiles, { eq }) => eq(profiles.id, profile.id)
    });
    expect(saved).toBeDefined();
  });

  it('should search profiles semantically', async () => {
    await service.createWithEmbedding({
      displayName: 'Maria Cabeleireira',
      services: ['corte de cabelo', 'escova']
    });

    const results = await service.semanticSearch('quero cortar cabelo');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toHaveProperty('similarity');
  });
});
```

### Testes de Carga (K6)

```javascript
// k6/scripts/search-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const queries = [
    'cabeleireiro', 'massagem relaxante', 'personal trainer',
    'manicure', 'maquiagem para festa'
  ];

  const query = queries[Math.floor(Math.random() * queries.length)];

  const res = http.post('http://localhost:3000/api/search/semantic', {
    query: query
  }, {
    headers: { 'Content-Type': 'application/json' }
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500
  });

  sleep(1);
}
```

---

## Monitoramento e Observabilidade

### Metricas Essenciais

```typescript
// apps/api/src/common/metrics/metrics.service.ts

@Injectable()
export class MetricsService {
  private readonly httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total de requisicoes HTTP',
    labelNames: ['method', 'route', 'status']
  });

  private readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duracao das requisicoes HTTP',
    labelNames: ['method', 'route'],
    buckets: [0.1, 0.3, 0.5, 1, 3, 5]
  });

  private readonly aiRequestsTotal = new Counter({
    name: 'ai_requests_total',
    help: 'Total de chamadas para provedores de IA',
    labelNames: ['provider', 'operation', 'status']
  });

  private readonly aiCostTotal = new Counter({
    name: 'ai_cost_total_usd',
    help: 'Custo total em USD das chamadas de IA',
    labelNames: ['provider', 'operation']
  });

  private readonly embeddingCacheHits = new Counter({
    name: 'embedding_cache_hits_total',
    help: 'Total de hits no cache de embeddings'
  });

  private readonly embeddingCacheMisses = new Counter({
    name: 'embedding_cache_misses_total',
    help: 'Total de misses no cache de embeddings'
  });

  private readonly activeUsers = new Gauge({
    name: 'active_users',
    help: 'Numero de usuarios ativos nos ultimos 5 minutos'
  });

  private readonly queueJobDuration = new Histogram({
    name: 'queue_job_duration_seconds',
    help: 'Duracao dos jobs nas filas',
    labelNames: ['queue', 'job']
  });
}
```

### Logs Estruturados

```typescript
// apps/api/src/common/logger/structured.logger.ts

export interface LogEntry {
  level: 'debug' | 'info' | 'warn' | 'error';
  timestamp: string;
  correlationId: string;
  service: string;
  message: string;
  userId?: string;
  profileId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
  metadata?: Record<string, any>;
}

export class StructuredLogger {
  constructor(private readonly context: string) {}

  info(message: string, metadata?: Record<string, any>) {
    this.log('info', message, metadata);
  }

  error(message: string, error?: Error, metadata?: Record<string, any>) {
    this.log('error', message, {
      ...metadata,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }

  private log(level: LogEntry['level'], message: string, metadata?: Record<string, any>) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      correlationId: this.getCorrelationId(),
      service: this.context,
      message,
      ...metadata
    };

    console.log(JSON.stringify(entry));
  }

  private getCorrelationId(): string {
    return AsyncContext.get('correlationId') || uuid();
  }
}
```

---

## Roadmap de Implementacao (Versao Detalhada)

### Sprint 1-2: Fundacao (Fase 0)
- Setup monorepo com Turborepo + pnpm
- Docker Compose com PostgreSQL 16 + pgvector + Redis
- Configuracao inicial do NestJS + Fastify + Drizzle
- Configuracao do Next.js 14 + shadcn/ui
- Schema base (users) e migrations
- Auth completo (JWT + refresh token + RBAC)
- Rate limiting e audit log
- Outbox pattern + event dispatcher
- CorrelationId em toda stack
- Testes de integracao basicos

### Sprint 3-4: Perfis e Busca (Fase 1)
- CRUD de perfis com upload de imagens (S3)
- Busca full-text (PostgreSQL FTS)
- Geolocalizacao com PostGIS
- Frontend: paginas de busca, perfil, cadastro
- Sistema de avaliacoes (reviews)
- Verificacao manual de perfis (moderadores)
- Integracao Stripe Connect
- Pagamentos basicos (Pix, cartao)
- Wallet e ledger
- Planos de assinatura para profissionais

### Sprint 5-6: IA Nativa (Fase 2)
- AI Gateway multi-provider
- PII sanitizer
- Embedding worker com outbox
- Busca semantica (pgvector)
- Recomendacoes inteligentes
- Moderacao automatica de fotos
- Deteccao de fraude (ML basico)
- Analise de sentimento das avaliacoes
- Precificacao dinamica (primeira versao)
- Cache semantico de embeddings
- Metricas de custo de IA

### Sprint 7-8: Escala e Otimizacao (Fase 3)
- Otimizacoes de performance
- Cache em multiplas camadas
- CDN para imagens
- Melhorias no algoritmo de recomendacao
- A/B testing de modelos de IA
- Dashboard de analytics para admins
- Webhooks para integracoes
- Documentacao OpenAPI completa
- Testes de carga e stress

### Sprint 9+: Expansao
- App mobile (React Native)
- Pagamentos em cripto
- Agentes autonomos com memoria
- Marketplace multi-categoria
- Internacionalizacao (i18n)
