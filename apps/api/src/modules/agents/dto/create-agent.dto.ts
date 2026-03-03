import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsIn,
  IsObject,
  IsNumber,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AgentConfigDto {
  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  maxTokens?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tools?: string[];

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  autonomyLevel?: 'low' | 'medium' | 'high';
}

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @IsIn(['moderator', 'assistant', 'analyst', 'pricing'])
  type!: 'moderator' | 'assistant' | 'analyst' | 'pricing';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  systemPrompt!: string;

  @IsOptional()
  @IsObject()
  @Type(() => AgentConfigDto)
  config?: AgentConfigDto;
}
