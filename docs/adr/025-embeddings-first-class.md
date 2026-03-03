# ADR 025: Embeddings como Primeira Classe com Sync Automático

## Status

**Aceito** — Março 2026

## Contexto

O ADR 016 definiu a estratégia de armazenamento vetorial (pgvector + Pinecone) e o ADR 021 estabeleceu o AI Gateway como ponto único de acesso a provedores de IA. No entanto, a geração e sincronização de embeddings permanece um processo ad-hoc: cada feature que precisa de embeddings implementa sua própria lógica de geração, armazenamento e atualização. Isso resulta em:

1. **Embeddings desatualizados**: Quando uma entidade é atualizada (perfil, produto, listing), não há garantia de que o embedding correspondente será recalculado. Buscas semânticas retornam resultados baseados em dados stale.
2. **Duplicação de lógica**: Cada serviço reimplementa o pipeline de geração de embeddings (chamar AI Gateway, formatar input, armazenar no pgvector), violando DRY.
3. **Falta de observabilidade**: Sem um sistema centralizado, é impossível saber qual percentual dos embeddings está atualizado, quanto tempo leva para sincronizar após uma mudança, ou quais entidades estão sem embedding.
4. **Inconsistência de modelos**: Diferentes serviços podem gerar embeddings com modelos diferentes ou versões diferentes, tornando buscas cross-feature incoerentes.

O Outbox Pattern (ADR 005) já garante que eventos de domínio são publicados de forma confiável. Ao tratar embeddings como cidadãos de primeira classe do sistema, podemos reaproveitar a infraestrutura de eventos existente para manter embeddings automaticamente sincronizados com os dados de origem.

## Decisão

Implementamos um **sistema de sincronização automática de embeddings** baseado em eventos de domínio, tratando embeddings como artefatos derivados que devem estar sempre consistentes com a entidade de origem.

### 1. EmbeddingEventHandler — Captura de Eventos de Domínio

O handler intercepta eventos de criação e atualização de entidades e enfileira jobs de sincronização de embeddings:

```typescript
// embeddings/src/handlers/embedding-event-handler.ts
@Injectable()
export class EmbeddingEventHandler {
  private readonly EMBEDDING_EVENTS: Record<string, EmbeddingConfig> = {
    'profile.created.v1': {
      entityType: 'PROFILE',
      textExtractor: ProfileTextExtractor,
      priority: 'HIGH',
    },
    'profile.updated.v1': {
      entityType: 'PROFILE',
      textExtractor: ProfileTextExtractor,
      priority: 'NORMAL',
    },
    'product.created.v1': {
      entityType: 'PRODUCT',
      textExtractor: ProductTextExtractor,
      priority: 'HIGH',
    },
    'product.updated.v1': {
      entityType: 'PRODUCT',
      textExtractor: ProductTextExtractor,
      priority: 'NORMAL',
    },
    'listing.published.v1': {
      entityType: 'LISTING',
      textExtractor: ListingTextExtractor,
      priority: 'HIGH',
    },
    'listing.updated.v1': {
      entityType: 'LISTING',
      textExtractor: ListingTextExtractor,
      priority: 'NORMAL',
    },
  };

  constructor(
    private readonly syncQueue: EmbeddingSyncQueue,
    private readonly syncStatusRepo: EmbeddingSyncStatusRepository,
  ) {}

  @OnEvent('domain.*')
  async handleDomainEvent(event: DomainEvent): Promise<void> {
    const config = this.EMBEDDING_EVENTS[event.type];
    if (!config) return; // Evento não relevante para embeddings

    const entityId = event.payload[`${config.entityType.toLowerCase()}Id`] ?? event.payload.id;

    // Registrar status de sincronização como PENDING
    await this.syncStatusRepo.upsert({
      tenantId: event.tenantId,
      entityType: config.entityType,
      entityId,
      eventId: event.id,
      eventType: event.type,
      status: 'PENDING',
      scheduledAt: new Date(),
    });

    // Enfileirar job de sincronização
    await this.syncQueue.add(
      {
        tenantId: event.tenantId,
        entityType: config.entityType,
        entityId,
        eventId: event.id,
        textExtractor: config.textExtractor.name,
      },
      {
        priority: config.priority === 'HIGH' ? 1 : 5,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );
  }
}
```

### 2. EmbeddingSyncWorker — Geração e Armazenamento de Embeddings

O worker processa jobs da fila, extrai texto da entidade, gera embeddings via AI Gateway (ADR 024), e armazena no pgvector:

```typescript
// embeddings/src/workers/embedding-sync-worker.ts
@Processor('embedding-sync')
export class EmbeddingSyncWorker {
  private readonly textExtractors: Record<string, TextExtractor>;

  constructor(
    private readonly aiGateway: AiGatewayClient,
    private readonly embeddingRepo: EmbeddingRepository,
    private readonly syncStatusRepo: EmbeddingSyncStatusRepository,
    private readonly entityLoader: EntityLoaderService,
    private readonly metricsCollector: EmbeddingMetricsCollector,
  ) {
    this.textExtractors = {
      ProfileTextExtractor: new ProfileTextExtractor(),
      ProductTextExtractor: new ProductTextExtractor(),
      ListingTextExtractor: new ListingTextExtractor(),
    };
  }

  @Process()
  async syncEmbedding(job: Job<EmbeddingSyncJob>): Promise<void> {
    const { tenantId, entityType, entityId, eventId, textExtractor } = job.data;
    const startTime = performance.now();

    try {
      // 1. Marcar como PROCESSING
      await this.syncStatusRepo.updateStatus(eventId, 'PROCESSING');

      // 2. Carregar entidade atual do banco
      const entity = await this.entityLoader.load(tenantId, entityType, entityId);

      if (!entity) {
        // Entidade foi deletada entre o evento e o processamento
        await this.embeddingRepo.deleteByEntity(tenantId, entityType, entityId);
        await this.syncStatusRepo.updateStatus(eventId, 'SKIPPED', 'Entity not found');
        return;
      }

      // 3. Extrair texto relevante para embedding
      const extractor = this.textExtractors[textExtractor];
      const text = extractor.extract(entity);

      if (!text || text.trim().length === 0) {
        await this.syncStatusRepo.updateStatus(eventId, 'SKIPPED', 'Empty text');
        return;
      }

      // 4. Gerar embedding via AI Gateway
      const embeddingResponse = await this.aiGateway.generateEmbedding({
        tenantId,
        text,
        feature: 'EMBEDDING_SYNC',
        model: 'text-embedding-3-small',
      });

      // 5. Armazenar/atualizar no pgvector
      await this.embeddingRepo.upsert({
        tenantId,
        entityType,
        entityId,
        modelVersion: embeddingResponse.model,
        embedding: embeddingResponse.embedding,
        metadata: {
          textLength: text.length,
          extractedFields: extractor.getFields(),
          syncEventId: eventId,
        },
      });

      // 6. Atualizar status de sincronização
      const latencyMs = performance.now() - startTime;
      await this.syncStatusRepo.updateStatus(eventId, 'COMPLETED', null, {
        latencyMs,
        inputTokens: embeddingResponse.usage.inputTokens,
        modelUsed: embeddingResponse.model,
      });

      // 7. Registrar métricas
      this.metricsCollector.recordSync({
        tenantId,
        entityType,
        latencyMs,
        success: true,
        inputTokens: embeddingResponse.usage.inputTokens,
      });
    } catch (error) {
      const latencyMs = performance.now() - startTime;

      await this.syncStatusRepo.updateStatus(eventId, 'FAILED', error.message);

      this.metricsCollector.recordSync({
        tenantId,
        entityType,
        latencyMs,
        success: false,
        error: error.message,
      });

      // Re-throw para BullMQ retry
      throw error;
    }
  }
}
```

### 3. Text Extractors — Extração de Texto por Tipo de Entidade

```typescript
// embeddings/src/extractors/text-extractor.ts
interface TextExtractor {
  extract(entity: unknown): string;
  getFields(): string[];
}

class ProfileTextExtractor implements TextExtractor {
  extract(entity: Profile): string {
    const parts = [
      entity.displayName,
      entity.bio,
      entity.skills?.join(', '),
      entity.location?.city,
      entity.specializations?.join(', '),
      entity.serviceDescription,
    ];
    return parts.filter(Boolean).join(' | ');
  }

  getFields(): string[] {
    return ['displayName', 'bio', 'skills', 'location', 'specializations', 'serviceDescription'];
  }
}

class ProductTextExtractor implements TextExtractor {
  extract(entity: Product): string {
    const parts = [
      entity.title,
      entity.description,
      entity.category?.name,
      entity.tags?.join(', '),
      entity.attributes?.map((a) => `${a.name}: ${a.value}`).join(', '),
    ];
    return parts.filter(Boolean).join(' | ');
  }

  getFields(): string[] {
    return ['title', 'description', 'category', 'tags', 'attributes'];
  }
}

class ListingTextExtractor implements TextExtractor {
  extract(entity: Listing): string {
    const parts = [
      entity.title,
      entity.description,
      entity.requirements,
      entity.category?.name,
      entity.location?.city,
      entity.keywords?.join(', '),
    ];
    return parts.filter(Boolean).join(' | ');
  }

  getFields(): string[] {
    return ['title', 'description', 'requirements', 'category', 'location', 'keywords'];
  }
}
```

### 4. Schema de Banco — Status de Sincronização

```sql
-- Tabela de rastreamento de sincronização de embeddings
CREATE TABLE embedding_sync_status (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    entity_type     VARCHAR(50) NOT NULL,
    entity_id       UUID NOT NULL,
    event_id        UUID NOT NULL,
    event_type      VARCHAR(128) NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED')),
    error_message   TEXT,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    latency_ms      INTEGER,
    input_tokens    INTEGER,
    model_used      VARCHAR(100),
    retry_count     SMALLINT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para monitoramento de SLO (encontrar pendentes e atrasados)
CREATE INDEX idx_sync_status_pending
    ON embedding_sync_status (status, scheduled_at)
    WHERE status IN ('PENDING', 'PROCESSING');

-- Índice para consulta por entidade (verificar se embedding está atualizado)
CREATE INDEX idx_sync_status_entity
    ON embedding_sync_status (tenant_id, entity_type, entity_id, created_at DESC);

-- Índice para métricas por tenant
CREATE INDEX idx_sync_status_metrics
    ON embedding_sync_status (tenant_id, entity_type, status, completed_at);

-- View para monitoramento de SLO
CREATE VIEW embedding_sync_slo AS
SELECT
    tenant_id,
    entity_type,
    date_trunc('hour', completed_at) AS hour,
    COUNT(*) AS total_syncs,
    COUNT(*) FILTER (WHERE latency_ms <= 60000) AS within_slo,
    ROUND(
        COUNT(*) FILTER (WHERE latency_ms <= 60000)::numeric / COUNT(*)::numeric * 100,
        2
    ) AS slo_percentage,
    ROUND(AVG(latency_ms)::numeric, 0) AS avg_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms) AS p99_latency_ms
FROM embedding_sync_status
WHERE status = 'COMPLETED'
    AND completed_at >= NOW() - INTERVAL '7 days'
GROUP BY tenant_id, entity_type, date_trunc('hour', completed_at);
```

### 5. Fluxo Completo: Entity Change → Embedding Atualizado

```
[Serviço de Domínio]
    │
    ├── 1. Atualiza entidade no banco (ex: profile.update)
    ├── 2. Grava evento na tabela outbox (mesma transação — ADR 005)
    │       └── event_type: 'profile.updated.v1'
    │
    ▼
[Outbox Dispatcher] (ADR 005)
    │
    ├── 3. Publica evento no message broker (Redis Streams)
    │
    ▼
[EmbeddingEventHandler]
    │
    ├── 4. Identifica evento como relevante para embeddings
    ├── 5. Cria registro em embedding_sync_status (PENDING)
    ├── 6. Enfileira job no BullMQ (fila 'embedding-sync')
    │
    ▼
[EmbeddingSyncWorker]
    │
    ├── 7. Carrega entidade atual do banco
    ├── 8. Extrai texto via TextExtractor adequado
    ├── 9. Chama AI Gateway (ADR 024) para gerar embedding
    │       └── ModelRouter seleciona modelo mais custo-eficiente
    ├── 10. Armazena embedding no pgvector (tabela embeddings — ADR 016)
    ├── 11. Atualiza embedding_sync_status → COMPLETED
    │
    ▼
[pgvector / Pinecone]
    └── Embedding disponível para busca semântica, matching, recomendações

SLO: Passos 1-11 completados em < 60 segundos para 95% dos eventos
```

### 6. Reindexação em Massa (Model Migration)

Quando o modelo de embeddings é atualizado, todos os embeddings existentes devem ser recalculados:

```typescript
// embeddings/src/jobs/bulk-reindex.ts
@Injectable()
export class BulkReindexService {
  async reindex(
    tenantId: string,
    entityType: string,
    newModelVersion: string,
  ): Promise<ReindexResult> {
    // Buscar todas as entidades com embedding de versão anterior
    const outdated = await this.embeddingRepo.findByModelVersionNot(
      tenantId,
      entityType,
      newModelVersion,
    );

    this.logger.log(
      `Starting bulk reindex: ${outdated.length} ${entityType} embeddings for tenant ${tenantId}`,
    );

    // Enfileirar em batches para não sobrecarregar o AI Gateway
    const BATCH_SIZE = 100;
    let enqueued = 0;

    for (let i = 0; i < outdated.length; i += BATCH_SIZE) {
      const batch = outdated.slice(i, i + BATCH_SIZE);

      await this.syncQueue.addBulk(
        batch.map((entry) => ({
          data: {
            tenantId,
            entityType,
            entityId: entry.entityId,
            eventId: `reindex-${entry.id}`,
            textExtractor: this.getExtractorName(entityType),
          },
          opts: {
            priority: 10, // Prioridade baixa (não bloquear sync de eventos novos)
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        })),
      );

      enqueued += batch.length;
    }

    return { totalEntities: outdated.length, enqueued };
  }
}
```

## Consequências

### Positivas
- Embeddings sempre sincronizados com dados de origem — busca semântica reflete o estado atual das entidades.
- Reutilização da infraestrutura de outbox (ADR 005) elimina necessidade de mecanismo de sync separado.
- Observabilidade completa: tabela `embedding_sync_status` permite rastrear o estado de cada embedding.
- SLO mensurável: view SQL calcula p95 de latência de sincronização por tenant e tipo de entidade.
- Reindexação em massa automatizada quando modelo de embeddings é atualizado.
- Consistência de modelo: todos os embeddings são gerados pelo mesmo pipeline, via AI Gateway (ADR 024).
- Priorização: embeddings de entidades recém-criadas têm prioridade sobre atualizações.

### Negativas
- Custo de IA proporcional ao volume de eventos: cada criação/atualização de entidade gera uma chamada de embedding.
- Latência eventual: até 60 segundos entre a mudança da entidade e a disponibilidade do novo embedding para busca.
- Dependência do AI Gateway: indisponibilidade do gateway impacta sincronização de embeddings (mitigado com retry e circuit breaker do ADR 024).
- Reindexação em massa pode ser custosa e demorada para tenants com milhões de entidades.
- Complexidade de TextExtractors: quando schema de entidade muda, extractor deve ser atualizado para incluir novos campos.

## Implementação

- **EmbeddingEventHandler** como consumer de eventos no módulo de embeddings, inscrito em eventos de domínio via BullMQ.
- **EmbeddingSyncWorker** como processor BullMQ com concorrência configurável por ambiente (default: 10 workers).
- **TextExtractors** implementados por tipo de entidade, com testes unitários para garantir extração correta.
- **BulkReindexService** como job Temporal para reindexação com controle de progresso e resumability.
- **Alertas** para: SLO < 95%, fila de sync > 10.000 jobs, taxa de falha > 5%.
- **Grafana Dashboard** com painéis: sync latency p50/p95/p99, queue depth, sync status distribution, SLO compliance.
- **Cleanup job** diário remove registros de `embedding_sync_status` com mais de 30 dias (exceto FAILED).

## Validação

- Teste de sync automático: criar/atualizar entidade e verificar que embedding é gerado em < 60s.
- Teste de idempotência: publicar mesmo evento duas vezes e verificar que embedding é gerado apenas uma vez (ou atualizado sem duplicação).
- Teste de entidade deletada: deletar entidade entre evento e processamento e verificar que embedding anterior é removido.
- Teste de texto vazio: entidade com campos relevantes vazios resulta em status SKIPPED sem embedding.
- Teste de fallback: simular falha do AI Gateway e verificar que job é retentado com backoff exponencial.
- Teste de reindexação: executar bulk reindex e verificar que todos os embeddings são atualizados com novo modelo.
- Teste de SLO: processar 1000 eventos e verificar que 95% completam em < 60s.
- Teste de isolamento: embeddings de um tenant jamais são acessíveis por outro tenant.
- Teste de prioridade: eventos HIGH são processados antes de eventos NORMAL na fila.

## Referências

- ADR 005 — Outbox Pattern e Replay de Eventos
- ADR 016 — Escalabilidade de Busca Vetorial para Features de IA
- ADR 021 — Governança de Shadow AI
- ADR 024 — AI Gateway — Roteamento Inteligente Multi-Provider
- REQ-AI-004 — Requisitos de Sincronização de Embeddings
