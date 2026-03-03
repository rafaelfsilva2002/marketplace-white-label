# ADR 007: Suporte a Single-tenant para Clientes com Requisitos Extremos de Compliance

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

Embora o modelo multi-tenant compartilhado (ADR 001) atenda a maioria dos clientes da plataforma, alguns clientes enterprise possuem requisitos regulatorios extremamente rigorosos (LGPD com exigencia de dados em territorio nacional, SOC2 Type II, PCI DSS, normas setoriais de saude ou financas) que exigem isolamento fisico completo dos dados. Esses clientes nao aceitam que seus dados compartilhem a mesma instancia de banco de dados com outros tenants, mesmo com RLS ativo.

Essa exigencia e particularmente comum em setores como saude (HIPAA-like), financas (Banco Central do Brasil), governo e grandes corporacoes que passam por auditorias regulares onde o auditor exige comprovacao de isolamento fisico. Negar esse requisito significaria perder esses clientes de alto valor; atende-lo sem uma arquitetura preparada significaria reescrever o sistema.

A plataforma precisa suportar ambos os modelos (shared e dedicated) de forma transparente para o codigo da aplicacao, sem bifurcacao de logica ou duplicacao de codigo. O mesmo servico, com a mesma API, deve funcionar independentemente do nivel de isolamento do tenant.

## Decisao

Adotamos um modelo hibrido onde o **nivel de isolamento e uma configuracao por tenant**, armazenada no `TenantConfig` com o campo `isolationLevel: 'shared' | 'dedicated'`. A resolucao da connection string do banco de dados e feita em runtime com base nessa configuracao.

### Justificativas:

1. **Transparencia para a aplicacao**: O codigo de negocio nao sabe (e nao precisa saber) se esta operando em banco shared ou dedicated. O `TenantContext` abstrai essa diferenca.
2. **Mesmo API contract**: Clientes shared e dedicated usam exatamente a mesma API, SDK e documentacao.
3. **Pricing diferenciado**: O custo de infraestrutura dedicada e repassado como tier premium, criando um modelo de receita adicional.
4. **Migracoes automaticas**: O pipeline de CI/CD aplica migracoes em todos os bancos (shared + dedicated) automaticamente.

### Niveis de isolamento:

| Aspecto | Shared | Dedicated |
|---------|--------|-----------|
| Banco de dados | Compartilhado com RLS | Instancia exclusiva |
| Connection string | Pool compartilhado | Pool dedicado |
| Backup | Compartilhado | Isolado e customizavel |
| Performance | Sujeito a noisy neighbor | Garantida |
| Compliance | LGPD padrao | SOC2, PCI DSS, setorial |
| Custo | Incluido no plano base | Tier premium |

## Consequencias

### Positivas
- Atende clientes enterprise com requisitos regulatorios extremos sem bifurcar o codigo.
- Modelo de pricing adicional com margens maiores para tier premium.
- Migracoes e deploys unificados para ambos os modelos.
- Backup e restauracao isolados para tenants dedicated facilitam compliance.
- Escalabilidade de performance garantida por isolamento fisico.

### Negativas
- Complexidade operacional: mais bancos de dados para gerenciar, monitorar e manter.
- Custo de infraestrutura significativamente maior por tenant dedicated.
- Pipeline de migracao precisa iterar sobre todos os bancos (shared + N dedicated).
- Testes de integracao precisam cobrir ambos os cenarios de isolamento.
- Onboarding de tenant dedicated e mais lento (provisionamento de infraestrutura).

## Implementacao

### Configuracao do TenantConfig

```typescript
interface TenantConfig {
  id: string;
  slug: string;
  isolationLevel: 'shared' | 'dedicated';
  database: {
    host: string;
    port: number;
    name: string;
    username: string;
    password: string; // Referencia ao secrets manager
  };
  features: FeatureFlags;
  compliance: {
    dataResidency: string;   // ex: 'br-south'
    certifications: string[]; // ex: ['SOC2', 'PCI_DSS']
    retentionDays: number;
  };
}
```

### Connection Manager com resolucao dinamica

```typescript
@Injectable()
export class TenantConnectionManager {
  private readonly connectionPool = new Map<string, DataSource>();

  constructor(
    private readonly tenantConfig: TenantConfigService,
    @Inject('SHARED_DATA_SOURCE') private readonly sharedDs: DataSource,
  ) {}

  async getConnection(tenantId: string): Promise<DataSource> {
    const config = await this.tenantConfig.get(tenantId);

    if (config.isolationLevel === 'shared') {
      return this.sharedDs;
    }

    // Dedicated: buscar ou criar connection pool
    if (!this.connectionPool.has(tenantId)) {
      const ds = new DataSource({
        type: 'postgres',
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        username: config.database.username,
        password: await this.resolveSecret(config.database.password),
        entities: [/* mesmas entidades */],
        synchronize: false,
      });
      await ds.initialize();
      this.connectionPool.set(tenantId, ds);
    }

    return this.connectionPool.get(tenantId)!;
  }

  async destroyConnection(tenantId: string): Promise<void> {
    const ds = this.connectionPool.get(tenantId);
    if (ds) {
      await ds.destroy();
      this.connectionPool.delete(tenantId);
    }
  }
}
```

### Middleware de conexao no ciclo de vida da request

```typescript
@Injectable()
export class TenantDatabaseMiddleware implements NestMiddleware {
  constructor(
    private readonly connectionManager: TenantConnectionManager,
  ) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const tenantId = getCurrentTenantId();
    const dataSource = await this.connectionManager.getConnection(tenantId);

    // Armazenar DataSource no contexto para uso pelos repositorios
    setCurrentDataSource(dataSource);

    next();
  }
}
```

### Pipeline de migracao para todos os bancos

```typescript
// scripts/migrate-all.ts
async function migrateAll(): Promise<void> {
  const tenants = await getAllTenantConfigs();

  // Migrar banco compartilhado
  await runMigrations(getSharedDataSource());

  // Migrar bancos dedicados em paralelo
  const dedicatedTenants = tenants.filter(t => t.isolationLevel === 'dedicated');
  await Promise.allSettled(
    dedicatedTenants.map(async (tenant) => {
      const ds = await createDataSource(tenant.database);
      await runMigrations(ds);
      await ds.destroy();
    }),
  );
}
```

## Validacao

1. **Teste de transparencia**: Executar mesma suite de testes de integracao contra tenant shared e tenant dedicated sem alteracao de codigo.
2. **Teste de isolamento fisico**: Verificar que tenant dedicated nao tem acesso ao banco shared e vice-versa.
3. **Teste de migracao**: Executar pipeline de migracao e verificar que schema esta identico em todos os bancos.
4. **Teste de connection pooling**: Verificar que pools dedicated sao criados sob demanda e destruidos quando nao utilizados.
5. **Teste de failover**: Simular queda do banco dedicated de um tenant e verificar que demais tenants nao sao afetados.
6. **Teste de provisionamento**: Criar novo tenant dedicated via API admin e verificar que banco e provisionado com schema correto.

## Referencias

- [ADR 001 - Modelo de Isolamento Multi-tenancy](001-tenancy-model.md)
- [ADR 002 - Host Trust Boundary e Resolucao de Tenant](002-host-trust-boundary.md)
- [ADR 006 - Arquitetura Hub-and-Spoke](006-hub-spoke-ai-architecture.md)
- REQ-SEC-004: Isolamento fisico para clientes com compliance regulatorio
- REQ-BIZ-001: Tier premium com pricing diferenciado
- LGPD - Lei Geral de Protecao de Dados (Lei 13.709/2018)
