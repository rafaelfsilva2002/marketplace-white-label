# ADR 006: Arquitetura Hub-and-Spoke para Escala Multi-tenant

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

A plataforma atende dezenas a centenas de tenants com perfis de uso muito diferentes: alguns tenants possuem milhares de usuarios ativos com alto volume de transacoes, enquanto outros sao marketplaces de nicho com volume moderado. Uma arquitetura monolitica ou uniformemente distribuida nao consegue atender eficientemente essa diversidade, pois escalar toda a plataforma para atender o pico de um unico tenant e desperdicar recursos para os demais.

Alem da diversidade de carga, existem servicos que sao inerentemente compartilhados (autenticacao, billing, configuracao de tenant) e servicos que sao especificos por tenant ou grupo de tenants (processamento de pedidos, busca, notificacoes). Escalar esses dois tipos de servicos de forma independente permite otimizar custos e performance.

A arquitetura Hub-and-Spoke e um padrao comprovado para esse cenario: o Hub centraliza servicos compartilhados e orquestracao, enquanto os Spokes executam cargas de trabalho que podem ser escaladas horizontalmente de forma independente, conectados ao Hub via event bus.

## Decisao

Adotamos a arquitetura **Hub-and-Spoke** onde:

- **Hub** = servicos compartilhados que atendem todos os tenants: autenticacao (Auth), billing (Stripe Connect), configuracao de tenant (TenantConfig), gateway API e event bus.
- **Spokes** = workloads especificos que podem ser escalados independentemente por demanda: processamento de pedidos, indexacao de busca (Algolia), notificacoes, processamento de pagamentos cripto, compliance/AML.

### Justificativas:

1. **Escalabilidade granular**: Spokes podem escalar horizontalmente por tenant ou por funcionalidade, sem afetar o Hub ou outros Spokes.
2. **Isolamento de falhas**: Uma falha em um Spoke (ex: indexacao do Algolia) nao afeta outros Spokes (ex: processamento de pagamentos).
3. **Otimizacao de custos**: Spokes com baixa demanda podem operar com replicas minimas, enquanto Spokes com alta demanda escalam conforme necessidade.
4. **Event bus como backbone**: O event bus desacopla Hub e Spokes, permitindo comunicacao assincrona sem dependencia direta.

### Topologia:

```
                    ┌─────────────┐
                    │   Gateway   │
                    │    (Hub)    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────┴─────┐ ┌───┴───┐ ┌─────┴─────┐
        │   Auth    │ │Billing│ │  Tenant   │
        │  (Hub)    │ │ (Hub) │ │  Config   │
        └───────────┘ └───────┘ │  (Hub)    │
                                └───────────┘
                           │
                    ┌──────┴──────┐
                    │  Event Bus  │
                    └──────┬──────┘
              ┌────────┬───┴───┬────────┐
              │        │       │        │
        ┌─────┴──┐ ┌──┴───┐ ┌┴─────┐ ┌┴──────┐
        │ Orders │ │Search│ │Notif.│ │Crypto │
        │(Spoke) │ │(Spoke│ │(Spoke│ │(Spoke)│
        └────────┘ └──────┘ └──────┘ └───────┘
```

## Consequencias

### Positivas
- Tenants de alto volume podem ter Spokes dedicados sem afetar a plataforma.
- Deploys independentes por Spoke reduzem blast radius de alteracoes.
- Auto-scaling por Spoke permite resposta automatica a picos de demanda.
- Facilita adocao de tecnologias diferentes por Spoke (ex: Go para Spoke de alta performance).
- Event bus garante desacoplamento temporal entre Hub e Spokes.

### Negativas
- Complexidade operacional maior: mais servicos para monitorar, deployar e debugar.
- Latencia adicional na comunicacao via event bus (vs chamada direta).
- Necessidade de observabilidade distribuida (tracing, correlation IDs).
- Event bus se torna single point of failure (mitigado com cluster redundante).
- Overhead de infraestrutura para Spokes com baixissimo volume.

## Implementacao

### Definicao de servicos Hub

```typescript
// hub/auth-service/auth.module.ts
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
    TenantModule, // Compartilhado por todos os tenants
  ],
  controllers: [AuthController],
  providers: [AuthService, TenantAwareGuard],
})
export class AuthModule {}
```

### Definicao de servicos Spoke com auto-scaling

```yaml
# k8s/spokes/orders-spoke.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-spoke
  labels:
    component: spoke
    spoke-type: orders
spec:
  replicas: 2
  selector:
    matchLabels:
      app: orders-spoke
  template:
    spec:
      containers:
        - name: orders
          image: marketplace/orders-spoke:latest
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orders-spoke-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orders-spoke
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: orders_queue_depth
        target:
          type: AverageValue
          averageValue: "50"
```

### Event bus conectando Hub e Spokes

```typescript
// shared/event-bus/event-bus.service.ts
@Injectable()
export class EventBusService {
  constructor(
    @Inject('MESSAGE_BROKER') private readonly broker: MessageBroker,
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    const topic = this.resolveTopicFromEventType(event.type);
    await this.broker.publish(topic, {
      ...event,
      publishedAt: new Date().toISOString(),
    });
  }

  subscribe(eventType: string, handler: EventHandler): void {
    const topic = this.resolveTopicFromEventType(eventType);
    this.broker.subscribe(topic, async (message) => {
      const event = this.deserialize(message);
      await handler.handle(event);
    });
  }

  private resolveTopicFromEventType(eventType: string): string {
    // profile.updated.v1 -> domain.profile
    const [domain, action] = eventType.split('.');
    return `domain.${domain}`;
  }
}
```

### Roteamento tenant-aware para Spokes dedicados

```typescript
@Injectable()
export class SpokeRouter {
  constructor(private readonly tenantConfig: TenantConfigService) {}

  async resolveSpoke(tenantId: string, spokeType: string): Promise<string> {
    const config = await this.tenantConfig.get(tenantId);

    // Tenants enterprise podem ter Spoke dedicado
    if (config.dedicatedSpokes?.includes(spokeType)) {
      return `${spokeType}-${tenantId}`;
    }

    // Demais tenants usam Spoke compartilhado
    return `${spokeType}-shared`;
  }
}
```

## Validacao

1. **Teste de isolamento de Spoke**: Derrubar um Spoke e verificar que outros Spokes e o Hub continuam operando.
2. **Teste de auto-scaling**: Gerar carga em um Spoke especifico e verificar que HPA escala horizontalmente.
3. **Teste de roteamento**: Verificar que tenant enterprise e direcionado para Spoke dedicado.
4. **Teste de latencia**: Medir latencia end-to-end Hub -> Event Bus -> Spoke e garantir que esta dentro dos SLAs.
5. **Teste de failover do Event Bus**: Simular queda de um no do broker e verificar que mensagens nao sao perdidas.
6. **Teste de carga cruzada**: Gerar alto volume em um tenant e verificar que outros tenants nao sao afetados.

## Referencias

- [ADR 001 - Modelo de Isolamento Multi-tenancy](001-tenancy-model.md)
- [ADR 005 - Outbox Pattern e Replay de Eventos](005-outbox-replay.md)
- [ADR 007 - Single-tenant para Compliance](007-single-tenant-for-compliance.md)
- REQ-ARCH-004: Escalabilidade horizontal por tenant
- REQ-ARCH-005: Isolamento de falhas entre servicos
- REQ-OPS-001: Auto-scaling baseado em metricas de negocio
