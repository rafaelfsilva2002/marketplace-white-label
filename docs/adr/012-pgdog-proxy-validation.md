# ADR 012: Proxy de Validacao Multi-tenant com PgDog

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

O isolamento de dados multi-tenant na plataforma e implementado em multiplas camadas: (1) `TenantContext` via `AsyncLocalStorage` na aplicacao, (2) Base Repository com auto-filter de `tenant_id`, e (3) Row-Level Security (RLS) no PostgreSQL (ADR 001). No entanto, bugs na aplicacao podem resultar em queries que nao incluem o filtro `tenant_id` -- seja por um repositorio que nao estende o base repository, uma query raw SQL escrita incorretamente, ou uma migration mal formulada.

Precisamos de uma camada adicional de defesa entre a aplicacao e o banco de dados que atue como rede de seguranca: se uma query chegar ao banco sem `tenant_id` na clausula WHERE, ela deve ser bloqueada antes de executar. Essa camada complementa o RLS (que depende do SET LOCAL correto) e o filtro da aplicacao (que depende do codigo correto).

O PgDog e um proxy PostgreSQL de alta performance escrito em Rust que oferece connection pooling, load balancing, query routing e, criticamente, capacidade de inspecionar e validar queries antes de encaminha-las ao banco. Ele pode ser configurado para rejeitar queries que nao atendam a criterios especificos, como a presenca obrigatoria de `tenant_id`.

## Decisao

Adotamos o **PgDog** como proxy entre a aplicacao NestJS e o PostgreSQL, com **validacao obrigatoria de `tenant_id`** em todas as queries DML (SELECT, INSERT, UPDATE, DELETE) contra tabelas de dominio. O PgDog tambem fornece connection pooling com roteamento tenant-aware.

### Justificativas:

1. **Defesa em profundidade**: Terceira camada de protecao (apos aplicacao e RLS), independente de codigo correto.
2. **Connection pooling**: Reduz numero de conexoes abertas com o PostgreSQL, essencial para multi-tenancy com muitos tenants simultaneos.
3. **Performance**: PgDog e escrito em Rust com overhead de < 0.5ms por query, negligivel para operacoes de banco.
4. **Roteamento tenant-aware**: Pode direcionar tenants dedicated (ADR 007) para bancos separados de forma transparente.
5. **Observabilidade**: Logs de queries bloqueadas fornecem visibilidade sobre bugs de isolamento.

### Camadas de defesa (modelo swiss cheese):

```
Requisicao HTTP
       ↓
[Camada 1] TenantInterceptor → define TenantContext
       ↓
[Camada 2] Base Repository → adiciona WHERE tenant_id = ?
       ↓
[Camada 3] PgDog Proxy → valida presenca de tenant_id na query
       ↓
[Camada 4] PostgreSQL RLS → filtra rows por tenant_id da sessao
       ↓
   Resultado
```

## Consequencias

### Positivas
- Rede de seguranca contra queries sem `tenant_id` que escapam das camadas anteriores.
- Connection pooling reduz uso de conexoes no PostgreSQL em ~80%.
- Roteamento transparente para bancos dedicated sem alteracao na aplicacao.
- Metricas e logs detalhados de queries bloqueadas para deteccao de bugs.
- Overhead minimo (< 0.5ms por query) nao impacta latencia da aplicacao.

### Negativas
- Componente adicional na infraestrutura para gerenciar e monitorar.
- Parsing de SQL pode gerar false positives em queries complexas (CTEs, subqueries).
- Queries administrativas (migrations, seeds) precisam de bypass configurado.
- Single point of failure entre app e banco (mitigado com replicas do PgDog).
- Curva de aprendizado da equipe com configuracao e operacao do PgDog.

## Implementacao

### Configuracao do PgDog

```toml
# pgdog.toml

[general]
host = "0.0.0.0"
port = 6432
admin_port = 6433
log_level = "info"

[pools.shared]
  [pools.shared.primary]
  host = "postgres-primary.internal"
  port = 5432
  database = "marketplace"
  username = "app_user"
  password_file = "/run/secrets/pg_password"

  [pools.shared.settings]
  pool_mode = "transaction"
  pool_size = 50
  min_pool_size = 10
  idle_timeout = 300
  connect_timeout = 5

# Pools dedicados para tenants enterprise
[pools.tenant_enterprise_abc]
  [pools.tenant_enterprise_abc.primary]
  host = "postgres-tenant-abc.internal"
  port = 5432
  database = "marketplace_abc"
  username = "app_user"
  password_file = "/run/secrets/pg_password_abc"

  [pools.tenant_enterprise_abc.settings]
  pool_mode = "transaction"
  pool_size = 20
```

### Regras de validacao de tenant_id

```toml
# pgdog_rules.toml

[validation]
enabled = true

# Tabelas que requerem tenant_id em toda query DML
[[validation.rules]]
name = "require_tenant_id"
action = "deny"
log_level = "error"
tables = [
  "profiles",
  "orders",
  "transactions",
  "ledger_entries",
  "crypto_transactions",
  "aml_checks",
  "services",
  "products",
]
condition = "missing_column_in_where"
column = "tenant_id"
operations = ["SELECT", "INSERT", "UPDATE", "DELETE"]

# Excecoes para queries administrativas
[[validation.exceptions]]
name = "admin_bypass"
user = "admin_migration"
operations = ["ALL"]

[[validation.exceptions]]
name = "outbox_dispatcher"
user = "outbox_worker"
tables = ["outbox"]
operations = ["SELECT", "UPDATE"]
```

### Modulo NestJS para conexao via PgDog

```typescript
// database/database.module.ts
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('PGDOG_HOST', 'localhost'), // PgDog, nao PostgreSQL direto
        port: config.get('PGDOG_PORT', 6432),
        database: config.get('DB_NAME'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        entities: [/* ... */],
        synchronize: false,
        extra: {
          // Configuracoes especificas para funcionar com PgDog
          statement_timeout: 30000,
          idle_in_transaction_session_timeout: 60000,
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
```

### Roteamento tenant-aware via PgDog

```typescript
// Subscriber TypeORM que define contexto de roteamento
@EventSubscriber()
export class TenantRoutingSubscriber implements EntitySubscriberInterface {
  async beforeQuery(event: BeforeQueryEvent<any>): Promise<void> {
    const tenantId = getCurrentTenantId();
    const tenantConfig = await getTenantConfig(tenantId);

    if (tenantConfig.isolationLevel === 'dedicated') {
      // Header customizado que PgDog usa para roteamento
      await event.queryRunner.query(
        `SET LOCAL pgdog.route_to = 'tenant_${tenantConfig.slug}'`
      );
    }

    // Sempre definir tenant_id para RLS
    await event.queryRunner.query(
      `SET LOCAL app.current_tenant_id = '${tenantId}'`
    );
  }
}
```

### Deploy do PgDog como sidecar ou servico dedicado

```yaml
# k8s/pgdog/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pgdog
  namespace: marketplace
spec:
  replicas: 3
  selector:
    matchLabels:
      app: pgdog
  template:
    metadata:
      labels:
        app: pgdog
    spec:
      containers:
        - name: pgdog
          image: pgdog/pgdog:latest
          ports:
            - containerPort: 6432
              name: postgres
            - containerPort: 6433
              name: admin
          volumeMounts:
            - name: config
              mountPath: /etc/pgdog
            - name: secrets
              mountPath: /run/secrets
          resources:
            requests:
              cpu: "500m"
              memory: "256Mi"
            limits:
              cpu: "2000m"
              memory: "1Gi"
          livenessProbe:
            tcpSocket:
              port: 6432
            initialDelaySeconds: 5
            periodSeconds: 10
          readinessProbe:
            tcpSocket:
              port: 6432
            initialDelaySeconds: 5
            periodSeconds: 5
      volumes:
        - name: config
          configMap:
            name: pgdog-config
        - name: secrets
          secret:
            secretName: pgdog-secrets
---
apiVersion: v1
kind: Service
metadata:
  name: pgdog
  namespace: marketplace
spec:
  selector:
    app: pgdog
  ports:
    - port: 6432
      targetPort: 6432
      name: postgres
    - port: 6433
      targetPort: 6433
      name: admin
```

## Validacao

1. **Teste de query valida**: Enviar query com `WHERE tenant_id = ?` e verificar que PgDog encaminha ao PostgreSQL.
2. **Teste de query sem tenant_id**: Enviar query SELECT sem `tenant_id` em tabela protegida e verificar que PgDog bloqueia com erro.
3. **Teste de bypass admin**: Executar migration com usuario `admin_migration` e verificar que PgDog permite sem validacao.
4. **Teste de connection pooling**: Abrir 200 conexoes via PgDog e verificar que apenas `pool_size` conexoes sao abertas no PostgreSQL.
5. **Teste de roteamento dedicated**: Enviar query de tenant dedicated e verificar que PgDog roteia para banco correto.
6. **Teste de failover**: Derrubar PgDog primary e verificar que replicas assumem sem perda de conexoes.
7. **Teste de latencia**: Medir overhead do PgDog e verificar que esta < 0.5ms por query.
8. **Teste de observabilidade**: Verificar que queries bloqueadas aparecem nos logs e metricas do PgDog.

## Referencias

- [ADR 001 - Modelo de Isolamento Multi-tenancy](001-tenancy-model.md)
- [ADR 002 - Host Trust Boundary e Resolucao de Tenant](002-host-trust-boundary.md)
- [ADR 007 - Single-tenant para Compliance](007-single-tenant-for-compliance.md)
- REQ-SEC-001: Isolamento de dados entre tenants
- REQ-SEC-006: Defesa em profundidade para acesso a dados
- REQ-OPS-003: Connection pooling para suporte a 100+ tenants simultaneos
- PgDog Documentation
