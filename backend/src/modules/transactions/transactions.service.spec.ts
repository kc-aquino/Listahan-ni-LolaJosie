import { BadRequestException, ConflictException } from '@nestjs/common';
import { TransactionEntryMode, TransactionType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsService } from './transactions.service.js';

describe('TransactionsService', () => {
  const transaction = {
    customer: { findUnique: vi.fn() },
    transaction: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
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
  let service: TransactionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    transaction.customer.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      archivedAt: null,
    });
    transaction.transaction.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'transaction-id', ...data, items: data.items?.create ?? [] }),
    );
    service = new TransactionsService(prisma as never, auditLogs as never, idempotency as never);
  });

  it('calculates itemized totals using decimal half-up rounding', async () => {
    await service.create(
      'owner-id',
      '00000000-0000-4000-8000-000000000001',
      'request-1',
      {
        type: TransactionType.STORE_ITEMS,
        entryMode: TransactionEntryMode.ITEMIZED,
        items: [
          { itemName: 'Rice', quantity: '1.005', unitPrice: '1.00' },
          { itemName: 'Coffee', quantity: '2', unitPrice: '3.50' },
        ],
      },
    );

    const [{ data }] = transaction.transaction.create.mock.calls[0] as [{ data: {
      totalAmount: { toFixed: (digits: number) => string };
      items: { create: { subtotal: { toFixed: (digits: number) => string }[] } };
    } }];
    expect(data.totalAmount.toFixed(2)).toBe('8.01');
    expect(data.items.create.map((item) => item.subtotal.toFixed(2))).toEqual(['1.01', '7.00']);
    expect(auditLogs.write).toHaveBeenCalledOnce();
  });

  it('rejects zero-quantity items without creating a debt', async () => {
    await expect(
      service.create('owner-id', 'customer-id', 'request-2', {
        type: TransactionType.STORE_ITEMS,
        entryMode: TransactionEntryMode.ITEMIZED,
        items: [{ itemName: 'Rice', quantity: '0', unitPrice: '10.00' }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction.transaction.create).not.toHaveBeenCalled();
  });

  it('rejects debts for archived customers', async () => {
    transaction.customer.findUnique.mockResolvedValue({
      id: 'customer-id',
      archivedAt: new Date(),
    });

    await expect(
      service.create('owner-id', 'customer-id', 'request-3', {
        type: TransactionType.MONEY_LOAN,
        totalAmount: '100.00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.transaction.create).not.toHaveBeenCalled();
  });

  it('reverses an active debt without posted payment allocations', async () => {
    transaction.transaction.findUnique.mockResolvedValue({
      id: 'transaction-id',
      status: 'ACTIVE',
      allocations: [],
    });
    transaction.transaction.update.mockResolvedValue({
      id: 'transaction-id',
      status: 'REVERSED',
      items: [],
    });
    prisma.$transaction = vi.fn(async (operation: (tx: never) => Promise<unknown>) =>
      operation(transaction as never),
    );

    await expect(service.reverseTransaction('owner-id', 'transaction-id')).resolves.toMatchObject({
      status: 'REVERSED',
    });
    expect(transaction.transaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'REVERSED' } }),
    );
    expect(auditLogs.write).toHaveBeenCalledOnce();
  });

  it('does not reverse debt while posted payment allocations remain', async () => {
    transaction.transaction.findUnique.mockResolvedValue({
      id: 'transaction-id',
      status: 'ACTIVE',
      allocations: [{ id: 'allocation-id' }],
    });
    prisma.$transaction = vi.fn(async (operation: (tx: never) => Promise<unknown>) =>
      operation(transaction as never),
    );

    await expect(
      service.reverseTransaction('owner-id', 'transaction-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.transaction.update).not.toHaveBeenCalled();
  });
});
