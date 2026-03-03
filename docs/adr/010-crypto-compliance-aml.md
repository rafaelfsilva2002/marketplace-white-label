# ADR 010: Camada de Compliance e AML para Transacoes Cripto

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

Transacoes em criptomoedas estao sujeitas a regulamentacoes de combate a lavagem de dinheiro (AML - Anti-Money Laundering) e financiamento ao terrorismo (CFT). No Brasil, a Receita Federal e o COAF exigem que plataformas que intermediam transacoes cripto implementem controles de compliance. Internacionalmente, reguladores como o FATF (Financial Action Task Force) estabelecem padroes de Travel Rule que exigem identificacao de remetentes e destinatarios.

Enderecos de criptomoedas associados a atividades ilicitas (ransomware, mercados darknet, esquemas de fraude, entidades sancionadas) sao catalogados por provedores especializados como Chainalysis, Elliptic e TRM Labs. A plataforma precisa verificar cada endereco de origem de deposito contra essas listas antes de creditar o valor no ledger. Creditar um deposito de um endereco sancionado sem verificacao expoe a plataforma a risco legal significativo.

A implementacao deve ser desacoplada do provedor de AML, pois o provedor pode mudar (de Chainalysis para Elliptic, por exemplo) sem que isso afete a logica de negocio. Inicialmente, a plataforma usara um mock provider que aprova todas as transacoes, permitindo desenvolvimento e testes completos antes da integracao com o provedor real.

## Decisao

Adotamos uma **camada de compliance obrigatoria** entre a deteccao de deposito cripto e a creditacao no ledger. Toda transacao cripto passa por verificacao AML antes de ser creditada. Enderecos sinalizados resultam em status `HOLD` com revisao manual obrigatoria.

### Fluxo de compliance:

```
Deposito Detectado
       ↓
  AML Check (endereco de origem)
       ↓
  ┌────┴────┐
  │         │
CLEAN    FLAGGED
  ↓         ↓
CREDITED   HOLD
           ↓
     ┌─────┴─────┐
     │           │
  APPROVED    REJECTED
     ↓           ↓
  CREDITED    RETURNED
```

### Justificativas:

1. **Compliance regulatorio**: Atende exigencias da Receita Federal, COAF e padroes internacionais FATF.
2. **Desacoplamento do provedor**: Interface `AmlProvider` permite trocar de provedor sem alterar logica de negocio.
3. **Mock-first development**: Equipe pode desenvolver e testar o fluxo completo antes de ter contrato com provedor real.
4. **Revisao manual**: Dashboard de compliance permite que analistas revisem transacoes flaggeadas, com trilha de auditoria completa.
5. **Defesa em camadas**: AML check e uma camada adicional de seguranca alem da verificacao de confirmacoes (ADR 009).

## Consequencias

### Positivas
- Conformidade regulatoria com legislacao brasileira e internacional.
- Protecao contra recepcao de fundos de origem ilicita.
- Trilha de auditoria completa para cada decisao de compliance.
- Flexibilidade para trocar de provedor AML sem refatoracao.
- Dashboard de compliance oferece visibilidade operacional.

### Negativas
- Latencia adicional no fluxo de creditacao (50-200ms por verificacao AML).
- Custo por verificacao com provedores reais (US$ 0.01-0.10 por check).
- Transacoes em HOLD requerem equipe de compliance para revisao manual.
- False positives de provedores AML podem gerar atrito com usuarios legitimos.
- Necessidade de manter dados de compliance com retencao minima de 5 anos.

## Implementacao

### Interface do provedor AML

```typescript
interface AmlProvider {
  checkAddress(
    address: string,
    chain: ChainId,
  ): Promise<AmlCheckResult>;

  checkTransaction(
    txHash: string,
    chain: ChainId,
  ): Promise<AmlCheckResult>;
}

interface AmlCheckResult {
  status: 'CLEAN' | 'FLAGGED' | 'ERROR';
  riskScore: number;        // 0-100
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE';
  flags: AmlFlag[];
  provider: string;
  checkedAt: Date;
  rawResponse?: unknown;    // Resposta completa do provedor para auditoria
}

interface AmlFlag {
  category: string;         // ex: 'SANCTIONS', 'DARKNET', 'RANSOMWARE'
  description: string;
  severity: 'WARNING' | 'CRITICAL';
  source: string;
}
```

### Mock provider para desenvolvimento

```typescript
@Injectable()
export class MockAmlProvider implements AmlProvider {
  private readonly flaggedAddresses = new Set<string>();

  async checkAddress(address: string, chain: ChainId): Promise<AmlCheckResult> {
    if (this.flaggedAddresses.has(address)) {
      return {
        status: 'FLAGGED',
        riskScore: 95,
        riskLevel: 'SEVERE',
        flags: [
          {
            category: 'SANCTIONS',
            description: 'Mock: Endereco na lista de sancoes',
            severity: 'CRITICAL',
            source: 'mock-provider',
          },
        ],
        provider: 'mock',
        checkedAt: new Date(),
      };
    }

    return {
      status: 'CLEAN',
      riskScore: 0,
      riskLevel: 'LOW',
      flags: [],
      provider: 'mock',
      checkedAt: new Date(),
    };
  }

  async checkTransaction(txHash: string, chain: ChainId): Promise<AmlCheckResult> {
    return this.checkAddress(txHash, chain); // Simplificado para mock
  }

  // Metodo auxiliar para testes
  flagAddress(address: string): void {
    this.flaggedAddresses.add(address);
  }
}
```

### Schema da tabela de compliance

```sql
CREATE TABLE aml_checks (
  tenant_id       UUID         NOT NULL,
  id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  crypto_tx_id    UUID         NOT NULL,
  address         VARCHAR(128) NOT NULL,
  chain           VARCHAR(32)  NOT NULL,
  provider        VARCHAR(64)  NOT NULL,
  status          VARCHAR(16)  NOT NULL
    CHECK (status IN ('CLEAN', 'FLAGGED', 'ERROR')),
  risk_score      SMALLINT     NOT NULL,
  risk_level      VARCHAR(16)  NOT NULL,
  flags           JSONB        NOT NULL DEFAULT '[]',
  raw_response    JSONB,
  checked_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, crypto_tx_id)
    REFERENCES crypto_transactions (tenant_id, id)
);

CREATE TABLE compliance_reviews (
  tenant_id       UUID         NOT NULL,
  id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  crypto_tx_id    UUID         NOT NULL,
  aml_check_id    UUID         NOT NULL,
  reviewer_id     UUID         NOT NULL,
  decision        VARCHAR(16)  NOT NULL
    CHECK (decision IN ('APPROVED', 'REJECTED')),
  reason          TEXT         NOT NULL,
  decided_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX idx_aml_checks_status
  ON aml_checks (tenant_id, status, checked_at);

CREATE INDEX idx_compliance_pending
  ON crypto_transactions (tenant_id, status)
  WHERE status = 'HOLD';
```

### Servico de compliance integrado ao fluxo de deposito

```typescript
@Injectable()
export class ComplianceService {
  private readonly RISK_THRESHOLD = 70; // Score acima de 70 = HOLD

  constructor(
    private readonly amlProvider: AmlProvider,
    private readonly amlCheckRepo: AmlCheckRepository,
    private readonly cryptoTxRepo: CryptoTransactionRepository,
  ) {}

  async evaluateTransaction(
    tenantId: string,
    cryptoTx: CryptoTransaction,
  ): Promise<ComplianceDecision> {
    const result = await this.amlProvider.checkAddress(
      cryptoTx.fromAddress,
      cryptoTx.chain as ChainId,
    );

    // Persistir resultado do check
    await this.amlCheckRepo.save({
      tenantId,
      cryptoTxId: cryptoTx.id,
      address: cryptoTx.fromAddress,
      chain: cryptoTx.chain,
      provider: result.provider,
      status: result.status,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      flags: result.flags,
      rawResponse: result.rawResponse,
    });

    if (result.status === 'FLAGGED' || result.riskScore >= this.RISK_THRESHOLD) {
      await this.cryptoTxRepo.updateStatus(cryptoTx.id, 'HOLD');
      return ComplianceDecision.HOLD;
    }

    return ComplianceDecision.APPROVED;
  }

  async manualReview(
    tenantId: string,
    cryptoTxId: string,
    reviewerId: string,
    decision: 'APPROVED' | 'REJECTED',
    reason: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await this.reviewRepo.save(manager, {
        tenantId,
        cryptoTxId,
        amlCheckId: await this.amlCheckRepo.findLatestByTx(tenantId, cryptoTxId),
        reviewerId,
        decision,
        reason,
      });

      if (decision === 'APPROVED') {
        await this.cryptoTxRepo.updateStatus(cryptoTxId, 'CONFIRMED', manager);
        // Fluxo de creditacao sera disparado pelo worker de confirmacoes
      } else {
        await this.cryptoTxRepo.updateStatus(cryptoTxId, 'FAILED', manager);
        // TODO: Disparar fluxo de devolucao de fundos
      }
    });
  }
}
```

## Validacao

1. **Teste de endereco limpo**: Submeter deposito de endereco nao flaggeado e verificar que fluxo segue para creditacao.
2. **Teste de endereco sancionado**: Flaggear endereco no MockAmlProvider e verificar que transacao vai para status HOLD.
3. **Teste de revisao manual - aprovacao**: Aprovar transacao em HOLD e verificar que segue para creditacao.
4. **Teste de revisao manual - rejeicao**: Rejeitar transacao em HOLD e verificar que status muda para FAILED.
5. **Teste de trilha de auditoria**: Verificar que todas as decisoes (automaticas e manuais) estao registradas com timestamp e reviewer.
6. **Teste de troca de provedor**: Substituir MockAmlProvider por stub de Chainalysis e verificar que fluxo funciona identicamente.
7. **Teste de threshold configuravel**: Alterar RISK_THRESHOLD e verificar que transacoes com score intermediario sao tratadas corretamente.

## Referencias

- [ADR 008 - Adapter para Multiplas Blockchains](008-crypto-rail-adapter.md)
- [ADR 009 - Conciliacao de Transacoes Cripto com Ledger](009-crypto-reconciliation-ledger.md)
- REQ-CRYPTO-004: Verificacao AML em todas as transacoes cripto
- REQ-COMPLIANCE-001: Conformidade com regulamentacoes COAF e Receita Federal
- REQ-COMPLIANCE-002: Retencao de dados de compliance por 5 anos
- FATF Recommendation 16 (Travel Rule)
- COAF - Conselho de Controle de Atividades Financeiras
