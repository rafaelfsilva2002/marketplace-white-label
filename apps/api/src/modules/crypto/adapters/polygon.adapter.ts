import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JsonRpcProvider,
  Wallet,
  parseEther,
  formatEther,
  parseUnits,
  formatUnits,
  Contract,
  isAddress,
  type TransactionResponse,
} from 'ethers';
import {
  ChainAdapter,
  type BalanceResult,
  type SendTransactionParams,
  type SendTransactionResult,
  type TransactionStatusResult,
  type GasEstimateParams,
  type GasEstimateResult,
  type SupportedChain,
} from '../interfaces/chain-adapter.interface';
import { StructuredLogger } from '@/common/logger/structured.logger';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

const POLYGON_TOKEN_ADDRESSES: Record<string, string> = {
  USDC: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',
  USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
};

@Injectable()
export class PolygonAdapter implements ChainAdapter {
  readonly chain: SupportedChain = 'polygon';
  private readonly provider: JsonRpcProvider;
  private readonly logger: StructuredLogger;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl = this.configService.get<string>(
      'POLYGON_RPC_URL',
      'https://polygon-rpc.com',
    );
    this.provider = new JsonRpcProvider(rpcUrl);
    this.logger = new StructuredLogger('PolygonAdapter');
  }

  async getBalance(address: string, token?: string): Promise<BalanceResult> {
    if (token && POLYGON_TOKEN_ADDRESSES[token]) {
      return this.getErc20Balance(address, token);
    }

    const balanceWei = await this.provider.getBalance(address);
    return {
      balance: formatEther(balanceWei),
      token: 'MATIC',
    };
  }

  private async getErc20Balance(
    address: string,
    token: string,
  ): Promise<BalanceResult> {
    const tokenAddress = POLYGON_TOKEN_ADDRESSES[token];
    const contract = new Contract(tokenAddress, ERC20_ABI, this.provider);

    const [balance, decimals] = await Promise.all([
      contract.balanceOf(address) as Promise<bigint>,
      contract.decimals() as Promise<number>,
    ]);

    return {
      balance: formatUnits(balance, decimals),
      token,
    };
  }

  async sendTransaction(
    params: SendTransactionParams,
  ): Promise<SendTransactionResult> {
    const wallet = new Wallet(params.privateKey, this.provider);

    let tx: TransactionResponse;

    if (params.token && POLYGON_TOKEN_ADDRESSES[params.token]) {
      tx = await this.sendErc20Transaction(wallet, params);
    } else {
      tx = await wallet.sendTransaction({
        to: params.to,
        value: parseEther(params.amount),
      });
    }

    this.logger.logWithData(
      'info',
      'Transaction sent on Polygon',
      {
        txHash: tx.hash,
        from: params.from,
        to: params.to,
        amount: params.amount,
        token: params.token ?? 'MATIC',
        chain: this.chain,
      },
      'PolygonAdapter',
    );

    return { txHash: tx.hash };
  }

  private async sendErc20Transaction(
    wallet: Wallet,
    params: SendTransactionParams,
  ): Promise<TransactionResponse> {
    const tokenAddress = POLYGON_TOKEN_ADDRESSES[params.token!];
    const contract = new Contract(tokenAddress, ERC20_ABI, wallet);
    const decimals = (await contract.decimals()) as number;
    const amount = parseUnits(params.amount, decimals);

    return contract.transfer(params.to, amount) as Promise<TransactionResponse>;
  }

  async getTransactionStatus(
    txHash: string,
  ): Promise<TransactionStatusResult> {
    const receipt = await this.provider.getTransactionReceipt(txHash);

    if (!receipt) {
      return {
        status: 'pending',
        confirmations: 0,
      };
    }

    const currentBlock = await this.provider.getBlockNumber();
    const confirmations = currentBlock - receipt.blockNumber + 1;

    return {
      status: receipt.status === 1 ? 'confirmed' : 'reverted',
      confirmations,
      blockNumber: receipt.blockNumber,
    };
  }

  async estimateGas(params: GasEstimateParams): Promise<GasEstimateResult> {
    const gasEstimate = await this.provider.estimateGas({
      from: params.from,
      to: params.to,
      value: parseEther(params.amount),
    });

    const feeData = await this.provider.getFeeData();
    const gasPrice = feeData.gasPrice ?? 0n;
    const gasFee = gasEstimate * gasPrice;

    return {
      gasEstimate: gasEstimate.toString(),
      gasFee: formatEther(gasFee),
    };
  }

  isValidAddress(address: string): boolean {
    return isAddress(address);
  }

  generateKeypair(): { address: string; privateKey: string } {
    const wallet = Wallet.createRandom();
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
    };
  }
}
