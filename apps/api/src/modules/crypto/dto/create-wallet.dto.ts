import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class CreateWalletDto {
  @IsString()
  @IsNotEmpty()
  @IsIn(['ethereum', 'polygon', 'solana'], {
    message: 'Chain must be one of: ethereum, polygon, solana',
  })
  chain: 'ethereum' | 'polygon' | 'solana';
}
