import { IsIn, IsString } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsIn(['ethereum', 'polygon', 'solana'])
  chain!: 'ethereum' | 'polygon' | 'solana';
}
