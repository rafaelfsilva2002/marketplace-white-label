import { IsEnum } from 'class-validator';

export enum PlanType {
  Free = 'free',
  Basic = 'basic',
  Professional = 'professional',
  Premium = 'premium',
}

export class CreateSubscriptionDto {
  @IsEnum(PlanType, {
    message: 'planType must be one of: free, basic, professional, premium',
  })
  planType: PlanType;
}
