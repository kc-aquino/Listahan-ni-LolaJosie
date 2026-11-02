import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AuditLogsModule,
    CustomersModule,
    TransactionsModule,
    PaymentsModule,
    ReportsModule,
    HealthModule,
  ],
})
export class AppModule {}
