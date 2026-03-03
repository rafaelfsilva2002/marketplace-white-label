import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export class SendPaymentDto {
  @IsUUID()
  @IsNotEmpty()
  walletId: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'Amount must be a valid numeric string',
  })
  amount: string;

  @IsString()
  @IsOptional()
  token?: string;

  @IsString()
  @IsNotEmpty()
  idempotencyKey: string;
}
