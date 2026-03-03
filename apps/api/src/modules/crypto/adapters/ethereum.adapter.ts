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

const ETHEREUM_TOKEN_ADDRESSES: Record<string, string> = {
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
};

@Injectable()
export class EthereumAdapter implements ChainAdapter {
  readonly chain: SupportedChain = 'ethereum';
  private readonly provider: JsonRpcProvider;
  private readonly logger: StructuredLogger;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl = this.configService.get<string>(
      'ETHEREUM_RPC_URL',
      'https://eth-mainnet.g.alchemy.com/v2/demo',
    );
    this.provider = new JsonRpcProvider(rpcUrl);
    this.logger = new StructuredLogger('EthereumAdapter');
  }

  async getBalance(address: string, token?: string): Promise<BalanceResult> {
    if (token && ETHEREUM_TOKEN_ADDRESSES[token]) {
      return this.getErc20Balance(address, token);
    }

    const balanceWei = await this.provider.getBalance(address);
    return {
      balance: formatEther(balanceWei),
      token: 'ETH',
    };
  }

  private async getErc20Balance(
    address: string,
    token: string,
  ): Promise<BalanceResult> {
    const tokenAddress = ETHEREUM_TOKEN_ADDRESSES[token];
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

    if (params.token && ETHEREUM_TOKEN_ADDRESSES[params.token]) {
      tx = await this.sendErc20Transaction(wallet, params);
    } else {
      tx = await wallet.sendTransaction({
        to: params.to,
        value: parseEther(params.amount),
      });
    }

    this.logger.logWithData(
      'info',
      'Transaction sent on Ethereum',
      {
        txHash: tx.hash,
        from: params.from,
        to: params.to,
        amount: params.amount,
        token: params.token ?? 'ETH',
        chain: this.chain,
      },
      'EthereumAdapter',
    );

    return { txHash: tx.hash };
  }

  private async sendErc20Transaction(
    wallet: Wallet,
    params: SendTransactionParams,
  ): Promise<TransactionResponse> {
    const tokenAddress = ETHEREUM_TOKEN_ADDRESSES[params.token!];
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
