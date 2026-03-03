# ADR 004: Isolamento de Dados no Algolia (Busca)

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

A plataforma utiliza Algolia como motor de busca para perfis de profissionais, servicos e produtos dentro de cada marketplace. A busca precisa ser rapida (< 50ms de latencia), relevante e, acima de tudo, isolada por tenant. Um usuario do marketplace A nunca pode ver resultados de busca do marketplace B, nem mesmo parcialmente, pois isso constitui vazamento de dados comerciais sensiveis e violacao da LGPD.

O Algolia oferece diferentes abordagens para multi-tenancy: (1) um unico indice com atributo `tenant_id` para filtragem, (2) indices separados por tenant, ou (3) aplicacoes separadas por tenant. A escolha entre essas abordagens impacta diretamente a seguranca, performance e custo da solucao. Um unico indice com filtro por `tenant_id` e mais simples, porem um bug no filtro expoe dados entre tenants. Indices separados oferecem isolamento fisico com custo moderado.

Alem do isolamento em si, as chaves de API usadas pelo frontend para realizar buscas precisam ser restritas ao indice do tenant correspondente. Chaves de API publicas sem restricao permitiriam que qualquer usuario consultasse qualquer indice, independentemente de seu tenant.

## Decisao

Adotamos o modelo de **indice separado por tenant** com nomenclatura padronizada `{tenantId}_profiles`, combinado com **Secured API Keys** geradas no servidor para restringir acesso do frontend ao indice correto.

### Justificativas:

1. **Isolamento fisico por indice**: Elimina qualquer possibilidade de vazamento de dados entre tenants via busca, pois os dados estao fisicamente separados.
2. **Secured API Keys**: Chaves de API sao geradas pelo backend com restricao de indice embutida, impossibilitando que o frontend acesse indices de outros tenants.
3. **Performance previsivel**: Cada indice contem apenas dados do tenant, evitando degradacao de performance em tenants com baixo volume devido a tenants vizinhos com alto volume.
4. **Custo aceitavel**: O Algolia cobra por operacoes, nao por numero de indices. Multiplos indices nao geram custo adicional significativo.

### Fluxo de indexacao:

1. Evento `profile.updated.v1` e publicado (via outbox pattern).
2. Indexer consumer consome o evento.
3. Indexer envia documento para o indice `{tenantId}_profiles` no Algolia.
4. Documento inclui atributos buscaveis (nome, habilidades, localizacao) sem dados sensiveis.

## Consequencias

### Positivas
- Isolamento total de dados de busca: impossivel vazar dados entre tenants.
- Performance independente por tenant: um tenant com milhoes de registros nao afeta tenants menores.
- Secured API Keys impedem acesso nao autorizado a indices de outros tenants.
- Facilidade de exclusao completa de dados de um tenant (deletar indice inteiro).
- Configuracao de relevancia (ranking, sinonimos) personalizavel por tenant.

### Negativas
- Necessidade de gerenciar N indices (criacao automatica no onboarding de tenant).
- Configuracoes de indice (searchable attributes, ranking) precisam ser replicadas para cada novo tenant.
- Busca cross-tenant para analytics da plataforma requer indice agregado separado.
- Latencia de indexacao: eventos passam pelo outbox antes de chegar ao Algolia (~200-500ms delay).

## Implementacao

### Servico de Indexacao

```typescript
@Injectable()
export class AlgoliaIndexerService {
  constructor(private readonly algoliaClient: SearchClient) {}

  private getIndexName(tenantId: string, entity: string): string {
    return `${tenantId}_${entity}`;
  }

  async indexProfile(tenantId: string, profile: ProfileDTO): Promise<void> {
    const indexName = this.getIndexName(tenantId, 'profiles');
    const index = this.algoliaClient.initIndex(indexName);

    await index.saveObject({
      objectID: profile.id,
      name: profile.displayName,
      skills: profile.skills,
      location: profile.location,
      rating: profile.averageRating,
      hourlyRate: profile.hourlyRate,
      _geoloc: profile.coordinates
        ? { lat: profile.coordinates.lat, lng: profile.coordinates.lng }
        : undefined,
    });
  }

  async removeProfile(tenantId: string, profileId: string): Promise<void> {
    const indexName = this.getIndexName(tenantId, 'profiles');
    const index = this.algoliaClient.initIndex(indexName);
    await index.deleteObject(profileId);
  }

  async deleteTenantIndex(tenantId: string, entity: string): Promise<void> {
    const indexName = this.getIndexName(tenantId, entity);
    const index = this.algoliaClient.initIndex(indexName);
    await index.delete();
  }
}
```

### Geracao de Secured API Key

```typescript
@Injectable()
export class AlgoliaKeyService {
  constructor(
    @Inject('ALGOLIA_SEARCH_KEY') private readonly searchApiKey: string,
  ) {}

  generateSecuredKey(tenantId: string): string {
    return generateSecuredApiKey(this.searchApiKey, {
      restrictIndices: [
        `${tenantId}_profiles`,
        `${tenantId}_services`,
        `${tenantId}_products`,
      ],
      validUntil: Math.floor(Date.now() / 1000) + 3600, // 1 hora
    });
  }
}
```

### Consumer de eventos para indexacao

```typescript
@Injectable()
export class ProfileIndexerConsumer {
  constructor(private readonly indexer: AlgoliaIndexerService) {}

  @EventHandler('profile.updated.v1')
  async handle(event: DomainEvent<ProfileUpdatedPayload>): Promise<void> {
    await this.indexer.indexProfile(event.tenantId, event.payload.profile);
  }

  @EventHandler('profile.deleted.v1')
  async handleDeletion(event: DomainEvent<ProfileDeletedPayload>): Promise<void> {
    await this.indexer.removeProfile(event.tenantId, event.payload.profileId);
  }
}
```

### Configuracao automatica de indice no onboarding

```typescript
async setupTenantIndices(tenantId: string): Promise<void> {
  const profileIndex = this.algoliaClient.initIndex(`${tenantId}_profiles`);

  await profileIndex.setSettings({
    searchableAttributes: ['name', 'skills', 'location'],
    attributesForFaceting: ['skills', 'location', 'filterOnly(hourlyRate)'],
    customRanking: ['desc(rating)', 'asc(hourlyRate)'],
    hitsPerPage: 20,
  });
}
```

## Validacao

1. **Teste de isolamento**: Indexar perfis para dois tenants diferentes e verificar que busca com Secured API Key do tenant A retorna apenas dados do tenant A.
2. **Teste de Secured API Key**: Tentar usar key do tenant A para acessar indice do tenant B e verificar que Algolia rejeita a requisicao.
3. **Teste de expiracao de key**: Gerar key com TTL de 1 segundo, esperar expiracao e verificar rejeicao.
4. **Teste de indexacao eventual**: Publicar evento `profile.updated.v1` e verificar que o perfil aparece no Algolia em menos de 2 segundos.
5. **Teste de onboarding**: Criar novo tenant e verificar que indices sao criados com configuracoes corretas.
6. **Teste de offboarding**: Deletar tenant e verificar que todos os indices sao removidos.

## Referencias

- [ADR 001 - Modelo de Isolamento Multi-tenancy](001-tenancy-model.md)
- [ADR 005 - Outbox Pattern e Replay de Eventos](005-outbox-replay.md)
- REQ-SEARCH-001: Busca full-text de perfis com latencia < 50ms
- REQ-SEC-001: Isolamento de dados entre tenants
- Algolia Secured API Keys Documentation
