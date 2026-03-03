import { IsInt, Min } from 'class-validator';

export class WithdrawDto {
  @IsInt()
  @Min(1, { message: 'Withdrawal amount must be at least 1 cent' })
  amount: number;
}
