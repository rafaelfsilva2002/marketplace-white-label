# ADR 008: Adapter para Multiplas Blockchains (Ethereum, Polygon, Solana)

**Status**: Aceito

**Data**: 2026-03-03

---

## Contexto

A plataforma suporta pagamentos em criptomoedas como alternativa ao Stripe Connect para tenants que desejam oferecer essa modalidade. Diferentes blockchains possuem caracteristicas tecnicas muito distintas: Ethereum e Polygon sao EVM-compatible (mesmo ABI, mesma estrutura de transacao, mas gas fees e tempos de confirmacao diferentes), enquanto Solana utiliza um modelo de programacao completamente diferente (accounts, programs, instrucoes).

Sem uma abstracao adequada, o codigo de negocio precisaria lidar diretamente com as especificidades de cada blockchain, criando acoplamento forte e tornando a adicao de novas chains extremamente custosa. Cada blockchain tem sua propria SDK (ethers.js para EVM, @solana/web3.js para Solana), seu proprio formato de endereco, mecanismo de confirmacao e tratamento de valores numericos.

A plataforma precisa suportar, no minimo: geracao de enderecos de deposito unicos por transacao, verificacao de confirmacoes on-chain, e parsing de valores de token (considerando decimais). A arquitetura deve permitir adicao de novas blockchains (ex: Bitcoin Lightning, Tron) sem alteracao no codigo de dominio.

## Decisao

Adotamos o padrao **Adapter** com uma interface `CryptoRail` que define o contrato para interacao com qualquer blockchain. Cada blockchain possui seu adapter especifico, e um **Factory** seleciona o adapter correto com base no identificador da chain. Um **Mock adapter** e fornecido para testes.

### Interface CryptoRail:

```typescript
interface CryptoRail {
  readonly chain: ChainId;
  generateDepositAddress(tenantId: string, transactionId: string): Promise<DepositAddress>;
  getConfirmations(txHash: string): Promise<number>;
  parseAmount(rawAmount: string, decimals: number): bigint;
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;
  estimateFee(to: string, amount: bigint): Promise<bigint>;
}
```

### Justificativas:

1. **Principio da Inversao de Dependencia (DIP)**: Codigo de dominio depende da abstracao `CryptoRail`, nao das SDKs concretas.
2. **Principio Aberto/Fechado (OCP)**: Nova blockchain = novo adapter, sem alteracao no codigo existente.
3. **Testabilidade**: Mock adapter permite testar todo o fluxo de pagamento cripto sem dependencia de nodes reais.
4. **Factory pattern**: Encapsula a logica de selecao de adapter, simplificando o codigo consumidor.

## Consequencias

### Positivas
- Adicao de novas blockchains sem alteracao no codigo de dominio (apenas novo adapter).
- Testes de integracao rapidos e confiaveis com mock adapter.
- Codigo de negocio limpo e desacoplado de SDKs especificas.
- Facilidade de substituir provider de node (Infura, Alchemy, self-hosted) sem afetar dominio.
- Reutilizacao de logica de reconciliacao e compliance para todas as chains.

### Negativas
- Abstracao pode nao capturar nuances especificas de cada blockchain (ex: MEV no Ethereum, rent no Solana).
- Overhead de manter interface generica compativel com blockchains muito diferentes.
- Necessidade de atualizar SDKs de cada chain independentemente.
- Complexidade adicional no Factory quando chains tem requisitos de configuracao muito distintos.

## Implementacao

### Adapter Ethereum/Polygon (EVM)

```typescript
@Injectable()
export class EvmCryptoRail implements CryptoRail {
  readonly chain: ChainId;

  constructor(
    private readonly provider: ethers.JsonRpcProvider,
    private readonly walletFactory: HDWalletFactory,
    chain: ChainId,
  ) {
    this.chain = chain;
  }

  async generateDepositAddress(
    tenantId: string,
    transactionId: string,
  ): Promise<DepositAddress> {
    // Derivacao deterministica via HD wallet
    const derivationPath = `m/44'/60'/${this.tenantIndex(tenantId)}'/${this.txIndex(transactionId)}`;
    const wallet = this.walletFactory.derive(derivationPath);

    return {
      address: wallet.address,
      chain: this.chain,
      derivationPath,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    };
  }

  async getConfirmations(txHash: string): Promise<number> {
    const tx = await this.provider.getTransaction(txHash);
    if (!tx || !tx.blockNumber) return 0;

    const currentBlock = await this.provider.getBlockNumber();
    return currentBlock - tx.blockNumber + 1;
  }

  parseAmount(rawAmount: string, decimals: number): bigint {
    return ethers.parseUnits(rawAmount, decimals);
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const receipt = await this.provider.getTransactionReceipt(txHash);
    if (!receipt) return TransactionStatus.PENDING;
    return receipt.status === 1
      ? TransactionStatus.CONFIRMED
      : TransactionStatus.FAILED;
  }

  async estimateFee(to: string, amount: bigint): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    const gasLimit = await this.provider.estimateGas({ to, value: amount });
    return gasLimit * (feeData.gasPrice ?? 0n);
  }
}
```

### Adapter Solana

```typescript
@Injectable()
export class SolanaCryptoRail implements CryptoRail {
  readonly chain = ChainId.SOLANA;

  constructor(
    private readonly connection: Connection,
    private readonly keypairFactory: SolanaKeypairFactory,
  ) {}

  async generateDepositAddress(
    tenantId: string,
    transactionId: string,
  ): Promise<DepositAddress> {
    const seed = Buffer.from(`${tenantId}:${transactionId}`);
    const keypair = this.keypairFactory.fromSeed(seed);

    return {
      address: keypair.publicKey.toBase58(),
      chain: this.chain,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  async getConfirmations(txHash: string): Promise<number> {
    const status = await this.connection.getSignatureStatus(txHash);
    if (!status?.value?.confirmationStatus) return 0;

    const confirmationMap: Record<string, number> = {
      processed: 1,
      confirmed: 15,
      finalized: 32,
    };

    return confirmationMap[status.value.confirmationStatus] ?? 0;
  }

  parseAmount(rawAmount: string, decimals: number): bigint {
    const factor = BigInt(10 ** decimals);
    const [whole, fraction = ''] = rawAmount.split('.');
    const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(whole) * factor + BigInt(paddedFraction);
  }

  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    const tx = await this.connection.getTransaction(txHash);
    if (!tx) return TransactionStatus.PENDING;
    return tx.meta?.err
      ? TransactionStatus.FAILED
      : TransactionStatus.CONFIRMED;
  }

  async estimateFee(to: string, amount: bigint): Promise<bigint> {
    const { feeCalculator } = await this.connection.getRecentBlockhash();
    return BigInt(feeCalculator.lamportsPerSignature);
  }
}
```

### Factory de selecao de adapter

```typescript
@Injectable()
export class CryptoRailFactory {
  private readonly adapters = new Map<ChainId, CryptoRail>();

  constructor(
    @Inject('EVM_ETH_RAIL') ethRail: EvmCryptoRail,
    @Inject('EVM_POLYGON_RAIL') polygonRail: EvmCryptoRail,
    @Inject('SOLANA_RAIL') solanaRail: SolanaCryptoRail,
  ) {
    this.adapters.set(ChainId.ETHEREUM, ethRail);
    this.adapters.set(ChainId.POLYGON, polygonRail);
    this.adapters.set(ChainId.SOLANA, solanaRail);
  }

  getAdapter(chain: ChainId): CryptoRail {
    const adapter = this.adapters.get(chain);
    if (!adapter) {
      throw new UnsupportedChainError(chain);
    }
    return adapter;
  }

  getSupportedChains(): ChainId[] {
    return Array.from(this.adapters.keys());
  }
}
```

### Mock adapter para testes

```typescript
export class MockCryptoRail implements CryptoRail {
  readonly chain = ChainId.MOCK;
  private confirmations = new Map<string, number>();

  async generateDepositAddress(
    tenantId: string,
    transactionId: string,
  ): Promise<DepositAddress> {
    return {
      address: `0xMOCK_${tenantId}_${transactionId}`,
      chain: this.chain,
      expiresAt: new Date(Date.now() + 86400000),
    };
  }

  async getConfirmations(txHash: string): Promise<number> {
    return this.confirmations.get(txHash) ?? 0;
  }

  parseAmount(rawAmount: string, decimals: number): bigint {
    return BigInt(rawAmount) * BigInt(10 ** decimals);
  }

  // Metodo auxiliar para testes
  setConfirmations(txHash: string, count: number): void {
    this.confirmations.set(txHash, count);
  }
}
```

## Validacao

1. **Teste unitario de cada adapter**: Verificar `generateDepositAddress`, `getConfirmations` e `parseAmount` com valores conhecidos.
2. **Teste de factory**: Verificar que `getAdapter(ChainId.ETHEREUM)` retorna `EvmCryptoRail` e `getAdapter(ChainId.SOLANA)` retorna `SolanaCryptoRail`.
3. **Teste de chain nao suportada**: Verificar que `getAdapter(ChainId.UNKNOWN)` lanca `UnsupportedChainError`.
4. **Teste de integracao com mock**: Executar fluxo completo de deposito cripto usando `MockCryptoRail`.
5. **Teste de integracao com testnet**: Executar fluxo contra Ethereum Sepolia e Solana Devnet para validar adapters reais.
6. **Teste de parseAmount**: Validar parsing correto de valores com diferentes casas decimais (6 para USDC, 18 para ETH, 9 para SOL).

## Referencias

- [ADR 009 - Conciliacao de Transacoes Cripto com Ledger](009-crypto-reconciliation-ledger.md)
- [ADR 010 - Camada de Compliance e AML](010-crypto-compliance-aml.md)
- REQ-CRYPTO-001: Suporte a pagamentos em Ethereum, Polygon e Solana
- REQ-CRYPTO-002: Geracao de enderecos unicos por transacao
- REQ-ARCH-006: Extensibilidade para novas blockchains
