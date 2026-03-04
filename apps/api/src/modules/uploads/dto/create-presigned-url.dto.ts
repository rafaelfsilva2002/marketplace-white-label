import { IsString, IsOptional, Matches, IsNotEmpty } from 'class-validator';

export class CreatePresignedUrlDto {
  @IsString()
  @IsNotEmpty({ message: 'fileName is required' })
  fileName!: string;

  @IsString()
  @Matches(/^image\//, { message: 'contentType must start with image/' })
  contentType!: string;

  @IsOptional()
  @IsString()
  folder?: string = 'profiles';
}
