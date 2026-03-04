import { IsBoolean } from 'class-validator';

export class VerifyUserDto {
  @IsBoolean()
  verified!: boolean;
}
