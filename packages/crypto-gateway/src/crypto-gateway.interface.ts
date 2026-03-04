import type {
  CreateWalletParams,
  CryptoWalletResult,
  TokenBalance,
  TransferParams,
  TransferResult,
  TransferStatus,
  QuoteParams,
  RampQuote,
  RampParams,
  RampResult,
  Chain,
  Token,
} from './types';

export const CRYPTO_GATEWAY = Symbol('CRYPTO_GATEWAY');

export interface CryptoGateway {
  createWallet(params: CreateWalletParams): Promise<CryptoWalletResult>;
  getBalance(address: string, chain: Chain, token?: Token): Promise<TokenBalance>;
  transfer(params: TransferParams): Promise<TransferResult>;
  getTransferStatus(transferId: string): Promise<TransferStatus>;
  getQuote(params: QuoteParams): Promise<RampQuote>;
  executeRamp(params: RampParams): Promise<RampResult>;
}
