import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { CryptoService } from '../services/crypto.service';
import { AmlComplianceService } from '../services/aml-compliance.service';
import { AmlCheckGuard } from '../middleware/aml-check.guard';
import { CreateWalletDto } from '../dto/create-wallet.dto';
import { SendPaymentDto } from '../dto/send-payment.dto';
import type { ScreeningResult } from '../services/aml-compliance.service';

@Controller('crypto')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CryptoController {
  constructor(
    private readonly cryptoService: CryptoService,
    private readonly amlComplianceService: AmlComplianceService,
  ) {}

  @Post('wallets')
  async createWallet(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateWalletDto,
  ) {
    const wallet = await this.cryptoService.createWallet(
      user.id,
      dto.chain,
    );

    return {
      id: wallet.id,
      chain: wallet.chain,
      address: wallet.address,
      isActive: wallet.isActive,
      createdAt: wallet.createdAt,
    };
  }

  @Get('wallets')
  async listWallets(@CurrentUser() user: JwtUser) {
    const wallets = await this.cryptoService.getWalletsByUser(user.id);

    return wallets.map((w) => ({
      id: w.id,
      chain: w.chain,
      address: w.address,
      isActive: w.isActive,
      createdAt: w.createdAt,
    }));
  }

  @Get('wallets/:id/balance')
  async getBalance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token?: string,
  ) {
    return this.cryptoService.getBalance(id, token);
  }

  @Post('payments')
  @UseGuards(AmlCheckGuard)
  async sendPayment(
    @CurrentUser() user: JwtUser,
    @Body() dto: SendPaymentDto,
    @Req() req: { amlScreeningResult?: ScreeningResult },
  ) {
    const transaction = await this.cryptoService.sendPayment(user.id, {
      walletId: dto.walletId,
      to: dto.to,
      amount: dto.amount,
      token: dto.token,
      idempotencyKey: dto.idempotencyKey,
    });

    const amlResult = req.amlScreeningResult;
    if (amlResult) {
      await this.amlComplianceService.recordComplianceCheck(
        transaction.id,
        user.id,
        amlResult,
      );

      if (amlResult.requiresManualReview) {
        await this.amlComplianceService.generateSAR(
          transaction.id,
          user.id,
          amlResult,
          {
            chain: transaction.chain,
            from: transaction.fromAddress,
            to: transaction.toAddress,
            amount: transaction.amount,
            token: transaction.token,
            txHash: transaction.txHash,
          },
        );
      }
    }

    return {
      id: transaction.id,
      txHash: transaction.txHash,
      chain: transaction.chain,
      from: transaction.fromAddress,
      to: transaction.toAddress,
      amount: transaction.amount,
      token: transaction.token,
      status: transaction.status,
      createdAt: transaction.createdAt,
      aml: amlResult
        ? {
            riskLevel: amlResult.riskLevel,
            requiresManualReview: amlResult.requiresManualReview,
          }
        : undefined,
    };
  }

  @Get('transactions')
  async listTransactions(
    @Query('walletId', ParseUUIDPipe) walletId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.cryptoService.getTransactionHistory({
      walletId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  @Get('transactions/:id')
  async getTransaction(@Param('id', ParseUUIDPipe) id: string) {
    const transaction = await this.cryptoService.pollTransactionStatus(id);

    return {
      id: transaction.id,
      walletId: transaction.walletId,
      txHash: transaction.txHash,
      chain: transaction.chain,
      from: transaction.fromAddress,
      to: transaction.toAddress,
      amount: transaction.amount,
      token: transaction.token,
      status: transaction.status,
      blockNumber: transaction.blockNumber,
      gasUsed: transaction.gasUsed,
      gasFee: transaction.gasFee,
      confirmations: transaction.confirmations,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
