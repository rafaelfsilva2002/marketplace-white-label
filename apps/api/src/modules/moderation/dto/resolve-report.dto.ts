import { IsString, IsIn } from 'class-validator';

export class ResolveReportDto {
  @IsIn(['resolved', 'dismissed'])
  status: string;

  @IsString()
  resolution: string;
}
