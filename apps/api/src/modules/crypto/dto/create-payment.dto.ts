import { IsString, IsIn, IsUUID } from 'class-validator';

export class CreateCryptoPaymentDto {
  @IsUUID()
  profileId!: string;

  @IsString()
  amount!: string;

  @IsIn(['ETH', 'MATIC', 'SOL', 'USDT', 'USDC'])
  token!: 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';

  @IsIn(['ethereum', 'polygon', 'solana'])
  chain!: 'ethereum' | 'polygon' | 'solana';

  @IsString()
  idempotencyKey!: string;
}
