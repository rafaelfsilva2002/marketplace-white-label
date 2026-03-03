# ADR 016: Escalabilidade de Busca Vetorial para Features de IA

## Status

**Aceito** — Março 2026

## Contexto

Funcionalidades de IA como busca semântica, recomendações inteligentes, matching entre compradores e vendedores, e detecção de fraude dependem fundamentalmente de representações vetoriais (embeddings) dos dados. A busca textual tradicional (Algolia, ADR 004) resolve buscas por keywords, mas não captura intenção semântica — um usuário buscando "profissional de design gráfico para branding" deve encontrar "designer especializado em identidade visual" mesmo sem correspondência textual exata.

No contexto multi-tenant, cada tenant opera um marketplace com domínio semântico potencialmente distinto. Embeddings devem ser isolados por tenant para evitar vazamento de informações e garantir relevância contextual. Um tenant de marketplace de saúde e outro de serviços jurídicos não devem ter seus vetores misturados em buscas de similaridade.

A escolha entre pgvector (extensão PostgreSQL) e Pinecone (banco vetorial gerenciado) impacta diretamente custo, operação, latência e escalabilidade. A decisão deve considerar o volume de vetores por tenant, a frequência de atualizações e os requisitos de latência das features de IA.

## Decisão

Adotamos uma **estratégia híbrida** de armazenamento vetorial:

### 1. pgvector como Camada Primária

Para tenants com até 1 milhão de embeddings, utilizamos pgvector integrado ao PostgreSQL existente:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    entity_type     VARCHAR(50) NOT NULL,  -- PRODUCT, PROFILE, LISTING, QUERY
    entity_id       UUID NOT NULL,
    model_version   VARCHAR(50) NOT NULL,  -- 'text-embedding-3-small-v1'
    embedding       vector(1536) NOT NULL,
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice IVFFlat para busca aproximada com isolamento por tenant
CREATE INDEX idx_embeddings_tenant_cosine
    ON embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
    WHERE tenant_id IS NOT NULL;

-- Índice HNSW para tenants de alto volume
CREATE INDEX idx_embeddings_hnsw
    ON embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

### 2. Pinecone para Tenants de Alto Volume

Tenants com mais de 1 milhão de embeddings são migrados para namespaces dedicados no Pinecone:

```typescript
interface VectorSearchAdapter {
  upsert(tenantId: string, vectors: VectorRecord[]): Promise<void>;
  query(tenantId: string, vector: number[], topK: number, filter?: MetadataFilter): Promise<SearchResult[]>;
  delete(tenantId: string, ids: string[]): Promise<void>;
}

class PineconeAdapter implements VectorSearchAdapter {
  async query(tenantId: string, vector: number[], topK: number, filter?: MetadataFilter) {
    return this.client.query({
      namespace: `tenant-${tenantId}`,
      vector,
      topK,
      filter: { ...filter, tenant_id: tenantId },
      includeMetadata: true,
    });
  }
}

class PgVectorAdapter implements VectorSearchAdapter {
  async query(tenantId: string, vector: number[], topK: number, filter?: MetadataFilter) {
    return this.repo.query(`
      SELECT entity_id, entity_type, metadata,
             1 - (embedding <=> $1::vector) AS similarity
      FROM embeddings
      WHERE tenant_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [JSON.stringify(vector), tenantId, topK]);
  }
}
```

### 3. Features de IA Suportadas

| Feature | Descrição | Tipo de Embedding |
|---|---|---|
| Smart Matching | Conecta compradores a vendedores por similaridade semântica | Profile + Query |
| Recommendation Engine | "Itens similares" e "Também pode gostar" | Product + Interaction |
| Semantic Search | Busca por intenção além de keywords | Query + Product |
| Fraud Detection Signals | Padrões anômalos em transações | Transaction embedding |

### 4. Pipeline de Geração de Embeddings

```
[Evento de Criação/Atualização] --> [Message Queue]
    --> [Embedding Worker] --> [AI Gateway (ADR 021)]
        --> [OpenAI / modelo local] --> [embedding 1536d]
            --> [Vector Store (pgvector ou Pinecone)]
```

## Consequências

### Positivas
- Busca semântica elimina a barreira do "vocabulary mismatch" — usuários encontram o que precisam mesmo sem usar os termos exatos.
- Isolamento completo de embeddings por tenant via namespace (Pinecone) ou WHERE clause (pgvector).
- Adapter pattern permite migrar tenants entre pgvector e Pinecone sem alterar a aplicação.
- Recomendações personalizadas aumentam engajamento e conversão dentro de cada marketplace.

### Negativas
- Custo de geração de embeddings via APIs de IA (mitigado com caching e batch processing).
- Latência de indexação: novos itens levam segundos a minutos para aparecer em buscas vetoriais.
- Complexidade operacional de manter dois backends de vetores (pgvector + Pinecone).
- Qualidade das features de IA depende diretamente da qualidade dos dados de entrada.

## Implementação

- **Embedding Worker** como consumer de fila Redis Streams, processando em batches de 100.
- **Model versioning** registrado na coluna `model_version` — reindexação quando modelo é atualizado.
- **Cache de embeddings** de queries frequentes no Redis com TTL de 1 hora.
- **Threshold de migração** automático: quando tenant atinge 800k vetores, alerta para planejamento de migração para Pinecone.
- **Feature flags** por tenant controlam quais features de IA estão habilitadas.

## Validação

- Testes de relevância: queries de teste com resultados esperados, medidos por Recall@10 e MRR.
- Teste de isolamento: busca vetorial de um tenant jamais retorna resultados de outro tenant.
- Benchmark de latência: p50 < 50ms, p99 < 200ms para queries vetoriais.
- Teste de consistência: verificar que atualização de entidade gera novo embedding em < 30s.
- Teste de failover: indisponibilidade do Pinecone faz fallback para pgvector (tenants com dual-write).

## Emenda v1.1 — Sync Automático via Eventos de Domínio (Março 2026)

O pipeline de geração de embeddings (Seção 4) é substituído por um modelo event-driven usando o outbox pattern (ADR-005).

### Antes (Batch)
```
[Cron job] → [busca entidades sem embedding] → [gera embeddings em batch] → [pgvector]
```

### Depois (Event-Driven)
```
[Entidade criada/atualizada] → [outbox: embedding.sync.requested]
    → [Embedding Sync Worker] → [AI Gateway (ADR-024)]
        → [embedding gerado] → [pgvector + outbox: embedding.sync.completed]
```

### Benefícios da Mudança
- **SLO definido**: embedding disponível em < 60 segundos (vs minutos/horas no batch)
- **Consistência**: impossível ter entidade sem embedding — o evento é transacional
- **Observabilidade**: cada sync é rastreável via correlationId do evento
- **Reprocessamento**: replay de eventos do outbox re-gera embeddings automaticamente

### Monitoramento de Freshness

```sql
-- View para detectar embeddings desatualizados
CREATE VIEW embedding_freshness AS
SELECT
    e.tenant_id,
    e.entity_type,
    COUNT(*) FILTER (WHERE e.updated_at < source.updated_at) AS stale_count,
    COUNT(*) AS total_count,
    ROUND(
        100.0 * COUNT(*) FILTER (WHERE e.updated_at >= source.updated_at) / COUNT(*),
        2
    ) AS freshness_pct
FROM embeddings e
JOIN entities source ON e.entity_id = source.id AND e.tenant_id = source.tenant_id
GROUP BY e.tenant_id, e.entity_type;
```

Alertas são disparados quando `freshness_pct` cai abaixo de 95% para qualquer tenant.

## Referências

- ADR 004 — Algolia Isolation
- ADR 005 — Outbox Replay (Emenda v1.1: Embedding Sync Events)
- ADR 013 — Trust Infrastructure
- ADR 015 — Edge Computing para Aplicações Globais
- ADR 021 — Governança de Shadow AI
- ADR 024 — AI Gateway Routing
- ADR 025 — Embeddings como Primeira Classe
- REQ-AI-001 — Requisitos de Features de Inteligência Artificial
