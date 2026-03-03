# ADR 013: Trust Infrastructure como Camada Fundamental

## Status

**Aceito** — Março 2026

## Contexto

Em uma plataforma multi-tenant SaaS marketplace, confiança não pode ser tratada como uma feature isolada ou um requisito não-funcional secundário. Cada transação financeira processada via Stripe Connect, cada match entre compradores e vendedores, e cada registro de dados pessoais exige rastreabilidade criptográfica completa. Regulações como LGPD, PCI-DSS e SOC 2 Type II demandam provas auditáveis de que dados foram manipulados corretamente ao longo de todo o ciclo de vida.

O modelo multi-tenant agrava a complexidade: dados de um tenant jamais devem vazar para outro, e cada transformação de dados precisa ser atribuível a um ator, serviço e timestamp específicos. Sem uma camada de confiança transversal, cada serviço implementaria suas próprias garantias de forma inconsistente, criando lacunas exploráveis e dificultando auditorias.

Além disso, a arquitetura de microsserviços exige uma postura de zero-trust entre serviços internos. Nenhum serviço deve confiar implicitamente em outro — toda comunicação deve ser autenticada, autorizada e registrada. Isso é especialmente crítico quando serviços lidam com crypto rails (ADR 008) e reconciliação financeira (ADR 009).

## Decisão

Adotamos **Trust Infrastructure como camada arquitetural fundamental** que permeia todos os serviços. Os pilares são:

### 1. Data Lineage Tracking

Toda transformação de dados é registrada na tabela `data_lineage`:

```sql
CREATE TABLE data_lineage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    entity_type     VARCHAR(100) NOT NULL,
    entity_id       UUID NOT NULL,
    operation       VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, TRANSFORM
    source_service  VARCHAR(100) NOT NULL,
    actor_id        UUID,
    actor_type      VARCHAR(50), -- USER, SYSTEM, API_KEY, WEBHOOK
    payload_hash    VARCHAR(128) NOT NULL, -- SHA-512 do payload
    parent_lineage  UUID REFERENCES data_lineage(id),
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_lineage_tenant_entity ON data_lineage(tenant_id, entity_type, entity_id);
CREATE INDEX idx_lineage_chain ON data_lineage(parent_lineage);
```

### 2. Policy-as-Code com Open Policy Agent (OPA)

Políticas de autorização e conformidade são definidas em Rego e avaliadas em tempo de execução:

```rego
package marketplace.trust

default allow = false

allow {
    input.actor.tenant_id == input.resource.tenant_id
    input.actor.roles[_] == "admin"
}

allow {
    input.actor.tenant_id == input.resource.tenant_id
    input.action == "read"
    input.actor.permissions[_] == concat(":", ["read", input.resource.type])
}

audit_required {
    input.resource.type == "financial_transaction"
}

audit_required {
    input.action == "delete"
}
```

### 3. Audit Trails Criptográficos

Cada entrada de auditoria é encadeada criptograficamente (hash chain), impedindo adulteração retroativa:

```typescript
interface AuditEntry {
  id: string;
  tenantId: string;
  previousHash: string;     // hash da entrada anterior
  entryHash: string;        // SHA-256(previousHash + payload + timestamp)
  payload: Record<string, unknown>;
  timestamp: string;
  signature: string;         // assinatura digital com chave do serviço
}
```

### 4. Zero-Trust entre Serviços

- Toda comunicação inter-serviço usa mTLS com certificados rotacionados automaticamente.
- Tokens JWT de curta duração (5 min) para chamadas service-to-service.
- Cada request inclui `X-Tenant-Id`, `X-Correlation-Id` e `X-Source-Service` nos headers.
- O API Gateway valida esses headers antes de rotear para qualquer serviço.

## Consequências

### Positivas
- Rastreabilidade completa de cada transformação de dados — essencial para auditorias SOC 2 e LGPD.
- Políticas de segurança versionadas e testáveis (Rego), eliminando lógica de autorização ad hoc.
- Detecção de adulteração via hash chain — qualquer modificação retroativa invalida a cadeia.
- Isolamento comprovável entre tenants por meio de políticas OPA avaliadas em cada request.
- Base sólida para compliance regulatório em múltiplas jurisdições.

### Negativas
- Overhead de latência: cada operação requer escrita em `data_lineage` e avaliação OPA (~2-5ms adicionais).
- Complexidade operacional: OPA, sistema de certificados mTLS e tabela de lineage exigem manutenção dedicada.
- Volume de armazenamento: a tabela `data_lineage` cresce rapidamente e requer estratégia de particionamento e arquivamento.
- Curva de aprendizado da linguagem Rego para toda a equipe de engenharia.

## Implementação

- **Interceptor NestJS** registra automaticamente em `data_lineage` via decorator `@Traceable()`.
- **OPA Sidecar** executa junto a cada serviço, com políticas sincronizadas via bundle server.
- **Particionamento** da tabela `data_lineage` por `tenant_id` e mês (range partition).
- **Cron job** arquiva registros com mais de 12 meses para cold storage (S3 + Parquet).
- **Dashboard Grafana** exibe métricas de lineage, violações de política e integridade da hash chain.

## Validação

- Testes de integração verificam que toda operação CRUD gera entrada em `data_lineage`.
- Testes de contrato OPA garantem que políticas Rego rejeitam acesso cross-tenant.
- Script de validação percorre a hash chain e detecta quebras de integridade.
- Testes de carga medem o overhead de latência (meta: < 5ms p99 adicional).
- Simulação de auditoria trimestral com dados reais para validar completude.

## Referências

- ADR 001 — Modelo de Isolamento de Dados Multi-tenancy
- ADR 002 — Host Trust Boundary
- ADR 008 — Crypto Rail Adapter
- ADR 009 — Crypto Reconciliation Ledger
- ADR 010 — Crypto Compliance AML
- REQ-SEC-001 — Requisitos de Segurança e Auditoria
