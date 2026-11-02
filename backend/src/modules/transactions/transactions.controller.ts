import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/authenticated-user.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateTransactionDto } from './dto/create-transaction.dto.js';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';
import { TransactionsService } from './transactions.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('customers/:customerId/transactions')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateTransactionDto,
  ) {
    return this.transactionsService.create(user.id, customerId, idempotencyKey, dto);
  }

  @Get('customers/:customerId/transactions')
  list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactionsService.list(customerId, query);
  }

  @Get('transactions/:transactionId')
  getById(@Param('transactionId', ParseUUIDPipe) transactionId: string) {
    return this.transactionsService.getById(transactionId);
  }

  @Post('transactions/:transactionId/void')
  voidTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactionsService.voidTransaction(user.id, transactionId);
  }

  @Post('transactions/:transactionId/reverse')
  reverseTransaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('transactionId', ParseUUIDPipe) transactionId: string,
  ) {
    return this.transactionsService.reverseTransaction(user.id, transactionId);
  }
}
