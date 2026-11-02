import { IsDateString, IsOptional, Matches } from 'class-validator';

export class ReportAsOfQueryDto {
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/)
  asOf?: string;
}
