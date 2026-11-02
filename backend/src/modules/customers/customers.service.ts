import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { ListCustomersQueryDto } from './dto/list-customers-query.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';

const customerSelect = {
  id: true,
  name: true,
  contactNumber: true,
  notes: true,
  archivedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CustomerSelect;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
  ) {}

  async list(query: ListCustomersQueryDto) {
    const search = query.q?.trim();
    const where: Prisma.CustomerWhereInput = {
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { contactNumber: { contains: search } },
            ],
          }
        : {}),
    };
    const skip = (query.page - 1) * query.pageSize;

    const [customers, totalItems] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: customerSelect,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);

    return {
      data: customers,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async create(userId: string, dto: CreateCustomerDto) {
    return this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.customer.create({
        data: {
          name: dto.name.trim(),
          contactNumber: dto.contactNumber?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
        select: customerSelect,
      });

      await this.auditLogs.write(transaction, {
        userId,
        action: 'CUSTOMER_CREATED',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        newValues: customer,
      });

      return customer;
    });
  }

  async getById(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: customerSelect,
    });

    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }

    return customer;
  }

  async update(userId: string, customerId: string, dto: UpdateCustomerDto) {
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException('At least one customer field must be provided.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.customer.findUnique({
        where: { id: customerId },
        select: customerSelect,
      });

      if (!current) {
        throw new NotFoundException('Customer was not found.');
      }

      const customer = await transaction.customer.update({
        where: { id: customerId },
        data: {
          ...(dto.name === undefined ? {} : { name: dto.name.trim() }),
          ...(dto.contactNumber === undefined
            ? {}
            : { contactNumber: dto.contactNumber?.trim() || null }),
          ...(dto.notes === undefined ? {} : { notes: dto.notes?.trim() || null }),
        },
        select: customerSelect,
      });

      await this.auditLogs.write(transaction, {
        userId,
        action: 'CUSTOMER_UPDATED',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        oldValues: current,
        newValues: customer,
      });

      return customer;
    });
  }

  async archive(userId: string, customerId: string) {
    return this.setArchived(userId, customerId, true);
  }

  async restore(userId: string, customerId: string) {
    return this.setArchived(userId, customerId, false);
  }

  async getBalances(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        transactions: {
          where: { status: 'ACTIVE' },
          select: {
            type: true,
            totalAmount: true,
            allocations: {
              where: { payment: { status: 'POSTED' } },
              select: { allocatedAmount: true },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer was not found.');
    }

    let moneyLoan = new Prisma.Decimal(0);
    let storeItems = new Prisma.Decimal(0);

    for (const debt of customer.transactions) {
      const allocated = debt.allocations.reduce(
        (sum, allocation) => sum.plus(allocation.allocatedAmount),
        new Prisma.Decimal(0),
      );
      const outstanding = debt.totalAmount.minus(allocated);

      if (debt.type === 'MONEY_LOAN') {
        moneyLoan = moneyLoan.plus(outstanding);
      } else {
        storeItems = storeItems.plus(outstanding);
      }
    }

    return {
      customerId: customer.id,
      moneyLoan: moneyLoan.toFixed(2),
      storeItems: storeItems.toFixed(2),
      combined: moneyLoan.plus(storeItems).toFixed(2),
      asOf: new Date().toISOString(),
    };
  }

  private async setArchived(userId: string, customerId: string, archived: boolean) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.customer.findUnique({
        where: { id: customerId },
        select: customerSelect,
      });

      if (!current) {
        throw new NotFoundException('Customer was not found.');
      }

      const customer = await transaction.customer.update({
        where: { id: customerId },
        data: { archivedAt: archived ? new Date() : null },
        select: customerSelect,
      });

      await this.auditLogs.write(transaction, {
        userId,
        action: archived ? 'CUSTOMER_ARCHIVED' : 'CUSTOMER_RESTORED',
        entityType: 'CUSTOMER',
        entityId: customer.id,
        oldValues: current,
        newValues: customer,
      });

      return customer;
    });
  }
}
