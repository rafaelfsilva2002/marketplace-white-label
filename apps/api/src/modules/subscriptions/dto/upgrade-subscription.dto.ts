import { IsEnum } from 'class-validator';
import { PlanType } from './create-subscription.dto';

export class UpgradeSubscriptionDto {
  @IsEnum(PlanType, {
    message: 'planId must be one of: free, basic, professional, premium',
  })
  planId: PlanType;
}
