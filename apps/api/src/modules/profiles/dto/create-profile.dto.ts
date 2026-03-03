import {
  IsString,
  IsOptional,
  IsArray,
  IsBoolean,
  IsNumber,
  ValidateNested,
  MinLength,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class PriceRangeDto {
  @IsNumber()
  min: number;

  @IsNumber()
  max: number;
}

export class CreateProfileDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  displayName: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PriceRangeDto)
  priceRange?: PriceRangeDto;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photos?: string[];
}
