import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DailyReportQueryDto } from './dto/daily-report-query.dto.js';
import { MonthlyReportQueryDto } from './dto/monthly-report-query.dto.js';
import { ReportAsOfQueryDto } from './dto/report-as-of-query.dto.js';
import { ReportCustomersQueryDto } from './dto/report-customers-query.dto.js';
import { ReportsService } from './reports.service.js';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  summary(@Query() query: ReportAsOfQueryDto) {
    return this.reportsService.summary(query);
  }

  @Get('customers')
  customers(@Query() query: ReportCustomersQueryDto) {
    return this.reportsService.customers(query);
  }

  @Get('daily')
  daily(@Query() query: DailyReportQueryDto) {
    return this.reportsService.daily(query);
  }

  @Get('monthly')
  monthly(@Query() query: MonthlyReportQueryDto) {
    return this.reportsService.monthly(query);
  }
}
