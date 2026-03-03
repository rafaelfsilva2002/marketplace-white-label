# ADR 005: Outbox Pattern e Replay de Eventos

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

A plataforma e orientada a eventos: acoes de dominio (criacao de pedido, atualizacao de perfil, processamento de pagamento) geram eventos que sao consumidos por multiplos servicos (indexacao no Algolia, notificacoes, ledger financeiro, etc.). A comunicacao assincrona via eventos e essencial para desacoplar os servicos e permitir escalabilidade independente.

O problema classico de consistencia entre banco de dados e message broker e o "dual write": se a aplicacao grava no banco e depois publica no broker, uma falha entre as duas operacoes deixa o sistema em estado inconsistente (dado gravado mas evento nao publicado, ou vice-versa). Transacoes distribuidas (2PC) sao complexas, lentas e frageis.

O Outbox Pattern resolve esse problema gravando o evento na mesma transacao do banco de dados, em uma tabela dedicada (`outbox`). Um processo separado (dispatcher) le a tabela outbox e publica os eventos no broker. Isso garante consistencia eventual com semantica de entrega at-least-once, exigindo que consumidores sejam idempotentes.

## Decisao

Adotamos o **Outbox Pattern** como mecanismo padrao de publicacao de eventos de dominio. Todos os eventos sao gravados na tabela `outbox` dentro da mesma transacao de negocio, e um dispatcher assincrono publica os eventos com retry e backoff exponencial.

### Envelope padrao de evento:

Todo evento segue um formato de envelope padrao para garantir consistencia, rastreabilidade e versionamento:

- `id`: UUID unico do evento
- `type`: Tipo do evento (ex: `profile.updated.v1`)
- `version`: Versao do schema do payload
- `tenantId`: Identificador do tenant de origem
- `timestamp`: Momento de criacao do evento (ISO 8601)
- `correlationId`: ID para rastreamento de cadeia de eventos
- `payload`: Dados especificos do evento

### Justificativas:

1. **Consistencia transacional**: Evento e gravado no banco na mesma transacao que a mudanca de dominio. Impossivel ter dado sem evento ou evento sem dado.
2. **At-least-once delivery**: O dispatcher garante que todo evento sera publicado, mesmo que sejam necessarias retentativas.
3. **Idempotencia do consumidor**: Como consequencia do at-least-once, consumidores sao projetados para processar o mesmo evento multiplas vezes sem efeitos colaterais.
4. **Replay de eventos**: A tabela outbox serve como log historico. Eventos podem ser re-publicados para correcao de bugs ou reprocessamento.

## Consequencias

### Positivas
- Eliminacao completa do problema de dual write.
- Garantia de que todo evento de dominio sera eventualmente publicado.
- Capacidade de replay de eventos para correcao ou migracao de dados.
- Auditoria completa de todos os eventos de dominio com timestamps e correlation IDs.
- Desacoplamento total entre produtores e consumidores de eventos.
- Versionamento de eventos permite evolucao de schema sem breaking changes.

### Negativas
- Latencia adicional entre gravacao do evento e publicacao (tipicamente 100-500ms no polling).
- Tabela outbox cresce rapidamente e necessita de politica de retencao/archiving.
- Complexidade adicional do dispatcher (polling, retry, dead letter).
- Consumidores devem ser implementados como idempotentes, aumentando complexidade.
- Ordenacao de eventos so e garantida por aggregate (nao globalmente).

## Implementacao

### Schema da tabela outbox

```sql
CREATE TABLE outbox (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL,
  event_type      VARCHAR(128) NOT NULL,
  event_version   SMALLINT    NOT NULL DEFAULT 1,
  correlation_id  UUID        NOT NULL,
  payload         JSONB       NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at    TIMESTAMPTZ,
  retry_count     SMALLINT    NOT NULL DEFAULT 0,
  next_retry_at   TIMESTAMPTZ,
  status          VARCHAR(16) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED', 'DEAD'))
);

CREATE INDEX idx_outbox_pending
  ON outbox (status, next_retry_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE INDEX idx_outbox_tenant_type
  ON outbox (tenant_id, event_type, created_at);
```

### Servico de publicacao de eventos (dentro da transacao)

```typescript
@Injectable()
export class DomainEventPublisher {
  constructor(private readonly outboxRepo: OutboxRepository) {}

  async publish(
    entityManager: EntityManager,
    event: DomainEvent,
  ): Promise<void> {
    await this.outboxRepo.save(entityManager, {
      tenantId: event.tenantId,
      eventType: event.type,
      eventVersion: event.version,
      correlationId: event.correlationId,
      payload: event.payload,
      status: 'PENDING',
    });
  }
}

// Uso dentro de um servico de dominio
async updateProfile(tenantId: string, profileId: string, data: UpdateProfileDTO): Promise<void> {
  await this.dataSource.transaction(async (manager) => {
    const profile = await manager.findOne(Profile, { where: { tenantId, id: profileId } });
    Object.assign(profile, data);
    await manager.save(profile);

    await this.eventPublisher.publish(manager, {
      tenantId,
      type: 'profile.updated.v1',
      version: 1,
      correlationId: generateCorrelationId(),
      payload: { profile: profile.toDTO() },
    });
  });
}
```

### Dispatcher com polling e backoff exponencial

```typescript
@Injectable()
export class OutboxDispatcher {
  private readonly MAX_RETRIES = 5;
  private readonly BASE_DELAY_MS = 1000;

  @Cron('*/2 * * * * *') // A cada 2 segundos
  async poll(): Promise<void> {
    const events = await this.outboxRepo.findPending(100);

    for (const event of events) {
      try {
        await this.messageBroker.publish(event.eventType, {
          id: event.id,
          type: event.eventType,
          version: event.eventVersion,
          tenantId: event.tenantId,
          timestamp: event.createdAt.toISOString(),
          correlationId: event.correlationId,
          payload: event.payload,
        });

        await this.outboxRepo.markPublished(event.id);
      } catch (error) {
        await this.handleRetry(event, error);
      }
    }
  }

  private async handleRetry(event: OutboxEntry, error: Error): Promise<void> {
    const newRetryCount = event.retryCount + 1;

    if (newRetryCount > this.MAX_RETRIES) {
      await this.outboxRepo.markDead(event.id);
      this.logger.error(`Event ${event.id} moved to dead letter after ${this.MAX_RETRIES} retries`);
      return;
    }

    const delay = this.BASE_DELAY_MS * Math.pow(2, newRetryCount);
    const nextRetryAt = new Date(Date.now() + delay);

    await this.outboxRepo.scheduleRetry(event.id, newRetryCount, nextRetryAt);
  }
}
```

### Replay de eventos

```typescript
async replayEvents(
  tenantId: string,
  eventType: string,
  fromDate: Date,
  toDate: Date,
): Promise<number> {
  const events = await this.outboxRepo.findByRange(tenantId, eventType, fromDate, toDate);

  for (const event of events) {
    await this.outboxRepo.resetForReplay(event.id);
  }

  return events.length; // Dispatcher ira re-publicar automaticamente
}
```

## Validacao

1. **Teste de atomicidade**: Salvar entidade de dominio e evento na mesma transacao, simular falha apos INSERT e verificar que ambos sofrem rollback.
2. **Teste de delivery**: Inserir evento na outbox e verificar que o dispatcher publica no broker em menos de 5 segundos.
3. **Teste de retry**: Simular falha de publicacao e verificar backoff exponencial (1s, 2s, 4s, 8s, 16s).
4. **Teste de dead letter**: Apos 5 falhas, verificar que evento e movido para status DEAD.
5. **Teste de replay**: Executar replay de eventos e verificar que consumidores reprocessam corretamente.
6. **Teste de idempotencia do consumidor**: Publicar mesmo evento duas vezes e verificar que o efeito e aplicado apenas uma vez.
7. **Teste de ordenacao**: Verificar que eventos do mesmo aggregate sao processados na ordem de criacao.

## Emenda v1.1 — Eventos de Embedding Sync (Março 2026)

Com a adoção da arquitetura AI-Native (Artigo XI da Constituição), o outbox passa a ser o mecanismo primário de sincronização de embeddings. Toda entidade com representação vetorial DEVE gerar um evento de embedding sync via outbox.

### Novos Event Types para Embedding Sync

```typescript
// Eventos de embedding sync adicionados ao catálogo de eventos
type EmbeddingSyncEventType =
  | 'embedding.sync.requested'   // Entidade criada/atualizada → precisa de novo embedding
  | 'embedding.sync.completed'   // Embedding gerado e armazenado com sucesso
  | 'embedding.sync.failed';     // Falha na geração (DLQ após retries)

interface EmbeddingSyncEvent extends DomainEvent {
  type: EmbeddingSyncEventType;
  payload: {
    entityType: string;   // 'profile', 'listing', 'product'
    entityId: string;
    tenantId: string;
    content: string;      // texto a ser embedado (só em 'requested')
    modelVersion?: string; // versão do modelo usado (só em 'completed')
  };
}
```

### Fluxo Atualizado

```
[Serviço de Domínio] → [save entidade + evento embedding.sync.requested na mesma TX]
    → [Outbox Dispatcher] → [Message Queue]
        → [Embedding Sync Worker] → [AI Gateway (ADR-024)]
            → [Provider LLM] → [embedding 1536d]
                → [pgvector store] + [evento embedding.sync.completed via outbox]
```

### Impacto no Schema

Nenhuma mudança no schema da tabela `outbox`. Os novos event types (`embedding.sync.*`) seguem o envelope padrão existente. O Embedding Sync Worker é um novo consumidor que processa esses eventos com as mesmas garantias de idempotência e retry.

## Referencias

- [ADR 003 - Idempotencia no Stripe Connect](003-stripe-idempotency.md)
- [ADR 004 - Isolamento de Dados no Algolia](004-algolia-isolation.md)
- [ADR 006 - Arquitetura Hub-and-Spoke](006-hub-spoke-ai-architecture.md)
- [ADR 024 - AI Gateway Routing](024-ai-gateway-routing.md)
- [ADR 025 - Embeddings como Primeira Classe](025-embeddings-first-class.md)
- REQ-ARCH-002: Comunicacao assincrona entre servicos
- REQ-ARCH-003: Consistencia eventual com garantias de entrega
- Pattern: Transactional Outbox (microservices.io)
