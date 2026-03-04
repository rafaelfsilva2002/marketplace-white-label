import { IsString, IsIn } from 'class-validator';

export class WithdrawCryptoDto {
  @IsString()
  toAddress!: string;

  @IsString()
  amount!: string;

  @IsIn(['ETH', 'MATIC', 'SOL', 'USDT', 'USDC'])
  token!: 'ETH' | 'MATIC' | 'SOL' | 'USDT' | 'USDC';

  @IsIn(['ethereum', 'polygon', 'solana'])
  chain!: 'ethereum' | 'polygon' | 'solana';
}
