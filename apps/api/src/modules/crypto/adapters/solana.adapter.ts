import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  getMint,
} from '@solana/spl-token';
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
import bs58 from 'bs58';

const SOLANA_TOKEN_ADDRESSES: Record<string, string> = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

@Injectable()
export class SolanaAdapter implements ChainAdapter {
  readonly chain: SupportedChain = 'solana';
  private readonly connection: Connection;
  private readonly logger: StructuredLogger;

  constructor(private readonly configService: ConfigService) {
    const rpcUrl = this.configService.get<string>(
      'SOLANA_RPC_URL',
      clusterApiUrl('mainnet-beta'),
    );
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.logger = new StructuredLogger('SolanaAdapter');
  }

  async getBalance(address: string, token?: string): Promise<BalanceResult> {
    const pubkey = new PublicKey(address);

    if (token && SOLANA_TOKEN_ADDRESSES[token]) {
      return this.getSplTokenBalance(pubkey, token);
    }

    const balance = await this.connection.getBalance(pubkey);
    return {
      balance: (balance / LAMPORTS_PER_SOL).toString(),
      token: 'SOL',
    };
  }

  private async getSplTokenBalance(
    owner: PublicKey,
    token: string,
  ): Promise<BalanceResult> {
    const mintAddress = new PublicKey(SOLANA_TOKEN_ADDRESSES[token]);
    const ata = await getAssociatedTokenAddress(mintAddress, owner);

    try {
      const account = await getAccount(this.connection, ata);
      const mint = await getMint(this.connection, mintAddress);
      const decimals = mint.decimals;
      const balance = Number(account.amount) / 10 ** decimals;

      return {
        balance: balance.toString(),
        token,
      };
    } catch {
      return {
        balance: '0',
        token,
      };
    }
  }

  async sendTransaction(
    params: SendTransactionParams,
  ): Promise<SendTransactionResult> {
    const senderKeypair = Keypair.fromSecretKey(
      bs58.decode(params.privateKey),
    );
    const recipientPubkey = new PublicKey(params.to);

    let signature: string;

    if (params.token && SOLANA_TOKEN_ADDRESSES[params.token]) {
      signature = await this.sendSplTokenTransaction(
        senderKeypair,
        recipientPubkey,
        params.amount,
        params.token,
      );
    } else {
      const lamports = Math.round(
        parseFloat(params.amount) * LAMPORTS_PER_SOL,
      );

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderKeypair.publicKey,
          toPubkey: recipientPubkey,
          lamports,
        }),
      );

      signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [senderKeypair],
      );
    }

    this.logger.logWithData(
      'info',
      'Transaction sent on Solana',
      {
        txHash: signature,
        from: params.from,
        to: params.to,
        amount: params.amount,
        token: params.token ?? 'SOL',
        chain: this.chain,
      },
      'SolanaAdapter',
    );

    return { txHash: signature };
  }

  private async sendSplTokenTransaction(
    sender: Keypair,
    recipient: PublicKey,
    amount: string,
    token: string,
  ): Promise<string> {
    const mintAddress = new PublicKey(SOLANA_TOKEN_ADDRESSES[token]);
    const mint = await getMint(this.connection, mintAddress);
    const decimals = mint.decimals;

    const senderAta = await getAssociatedTokenAddress(
      mintAddress,
      sender.publicKey,
    );
    const recipientAta = await getAssociatedTokenAddress(
      mintAddress,
      recipient,
    );

    const tokenAmount = Math.round(parseFloat(amount) * 10 ** decimals);

    const transaction = new Transaction().add(
      createTransferInstruction(
        senderAta,
        recipientAta,
        sender.publicKey,
        tokenAmount,
      ),
    );

    return sendAndConfirmTransaction(this.connection, transaction, [sender]);
  }

  async getTransactionStatus(
    txHash: string,
  ): Promise<TransactionStatusResult> {
    const status = await this.connection.getSignatureStatus(txHash, {
      searchTransactionHistory: true,
    });

    if (!status.value) {
      return {
        status: 'pending',
        confirmations: 0,
      };
    }

    const confirmations = status.value.confirmations ?? 0;
    const slot = status.value.slot;

    if (status.value.err) {
      return {
        status: 'failed',
        confirmations,
        blockNumber: slot,
      };
    }

    if (
      status.value.confirmationStatus === 'finalized' ||
      status.value.confirmationStatus === 'confirmed'
    ) {
      return {
        status: 'confirmed',
        confirmations,
        blockNumber: slot,
      };
    }

    return {
      status: 'pending',
      confirmations,
      blockNumber: slot,
    };
  }

  async estimateGas(params: GasEstimateParams): Promise<GasEstimateResult> {
    const recentBlockhash = await this.connection.getLatestBlockhash();
    const lamports = Math.round(
      parseFloat(params.amount) * LAMPORTS_PER_SOL,
    );

    const transaction = new Transaction({
      recentBlockhash: recentBlockhash.blockhash,
      feePayer: new PublicKey(params.from),
    }).add(
      SystemProgram.transfer({
        fromPubkey: new PublicKey(params.from),
        toPubkey: new PublicKey(params.to),
        lamports,
      }),
    );

    const fee = await this.connection.getFeeForMessage(
      transaction.compileMessage(),
    );

    const feeInSol = (fee.value ?? 5000) / LAMPORTS_PER_SOL;

    return {
      gasEstimate: (fee.value ?? 5000).toString(),
      gasFee: feeInSol.toString(),
    };
  }

  isValidAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return PublicKey.isOnCurve(address);
    } catch {
      return false;
    }
  }

  generateKeypair(): { address: string; privateKey: string } {
    const keypair = Keypair.generate();
    return {
      address: keypair.publicKey.toBase58(),
      privateKey: bs58.encode(keypair.secretKey),
    };
  }
}
