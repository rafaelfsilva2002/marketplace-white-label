# Marketplace FTM — Audit Completo (2026-03-05)

## Resumo Executivo

| Área | Crítico | Alto | Médio | Baixo |
|------|---------|------|-------|-------|
| Segurança (OWASP) | 2 | 3 | 7 | 3 |
| Qualidade de Código | 3 | 6 | 6 | 5 |
| Performance | 2 | 7 | 10 | 3 |
| Cobertura de Testes | — | — | — | — |

**Cobertura de testes**: ~24% (26/108 arquivos fonte com testes unitários)

---

## 1. SEGURANÇA (OWASP Top 10)

### CRÍTICO

**S1. Privilege Escalation — RegisterDto aceita campo `role`**
- `apps/api/src/modules/auth/dto/register.dto.ts:37-41`
- `apps/api/src/modules/auth/services/auth.service.ts:55`
- Qualquer usuário pode se registrar como `admin` enviando `"role": "admin"`
- **Fix**: Remover campo `role` do RegisterDto. Sempre atribuir `UserRole.User`

**S2. WebSocket JWT Não Verifica Assinatura**
- `apps/api/src/modules/chat/chat.gateway.ts:173-186`
- `apps/api/src/modules/notifications/gateways/notification.gateway.ts:64-77`
- Usam `Buffer.from(token.split('.')[1], 'base64')` sem verificar assinatura
- Atacante pode forjar JWT e impersonar qualquer usuário no chat/notifications
- **Fix**: Usar `TokenService.verifyAccessToken()` nos gateways

### ALTO

**S3. Access Token Cookie sem HttpOnly/Secure**
- `apps/web/src/lib/api.ts:23`
- Cookie acessível via JavaScript, vulnerável a XSS
- **Fix**: Setar cookie server-side com `HttpOnly; Secure; SameSite=Lax`

**S4. Sem Proteção CSRF**
- Nenhum middleware CSRF no projeto. CORS com `credentials: true` + cookie = risco
- **Fix**: Parar de usar cookie para token OU implementar double-submit pattern

**S5. Endpoint /metrics Exposto Sem Auth**
- `apps/api/src/modules/metrics/controllers/metrics.controller.ts:4-13`
- Prometheus metrics públicos sem autenticação
- **Fix**: Adicionar `@UseGuards(JwtAuthGuard, RolesGuard)` com role admin

### MÉDIO

**S6. DTOs sem class-validator** — `ExperimentController`, `AdminController`, `ModerationController`
**S7. Token lookup faz scan de 1000 users** — `auth.service.ts:413-421, 504-512`
**S8. Reset token retornado na API response** — `auth.service.ts:496`
**S9. Rate limiting só no AuthController** — Falta em payments, crypto, search
**S10. Image URL sem sanitização no chat** — `MessageBubble.tsx:52-57`
**S11. Middleware JWT sem verificação de assinatura** — `middleware.ts:87-98`
**S12. Refresh token rotation retorna email/role stale** — `token.service.ts:166-171`

### BAIXO

**S13.** Sem Content-Security-Policy
**S14.** Sessões não revogadas após password reset
**S15.** Helmet com `contentSecurityPolicy: false`

---

## 2. QUALIDADE DE CÓDIGO

### CRÍTICO

**Q1. Salt criptográfico hardcoded**
- `apps/api/src/modules/crypto/services/crypto.service.ts:34`
- `const SALT = 'marketplace-crypto-salt'` — derrota propósito do salt
- Linha 75: secret default hardcoded `'default-secret-change-in-production-32chars!'`
- **Fix**: Fail fast se `CRYPTO_ENCRYPTION_SECRET` não estiver setado. Salt aleatório por wallet

**Q2. `this.db as any` bypass transaction safety**
- `apps/api/src/modules/profiles/services/profile.service.ts:355`
- Outbox event escrito fora de transação, violando o outbox pattern

**Q3. `ApiResponse<any>` no AdminController**
- `apps/api/src/modules/admin/controllers/admin.controller.ts:92`

### ALTO

**Q4. EthereumAdapter e PolygonAdapter são 99% idênticos** (179 linhas cada)
- **Fix**: Extrair base class `EvmChainAdapter`

**Q5. Email/SendGrid duplicado** entre `notification.worker.ts` e `email.service.ts`
**Q6. API_BASE duplicado em 7 arquivos web** — Devem importar de `api.ts`

**Q7. 20+ arquivos >300 linhas** — Maiores:
- `admin/usuarios/page.tsx` (679 linhas)
- `dashboard/profile/page.tsx` (642 linhas)
- `aml-screening.worker.ts` (635 linhas)
- `recommendation.service.ts` (634 linhas)
- `analytics/page.tsx` (530 linhas)

**Q8. Funções gigantes**:
- `sendPayment()` ~180 linhas
- `AdminUsuariosPage()` ~400+ linhas
- `ProfilePage()` ~540+ linhas

### MÉDIO

**Q9.** 13× `@Request() req: any` — Deve usar `@CurrentUser()` decorator existente
**Q10.** 12+ usos de `any` em código de produção
**Q11.** 13× `catch (e: any)` no mobile — Usar `catch (e: unknown)`
**Q12.** 47× `console.log` nos workers — Usar `createLogger` existente
**Q13.** 5× `console.error` no web frontend
**Q14.** Model names hardcoded no AI Gateway (claude-sonnet-4, claude-3-5-haiku)

### BAIXO

**Q15.** Email padrão `noreply@marketplace.com` duplicado
**Q16.** Magic numbers em batch sizes e timeouts
**Q17.** Logger inconsistente (NestJS Logger vs StructuredLogger)
**Q18.** Self-reference `any` cast em categories schema (limitação Drizzle)
**Q19.** `coViewRows` computado mas nunca usado em recommendation.service.ts

---

## 3. PERFORMANCE

### CRÍTICO

**P1. N+1 Query em ChatService.getConversations**
- `apps/api/src/modules/chat/chat.service.ts:97-129`
- 2 queries extras POR conversa (user info + unread count)
- 20 conversas = 40 queries extras
- **Fix**: Batch com `IN (...)` + `GROUP BY`

**P2. Moderation queue carrega TODOS registros sem LIMIT**
- `apps/api/src/modules/moderation/services/moderation.service.ts:47-93`
- Busca todos profiles não verificados + todas reviews não moderadas, ordena em JS
- **Fix**: Aplicar LIMIT/OFFSET no SQL

### ALTO

**P3.** Sem GIN index para full-text search — `profiles` FTS faz sequential scan
**P4.** Sem HNSW index para vector similarity — semantic search é O(n)
**P5.** Sem GIST index para geo search — `ST_DWithin` faz sequential scan
**P6.** Analytics dashboard executa 11 queries sequenciais sem cache
**P7.** Profile view recording é síncrono no request path (INSERT + UPDATE)
**P8.** Chat `getUnreadCount` busca TODAS conversas sem LIMIT
**P9.** Nenhum cache em analytics, categories, search, admin stats

### MÉDIO

**P10.** Missing index em `users.role`, `users.deletedAt`
**P11.** Missing indexes em `refresh_tokens` (tokenHash, userId, family)
**P12.** Missing indexes em `reports` (status, reporterId)
**P13.** Embedding column (12KB) incluída em respostas de search/recommendation
**P14.** `ProfileViewsService.getViewStats` — 5 queries sequenciais (devem ser paralelas)
**P15.** Search executa mesma WHERE 2× (count + data)
**P16.** Correlated subqueries em recommendations (`avg(rating)` por candidato)
**P17.** `InMemoryCacheStore` cresce sem limite no AI Gateway
**P18.** Outbox `writeEvents` insere um-a-um em loop
**P19.** ChatGateway busca conversa 2× em `handleSendMessage`

### BAIXO

**P20.** Missing index em `reports` table
**P21.** WebSocket Maps podem acumular entries em disconnect falho
**P22.** Batch INSERT poderia ser usado em outbox service

---

## 4. COBERTURA DE TESTES

### Estatísticas

| Área | Arquivos | Com Testes | Cobertura |
|------|----------|-----------|-----------|
| API Services | ~35 | 16 | 46% |
| API Controllers | 18 | 6 | 33% |
| Workers | 8 | **0** | **0%** |
| packages/crypto-gateway | 4 | **0** | **0%** |
| packages/ai-gateway | 7 | **0** | **0%** |
| packages/database | 19 | **0** | **0%** |

### Top 5 Gaps Mais Perigosos

1. **PaymentService + StripeService** (~580 linhas sem teste) — Dinheiro real
2. **AML Screening Worker** (714 linhas sem teste) — Compliance regulatório
3. **CryptoPaymentService + CryptoService + AmlComplianceService** (~900 linhas) — Crypto
4. **Outbox + EventDispatcher** — Fundação da arquitetura event-driven
5. **Fraud Detection Worker** — Pode desativar profiles (falso positivo = profissional inocente bloqueado)

### Módulos Críticos Sem Testes

- `payment.service.ts`, `stripe.service.ts`
- `crypto-payment.service.ts`, `crypto.service.ts`, `ramp.service.ts`
- `aml-compliance.service.ts`, `review-queue.service.ts`, `sar.service.ts`
- `aml-check.guard.ts`
- Todos os 8 workers
- Todos os packages (crypto-gateway, ai-gateway, database, shared)
- `outbox.service.ts`, `event-dispatcher.service.ts`

---

## 5. MUDANÇAS PENDENTES (git diff)

Todas as mudanças são melhorias válidas:

1. **App.tsx**: ErrorBoundary wrapping, remoção de console.log
2. **next.config.js**: Security headers (X-Content-Type-Options, X-Frame-Options, etc.)
3. **chat/page.tsx**: Remoção de console.log em socket connect/disconnect
4. **package.json**: Adição de zod como dependência
5. **Novos**: ErrorBoundary.tsx, NetworkError.tsx (mobile)

---

## 6. PRIORIDADES DE FIX

### Fase 1 — Segurança Crítica (Imediato)
1. Remover `role` do RegisterDto (S1)
2. Verificar JWT signature nos WebSockets (S2)
3. Remover crypto salt/secret hardcoded (Q1)
4. Proteger /metrics endpoint (S5)

### Fase 2 — Performance Crítica
5. Adicionar GIN index para FTS (P3)
6. Adicionar HNSW index para vectors (P4)
7. Adicionar GIST index para geo (P5)
8. Fix N+1 no chat (P1)
9. Fix moderation unbounded query (P2)

### Fase 3 — Testes Críticos
10. Testes para PaymentService/StripeService
11. Testes para CryptoPaymentService
12. Testes para AML Screening Worker
13. Testes para Outbox/EventDispatcher

### Fase 4 — Qualidade
14. Extrair EvmChainAdapter base class
15. Consolidar duplicações (email, API_BASE, Expo URL)
16. Substituir `any` por tipos corretos
17. Adicionar cache em analytics/categories/search
