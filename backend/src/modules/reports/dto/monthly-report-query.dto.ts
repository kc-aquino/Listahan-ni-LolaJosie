import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class MonthlyReportQueryDto {
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  from!: string;

  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone = 'Asia/Manila';
}
