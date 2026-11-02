import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from './payments.service.js';

describe('PaymentsService', () => {
  const transaction = {
    customer: { findUnique: vi.fn() },
    transaction: { findMany: vi.fn() },
    payment: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  const prisma = {};
  const auditLogs = { write: vi.fn() };
  const idempotency = {
    execute: vi.fn(
      async (
        _userId: string,
        _key: string | undefined,
        _method: string,
        _path: string,
        _request: unknown,
        operation: (tx: never) => Promise<unknown>,
      ) => operation(transaction as never),
    ),
  };
  let service: PaymentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    transaction.customer.findUnique.mockResolvedValue({ id: 'customer-id' });
    transaction.transaction.findMany.mockResolvedValue([
      {
        id: 'debt-1',
        totalAmount: new Prisma.Decimal('120.00'),
        allocations: [{ allocatedAmount: new Prisma.Decimal('20.00') }],
      },
      {
        id: 'debt-2',
        totalAmount: new Prisma.Decimal('100.00'),
        allocations: [],
      },
    ]);
    transaction.payment.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'payment-id', ...data, allocations: data.allocations.create }),
    );
    service = new PaymentsService(prisma as never, auditLogs as never, idempotency as never);
  });

  it('creates an explicitly split payment and audits it atomically', async () => {
    await service.create('owner-id', 'customer-id', 'payment-key', {
      amount: '150.00',
      paymentMethod: ' cash ',
      allocations: [
        { transactionId: 'debt-1', allocatedAmount: '100.00' },
        { transactionId: 'debt-2', allocatedAmount: '50.00' },
      ],
    });

    expect(transaction.customer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'customer-id' } }),
    );
    expect(transaction.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: new Prisma.Decimal('150.00'),
          paymentMethod: 'cash',
          allocations: {
            create: [
              { transactionId: 'debt-1', allocatedAmount: new Prisma.Decimal('100.00') },
              { transactionId: 'debt-2', allocatedAmount: new Prisma.Decimal('50.00') },
            ],
          },
        }),
        include: {
          allocations: { include: { transaction: { select: { type: true } } } },
        },
      }),
    );
    expect(auditLogs.write).toHaveBeenCalledOnce();
  });

  it('rejects allocations whose sum does not exactly match the payment', async () => {
    await expect(
      service.create('owner-id', 'customer-id', 'payment-key', {
        amount: '150.00',
        allocations: [{ transactionId: 'debt-1', allocatedAmount: '149.99' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.transaction.findMany).not.toHaveBeenCalled();
    expect(transaction.payment.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate debt allocation lines', async () => {
    await expect(
      service.create('owner-id', 'customer-id', 'payment-key', {
        amount: '20.00',
        allocations: [
          { transactionId: 'debt-1', allocatedAmount: '10.00' },
          { transactionId: 'debt-1', allocatedAmount: '10.00' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.payment.create).not.toHaveBeenCalled();
  });

  it('rejects an allocation above the outstanding debt', async () => {
    await expect(
      service.create('owner-id', 'customer-id', 'payment-key', {
        amount: '101.00',
        allocations: [{ transactionId: 'debt-1', allocatedAmount: '101.00' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.payment.create).not.toHaveBeenCalled();
  });

  it('allows archived customers to settle existing active debts', async () => {
    transaction.transaction.findMany.mockResolvedValueOnce([
      {
        id: 'debt-1',
        totalAmount: new Prisma.Decimal('120.00'),
        allocations: [{ allocatedAmount: new Prisma.Decimal('20.00') }],
      },
    ]);

    await service.create('owner-id', 'archived-customer-id', 'payment-key', {
      amount: '10.00',
      allocations: [{ transactionId: 'debt-1', allocatedAmount: '10.00' }],
    });

    expect(transaction.payment.create).toHaveBeenCalledOnce();
  });

  it('reverses a posted payment and writes an audit entry', async () => {
    transaction.payment.findUnique.mockResolvedValue({
      id: 'payment-id',
      status: 'POSTED',
      allocations: [{ id: 'allocation-id' }],
    });
    transaction.payment.update.mockResolvedValue({
      id: 'payment-id',
      status: 'REVERSED',
      allocations: [{ id: 'allocation-id' }],
    });
    prisma.$transaction = vi.fn(async (operation: (tx: never) => Promise<unknown>) =>
      operation(transaction as never),
    );

    await expect(service.reversePayment('owner-id', 'payment-id')).resolves.toMatchObject({
      status: 'REVERSED',
    });
    expect(transaction.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REVERSED' } }),
    );
    expect(auditLogs.write).toHaveBeenCalledOnce();
  });
});
