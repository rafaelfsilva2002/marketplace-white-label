import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { StructuredLogger } from '@/common/logger/structured.logger';
import { getCorrelationId } from '@/common/interceptors/correlation-id.interceptor';
import { AmlComplianceService } from '../services/aml-compliance.service';

@Injectable()
export class AmlCheckGuard implements CanActivate {
  private readonly logger: StructuredLogger;

  constructor(
    private readonly amlComplianceService: AmlComplianceService,
  ) {
    this.logger = new StructuredLogger('AmlCheckGuard');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const correlationId = getCorrelationId();

    const isPaymentEndpoint = this.isPaymentEndpoint(request);
    if (!isPaymentEndpoint) {
      return true;
    }

    const body = request.body;
    const user = request.user;

    if (!body || !user) {
      return true;
    }

    const { walletId, to, amount, token } = body;

    if (!walletId || !to || !amount) {
      return true;
    }

    const chain = body.chain ?? 'ethereum';

    const result = await this.amlComplianceService.screenTransaction({
      userId: user.id,
      amount: String(amount),
      chain,
      toAddress: to,
      token: token ?? chain,
    });

    if (!result.approved) {
      this.logger.logWithData(
        'warn',
        'Transaction blocked by AML compliance',
        {
          userId: user.id,
          toAddress: to,
          amount,
          chain,
          riskLevel: result.riskLevel,
          reasons: result.reasons,
          correlationId,
        },
        'AmlCheckGuard',
      );

      throw new ForbiddenException({
        message: 'Transaction blocked by compliance check',
        riskLevel: result.riskLevel,
        reasons: result.reasons,
      });
    }

    if (result.requiresManualReview) {
      this.logger.logWithData(
        'warn',
        'Transaction flagged for manual review',
        {
          userId: user.id,
          toAddress: to,
          amount,
          chain,
          riskLevel: result.riskLevel,
          reasons: result.reasons,
          correlationId,
        },
        'AmlCheckGuard',
      );
    }

    request.amlScreeningResult = result;

    return true;
  }

  private isPaymentEndpoint(request: { method: string; url: string }): boolean {
    return (
      request.method === 'POST' &&
      request.url.includes('/crypto/payments')
    );
  }
}
