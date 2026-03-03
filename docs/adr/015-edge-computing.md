# ADR 015: Edge Computing para Aplicações Globais

## Status

**Aceito** — Março 2026

## Contexto

A plataforma marketplace white-label atende tenants em múltiplas regiões geográficas. A experiência do usuário final é diretamente impactada pela latência — cada 100ms adicional em tempo de carregamento pode reduzir conversões em até 7%. O frontend Next.js e APIs de leitura frequente (catálogos, configurações de tenant, resultados de busca) são candidatos naturais para execução na edge.

O modelo multi-tenant intensifica a necessidade: cada tenant pode operar em regiões distintas, e seus usuários finais esperam tempos de resposta equivalentes a aplicações locais. Servir tudo a partir de uma única região de origem (us-east-1, por exemplo) penaliza severamente tenants na América Latina, Europa ou Ásia-Pacífico.

Ao mesmo tempo, operações de escrita — criação de transações, processamento de pagamentos, mutações de estado — devem ser direcionadas à origem para garantir consistência forte, ACID compliance e integração com Stripe Connect e ledgers financeiros. A estratégia deve separar claramente leitura (edge) de escrita (origem).

## Decisão

Adotamos uma **arquitetura híbrida edge-origin** com os seguintes componentes:

### 1. Frontend na Edge (Next.js + Vercel Edge Runtime)

```typescript
// next.config.js — configuração de edge runtime
export const config = {
  runtime: 'edge',
  regions: ['gru1', 'iad1', 'cdg1', 'nrt1'], // São Paulo, Virginia, Paris, Tokyo
};

// middleware.ts — roteamento por tenant na edge
export function middleware(request: NextRequest) {
  const tenantSlug = request.headers.get('x-tenant-slug')
    || request.nextUrl.hostname.split('.')[0];

  const tenantConfig = await getEdgeTenantConfig(tenantSlug);

  if (!tenantConfig) {
    return NextResponse.rewrite(new URL('/404', request.url));
  }

  request.headers.set('x-tenant-id', tenantConfig.id);
  request.headers.set('x-tenant-theme', tenantConfig.themeId);
  return NextResponse.next();
}
```

### 2. Cache de Configuração de Tenant na Edge

Configurações de tenant (tema, features habilitadas, limites) são cacheadas em KV stores na edge:

```typescript
// edge-tenant-config.ts
async function getEdgeTenantConfig(slug: string): Promise<TenantConfig | null> {
  const cached = await TENANT_KV.get(`tenant:${slug}`, 'json');
  if (cached) return cached as TenantConfig;

  const config = await fetch(`${ORIGIN_URL}/api/internal/tenants/${slug}/config`);
  const data = await config.json();

  await TENANT_KV.put(`tenant:${slug}`, JSON.stringify(data), {
    expirationTtl: 300, // 5 minutos
  });

  return data;
}
```

### 3. Roteamento Geo-aware

```
[Usuário Brasil] ---> Edge GRU1 (São Paulo) ---> Cache Hit? Responde direto
                                              ---> Cache Miss? Origin us-east-1
[Usuário Europa] ---> Edge CDG1 (Paris) -----> Cache Hit? Responde direto
                                              ---> Cache Miss? Origin us-east-1
[Escrita qualquer] ---> Origin us-east-1 diretamente
```

### 4. Separação Leitura vs. Escrita

| Operação | Destino | Latência Alvo |
|---|---|---|
| Listagem de produtos | Edge | < 50ms |
| Configuração de tenant | Edge (KV) | < 10ms |
| Resultados de busca Algolia | Edge (proxy) | < 30ms |
| Assets estáticos | CDN Edge | < 20ms |
| Criação de transação | Origin | < 200ms |
| Processamento de pagamento | Origin | < 500ms |
| Mutação de perfil | Origin | < 150ms |

## Consequências

### Positivas
- Redução de latência de 60-80% para operações de leitura em regiões distantes da origem.
- Experiência de usuário consistente globalmente, independente da localização do tenant.
- Redução de carga no servidor de origem — edge absorve a maioria das requisições de leitura.
- Escalabilidade horizontal automática via provedores de edge (Vercel, Cloudflare).

### Negativas
- Complexidade de invalidação de cache — configurações de tenant alteradas levam até 5 minutos para propagar.
- Debugging mais difícil: requests podem ser servidos de dezenas de PoPs diferentes.
- Limitações de runtime na edge (sem acesso direto a banco de dados, APIs com cold start).
- Custo adicional de bandwidth em provedores de edge para alto volume de tráfego.

## Implementação

- **Vercel Edge Runtime** para SSR e API routes de leitura do Next.js.
- **Cloudflare KV** (ou Vercel Edge Config) para configurações de tenant com TTL de 5 minutos.
- **Webhook de invalidação** dispara purge do cache quando tenant atualiza configurações na origem.
- **Headers `X-Edge-Region`** adicionados em cada resposta para observabilidade de roteamento.
- **Feature flag** `EDGE_ENABLED` por tenant — rollout gradual.
- **Stale-while-revalidate** pattern para dados de catálogo com revalidação assíncrona.

## Validação

- Testes de latência via synthetic monitoring (Datadog Synthetics) de 5 regiões globais.
- Teste de invalidação de cache: alterar config de tenant e verificar propagação em < 5 minutos.
- Teste de fallback: simular edge indisponível e verificar roteamento transparente para origem.
- Métricas de cache hit rate — alvo: > 90% para configurações de tenant, > 70% para catálogos.
- Comparação A/B de Core Web Vitals (LCP, FID, CLS) entre edge e origin-only.

## Referências

- ADR 004 — Algolia Isolation
- ADR 001 — Modelo de Isolamento de Dados Multi-tenancy
- ADR 016 — Escalabilidade de Busca Vetorial para Features de IA
- REQ-PERF-001 — Requisitos de Performance e Latência
