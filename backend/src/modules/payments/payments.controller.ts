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
import { CreatePaymentDto } from './dto/create-payment.dto.js';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto.js';
import { PaymentsService } from './payments.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('customers/:customerId/payments')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePaymentDto,
  ) {
    return this.paymentsService.create(user.id, customerId, idempotencyKey, dto);
  }

  @Get('customers/:customerId/payments')
  list(
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query() query: ListPaymentsQueryDto,
  ) {
    return this.paymentsService.list(customerId, query);
  }

  @Get('payments/:paymentId')
  getById(@Param('paymentId', ParseUUIDPipe) paymentId: string) {
    return this.paymentsService.getById(paymentId);
  }

  @Post('payments/:paymentId/void')
  voidPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentsService.voidPayment(user.id, paymentId);
  }

  @Post('payments/:paymentId/reverse')
  reversePayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('paymentId', ParseUUIDPipe) paymentId: string,
  ) {
    return this.paymentsService.reversePayment(user.id, paymentId);
  }
}
