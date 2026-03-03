import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { JwtUser } from '@/modules/auth/strategies/jwt.strategy';
import { StripeService } from '../services/stripe.service';
import { WalletService } from '../services/wallet.service';
import { PaymentService } from '../services/payment.service';
import { CreatePaymentDto } from '../dto/create-payment.dto';
import { WithdrawDto } from '../dto/withdraw.dto';
import { randomUUID } from 'node:crypto';

@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private readonly stripeService: StripeService,
    private readonly walletService: WalletService,
    private readonly paymentService: PaymentService,
  ) {}

  @Post('create-account')
  async createConnectAccount(@CurrentUser() user: JwtUser) {
    const account = await this.stripeService.createConnectAccount(
      user.id,
      user.email,
    );

    const onboardingUrl = await this.stripeService.createAccountLink(
      user.id,
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/payments/refresh`,
      `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/payments/return`,
    );

    return {
      accountId: account.id,
      stripeAccountId: account.stripeAccountId,
      status: account.status,
      onboardingUrl,
    };
  }

  @Get('account-status')
  async getAccountStatus(@CurrentUser() user: JwtUser) {
    return this.stripeService.getAccountStatus(user.id);
  }

  @Post('create-payment')
  async createPayment(
    @CurrentUser() user: JwtUser,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentService.createPayment({
      userId: user.id,
      profileId: dto.profileId,
      amount: dto.amount,
      description: dto.description,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  @Post('confirm')
  async confirmPayment(
    @CurrentUser() user: JwtUser,
    @Body('paymentIntentId') paymentIntentId: string,
  ) {
    return this.paymentService.confirmPayment(paymentIntentId, user.id);
  }

  @Get('history')
  async getHistory(
    @CurrentUser() user: JwtUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.walletService.getHistory(
      user.id,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  @Post('withdraw')
  async withdraw(
    @CurrentUser() user: JwtUser,
    @Body() dto: WithdrawDto,
  ) {
    const idempotencyKey = `withdraw_${user.id}_${randomUUID()}`;
    return this.paymentService.createPayout(
      user.id,
      dto.amount,
      idempotencyKey,
    );
  }

  @Get('wallet')
  async getWallet(@CurrentUser() user: JwtUser) {
    return this.walletService.getBalance(user.id);
  }
}
