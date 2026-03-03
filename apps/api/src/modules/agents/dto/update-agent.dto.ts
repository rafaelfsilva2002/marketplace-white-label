import {
  IsString,
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
import { AgentConfigDto } from './create-agent.dto';

export class UpdateAgentDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsIn(['active', 'paused', 'disabled'])
  status?: 'active' | 'paused' | 'disabled';

  @IsOptional()
  @IsObject()
  @Type(() => AgentConfigDto)
  config?: AgentConfigDto;
}
