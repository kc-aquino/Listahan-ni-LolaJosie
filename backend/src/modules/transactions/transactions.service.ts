import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  PaymentStatus,
  Prisma,
  TransactionEntryMode,
  TransactionStatus,
  TransactionType,
} from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { IdempotencyService } from '../idempotency/idempotency.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateTransactionDto } from './dto/create-transaction.dto.js';
import type { ListTransactionsQueryDto } from './dto/list-transactions-query.dto.js';

const MAX_MONEY_AMOUNT = new Prisma.Decimal('9999999999999999.99');

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  create(
    userId: string,
    customerId: string,
    idempotencyKey: string | undefined,
    dto: CreateTransactionDto,
  ) {
    const path = `/customers/${customerId}/transactions`;

    return this.idempotency.execute(
      userId,
      idempotencyKey,
      'POST',
      path,
      dto,
      (transaction) => this.createWithinTransaction(transaction, userId, customerId, dto),
    );
  }

  async list(customerId: string, query: ListTransactionsQueryDto) {
    await this.ensureCustomer(customerId);
    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      throw new BadRequestException('"from" must be earlier than or equal to "to".');
    }
    const where: Prisma.TransactionWhereInput = {
      customerId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [data, totalItems] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        include: {
          items: true,
          allocations: {
            where: { payment: { status: PaymentStatus.POSTED } },
            select: { allocatedAmount: true },
          },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.transaction.count({ where }),
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

  async getById(transactionId: string) {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { items: true, allocations: { include: { payment: true } } },
    });

    if (!transaction) {
      throw new NotFoundException('Debt transaction was not found.');
    }

    return transaction;
  }

  voidTransaction(userId: string, transactionId: string) {
    return this.updateStatus(userId, transactionId, TransactionStatus.VOIDED);
  }

  reverseTransaction(userId: string, transactionId: string) {
    return this.updateStatus(userId, transactionId, TransactionStatus.REVERSED);
  }

  private async createWithinTransaction(
    transaction: Prisma.TransactionClient,
    userId: string,
    customerId: string,
    dto: CreateTransactionDto,
  ) {
    const customer = await transaction.customer.findUnique({
      where: { id: customerId },
      select: { id: true, archivedAt: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }
    if (customer.archivedAt) {
      throw new ConflictException('Restore this customer before adding new debt.');
    }

    const items: Prisma.TransactionItemCreateWithoutTransactionInput[] = [];
    let totalAmount: Prisma.Decimal;
    let entryMode: TransactionEntryMode | null = null;

    if (dto.type === TransactionType.MONEY_LOAN) {
      if (dto.entryMode !== undefined || dto.items !== undefined || !dto.totalAmount) {
        throw new BadRequestException('Money Utang requires one amount and does not accept item details.');
      }
      totalAmount = new Prisma.Decimal(dto.totalAmount);
    } else if (dto.entryMode === TransactionEntryMode.TOTAL_ONLY) {
      if (!dto.totalAmount || dto.items !== undefined) {
        throw new BadRequestException('Total-only store credit requires one total and no item rows.');
      }
      totalAmount = new Prisma.Decimal(dto.totalAmount);
      entryMode = TransactionEntryMode.TOTAL_ONLY;
    } else if (dto.entryMode === TransactionEntryMode.ITEMIZED) {
      if (dto.totalAmount !== undefined || !dto.items?.length) {
        throw new BadRequestException('Itemized store credit requires item rows and no client total.');
      }

      totalAmount = new Prisma.Decimal(0);
      for (const item of dto.items) {
        const quantity = new Prisma.Decimal(item.quantity);
        const unitPrice = new Prisma.Decimal(item.unitPrice);
        if (!quantity.greaterThan(0)) {
          throw new BadRequestException('Item quantity must be greater than zero.');
        }
        const subtotal = quantity
          .mul(unitPrice)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        totalAmount = totalAmount.plus(subtotal);
        items.push({
          itemName: item.itemName.trim(),
          quantity,
          unitPrice,
          subtotal,
        });
      }
      entryMode = TransactionEntryMode.ITEMIZED;
    } else {
      throw new BadRequestException('Store Items Utang requires an entry mode.');
    }

    if (!totalAmount.greaterThan(0)) {
      throw new BadRequestException('Debt amount must be greater than zero.');
    }
    if (totalAmount.greaterThan(MAX_MONEY_AMOUNT)) {
      throw new BadRequestException('Debt amount exceeds the supported maximum.');
    }

    const created = await transaction.transaction.create({
      data: {
        customerId,
        userId,
        type: dto.type,
        entryMode,
        totalAmount,
        description: dto.description?.trim() || null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        ...(items.length > 0 ? { items: { create: items } } : {}),
      },
      include: { items: true },
    });

    await this.auditLogs.write(transaction, {
      userId,
      action: 'DEBT_CREATED',
      entityType: 'TRANSACTION',
      entityId: created.id,
      newValues: created,
    });

    return created;
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
    transactionId: string,
    status: typeof TransactionStatus.VOIDED | typeof TransactionStatus.REVERSED,
  ) {
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const current = await transaction.transaction.findUnique({
            where: { id: transactionId },
            include: {
              allocations: {
                where: { payment: { status: PaymentStatus.POSTED } },
                select: { id: true },
              },
            },
          });
          if (!current) {
            throw new NotFoundException('Debt transaction was not found.');
          }
          if (current.status !== TransactionStatus.ACTIVE) {
            throw new ConflictException('Only active debt transactions can be voided or reversed.');
          }
          if (current.allocations.length > 0) {
            throw new ConflictException(
              'Reverse or void the allocated payments before changing this debt.',
            );
          }

          const updated = await transaction.transaction.update({
            where: { id: transactionId },
            data: { status },
            include: { items: true },
          });
          await this.auditLogs.write(transaction, {
            userId,
            action: status === TransactionStatus.VOIDED ? 'TRANSACTION_VOIDED' : 'TRANSACTION_REVERSED',
            entityType: 'TRANSACTION',
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
