# ADR 020: Expor APIs de Gerenciamento para Clientes Enterprise

## Status

**Aceito** — Março 2026

## Contexto

Clientes enterprise que adotam a plataforma marketplace white-label frequentemente operam dentro de ecossistemas de TI complexos. Possuem provedores de identidade corporativos (Okta, Azure AD, OneLogin), sistemas de governança de acesso (IAM), ferramentas de SIEM para auditoria, e processos automatizados de provisionamento e desprovisionamento de usuários. Para que a plataforma seja adotada em escala enterprise, ela precisa se integrar nativamente a esses ecossistemas.

Sem APIs de gerenciamento, cada operação administrativa requer acesso manual ao painel da plataforma: criar usuários, atribuir roles, exportar logs de auditoria, configurar features. Isso é inaceitável para organizações com milhares de usuários, múltiplas equipes e requisitos de compliance que exigem automação completa do ciclo de vida de identidade.

Além disso, a tendência de "self-service tenant administration" reduz drasticamente o custo de suporte: clientes enterprise configuram e gerenciam seus próprios marketplaces via API, sem depender da equipe de suporte da plataforma.

## Decisão

Expomos **APIs de gerenciamento** que permitem a clientes enterprise integrar a plataforma com seus sistemas corporativos:

### 1. SCIM 2.0 para Provisionamento de Usuários

```typescript
// SCIM endpoints — RFC 7644
// POST   /scim/v2/Users          — Criar usuário
// GET    /scim/v2/Users/:id      — Consultar usuário
// PUT    /scim/v2/Users/:id      — Atualizar usuário
// PATCH  /scim/v2/Users/:id      — Atualização parcial
// DELETE /scim/v2/Users/:id      — Desprovisionamento
// GET    /scim/v2/Groups         — Listar grupos/roles
// POST   /scim/v2/Groups         — Criar grupo/role

// Exemplo de payload SCIM para criação de usuário
interface ScimUser {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'];
  userName: string;           // email corporativo
  name: {
    givenName: string;
    familyName: string;
  };
  emails: Array<{ value: string; primary: boolean }>;
  active: boolean;
  roles: Array<{ value: string }>; // ADMIN, SELLER, BUYER, SUPPORT
  'urn:marketplace:scim:tenant': {
    tenantId: string;
    departmentCode?: string;
  };
}
```

### 2. Integração com Identity Providers

```typescript
// config/sso.config.ts — configuração por tenant
interface TenantSsoConfig {
  tenantId: string;
  provider: 'OKTA' | 'AZURE_AD' | 'ONELOGIN' | 'CUSTOM_SAML' | 'CUSTOM_OIDC';
  saml?: {
    entityId: string;
    ssoUrl: string;
    certificate: string;
    attributeMapping: Record<string, string>;
  };
  oidc?: {
    issuer: string;
    clientId: string;
    clientSecret: string; // encrypted at rest
    scopes: string[];
  };
  jitProvisioning: boolean;   // Just-in-Time user creation no primeiro login
  defaultRole: string;
  enforceSso: boolean;        // bloquear login por email/senha
}
```

### 3. API de Exportação de Audit Logs

```typescript
// GET /api/v1/management/audit-logs
// Query params: from, to, actor_id, action, entity_type, page, limit

interface AuditLogExport {
  data: AuditLogEntry[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
  exportFormats: ['JSON', 'CSV', 'CEF']; // CEF para integração com SIEMs
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: { id: string; email: string; type: string };
  action: string;
  resource: { type: string; id: string };
  outcome: 'SUCCESS' | 'FAILURE';
  sourceIp: string;
  userAgent: string;
  metadata: Record<string, unknown>;
}
```

### 4. API de Configuração de Tenant

```typescript
// Endpoints de configuração self-service
// GET    /api/v1/management/config                  — Configuração completa
// PATCH  /api/v1/management/config/branding         — Tema e marca
// PATCH  /api/v1/management/config/features         — Feature flags
// PATCH  /api/v1/management/config/notifications    — Preferências de notificação
// PATCH  /api/v1/management/config/compliance       — Configurações de compliance
// GET    /api/v1/management/config/webhooks         — Webhooks registrados
// POST   /api/v1/management/config/webhooks         — Registrar webhook
// DELETE /api/v1/management/config/webhooks/:id     — Remover webhook
```

### 5. Autenticação das Management APIs

```
[Cliente Enterprise] ---> [API Key + Tenant ID no header]
                     ---> [Rate limit: 1000 req/min por tenant]
                     ---> [Scoped permissions: management:users, management:config, etc.]
                     ---> [Audit log de toda chamada à management API]
```

## Consequências

### Positivas
- Integração nativa com ecossistemas enterprise (Okta, Azure AD) elimina barreiras de adoção.
- SCIM automatiza provisionamento/desprovisionamento — reduz risco de acessos órfãos.
- Exportação de audit logs em CEF permite integração direta com SIEMs corporativos.
- Self-service reduz volume de tickets de suporte em 40-60% para operações administrativas.
- Webhooks permitem automações customizadas por parte do cliente.

### Negativas
- Superfície de ataque ampliada: management APIs são alvos de alto valor e exigem segurança redobrada.
- Complexidade de manutenção: SCIM 2.0 tem especificação extensa com edge cases.
- Suporte a múltiplos IdPs (SAML, OIDC) multiplica cenários de teste e configuração.
- Necessidade de documentação detalhada e SDKs para facilitar integração.

## Implementação

- **Módulo NestJS** `@marketplace/management-api` com guard dedicado para API keys de management.
- **SCIM server** via biblioteca `scimmy` adaptada para o modelo multi-tenant.
- **Passport.js** com strategies para SAML e OIDC, configuráveis por tenant.
- **Rate limiting** via Redis com limites configuráveis por tenant e por endpoint.
- **Swagger/OpenAPI** auto-gerado para documentação interativa das management APIs.
- **SDK TypeScript** publicado como pacote npm para facilitar integração por clientes.

## Validação

- Testes de conformidade SCIM 2.0 usando test suite oficial do protocolo.
- Testes de integração com Okta e Azure AD em ambiente sandbox.
- Teste de audit log: toda chamada à management API gera entrada verificável.
- Teste de isolamento: API key de um tenant jamais acessa dados de outro.
- Teste de rate limiting: exceder o limite retorna 429 com header `Retry-After`.
- Pen test dedicado para management APIs com foco em IDOR e privilege escalation.

## Referências

- ADR 001 — Modelo de Isolamento de Dados Multi-tenancy
- ADR 002 — Host Trust Boundary
- ADR 013 — Trust Infrastructure
- ADR 023 — Estratégia de API Versionamento
- REQ-ENT-001 — Requisitos de Clientes Enterprise
