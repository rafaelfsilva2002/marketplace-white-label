# ADR 001: Modelo de Isolamento de Dados Multi-tenancy

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

A plataforma marketplace white-label atende múltiplos clientes (tenants) simultaneamente, cada um operando seu próprio marketplace com dados de usuários, transações financeiras, perfis de profissionais e configurações específicas. O isolamento correto desses dados é o requisito mais crítico da arquitetura, pois qualquer vazamento entre tenants configura uma violação grave de privacidade e conformidade regulatória (LGPD, SOC2).

Existem três abordagens clássicas para multi-tenancy em bancos de dados relacionais: (1) banco de dados separado por tenant, (2) schema separado por tenant dentro do mesmo banco, e (3) banco compartilhado com coluna discriminadora (`tenant_id`). Cada abordagem apresenta trade-offs distintos entre isolamento, custo operacional, complexidade de manutenção e escalabilidade.

Para a maioria dos tenants da plataforma, o volume de dados é moderado e não justifica a sobrecarga operacional de instâncias ou schemas dedicados. No entanto, precisamos garantir que o isolamento seja robusto o suficiente para atender requisitos regulatórios, mesmo no modelo compartilhado.

## Decisão

Adotamos o modelo de **banco de dados compartilhado com coluna `tenant_id`** como estratégia padrão de isolamento, complementado por **Row-Level Security (RLS)** do PostgreSQL como camada de defesa em profundidade.

### Justificativas:

1. **Custo operacional**: Um único cluster PostgreSQL reduz drasticamente custos de infraestrutura, backup, monitoramento e manutenção comparado a N bancos ou schemas.
2. **Simplicidade de migrações**: Alterações de schema são aplicadas uma única vez e afetam todos os tenants simultaneamente, evitando drift de versões.
3. **RLS como defesa em profundidade**: Mesmo que o código da aplicação falhe em filtrar por `tenant_id`, o PostgreSQL bloqueia o acesso no nível do banco.
4. **Escalabilidade futura**: O modelo permite migração gradual de tenants de alto volume para bancos dedicados (ver ADR 007) sem alteração na API.

### Detalhes técnicos:

- Toda tabela de domínio possui `tenant_id UUID NOT NULL` como primeira coluna.
- Chaves primárias são compostas: `PRIMARY KEY (tenant_id, id)`.
- Índices sempre incluem `tenant_id` como prefixo para otimização de queries.
- O `TenantContext` é propagado via `AsyncLocalStorage` do Node.js, garantindo isolamento por request sem necessidade de passagem explícita de parâmetros.

## Consequências

### Positivas
- Redução de ~70% no custo de infraestrutura comparado a banco-por-tenant.
- Migrações de schema unificadas eliminam problemas de versionamento.
- RLS oferece garantia adicional contra bugs de filtragem na aplicação.
- Queries cross-tenant para relatórios administrativos são triviais (com role de superadmin).
- Facilita onboarding de novos tenants (apenas um INSERT na tabela de configuração).

### Negativas
- Risco de "noisy neighbor": um tenant com queries pesadas pode afetar outros (mitigado com connection pooling e limites de recursos).
- Complexidade adicional em toda query e todo repositório para incluir `tenant_id`.
- RLS adiciona overhead de ~2-5% em cada query (aceitável dado o benefício de segurança).
- Restauração de backup seletiva por tenant é mais complexa que no modelo dedicado.

## Implementação

### Políticas RLS no PostgreSQL

```sql
-- Habilitar RLS na tabela
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Política de isolamento
CREATE POLICY tenant_isolation_policy ON profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Forçar RLS mesmo para o owner da tabela
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
```

### TenantContext com AsyncLocalStorage

```typescript
import { AsyncLocalStorage } from 'async_hooks';

interface TenantStore {
  tenantId: string;
  tenantSlug: string;
  isolationLevel: 'shared' | 'dedicated';
}

export const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function getCurrentTenantId(): string {
  const store = tenantStorage.getStore();
  if (!store) {
    throw new TenantContextMissingError();
  }
  return store.tenantId;
}
```

### Base Repository com Auto-filter

```typescript
export abstract class TenantAwareRepository<T> {
  async findAll(options?: FindOptions): Promise<T[]> {
    const tenantId = getCurrentTenantId();
    return this.repository.find({
      ...options,
      where: {
        ...options?.where,
        tenant_id: tenantId,
      },
    });
  }

  async save(entity: Partial<T>): Promise<T> {
    const tenantId = getCurrentTenantId();
    return this.repository.save({
      ...entity,
      tenant_id: tenantId,
    });
  }
}
```

### Configuração de tenant_id na conexão

```typescript
// Executado antes de cada query via subscriber do TypeORM
async beforeQuery(event: BeforeQueryEvent): Promise<void> {
  const tenantId = getCurrentTenantId();
  await event.queryRunner.query(
    `SET LOCAL app.current_tenant_id = '${tenantId}'`
  );
}
```

## Validação

1. **Teste de isolamento**: Criar dois tenants, inserir dados em ambos, e verificar que queries de um tenant nunca retornam dados do outro.
2. **Teste de RLS**: Desabilitar o filtro na aplicação intencionalmente e verificar que o PostgreSQL bloqueia o acesso via RLS.
3. **Teste de performance**: Executar benchmark comparando queries com e sem RLS para validar que o overhead permanece < 5%.
4. **Teste de regressão**: Toda nova migration deve incluir `tenant_id` em tabelas de domínio; CI valida via script de auditoria.
5. **Teste de carga**: Simular 50+ tenants simultâneos para validar ausência de noisy neighbor com connection pooling configurado.

## Referências

- [ADR 002 - Host Trust Boundary e Resolução de Tenant](002-host-trust-boundary.md)
- [ADR 007 - Suporte a Single-tenant para Compliance](007-single-tenant-for-compliance.md)
- [ADR 012 - Proxy de Validação com PgDog](012-pgdog-proxy-validation.md)
- REQ-SEC-001: Isolamento de dados entre tenants
- REQ-ARCH-001: Suporte a multi-tenancy horizontal
