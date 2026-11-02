import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomersService } from './customers.service.js';

describe('CustomersService', () => {
  const prisma = {
    customer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  };
  const auditLogs = {
    write: vi.fn(),
  };
  let service: CustomersService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new CustomersService(prisma as never, auditLogs as never);
  });

  it('calculates independent category balances using decimal arithmetic', async () => {
    prisma.customer.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      transactions: [
        {
          type: 'MONEY_LOAN',
          totalAmount: new Prisma.Decimal('500.00'),
          allocations: [{ allocatedAmount: new Prisma.Decimal('125.25') }],
        },
        {
          type: 'STORE_ITEMS',
          totalAmount: new Prisma.Decimal('350.00'),
          allocations: [
            { allocatedAmount: new Prisma.Decimal('50.00') },
            { allocatedAmount: new Prisma.Decimal('25.50') },
          ],
        },
      ],
    });

    await expect(service.getBalances('00000000-0000-4000-8000-000000000001')).resolves.toMatchObject({
      moneyLoan: '374.75',
      storeItems: '274.50',
      combined: '649.25',
    });
    expect(prisma.customer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          transactions: expect.objectContaining({
            where: { status: 'ACTIVE' },
            select: expect.objectContaining({
              allocations: { where: { payment: { status: 'POSTED' } }, select: { allocatedAmount: true } },
            }),
          }),
        }),
      }),
    );
  });

  it('returns not found when the customer does not exist', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);

    await expect(service.getById('00000000-0000-4000-8000-000000000001')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects empty updates instead of recording a no-op audit entry', async () => {
    await expect(
      service.update('00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', {}),
    ).rejects.toThrow('At least one customer field must be provided.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    { action: 'archive', archivedAt: expect.any(Date), auditAction: 'CUSTOMER_ARCHIVED' },
    { action: 'restore', archivedAt: null, auditAction: 'CUSTOMER_RESTORED' },
  ])('audits customer $action', async ({ action, archivedAt, auditAction }) => {
    const current = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Customer',
      contactNumber: null,
      notes: null,
      archivedAt: null,
      createdAt: new Date('2025-01-01T00:00:00.000Z'),
      updatedAt: new Date('2025-01-01T00:00:00.000Z'),
    };
    const updated = { ...current, archivedAt };
    const transaction = {
      customer: {
        findUnique: vi.fn().mockResolvedValue(current),
        update: vi.fn().mockResolvedValue(updated),
      },
    };
    prisma.$transaction.mockImplementation(async (callback) => callback(transaction as never));

    await expect(
      service[action]('00000000-0000-4000-8000-000000000002', current.id),
    ).resolves.toEqual(updated);
    expect(transaction.customer.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt } }),
    );
    expect(auditLogs.write).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        action: auditAction,
        entityType: 'CUSTOMER',
        entityId: current.id,
        oldValues: current,
        newValues: updated,
      }),
    );
  });
});
