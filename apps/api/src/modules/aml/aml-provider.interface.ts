import type {
  ScreeningParams,
  ScreeningResult,
  WalletRiskResult,
  Chain,
} from './types';

export const AML_PROVIDER = Symbol('AML_PROVIDER');

export interface AmlProvider {
  screenTransaction(params: ScreeningParams): Promise<ScreeningResult>;
  screenWallet(address: string, chain: Chain): Promise<WalletRiskResult>;
  isBlacklisted(address: string, chain?: Chain): Promise<boolean>;
}
