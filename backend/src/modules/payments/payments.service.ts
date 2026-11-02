import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentStatus, Prisma, TransactionStatus } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { IdempotencyService } from '../idempotency/idempotency.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreatePaymentDto } from './dto/create-payment.dto.js';
import type { ListPaymentsQueryDto } from './dto/list-payments-query.dto.js';

const MAX_MONEY_AMOUNT = new Prisma.Decimal('9999999999999999.99');

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  create(
    userId: string,
    customerId: string,
    idempotencyKey: string | undefined,
    dto: CreatePaymentDto,
  ) {
    const path = `/customers/${customerId}/payments`;

    return this.idempotency.execute(
      userId,
      idempotencyKey,
      'POST',
      path,
      dto,
      (transaction) => this.createWithinTransaction(transaction, userId, customerId, dto),
    );
  }

  async list(customerId: string, query: ListPaymentsQueryDto) {
    await this.ensureCustomer(customerId);
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('"from" must be earlier than or equal to "to".');
    }

    const where: Prisma.PaymentWhereInput = {
      customerId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            paidAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: {
          allocations: { include: { transaction: { select: { type: true } } } },
        },
        orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async getById(paymentId: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        allocations: { include: { transaction: { select: { type: true } } } },
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment was not found.');
    }

    return payment;
  }

  voidPayment(userId: string, paymentId: string) {
    return this.updateStatus(userId, paymentId, PaymentStatus.VOIDED);
  }

  reversePayment(userId: string, paymentId: string) {
    return this.updateStatus(userId, paymentId, PaymentStatus.REVERSED);
  }

  private async createWithinTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    customerId: string,
    dto: CreatePaymentDto,
  ) {
    const customer = await transaction.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }

    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.greaterThan(0) || amount.greaterThan(MAX_MONEY_AMOUNT)) {
      throw new BadRequestException('Payment amount is outside the supported range.');
    }

    const ids = dto.allocations.map(({ transactionId }) => transactionId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('A payment cannot allocate to the same debt more than once.');
    }

    const requestedTotal = dto.allocations.reduce(
      (sum, allocation) => sum.plus(new Prisma.Decimal(allocation.allocatedAmount)),
      new Prisma.Decimal(0),
    );
    if (!requestedTotal.equals(amount)) {
      throw new BadRequestException('Allocation amounts must add up exactly to the payment amount.');
    }

    const debts = await transaction.transaction.findMany({
      where: {
        id: { in: ids },
        customerId,
        status: TransactionStatus.ACTIVE,
      },
      select: {
        id: true,
        totalAmount: true,
        allocations: {
          where: { payment: { status: PaymentStatus.POSTED } },
          select: { allocatedAmount: true },
        },
      },
    });
    if (debts.length !== ids.length) {
      throw new BadRequestException(
        'Each allocation must reference an active debt belonging to this customer.',
      );
    }

    const debtById = new Map(debts.map((debt) => [debt.id, debt]));
    for (const allocation of dto.allocations) {
      const allocatedAmount = new Prisma.Decimal(allocation.allocatedAmount);
      if (!allocatedAmount.greaterThan(0)) {
        throw new BadRequestException('Each allocated amount must be greater than zero.');
      }

      const debt = debtById.get(allocation.transactionId);
      if (!debt) {
        throw new BadRequestException('Each allocation must reference an active debt.');
      }
      const alreadyAllocated = debt.allocations.reduce(
        (sum, existing) => sum.plus(existing.allocatedAmount),
        new Prisma.Decimal(0),
      );
      const outstanding = debt.totalAmount.minus(alreadyAllocated);
      if (allocatedAmount.greaterThan(outstanding)) {
        throw new BadRequestException('An allocation cannot exceed its debt’s outstanding balance.');
      }
    }

    const payment = await transaction.payment.create({
      data: {
        customerId,
        userId,
        amount,
        paymentMethod: dto.paymentMethod?.trim() || null,
        notes: dto.notes?.trim() || null,
        paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        allocations: {
          create: dto.allocations.map(({ transactionId, allocatedAmount }) => ({
            transactionId,
            allocatedAmount: new Prisma.Decimal(allocatedAmount),
          })),
        },
      },
      include: {
        allocations: { include: { transaction: { select: { type: true } } } },
      },
    });

    await this.auditLogs.write(transaction, {
      userId,
      action: 'PAYMENT_CREATED',
      entityType: 'PAYMENT',
      entityId: payment.id,
      newValues: payment,
    });

    return payment;
  }

  private async ensureCustomer(customerId: string) {
    const exists = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Customer was not found.');
    }
  }

  private async updateStatus(
    userId: string,
    paymentId: string,
    status: typeof PaymentStatus.VOIDED | typeof PaymentStatus.REVERSED,
  ) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await transaction.payment.findUnique({
            where: { id: paymentId },
            include: { allocations: true },
          });
          if (!current) {
            throw new NotFoundException('Payment was not found.');
          }
          if (current.status !== PaymentStatus.POSTED) {
            throw new ConflictException('Only posted payments can be voided or reversed.');
          }

          const updated = await transaction.payment.update({
            where: { id: paymentId },
            data: { status },
            include: { allocations: true },
          });
          await this.auditLogs.write(transaction, {
            userId,
            action: status === PaymentStatus.VOIDED ? 'PAYMENT_VOIDED' : 'PAYMENT_REVERSED',
            entityType: 'PAYMENT',
            entityId: updated.id,
            oldValues: current,
            newValues: updated,
          });
          return updated;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        throw new ServiceUnavailableException(
          'The record changed during the request. Please retry.',
        );
      }
      throw error;
    }
  }
}
