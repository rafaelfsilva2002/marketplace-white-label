import { IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1, { message: 'Message content must not be empty' })
  @MaxLength(5000, { message: 'Message content must be at most 5000 characters' })
  content!: string;

  @IsOptional()
  @IsEnum(['text', 'image', 'system'], {
    message: 'Type must be one of: text, image, system',
  })
  type?: 'text' | 'image' | 'system';
}
