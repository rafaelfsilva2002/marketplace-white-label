# ADR 023: Estratégia de API Versionamento

## Status

**Aceito** — Março 2026

## Contexto

A plataforma marketplace white-label expõe APIs consumidas por múltiplos tipos de clientes: frontends Next.js internos, aplicações mobile, integrações de clientes enterprise (ADR 020), webhooks e SDKs de terceiros. Cada um desses consumidores tem ciclos de atualização distintos — um frontend interno pode ser atualizado junto com a API, mas um aplicativo mobile instalado no dispositivo de um usuário final pode levar meses para ser atualizado.

Breaking changes são inevitáveis em uma plataforma que evolui continuamente: renomear campos, alterar formatos de resposta, remover endpoints deprecated, ou mudar lógica de negócio. Sem uma estratégia formal de versionamento, breaking changes causam falhas em integrações de clientes, erosão de confiança e alto custo de suporte.

O desafio no contexto multi-tenant é ainda maior: diferentes tenants podem estar em diferentes versões da API dependendo de quando integraram seus sistemas. A estratégia deve permitir coexistência de múltiplas versões sem explosão de complexidade no backend.

## Decisão

Adotamos **versionamento por path na URL** com políticas claras de ciclo de vida:

### 1. Formato de Versionamento

```
Base URL: https://api.{tenant-slug}.marketplace.com

Endpoints:
  /api/v1/products          (versão estável atual)
  /api/v2/products          (próxima versão quando houver breaking change)
  /api/v1/transactions
  /api/v1/management/users  (Management APIs — ADR 020)
```

### 2. O que Constitui Breaking Change

| Tipo | Breaking? | Requer Nova Versão? |
|---|---|---|
| Remover campo de resposta | Sim | Sim |
| Renomear campo de resposta | Sim | Sim |
| Alterar tipo de campo | Sim | Sim |
| Remover endpoint | Sim | Sim |
| Alterar comportamento de campo existente | Sim | Sim |
| Adicionar campo opcional em resposta | Não | Não |
| Adicionar endpoint novo | Não | Não |
| Adicionar query parameter opcional | Não | Não |
| Adicionar header opcional | Não | Não |

### 3. Implementação no NestJS

```typescript
// Versionamento via módulo NestJS
// main.ts
app.enableVersioning({
  type: VersioningType.URI,
  prefix: 'api/v',
  defaultVersion: '1',
});

// products.controller.ts
@Controller('products')
export class ProductsController {
  @Version('1')
  @Get()
  async listV1(@Query() query: ListProductsV1Dto): Promise<ProductResponseV1[]> {
    const products = await this.productsService.list(query);
    return products.map(ProductMapperV1.toResponse);
  }

  @Version('2')
  @Get()
  async listV2(@Query() query: ListProductsV2Dto): Promise<ProductResponseV2[]> {
    const products = await this.productsService.list(query);
    return products.map(ProductMapperV2.toResponse);
  }
}
```

### 4. Camada de Mapeamento (Anti-Corruption Layer)

```typescript
// mappers/product-mapper-v1.ts
export class ProductMapperV1 {
  static toResponse(product: Product): ProductResponseV1 {
    return {
      id: product.id,
      name: product.title,           // v1 usa "name", v2 usa "title"
      price: product.price.amount,   // v1 retorna number flat
      currency: product.price.currency,
      seller_id: product.sellerId,   // v1 usa snake_case
    };
  }
}

// mappers/product-mapper-v2.ts
export class ProductMapperV2 {
  static toResponse(product: Product): ProductResponseV2 {
    return {
      id: product.id,
      title: product.title,
      price: {                        // v2 retorna objeto Money
        amount: product.price.amount,
        currency: product.price.currency,
      },
      sellerId: product.sellerId,     // v2 usa camelCase
      metadata: product.metadata,     // campo novo na v2
    };
  }
}
```

### 5. Política de Deprecação e Sunset

```typescript
// middleware/deprecation.middleware.ts
@Injectable()
export class DeprecationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const version = req.params.version || '1';
    const deprecationInfo = this.getDeprecationInfo(version);

    if (deprecationInfo) {
      // RFC 8594 — Sunset Header
      res.set('Sunset', deprecationInfo.sunsetDate);
      res.set('Deprecation', deprecationInfo.deprecatedSince);
      res.set('Link', `<${deprecationInfo.migrationGuideUrl}>; rel="successor-version"`);

      // Log para tracking de adoção
      this.metricsService.trackDeprecatedUsage(req.tenantId, version, req.path);
    }

    next();
  }
}

// Política de ciclo de vida:
// 1. Nova versão anunciada → v(N) marcada como deprecated
// 2. Período de migração: mínimo 6 meses
// 3. Sunset headers adicionados a toda resposta da versão deprecated
// 4. Dashboard mostra % de tráfego por versão por tenant
// 5. Contato direto com tenants que ainda usam versão deprecated
// 6. Remoção da versão após sunset date
```

### 6. Negociação de Versão para Migração Gradual

```typescript
// Para clientes que precisam de migração gradual:
// Header X-API-Version-Override permite testar nova versão sem commit

@Injectable()
export class VersionNegotiationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const override = req.headers['x-api-version-override'];

    if (override) {
      // Permite testar v2 enquanto ainda usa v1 por padrão
      // Apenas em modo preview — não altera o comportamento padrão
      req.params.version = override;
      res.set('X-API-Version-Effective', override);
      res.set('X-API-Version-Preview', 'true');
    }

    next();
  }
}
```

## Consequências

### Positivas
- Breaking changes são contidos em novas versões — integrações existentes continuam funcionando.
- Sunset headers (RFC 8594) fornecem sinalização padronizada e machine-readable de deprecação.
- Período mínimo de 6 meses dá tempo suficiente para migração de clientes enterprise.
- Mappers isolam a lógica de transformação — o service layer permanece unificado.
- Métricas de adoção por versão informam quando é seguro remover versões antigas.

### Negativas
- Manutenção de múltiplas versões simultâneas aumenta a base de código.
- Mappers precisam ser atualizados para cada versão, adicionando overhead de desenvolvimento.
- Risco de "version sprawl" se novas versões forem criadas com frequência excessiva.
- Testes devem cobrir todas as versões ativas, multiplicando a suíte de testes.

## Implementação

- **NestJS URI Versioning** como mecanismo nativo de roteamento por versão.
- **Mappers por versão** em diretório dedicado (`/mappers/v1/`, `/mappers/v2/`).
- **OpenAPI spec** gerada separadamente por versão, publicada em portal de documentação.
- **Changelog** automatizado por versão, gerado a partir de commits e PRs.
- **Dashboard de adoção** mostra distribuição de tráfego por versão e por tenant.
- **CI check** garante que toda versão deprecated tem sunset date definido.
- **SDK versionado**: cada versão da API tem SDK correspondente publicado.

## Validação

- Testes de contrato (contract tests) para cada versão ativa verificam que a estrutura de resposta não muda.
- Teste de backward compatibility: requests válidos em v1 continuam funcionando após deploy de v2.
- Teste de sunset header: verificar presença de headers corretos em versões deprecated.
- Teste de version override: header `X-API-Version-Override` roteia para versão correta.
- Teste de isolamento: lógica de v1 e v2 não interfere uma na outra.
- Monitoramento contínuo: alertar quando tráfego em versão deprecated excede threshold.

## Referências

- ADR 020 — Expor APIs de Gerenciamento para Clientes Enterprise
- ADR 013 — Trust Infrastructure
- ADR 019 — Camada Semântica Compartilhada
- RFC 8594 — The Sunset HTTP Header Field
- REQ-API-001 — Requisitos de API e Integrações
