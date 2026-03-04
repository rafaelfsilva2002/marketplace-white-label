export type Chain = 'ethereum' | 'polygon' | 'solana';

export type Token = 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';

export interface CreateWalletParams {
  userId: string;
  chain: Chain;
}

export interface CryptoWalletResult {
  walletId: string;
  address: string;
  chain: Chain;
}

export interface TokenBalance {
  token: Token;
  chain: Chain;
  balance: string;
  decimals: number;
}

export interface TransferParams {
  fromWalletId: string;
  toAddress: string;
  chain: Chain;
  token: Token;
  amount: string;
  idempotencyKey: string;
  correlationId: string;
}

export interface TransferResult {
  transferId: string;
  txHash?: string;
  status: 'pending' | 'confirming' | 'confirmed' | 'failed';
}

export interface TransferStatus {
  transferId: string;
  txHash?: string;
  status: 'pending' | 'confirming' | 'confirmed' | 'failed';
  confirmations: number;
  blockNumber?: number;
}

export interface QuoteParams {
  fromCurrency: string;
  toCurrency: string;
  amount: string;
  chain?: Chain;
}

export interface RampQuote {
  quoteId: string;
  rate: string;
  fromAmount: string;
  toAmount: string;
  fees: string;
  expiresAt: Date;
}

export interface RampParams {
  quoteId: string;
  userId: string;
  idempotencyKey: string;
  correlationId: string;
}

export interface RampResult {
  rampId: string;
  status: 'pending' | 'completed' | 'failed';
  fromAmount: string;
  toAmount: string;
}
