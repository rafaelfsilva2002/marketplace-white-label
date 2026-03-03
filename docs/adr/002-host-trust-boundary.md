# ADR 002: Host Trust Boundary e Resolução de Tenant

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

Em uma plataforma multi-tenant white-label, cada tenant opera sob seu próprio domínio ou subdomínio (por exemplo, `parceiroa.example.com`, `parceirob.example.com`). O sistema precisa resolver qual tenant está sendo acessado em cada requisição HTTP de forma segura, performática e confiável. Essa resolução é o primeiro passo do pipeline de processamento e estabelece o contexto de segurança para todo o restante da cadeia.

A resolução de tenant baseada no header `Host` é a abordagem mais natural para uma plataforma white-label, pois cada tenant já possui seu próprio domínio configurado. No entanto, o header `Host` pode ser facilmente manipulado por clientes maliciosos, o que exige validação rigorosa contra uma lista de domínios permitidos (allowlist). Qualquer falha nessa camada compromete todo o sistema de isolamento.

Este ADR define o `TenantInterceptor` como a **trust boundary** (fronteira de confiança) da aplicação. Todo código downstream do interceptor pode confiar que o `TenantContext` contém dados válidos e verificados. Nenhum código upstream do interceptor deve ser considerado confiável para fins de identificação de tenant.

## Decisão

Adotamos a resolução de tenant via header `Host` com validação contra allowlist armazenada em cache Redis. O `TenantInterceptor` do NestJS é o único ponto de entrada para definição do `TenantContext`, funcionando como trust boundary explícita.

### Fluxo de resolução:

1. Requisição chega com header `Host: parceiroa.example.com`.
2. `TenantInterceptor` extrai o hostname.
3. Busca no Redis (cache com TTL de 5 minutos) o mapeamento `hostname → tenantConfig`.
4. Se não encontrar no cache, consulta o banco de dados.
5. Se o hostname não existir na allowlist, retorna HTTP 404 (não 403, para não revelar informações).
6. Se encontrado, popula o `TenantContext` via `AsyncLocalStorage` e define `SET LOCAL app.current_tenant_id` para RLS.
7. Todo código downstream confia no `TenantContext` sem necessidade de revalidação.

### Justificativas:

1. **404 em vez de 403**: Retornar 404 para hosts desconhecidos evita enumeration attacks, pois o atacante não consegue distinguir entre "host não existe" e "host existe mas acesso negado".
2. **Cache Redis**: Evita consulta ao banco em cada requisição. TTL de 5 minutos equilibra performance e propagação rápida de alterações.
3. **AsyncLocalStorage**: Propaga o contexto de tenant sem poluir assinaturas de métodos com parâmetros explícitos.
4. **Interceptor global**: Garante que nenhuma rota escape da validação de tenant.

## Consequências

### Positivas
- Ponto único de validação de tenant simplifica auditoria de segurança.
- Cache Redis garante resolução em < 1ms para 99% das requisições.
- Código downstream limpo, sem necessidade de validação redundante de tenant.
- Proteção contra host header injection e enumeration attacks.
- Facilidade de adicionar novos domínios: basta inserir no banco e esperar TTL do cache.

### Negativas
- Dependência do Redis como componente crítico no path de cada requisição (mitigado com fallback para banco).
- TTL de 5 minutos significa que remoção de tenant leva até 5 minutos para propagar.
- Hosts com TLS (HTTPS) exigem certificado wildcard ou geração dinâmica de certificados.
- Testes de integração precisam mockar o header `Host` em cada requisição.

## Implementação

### TenantInterceptor

```typescript
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(
    private readonly tenantResolver: TenantResolverService,
    private readonly tenantStorage: TenantStorageService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const hostname = request.hostname;

    const tenantConfig = await this.tenantResolver.resolve(hostname);

    if (!tenantConfig) {
      throw new NotFoundException(); // 404, não 403
    }

    return this.tenantStorage.run(
      {
        tenantId: tenantConfig.id,
        tenantSlug: tenantConfig.slug,
        isolationLevel: tenantConfig.isolationLevel,
      },
      () => next.handle(),
    );
  }
}
```

### TenantResolverService com cache Redis

```typescript
@Injectable()
export class TenantResolverService {
  private readonly CACHE_TTL = 300; // 5 minutos
  private readonly CACHE_PREFIX = 'tenant:host:';

  constructor(
    private readonly redis: RedisService,
    private readonly tenantRepo: TenantRepository,
  ) {}

  async resolve(hostname: string): Promise<TenantConfig | null> {
    const cacheKey = `${this.CACHE_PREFIX}${hostname}`;

    // 1. Buscar no cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. Buscar no banco
    const tenant = await this.tenantRepo.findByHostname(hostname);
    if (!tenant) {
      // Cache negativo para evitar re-consultas
      await this.redis.set(cacheKey, 'null', 'EX', 60);
      return null;
    }

    // 3. Popular cache
    const config: TenantConfig = {
      id: tenant.id,
      slug: tenant.slug,
      isolationLevel: tenant.isolationLevel,
      features: tenant.features,
    };
    await this.redis.set(cacheKey, JSON.stringify(config), 'EX', this.CACHE_TTL);

    return config;
  }

  async invalidate(hostname: string): Promise<void> {
    await this.redis.del(`${this.CACHE_PREFIX}${hostname}`);
  }
}
```

### Registro global do Interceptor

```typescript
// app.module.ts
@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule {}
```

## Validação

1. **Teste de host válido**: Enviar requisição com `Host: tenant-valido.example.com` e verificar que `TenantContext` é populado corretamente.
2. **Teste de host inválido**: Enviar requisição com `Host: atacante.evil.com` e verificar retorno HTTP 404.
3. **Teste de cache hit**: Verificar que segunda requisição para o mesmo host não consulta o banco de dados.
4. **Teste de cache negativo**: Verificar que hosts inválidos recebem cache negativo de 60 segundos.
5. **Teste de invalidação**: Alterar hostname de tenant e verificar que `invalidate()` limpa o cache.
6. **Teste de fallback**: Simular falha do Redis e verificar que resolução via banco funciona.
7. **Teste de concorrência**: Enviar 1000 requisições simultâneas para hosts diferentes e verificar isolamento correto.

## Referências

- [ADR 001 - Modelo de Isolamento Multi-tenancy](001-tenancy-model.md)
- [ADR 012 - Proxy de Validação com PgDog](012-pgdog-proxy-validation.md)
- REQ-SEC-002: Resolução segura de tenant
- REQ-SEC-003: Proteção contra host header injection
- OWASP Host Header Injection Prevention
