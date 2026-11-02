import { BadRequestException } from '@nestjs/common';
import { PaymentStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  const transaction = {
    transaction: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
  };
  const prisma = {
    transaction: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    customer: { findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn(
      async (operation: ((tx: typeof transaction) => Promise<unknown>) | Promise<unknown>[]) =>
        Array.isArray(operation)
          ? Promise.all(operation)
          : operation(transaction),
    ),
  };
  let service: ReportsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.transaction.findMany.mockResolvedValue([]);
    prisma.auditLog.findMany.mockResolvedValue([]);
    transaction.transaction.findMany.mockResolvedValue([]);
    transaction.auditLog.findMany.mockResolvedValue([]);
    prisma.customer.findMany.mockResolvedValue([]);
    prisma.customer.count.mockResolvedValue(0);
    service = new ReportsService(prisma as never);
  });

  it('includes a debt in a historical balance when it was reversed later', async () => {
    transaction.transaction.findMany.mockResolvedValue([
      {
        id: 'debt-id',
        customerId: 'customer-id',
        type: TransactionType.MONEY_LOAN,
        totalAmount: new Prisma.Decimal('100.00'),
        status: TransactionStatus.REVERSED,
        occurredAt: new Date('2026-01-01T10:00:00Z'),
        allocations: [],
      },
    ]);
    transaction.auditLog.findMany.mockResolvedValue([
      {
        entityId: 'debt-id',
        entityType: 'TRANSACTION',
        createdAt: new Date('2026-01-20T10:00:00Z'),
      },
    ]);

    await expect(
      service.summary({ asOf: '2026-01-10T12:00:00Z' }),
    ).resolves.toMatchObject({
      moneyLoan: '100.00',
      storeItems: '0.00',
      combined: '100.00',
    });
    await expect(
      service.summary({ asOf: '2026-01-21T12:00:00Z' }),
    ).resolves.toMatchObject({
      moneyLoan: '0.00',
      combined: '0.00',
    });
  });

  it('restores a balance only after a payment reversal takes effect', async () => {
    transaction.transaction.findMany.mockResolvedValue([
      {
        id: 'debt-id',
        customerId: 'customer-id',
        type: TransactionType.STORE_ITEMS,
        totalAmount: new Prisma.Decimal('100.00'),
        status: TransactionStatus.ACTIVE,
        occurredAt: new Date('2026-01-01T10:00:00Z'),
        allocations: [
          {
            allocatedAmount: new Prisma.Decimal('30.00'),
            payment: {
              id: 'payment-id',
              status: PaymentStatus.REVERSED,
              paidAt: new Date('2026-01-05T10:00:00Z'),
            },
          },
        ],
      },
    ]);
    transaction.auditLog.findMany.mockResolvedValue([
      {
        entityId: 'payment-id',
        entityType: 'PAYMENT',
        createdAt: new Date('2026-01-20T10:00:00Z'),
      },
    ]);

    await expect(
      service.summary({ asOf: '2026-01-10T12:00:00Z' }),
    ).resolves.toMatchObject({ storeItems: '70.00' });
    await expect(
      service.summary({ asOf: '2026-01-21T12:00:00Z' }),
    ).resolves.toMatchObject({ storeItems: '100.00' });
  });

  it('uses the requested IANA time zone for daily boundaries and activity', async () => {
    transaction.transaction.findMany.mockResolvedValue([
      {
        id: 'debt-id',
        customerId: 'customer-id',
        type: TransactionType.MONEY_LOAN,
        totalAmount: new Prisma.Decimal('25.00'),
        status: TransactionStatus.REVERSED,
        occurredAt: new Date('2026-01-01T16:30:00Z'),
        allocations: [],
      },
    ]);
    transaction.auditLog.findMany.mockResolvedValue([
      {
        entityId: 'debt-id',
        entityType: 'TRANSACTION',
        createdAt: new Date('2026-01-01T17:00:00Z'),
      },
    ]);

    const report = await service.daily({
      from: '2026-01-01',
      to: '2026-01-02',
      timeZone: 'Asia/Manila',
    });

    expect(report.data).toMatchObject([
      { period: '2026-01-01', debtAdded: { moneyLoan: '0.00' } },
      { period: '2026-01-02', debtAdded: { moneyLoan: '25.00' }, outstanding: { moneyLoan: '0.00' } },
    ]);
  });

  it('rejects invalid time zones before querying the database', async () => {
    await expect(
      service.daily({
        from: '2026-01-01',
        to: '2026-01-01',
        timeZone: 'Not/A_Timezone',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.transaction.findMany).not.toHaveBeenCalled();
  });
});
