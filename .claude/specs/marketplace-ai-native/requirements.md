# Requirements Document — Marketplace AI-Native

## Introduction

Marketplace de servicos profissionais AI-Native que conecta profissionais a clientes com inteligencia artificial embutida em toda a experiencia. Inspirado no Fatal Model, o sistema oferece busca semantica, recomendacao inteligente, moderacao automatica, deteccao de fraude, analise de sentimento e precificacao dinamica.

## Alignment with Product Vision

Este projeto suporta diretamente a visao de ser a plataforma #1 de servicos profissionais no Brasil, com IA nativa desde o dia 1 (nao bolt-on). Todas as features core integram IA para melhorar a experiencia do usuario e a confianca da plataforma.

## Requirements

### REQ-1: Monorepo e Infraestrutura Base

**User Story:** As a developer, I want a well-structured monorepo with all infrastructure configured, so that I can develop features independently across apps and packages.

#### Acceptance Criteria

1. WHEN the developer runs `pnpm install` THEN the system SHALL install all workspace dependencies
2. WHEN the developer runs `pnpm dev` THEN the system SHALL start all apps in parallel with hot reload
3. WHEN the developer runs `pnpm build` THEN Turborepo SHALL build all packages and apps in correct order
4. WHEN Docker Compose starts THEN PostgreSQL 16 (with pgvector + PostGIS) and Redis SHALL be available and healthy

### REQ-2: Autenticacao e Autorizacao

**User Story:** As a user, I want to register and login securely, so that I can access the platform with my role-specific features.

#### Acceptance Criteria

1. WHEN a user registers with email/password THEN the system SHALL create an account with hashed password and default role 'user'
2. WHEN a user logs in with valid credentials THEN the system SHALL return a JWT access token and a refresh token
3. WHEN the access token expires THEN the system SHALL allow token refresh using a valid refresh token (rotativo)
4. WHEN a user with role 'user' tries to access admin endpoints THEN the system SHALL return 403 Forbidden
5. IF rate limit is exceeded THEN the system SHALL return 429 Too Many Requests

### REQ-3: Perfis de Profissionais

**User Story:** As a professional, I want to create and manage my profile with photos, services, and location, so that clients can find and evaluate me.

#### Acceptance Criteria

1. WHEN a professional creates a profile THEN the system SHALL save display name, bio, services, location, and photos
2. WHEN photos are uploaded THEN the system SHALL store them and trigger automatic moderation via AI
3. WHEN a profile is created/updated THEN the system SHALL generate embeddings via the AI Gateway
4. IF a profile has embedding THEN the system SHALL make it searchable via semantic search
5. WHEN a user views a profile THEN the system SHALL record the view for analytics and recommendations

### REQ-4: Busca (Full-text + Semantica + Geo)

**User Story:** As a user, I want to search for professionals using natural language or location, so that I can find the best match for my needs.

#### Acceptance Criteria

1. WHEN a user searches with keywords THEN the system SHALL return results using PostgreSQL FTS
2. WHEN a user searches with natural language (e.g., "quero alguem pra cortar cabelo estilo coreano") THEN the system SHALL use semantic search via pgvector
3. WHEN a user searches by location THEN the system SHALL return results ordered by proximity using PostGIS
4. WHEN search results are returned THEN the system SHALL respond within 500ms (p95)

### REQ-5: Avaliacoes e Reviews

**User Story:** As a user, I want to leave reviews for professionals, so that other users can make informed decisions.

#### Acceptance Criteria

1. WHEN a user submits a review THEN the system SHALL save rating (1-5) and comment
2. WHEN a review is created THEN the system SHALL trigger sentiment analysis via AI
3. WHEN sentiment analysis completes THEN the system SHALL store sentiment_score and sentiment_label
4. IF a review contains inappropriate content THEN the system SHALL flag it for moderation

### REQ-6: Pagamentos (Stripe Connect)

**User Story:** As a professional, I want to receive payments through the platform, so that I can monetize my services securely.

#### Acceptance Criteria

1. WHEN a professional onboards THEN the system SHALL create a Stripe Connect account
2. WHEN a payment is initiated THEN the system SHALL create a PaymentIntent with idempotency key
3. WHEN a payment succeeds THEN the system SHALL credit the professional's wallet via ledger entry
4. WHEN a professional requests a withdrawal THEN the system SHALL process it via Stripe Transfer
5. WHEN a professional subscribes to a plan THEN the system SHALL manage the subscription lifecycle

### REQ-7: AI Gateway

**User Story:** As a developer, I want all AI calls to go through a centralized gateway, so that I can manage providers, costs, and safety consistently.

#### Acceptance Criteria

1. WHEN the gateway receives a completion request THEN the system SHALL route to the best available provider
2. WHEN the gateway processes text THEN the system SHALL sanitize PII before sending to external providers
3. WHEN an embedding is requested THEN the system SHALL check semantic cache first (similarity > 0.95)
4. IF a provider is down THEN the circuit breaker SHALL fallback to the next available provider
5. WHEN any AI operation completes THEN the system SHALL track cost per operation

### REQ-8: Moderacao Automatica

**User Story:** As a moderator, I want photos to be automatically analyzed by AI, so that I only need to manually review flagged content.

#### Acceptance Criteria

1. WHEN a photo is uploaded THEN the system SHALL queue it for AI moderation
2. WHEN AI moderation detects risk > 0.7 THEN the system SHALL add it to the moderation queue
3. WHEN AI moderation detects risk < 0.7 THEN the system SHALL auto-approve the photo
4. WHEN a moderator reviews a queued item THEN the system SHALL record the decision and moderator ID

### REQ-9: Deteccao de Fraude

**User Story:** As an admin, I want the system to automatically detect suspicious profiles, so that I can maintain platform trust.

#### Acceptance Criteria

1. WHEN a new profile is created THEN the system SHALL calculate a fraud risk score
2. IF risk score > 0.8 THEN the system SHALL deactivate the profile and notify admin
3. WHEN fraud analysis runs THEN the system SHALL consider account age, verification status, and behavioral patterns

### REQ-10: Recomendacao Inteligente

**User Story:** As a user, I want to see recommended professionals based on my browsing history, so that I can discover relevant options.

#### Acceptance Criteria

1. WHEN a user views profiles THEN the system SHALL record views with source and duration
2. WHEN recommendations are requested THEN the system SHALL return similar profiles based on embedding similarity
3. WHEN "similar profiles" are requested for a profile THEN the system SHALL use collaborative filtering + embeddings

### REQ-11: Precificacao Dinamica

**User Story:** As a professional, I want the system to suggest the best subscription plan, so that I can maximize my visibility cost-effectively.

#### Acceptance Criteria

1. WHEN a professional views subscription options THEN the system SHALL suggest a plan based on their view history and engagement metrics
2. WHEN pricing suggestions are made THEN the system SHALL explain the reasoning

### REQ-12: Observabilidade

**User Story:** As a developer, I want structured logs, metrics, and audit trails, so that I can debug issues and monitor the system.

#### Acceptance Criteria

1. WHEN any operation is performed THEN the system SHALL include a correlationId in all logs
2. WHEN a state change occurs THEN the system SHALL record it in the audit log (append-only)
3. WHEN events are emitted THEN the system SHALL use the outbox pattern (never publish directly)
4. WHEN HTTP/AI/queue operations complete THEN the system SHALL record metrics (latency, cost, status)

## Non-Functional Requirements

### Performance
- Busca semantica: < 500ms (p95)
- API REST: < 200ms (p95)
- Busca full-text: < 100ms (p95)
- Frontend LCP: < 2.5s

### Security
- JWT + refresh token rotativo
- RBAC com guards por role
- Rate limiting per user per operation
- PII sanitizer no AI Gateway
- Audit log append-only
- LGPD compliance

### Reliability
- Outbox pattern para zero perda de eventos
- Circuit breaker no AI Gateway
- Retry com exponential backoff nos workers
- Optimistic locking nas wallets
- Idempotencia em operacoes financeiras

### Usability
- Interface responsiva (mobile-first)
- shadcn/ui com tema consistente
- Server Components por padrao (fast initial load)
- Busca em linguagem natural (baixa barreira de entrada)
