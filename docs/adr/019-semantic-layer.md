# ADR 019: Camada Semântica Compartilhada

## Status

**Aceito** — Março 2026

## Contexto

Em uma arquitetura de microsserviços, é comum que cada serviço desenvolva sua própria interpretação de conceitos de negócio fundamentais. O serviço de pagamentos define "transação" de uma forma, o serviço de analytics de outra, e o serviço de billing de uma terceira. "Perfil de vendedor" pode significar dados cadastrais para um serviço, score de reputação para outro, e status de compliance para um terceiro. Essa divergência semântica — ou "drift" — gera inconsistências em relatórios, bugs sutis em integrações e dificuldade de comunicação entre times.

O problema se intensifica no modelo white-label multi-tenant: cada tenant pode ter terminologia distinta ("vendedor" vs "prestador" vs "profissional"), mas a plataforma precisa que a definição técnica subjacente seja única e consistente. A camada semântica separa a linguagem do negócio (variável por tenant) da definição técnica (fixa na plataforma).

Sem uma fonte única de verdade para definições de negócio, cada novo microsserviço requer alinhamento manual com os existentes, aumentando o custo de integração e o risco de regressões semânticas. A camada semântica atua como o "dicionário de dados vivo" da plataforma.

## Decisão

Implementamos uma **camada semântica compartilhada** como pacote npm interno que define formalmente os conceitos de negócio da plataforma:

### 1. Definição de Conceitos de Negócio

```typescript
// @marketplace/semantic-layer/src/concepts/transaction.ts

/**
 * TRANSAÇÃO: Representa uma troca de valor entre duas partes dentro do marketplace.
 *
 * Invariantes:
 * - Toda transação pertence a exatamente um tenant.
 * - Toda transação tem um buyer e um seller distintos.
 * - O valor bruto (grossAmount) é sempre > 0.
 * - O status segue a máquina de estados definida em TransactionStateMachine.
 */
export interface TransactionConcept {
  /** Identificador único global */
  id: string;
  /** Tenant proprietário */
  tenantId: string;
  /** Parte compradora */
  buyerId: string;
  /** Parte vendedora */
  sellerId: string;
  /** Valor bruto da transação na moeda do tenant */
  grossAmount: Money;
  /** Taxa da plataforma */
  platformFee: Money;
  /** Valor líquido para o vendedor */
  netAmount: Money;
  /** Estado atual no ciclo de vida */
  status: TransactionStatus;
  /** Timestamps do ciclo de vida */
  lifecycle: TransactionLifecycle;
}

export type TransactionStatus =
  | 'PENDING'       // criada, aguardando pagamento
  | 'AUTHORIZED'    // pagamento autorizado
  | 'CAPTURED'      // pagamento capturado
  | 'COMPLETED'     // entrega confirmada, fundos liberados
  | 'DISPUTED'      // em disputa
  | 'REFUNDED'      // reembolsada
  | 'CANCELLED';    // cancelada antes de captura
```

### 2. Value Objects Compartilhados

```typescript
// @marketplace/semantic-layer/src/value-objects/money.ts
export class Money {
  constructor(
    readonly amount: number,    // em centavos (inteiro)
    readonly currency: string,  // ISO 4217
  ) {
    if (!Number.isInteger(amount)) throw new Error('Amount must be integer (cents)');
    if (amount < 0) throw new Error('Amount cannot be negative');
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount + other.amount, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount - other.amount, this.currency);
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(`Currency mismatch: ${this.currency} vs ${other.currency}`);
    }
  }
}
```

### 3. Máquinas de Estado

```typescript
// @marketplace/semantic-layer/src/state-machines/transaction.sm.ts
export const TransactionStateMachine = {
  PENDING:    { allowed: ['AUTHORIZED', 'CANCELLED'] },
  AUTHORIZED: { allowed: ['CAPTURED', 'CANCELLED'] },
  CAPTURED:   { allowed: ['COMPLETED', 'DISPUTED', 'REFUNDED'] },
  COMPLETED:  { allowed: ['DISPUTED'] },
  DISPUTED:   { allowed: ['COMPLETED', 'REFUNDED'] },
  REFUNDED:   { allowed: [] },
  CANCELLED:  { allowed: [] },
} as const;

export function canTransition(from: TransactionStatus, to: TransactionStatus): boolean {
  return TransactionStateMachine[from].allowed.includes(to);
}
```

### 4. Glossário por Tenant (Terminologia Customizada)

```typescript
// Mapping de terminologia por vertical de marketplace
export const VERTICAL_GLOSSARY = {
  services: {
    seller: 'Profissional',
    buyer: 'Cliente',
    listing: 'Serviço',
    transaction: 'Contratação',
  },
  products: {
    seller: 'Vendedor',
    buyer: 'Comprador',
    listing: 'Produto',
    transaction: 'Pedido',
  },
  freelance: {
    seller: 'Freelancer',
    buyer: 'Contratante',
    listing: 'Proposta',
    transaction: 'Projeto',
  },
} as const;
```

### 5. Estrutura do Pacote

```
@marketplace/semantic-layer/
├── src/
│   ├── concepts/          # Definições formais de entidades
│   │   ├── transaction.ts
│   │   ├── profile.ts
│   │   ├── listing.ts
│   │   └── match.ts
│   ├── value-objects/     # Money, Email, TenantId, etc.
│   ├── state-machines/    # Transições válidas de estado
│   ├── glossary/          # Terminologia por vertical
│   ├── events/            # Contratos de domain events
│   └── validators/        # Regras de validação compartilhadas
├── tests/
└── package.json
```

## Consequências

### Positivas
- Definição única e versionada de cada conceito de negócio — elimina drift semântico entre serviços.
- Value objects compartilhados previnem bugs de aritmética monetária e conversão de moeda.
- Máquinas de estado garantem que transições inválidas são rejeitadas em todos os serviços igualmente.
- Glossário por vertical permite customização de UI sem alterar lógica de negócio.
- Onboarding de novos desenvolvedores acelerado — documentação viva no código.

### Negativas
- Acoplamento: todos os serviços dependem do pacote `@marketplace/semantic-layer`.
- Versionamento requer cuidado — breaking changes no pacote impactam todos os consumidores.
- Risco de crescimento excessivo se conceitos muito específicos de um serviço forem incluídos.
- Necessidade de governança sobre o que entra ou não na camada semântica.

## Implementação

- **Pacote npm privado** publicado no registry interno (GitHub Packages ou Verdaccio).
- **Semantic versioning** rigoroso: MAJOR para breaking changes, MINOR para novos conceitos.
- **Code owners** obrigatórios para reviews de alterações no pacote.
- **Schema registry** complementar para contratos de eventos (Avro/JSON Schema).
- **CI check** verifica que nenhum serviço redefine conceitos já definidos na camada semântica.

## Validação

- Testes unitários cobrem 100% dos value objects e state machines.
- Testes de contrato verificam que cada serviço consome os conceitos corretamente.
- Linting customizado detecta definições duplicadas de conceitos de negócio fora do pacote.
- Review trimestral do glossário semântico com stakeholders de produto.
- Teste de compatibilidade: verificar que atualização do pacote não quebra nenhum serviço.

## Referências

- ADR 001 — Modelo de Isolamento de Dados Multi-tenancy
- ADR 009 — Crypto Reconciliation Ledger
- ADR 013 — Trust Infrastructure
- ADR 018 — Camada de Orquestração como Ativo Estratégico
- REQ-ARCH-001 — Requisitos de Consistência Arquitetural
