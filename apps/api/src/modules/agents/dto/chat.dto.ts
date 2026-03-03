import { IsString, IsNotEmpty, IsOptional, IsObject, MaxLength } from 'class-validator';

export class ChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  message!: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
