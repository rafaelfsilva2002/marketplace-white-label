# ADR 022: Active Backups para Reuso de Dados

## Status

**Aceito** — Março 2026

## Contexto

Backups tradicionais são tratados exclusivamente como mecanismo de disaster recovery — dados são compactados, armazenados em cold storage e só acessados quando algo dá errado. Esse modelo desperdiça um ativo valioso: os dados históricos contidos nos backups podem alimentar workloads de analytics, machine learning, auditorias regulatórias e relatórios de compliance sem impactar a performance do banco de dados de produção.

No contexto multi-tenant, diferentes tenants podem ter requisitos de retenção distintos: um tenant no setor financeiro pode precisar de 7 anos de histórico, enquanto outro precisa de apenas 12 meses. Além disso, a regulação LGPD exige capacidade de point-in-time recovery e exclusão de dados por solicitação do titular, o que requer backups granulares por tenant.

Executar queries analíticas pesadas diretamente no banco de produção degrada a experiência dos usuários finais. Read replicas ajudam, mas ainda competem por recursos com o tráfego de leitura normal. Backups ativos — queryable e isolados — resolvem esse problema de forma definitiva.

## Decisão

Adotamos o conceito de **Active Backups** — backups que são queryable, isolados por tenant e servem como fonte de dados para workloads analíticos:

### 1. Arquitetura de Backup Ativo

```
[PostgreSQL Produção]
    ├── WAL Streaming → [Read Replica 1] (tráfego de leitura normal)
    ├── WAL Streaming → [Read Replica 2] (analytics / active backup)
    └── pg_dump contínuo → [S3 Parquet] (cold storage queryable via Athena)
```

### 2. Configuração por Tenant

```sql
CREATE TABLE backup_policies (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id),
    retention_days      INTEGER NOT NULL DEFAULT 365,
    pitr_enabled        BOOLEAN DEFAULT true,
    pitr_retention_days INTEGER DEFAULT 30,
    analytics_access    BOOLEAN DEFAULT true,
    export_format       VARCHAR(20) DEFAULT 'PARQUET', -- PARQUET, CSV, JSON
    encryption_key_id   UUID,  -- KMS key para criptografia de backup
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id)
);

CREATE TABLE backup_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    snapshot_type   VARCHAR(20) NOT NULL, -- FULL, INCREMENTAL, PITR
    storage_path    TEXT NOT NULL,        -- s3://backups/tenant-xyz/2026-03-01/
    size_bytes      BIGINT NOT NULL,
    started_at      TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    status          VARCHAR(20) DEFAULT 'IN_PROGRESS',
    checksum        VARCHAR(128),         -- SHA-256 para integridade
    metadata        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. Pipeline de Backup Ativo

```typescript
// backup/active-backup.workflow.ts (Temporal)
export async function activeBackupWorkflow(tenantId: string): Promise<BackupResult> {
  const policy = await getBackupPolicy(tenantId);

  // 1. Snapshot incremental dos dados do tenant
  const snapshot = await createTenantSnapshot(tenantId, 'INCREMENTAL');

  // 2. Exportar para Parquet no S3 (queryable via Athena)
  const parquetPath = await exportToParquet(snapshot, {
    partitionBy: ['entity_type', 'year', 'month'],
    encryption: policy.encryptionKeyId,
  });

  // 3. Registrar snapshot no catálogo
  await registerSnapshot({
    tenantId,
    storagePath: parquetPath,
    sizeBytes: snapshot.sizeBytes,
    checksum: snapshot.checksum,
  });

  // 4. Limpar snapshots expirados conforme política de retenção
  await purgeExpiredSnapshots(tenantId, policy.retentionDays);

  return { snapshotId: snapshot.id, path: parquetPath };
}
```

### 4. Analytics via SQL sobre Backups

```sql
-- Query via Amazon Athena sobre backups em Parquet
-- Isolamento por tenant via partição S3 e IAM policy

SELECT
    DATE_TRUNC('month', created_at) AS month,
    COUNT(*) AS total_transactions,
    SUM(gross_amount) AS gmv,
    AVG(gross_amount) AS avg_ticket
FROM backup_catalog.transactions
WHERE tenant_id = 'tenant-xyz'
  AND year = 2025
GROUP BY 1
ORDER BY 1;
```

### 5. Point-in-Time Recovery por Tenant

```typescript
interface PitrRequest {
  tenantId: string;
  targetTimestamp: Date;      // restaurar dados até este momento
  tables?: string[];          // opcional: restaurar apenas tabelas específicas
  targetEnvironment: 'STAGING' | 'ISOLATED'; // nunca direto em produção
  reason: string;             // obrigatório para audit trail
  requestedBy: string;
}

// Fluxo:
// 1. Localizar backup mais próximo ao targetTimestamp
// 2. Restaurar em banco isolado
// 3. Aplicar WAL logs até targetTimestamp exato
// 4. Validar integridade dos dados
// 5. Disponibilizar para o solicitante em ambiente isolado
```

## Consequências

### Positivas
- Workloads analíticos executam sobre backups sem impactar produção — zero degradação de performance.
- Retenção configurável por tenant atende a requisitos regulatórios distintos.
- Point-in-time recovery por tenant permite restauração cirúrgica sem afetar outros tenants.
- Dados em Parquet no S3 são queryable via Athena com custo extremamente baixo ($5/TB scanned).
- Backups criptografados por tenant com chaves distintas no KMS.

### Negativas
- Custo de armazenamento S3 cresce com o número de tenants e suas políticas de retenção.
- Latência de queries Athena (segundos a minutos) não é adequada para dashboards em tempo real.
- Complexidade do pipeline de backup com particionamento por tenant e formato Parquet.
- Point-in-time recovery é operação complexa que requer validação cuidadosa antes de uso.

## Implementação

- **Temporal workflow** `activeBackupWorkflow` executa diariamente por tenant, com stagger para distribuir carga.
- **pg_dump** com `--format=custom` para snapshots incrementais, filtrado por `tenant_id`.
- **AWS Glue** ou **DuckDB** para conversão de dumps SQL para Parquet particionado.
- **Athena** com catálogo Glue para queries SQL ad hoc sobre backups.
- **Terraform** provisiona buckets S3, KMS keys e políticas IAM por tenant.
- **Dashboard Grafana** exibe status de backups, tamanho por tenant e alertas de falha.
- **Retenção automática** via S3 Lifecycle Rules configuradas pela `backup_policies`.

## Validação

- Teste de restauração mensal: restaurar backup de tenant aleatório e verificar integridade dos dados.
- Teste de PITR: restaurar dados de um tenant para timestamp específico e comparar com expected state.
- Teste de isolamento: query Athena de tenant A não acessa dados de tenant B (IAM enforcement).
- Teste de retenção: verificar que snapshots expirados são efetivamente removidos.
- Teste de performance: backup de tenant com 10M registros completa em < 30 minutos.
- Teste de criptografia: verificar que dados em S3 são ilegíveis sem KMS key correta.

## Referências

- ADR 001 — Modelo de Isolamento de Dados Multi-tenancy
- ADR 013 — Trust Infrastructure
- ADR 017 — FinOps como Princípio Arquitetural
- ADR 018 — Camada de Orquestração como Ativo Estratégico
- REQ-OPS-002 — Requisitos de Backup e Disaster Recovery
