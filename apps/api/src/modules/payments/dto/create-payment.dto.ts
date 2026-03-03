import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsInt()
  @Min(1, { message: 'Amount must be at least 1 cent' })
  amount: number;

  @IsUUID()
  @IsNotEmpty()
  profileId: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
