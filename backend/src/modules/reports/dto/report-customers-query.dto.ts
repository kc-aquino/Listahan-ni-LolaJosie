import { Type } from 'class-transformer';
import { IsOptional, IsString, IsInt, Max, Min } from 'class-validator';
import { ReportAsOfQueryDto } from './report-as-of-query.dto.js';

export class ReportCustomersQueryDto extends ReportAsOfQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;
}
