import { randomUUID } from 'crypto';

import type { CryptoGateway } from '../crypto-gateway.interface';
import type {
  Chain,
  CreateWalletParams,
  CryptoWalletResult,
  QuoteParams,
  RampParams,
  RampQuote,
  RampResult,
  Token,
  TokenBalance,
  TransferParams,
  TransferResult,
  TransferStatus,
} from '../types';

const TOKEN_DECIMALS: Record<Token, number> = {
  ETH: 18,
  MATIC: 18,
  SOL: 9,
  USDT: 6,
  USDC: 6,
};

const DEFAULT_TOKEN_BY_CHAIN: Record<Chain, Token> = {
  ethereum: 'ETH',
  polygon: 'MATIC',
  solana: 'SOL',
};

const HEX_CHARS = '0123456789abcdef';
const ALPHANUM_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateRandomString(chars: string, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function generateEvmAddress(): string {
  return '0x' + generateRandomString(HEX_CHARS, 40);
}

function generateSolanaAddress(): string {
  return generateRandomString(ALPHANUM_CHARS, 44);
}

function generateTxHash(): string {
  return '0x' + generateRandomString(HEX_CHARS, 64);
}

interface StoredTransfer {
  transferId: string;
  txHash: string;
  status: 'confirmed';
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export class MockCryptoAdapter implements CryptoGateway {
  private readonly transfers = new Map<string, StoredTransfer>();

  async createWallet(params: CreateWalletParams): Promise<CryptoWalletResult> {
    const address =
      params.chain === 'solana' ? generateSolanaAddress() : generateEvmAddress();

    return {
      walletId: randomUUID(),
      address,
      chain: params.chain,
    };
  }

  async getBalance(
    _address: string,
    chain: Chain,
    token?: Token,
  ): Promise<TokenBalance> {
    const resolvedToken = token ?? DEFAULT_TOKEN_BY_CHAIN[chain];
    const decimals = TOKEN_DECIMALS[resolvedToken];

    return {
      token: resolvedToken,
      chain,
      balance: '1000000000',
      decimals,
    };
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    const existing = this.transfers.get(params.idempotencyKey);
    if (existing) {
      return {
        transferId: existing.transferId,
        txHash: existing.txHash,
        status: existing.status,
      };
    }

    const stored: StoredTransfer = {
      transferId: randomUUID(),
      txHash: generateTxHash(),
      status: 'confirmed',
    };

    this.transfers.set(params.idempotencyKey, stored);

    return {
      transferId: stored.transferId,
      txHash: stored.txHash,
      status: stored.status,
    };
  }

  async getTransferStatus(transferId: string): Promise<TransferStatus> {
    for (const stored of this.transfers.values()) {
      if (stored.transferId === transferId) {
        return {
          transferId: stored.transferId,
          txHash: stored.txHash,
          status: 'confirmed',
          confirmations: 12,
          blockNumber: 1_000_000,
        };
      }
    }

    return {
      transferId,
      status: 'pending',
      confirmations: 0,
    };
  }

  async getQuote(params: QuoteParams): Promise<RampQuote> {
    const rate = '1.00';
    const fromAmount = params.amount;
    const toAmount = params.amount;
    const fees = '0.01';

    return {
      quoteId: randomUUID(),
      rate,
      fromAmount,
      toAmount,
      fees,
      expiresAt: new Date(Date.now() + FIVE_MINUTES_MS),
    };
  }

  async executeRamp(_params: RampParams): Promise<RampResult> {
    return {
      rampId: randomUUID(),
      status: 'completed',
      fromAmount: '100.00',
      toAmount: '100.00',
    };
  }
}
