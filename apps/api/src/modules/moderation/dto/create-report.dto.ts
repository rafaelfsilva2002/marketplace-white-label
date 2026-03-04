import { IsString, IsUUID, IsOptional, IsIn } from 'class-validator';

export class CreateReportDto {
  @IsIn(['profile', 'review', 'photo'])
  entityType: string;

  @IsUUID()
  entityId: string;

  @IsString()
  reason: string;

  @IsString()
  @IsOptional()
  description?: string;
}
