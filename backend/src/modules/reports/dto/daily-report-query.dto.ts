import { IsDateString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class DailyReportQueryDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone = 'Asia/Manila';
}
