import type { CryptoGateway } from '../crypto-gateway.interface';
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
} from '../types';

export interface DfnsConfig {
  appId: string;
  authToken: string;
  baseUrl: string;
}

const CHAIN_TO_DFNS_NETWORK: Record<Chain, string> = {
  ethereum: 'EthereumSepolia',
  polygon: 'PolygonMumbai',
  solana: 'SolanaDevnet',
};

const DFNS_STATUS_MAP: Record<string, TransferResult['status']> = {
  Initiated: 'pending',
  Broadcasted: 'confirming',
  Confirmed: 'confirmed',
  Failed: 'failed',
};

export class DfnsCryptoAdapter implements CryptoGateway {
  private client: any;

  constructor(private config: DfnsConfig) {
    // Dynamic import - Dfns SDK loaded at runtime
    const { DfnsApiClient } = require('@dfns/sdk');
    this.client = new DfnsApiClient({
      appId: config.appId,
      authToken: config.authToken,
      baseUrl: config.baseUrl,
    });
  }

  async createWallet(params: CreateWalletParams): Promise<CryptoWalletResult> {
    const network = CHAIN_TO_DFNS_NETWORK[params.chain];
    const wallet = await this.client.wallets.createWallet({
      body: { network },
    });
    return {
      walletId: wallet.id,
      address: wallet.address,
      chain: params.chain,
    };
  }

  async getBalance(
    address: string,
    chain: Chain,
    token?: Token,
  ): Promise<TokenBalance> {
    const assets = await this.client.wallets.getWalletAssets({
      walletId: address,
    });
    const t = token ?? this.defaultToken(chain);
    const asset = assets.assets?.find(
      (a: any) => a.symbol.toUpperCase() === t,
    );
    return {
      token: t,
      chain,
      balance: asset?.balance ?? '0',
      decimals: asset?.decimals ?? 18,
    };
  }

  async transfer(params: TransferParams): Promise<TransferResult> {
    const result = await this.client.transfers.createTransfer({
      walletId: params.fromWalletId,
      body: {
        to: params.toAddress,
        amount: params.amount,
        asset: params.token,
        note: params.correlationId,
        externalId: params.idempotencyKey,
      },
    });
    return {
      transferId: result.id,
      txHash: result.txHash,
      status: DFNS_STATUS_MAP[result.status] ?? 'pending',
    };
  }

  async getTransferStatus(transferId: string): Promise<TransferStatus> {
    const result = await this.client.transfers.getTransfer({ transferId });
    return {
      transferId: result.id,
      txHash: result.txHash,
      status: DFNS_STATUS_MAP[result.status] ?? 'pending',
      confirmations: result.confirmations ?? 0,
      blockNumber: result.blockNumber,
    };
  }

  async getQuote(_params: QuoteParams): Promise<RampQuote> {
    throw new Error(
      'On/off ramp not implemented in DfnsAdapter — use dedicated ramp service',
    );
  }

  async executeRamp(_params: RampParams): Promise<RampResult> {
    throw new Error(
      'On/off ramp not implemented in DfnsAdapter — use dedicated ramp service',
    );
  }

  private defaultToken(chain: Chain): Token {
    const map: Record<Chain, Token> = {
      ethereum: 'ETH',
      polygon: 'MATIC',
      solana: 'SOL',
    };
    return map[chain];
  }
}
