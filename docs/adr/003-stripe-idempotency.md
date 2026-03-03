# ADR 003: Idempotencia e Consistencia no Stripe Connect

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

A plataforma processa pagamentos entre compradores e vendedores (profissionais) utilizando Stripe Connect no modelo de split payments. Cada transacao envolve a criacao de um `PaymentIntent` com `application_fee_amount` para a plataforma e transferencia automatica para a conta conectada do vendedor. Falhas de rede, timeouts e retentativas automaticas podem causar cobracas duplicadas ou inconsistencias entre o estado da plataforma e o estado do Stripe.

Em sistemas de pagamento, a idempotencia nao e apenas uma boa pratica -- e um requisito obrigatorio. Uma cobranca duplicada gera reembolsos, reclamacoes de clientes, disputas de chargeback e potenciais sancoes regulatorias. O Stripe oferece suporte nativo a `Idempotency-Key` em suas APIs, mas a responsabilidade de gerar e gerenciar essas chaves e da aplicacao.

Alem dos pagamentos em si, os webhooks do Stripe podem ser entregues multiplas vezes (at-least-once delivery). Sem deduplicacao no lado do consumidor, um webhook de `payment_intent.succeeded` processado duas vezes pode creditar o vendedor em dobro no ledger interno da plataforma.

## Decisao

Adotamos uma estrategia de idempotencia em tres camadas para todas as interacoes com o Stripe Connect:

1. **Idempotency-Key em toda chamada API**: Cada operacao de criacao no Stripe recebe uma chave unica derivada do contexto de negocio (ex: `{tenantId}:{orderId}:{operation}`).
2. **Tabela `stripe_webhook_events`**: Armazena o `event_id` de cada webhook processado para deduplicacao.
3. **Ledger entries compensatorios**: Reembolsos nao deletam entradas do ledger; criam entradas compensatorias (credito negativo) para manter trilha de auditoria completa.

### Justificativas:

1. **Chave de idempotencia baseada em negocio**: Usar UUID aleatorio nao protege contra retentativas logicas (usuario clicando duas vezes). Chaves derivadas do contexto de negocio garantem que a mesma operacao de negocio gere a mesma chamada Stripe.
2. **Deduplicacao de webhooks**: O Stripe garante entrega, nao unicidade. A tabela de eventos garante processamento exatamente-uma-vez na pratica.
3. **Entradas compensatorias**: Padrao contabil double-entry garante que o saldo do ledger esta sempre correto e auditavel.

## Consequencias

### Positivas
- Zero cobracas duplicadas mesmo sob falha de rede ou retentativa.
- Trilha de auditoria completa de todas as transacoes financeiras no ledger.
- Webhooks processados exatamente uma vez na pratica (at-most-once processing).
- Reconciliacao automatica entre Stripe e ledger interno.
- Conformidade com boas praticas de sistemas financeiros (double-entry bookkeeping).

### Negativas
- Complexidade adicional na geracao e armazenamento de chaves de idempotencia.
- Tabela `stripe_webhook_events` cresce indefinidamente (necessita politica de retencao).
- Latencia adicional de ~1-2ms por webhook para verificar deduplicacao.
- Entradas compensatorias tornam queries de saldo mais complexas (SUM em vez de SELECT simples).

## Implementacao

### Servico de Pagamento com Idempotency-Key

```typescript
@Injectable()
export class StripePaymentService {
  constructor(private readonly stripe: Stripe) {}

  async createPaymentIntent(
    tenantId: string,
    orderId: string,
    amount: number,
    currency: string,
    connectedAccountId: string,
    applicationFeeAmount: number,
  ): Promise<Stripe.PaymentIntent> {
    const idempotencyKey = `${tenantId}:${orderId}:create_pi`;

    return this.stripe.paymentIntents.create(
      {
        amount,
        currency,
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: connectedAccountId,
        },
        metadata: {
          tenant_id: tenantId,
          order_id: orderId,
        },
      },
      {
        idempotencyKey,
        stripeAccount: connectedAccountId,
      },
    );
  }

  async refundPayment(
    tenantId: string,
    paymentIntentId: string,
    amount?: number,
  ): Promise<Stripe.Refund> {
    const idempotencyKey = `${tenantId}:${paymentIntentId}:refund:${amount ?? 'full'}`;

    return this.stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        amount,
        reverse_transfer: true,
        refund_application_fee: true,
      },
      { idempotencyKey },
    );
  }
}
```

### Tabela de deduplicacao de webhooks

```sql
CREATE TABLE stripe_webhook_events (
  tenant_id    UUID        NOT NULL,
  event_id     VARCHAR(64) NOT NULL,
  event_type   VARCHAR(64) NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload      JSONB       NOT NULL,
  PRIMARY KEY (tenant_id, event_id)
);

CREATE INDEX idx_webhook_events_type
  ON stripe_webhook_events (tenant_id, event_type, processed_at);
```

### Handler de webhook com deduplicacao

```typescript
@Injectable()
export class StripeWebhookHandler {
  constructor(
    private readonly webhookRepo: WebhookEventRepository,
    private readonly ledgerService: LedgerService,
  ) {}

  async handleEvent(event: Stripe.Event, tenantId: string): Promise<void> {
    // 1. Verificar deduplicacao
    const alreadyProcessed = await this.webhookRepo.exists(tenantId, event.id);
    if (alreadyProcessed) {
      return; // Idempotente: ignorar eventos ja processados
    }

    // 2. Processar evento
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event, tenantId);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event, tenantId);
        break;
    }

    // 3. Registrar evento como processado
    await this.webhookRepo.save({
      tenantId,
      eventId: event.id,
      eventType: event.type,
      payload: event.data,
    });
  }

  private async handleChargeRefunded(
    event: Stripe.Event,
    tenantId: string,
  ): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    // Entrada compensatoria, nao delecao
    await this.ledgerService.createEntry({
      tenantId,
      type: 'REFUND',
      amount: -charge.amount_refunded,
      referenceId: charge.payment_intent as string,
      metadata: { stripeChargeId: charge.id },
    });
  }
}
```

## Validacao

1. **Teste de idempotencia**: Chamar `createPaymentIntent` duas vezes com mesmos parametros e verificar que apenas um PaymentIntent e criado no Stripe.
2. **Teste de deduplicacao de webhook**: Enviar o mesmo evento de webhook duas vezes e verificar que o ledger recebe apenas uma entrada.
3. **Teste de reembolso compensatorio**: Processar reembolso e verificar que entrada compensatoria negativa e criada no ledger (saldo correto).
4. **Teste de falha de rede**: Simular timeout na chamada Stripe, retentativa automatica e verificar que nao ha duplicacao.
5. **Teste de reconciliacao**: Comparar totais do ledger interno com dados do Stripe Dashboard via API e verificar consistencia.

## Referencias

- [ADR 005 - Outbox Pattern e Replay de Eventos](005-outbox-replay.md)
- [ADR 009 - Conciliacao de Transacoes Cripto com Ledger](009-crypto-reconciliation-ledger.md)
- REQ-PAY-001: Processamento de pagamentos via Stripe Connect
- REQ-PAY-002: Split payment com application fee
- REQ-FIN-001: Trilha de auditoria financeira completa
- Stripe Idempotent Requests Documentation
