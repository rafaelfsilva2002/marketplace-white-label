export interface BalanceResult {
  balance: string;
  token: string;
}

export interface SendTransactionParams {
  from: string;
  to: string;
  amount: string;
  token?: string;
  privateKey: string;
}

export interface SendTransactionResult {
  txHash: string;
}

export interface TransactionStatusResult {
  status: string;
  confirmations: number;
  blockNumber?: number;
}

export interface GasEstimateParams {
  from: string;
  to: string;
  amount: string;
}

export interface GasEstimateResult {
  gasEstimate: string;
  gasFee: string;
}

export type SupportedChain = 'ethereum' | 'polygon' | 'solana';

export const CHAIN_ADAPTER = Symbol('CHAIN_ADAPTER');

export interface ChainAdapter {
  readonly chain: SupportedChain;

  getBalance(address: string, token?: string): Promise<BalanceResult>;

  sendTransaction(params: SendTransactionParams): Promise<SendTransactionResult>;

  getTransactionStatus(txHash: string): Promise<TransactionStatusResult>;

  estimateGas(params: GasEstimateParams): Promise<GasEstimateResult>;

  isValidAddress(address: string): boolean;

  generateKeypair(): { address: string; privateKey: string };
}
