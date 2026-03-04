import {
  Controller, Post, Get, Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { CryptoWalletService } from '../services/crypto-wallet.service';
import { CryptoBalanceService } from '../services/crypto-balance.service';
import { CryptoPaymentService } from '../services/crypto-payment.service';
import { CreateWalletDto } from '../dto/create-wallet.dto';
import { CreateCryptoPaymentDto } from '../dto/create-payment.dto';
import type { Chain, Token } from '@marketplace/crypto-gateway';

@Controller('crypto')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CryptoController {
  constructor(
    private readonly walletService: CryptoWalletService,
    private readonly balanceService: CryptoBalanceService,
    private readonly paymentService: CryptoPaymentService,
  ) {}

  @Post('wallets')
  async createWallet(@Request() req: any, @Body() dto: CreateWalletDto) {
    return this.walletService.createWallet(req.user.id, dto.chain);
  }

  @Get('wallets')
  async listWallets(@Request() req: any) {
    return this.walletService.listWallets(req.user.id);
  }

  @Get('wallets/:chain')
  async getWallet(@Request() req: any, @Param('chain') chain: Chain) {
    return this.walletService.getWallet(req.user.id, chain);
  }

  @Get('balances')
  async getBalances(@Request() req: any) {
    return this.balanceService.getBalances(req.user.id);
  }

  @Get('balances/:token')
  async getBalance(
    @Request() req: any,
    @Param('token') token: Token,
    @Query('chain') chain: Chain,
  ) {
    return this.balanceService.getBalance(req.user.id, token, chain);
  }

  @Post('payments')
  async createPayment(@Request() req: any, @Body() dto: CreateCryptoPaymentDto) {
    return this.paymentService.createPayment({
      userId: req.user.id,
      professionalUserId: '',
      profileId: dto.profileId,
      amount: dto.amount,
      token: dto.token,
      chain: dto.chain,
      idempotencyKey: dto.idempotencyKey,
      correlationId: req.correlationId,
    });
  }

  @Get('payments/history')
  async getHistory(
    @Request() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.balanceService.getHistory(
      req.user.id,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0,
    );
  }
}
