# ADR 009: Conciliacao de Transacoes Cripto com Ledger

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

Diferentemente de pagamentos via Stripe (onde a confirmacao e quase instantanea e gerenciada pelo Stripe), transacoes em blockchain requerem um numero minimo de confirmacoes antes de serem consideradas finais. Uma transacao Ethereum precisa de ~12 confirmacoes (~3 minutos), Polygon ~128 confirmacoes (~4 minutos) e Solana atinge finalidade em ~32 slots (~13 segundos). Ate atingir esse threshold, a transacao pode ser revertida (reorganizacao de blocos).

A plataforma precisa acompanhar o ciclo de vida completo de cada transacao cripto: desde a deteccao do deposito no endereco gerado, passando pelo acumulo de confirmacoes, ate a creditacao final no ledger do vendedor. Esse acompanhamento deve ser idempotente -- se o worker processar a mesma transacao duas vezes (por restart, crash recovery ou replay), o vendedor nao pode ser creditado em dobro.

O ledger financeiro e a fonte de verdade para saldos da plataforma. Toda entrada no ledger e imutavel (append-only). A reconciliacao garante que o estado do ledger reflete fielmente o estado on-chain, detectando divergencias automaticamente.

## Decisao

Adotamos um modelo de **conciliacao baseada em maquina de estados** para transacoes cripto, com **creditacao no ledger condicionada ao threshold de confirmacoes** e **idempotencia baseada no tx hash**.

### Maquina de estados da transacao cripto:

```
DETECTED → CONFIRMING → CONFIRMED → CREDITED
                ↓              ↓
             DROPPED        FAILED
```

### Justificativas:

1. **Maquina de estados explicita**: Cada transacao tem um status claro e auditavel. Transicoes invalidas sao bloqueadas.
2. **Threshold de confirmacoes configuravel por chain**: Permite ajustar seguranca vs velocidade por blockchain.
3. **Idempotencia por tx hash**: A combinacao `(tenant_id, chain, tx_hash)` e unica. Tentativas duplicadas de creditacao sao ignoradas.
4. **Ledger append-only**: Garante trilha de auditoria completa e reconciliacao automatica.

## Consequencias

### Positivas
- Impossivel creditar a mesma transacao duas vezes (idempotencia por tx hash).
- Rastreabilidade completa do ciclo de vida de cada transacao cripto.
- Thresholds de confirmacao configuraveis permitem balancear seguranca e experiencia do usuario.
- Reconciliacao automatica detecta divergencias entre blockchain e ledger.
- Compativel com o padrao de entradas compensatorias do Stripe (ADR 003).

### Negativas
- Worker de polling adiciona carga no node RPC (mitigado com batch queries e cache).
- Atraso entre deposito e creditacao pode frustrar usuarios (UX de progresso necessario).
- Tabela `crypto_transactions` cresce significativamente com volume alto de transacoes.
- Complexidade de tratamento de reorganizacao de blocos (edge case raro mas critico).

## Implementacao

### Schema da tabela crypto_transactions

```sql
CREATE TABLE crypto_transactions (
  tenant_id       UUID         NOT NULL,
  id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  chain           VARCHAR(32)  NOT NULL,
  tx_hash         VARCHAR(128) NOT NULL,
  from_address    VARCHAR(128) NOT NULL,
  to_address      VARCHAR(128) NOT NULL,
  amount          NUMERIC(78, 0) NOT NULL, -- Suporta ate uint256
  token_address   VARCHAR(128),            -- NULL para moeda nativa
  decimals        SMALLINT     NOT NULL,
  confirmations   INT          NOT NULL DEFAULT 0,
  required_confirmations INT   NOT NULL,
  status          VARCHAR(16)  NOT NULL DEFAULT 'DETECTED'
    CHECK (status IN ('DETECTED', 'CONFIRMING', 'CONFIRMED', 'CREDITED', 'DROPPED', 'FAILED')),
  ledger_entry_id UUID,
  detected_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  confirmed_at    TIMESTAMPTZ,
  credited_at     TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, chain, tx_hash)
);

CREATE INDEX idx_crypto_tx_status
  ON crypto_transactions (status, updated_at)
  WHERE status IN ('DETECTED', 'CONFIRMING');

CREATE INDEX idx_crypto_tx_address
  ON crypto_transactions (tenant_id, to_address, status);
```

### Worker de monitoramento de confirmacoes

```typescript
@Injectable()
export class CryptoConfirmationWorker {
  private readonly thresholds: Record<ChainId, number> = {
    [ChainId.ETHEREUM]: 12,
    [ChainId.POLYGON]: 128,
    [ChainId.SOLANA]: 32,
  };

  constructor(
    private readonly cryptoTxRepo: CryptoTransactionRepository,
    private readonly cryptoRailFactory: CryptoRailFactory,
    private readonly ledgerService: LedgerService,
    private readonly eventPublisher: DomainEventPublisher,
  ) {}

  @Cron('*/10 * * * * *') // A cada 10 segundos
  async checkConfirmations(): Promise<void> {
    const pendingTxs = await this.cryptoTxRepo.findPending(100);

    for (const tx of pendingTxs) {
      const rail = this.cryptoRailFactory.getAdapter(tx.chain as ChainId);
      const confirmations = await rail.getConfirmations(tx.txHash);

      await this.processConfirmations(tx, confirmations);
    }
  }

  private async processConfirmations(
    tx: CryptoTransaction,
    confirmations: number,
  ): Promise<void> {
    const threshold = this.thresholds[tx.chain as ChainId];

    if (confirmations === 0 && tx.status === 'DETECTED') {
      // Verificar se transacao foi dropada (mais de 1h sem confirmacao)
      const age = Date.now() - tx.detectedAt.getTime();
      if (age > 3600000) {
        await this.cryptoTxRepo.updateStatus(tx.id, 'DROPPED');
        return;
      }
    }

    if (confirmations > 0 && tx.status === 'DETECTED') {
      await this.cryptoTxRepo.updateConfirmations(tx.id, confirmations, 'CONFIRMING');
    }

    if (confirmations >= threshold && tx.status !== 'CREDITED') {
      await this.creditToLedger(tx);
    } else if (confirmations > tx.confirmations) {
      await this.cryptoTxRepo.updateConfirmations(tx.id, confirmations, tx.status);
    }
  }

  private async creditToLedger(tx: CryptoTransaction): Promise<void> {
    // Idempotencia: verificar se ja foi creditado
    const existing = await this.ledgerService.findByReference(
      tx.tenantId,
      'CRYPTO_DEPOSIT',
      `${tx.chain}:${tx.txHash}`,
    );

    if (existing) {
      // Ja creditado, apenas atualizar status
      await this.cryptoTxRepo.updateStatus(tx.id, 'CREDITED');
      return;
    }

    // Criar entrada no ledger dentro de transacao
    await this.dataSource.transaction(async (manager) => {
      const ledgerEntry = await this.ledgerService.createEntry(manager, {
        tenantId: tx.tenantId,
        type: 'CRYPTO_DEPOSIT',
        amount: tx.amount,
        currency: tx.chain,
        referenceId: `${tx.chain}:${tx.txHash}`,
        metadata: {
          chain: tx.chain,
          txHash: tx.txHash,
          fromAddress: tx.fromAddress,
          toAddress: tx.toAddress,
          confirmations: tx.confirmations,
        },
      });

      await this.cryptoTxRepo.markCredited(
        manager,
        tx.id,
        ledgerEntry.id,
      );
    });

    // Publicar evento de deposito confirmado
    await this.eventPublisher.publish({
      tenantId: tx.tenantId,
      type: 'crypto.deposit.confirmed.v1',
      payload: { transactionId: tx.id, amount: tx.amount.toString(), chain: tx.chain },
    });
  }
}
```

### Job de reconciliacao periodica

```typescript
@Injectable()
export class CryptoReconciliationJob {
  @Cron('0 */6 * * *') // A cada 6 horas
  async reconcile(): Promise<void> {
    const creditedTxs = await this.cryptoTxRepo.findCredited(
      new Date(Date.now() - 24 * 60 * 60 * 1000), // Ultimas 24h
    );

    for (const tx of creditedTxs) {
      const rail = this.cryptoRailFactory.getAdapter(tx.chain as ChainId);
      const onChainStatus = await rail.getTransactionStatus(tx.txHash);

      if (onChainStatus === TransactionStatus.FAILED) {
        this.alertService.critical(
          `Transacao ${tx.txHash} creditada mas falhou on-chain! Intervencao manual necessaria.`,
        );
      }
    }
  }
}
```

## Validacao

1. **Teste de ciclo de vida**: Simular deposito com MockCryptoRail, incrementar confirmacoes e verificar transicoes DETECTED -> CONFIRMING -> CONFIRMED -> CREDITED.
2. **Teste de idempotencia**: Processar mesma transacao duas vezes e verificar que apenas uma entrada e criada no ledger.
3. **Teste de drop**: Simular transacao que nunca recebe confirmacoes e verificar transicao para DROPPED apos timeout.
4. **Teste de threshold**: Verificar que creditacao so ocorre apos atingir numero minimo de confirmacoes por chain.
5. **Teste de reconciliacao**: Inserir transacao com divergencia e verificar que alerta e emitido.
6. **Teste de concorrencia**: Executar dois workers simultaneos processando a mesma transacao e verificar que apenas um credita.

## Referencias

- [ADR 003 - Idempotencia no Stripe Connect](003-stripe-idempotency.md)
- [ADR 005 - Outbox Pattern e Replay de Eventos](005-outbox-replay.md)
- [ADR 008 - Adapter para Multiplas Blockchains](008-crypto-rail-adapter.md)
- [ADR 010 - Camada de Compliance e AML](010-crypto-compliance-aml.md)
- REQ-CRYPTO-003: Confirmacao de depositos com threshold por chain
- REQ-FIN-002: Reconciliacao automatica de transacoes cripto
