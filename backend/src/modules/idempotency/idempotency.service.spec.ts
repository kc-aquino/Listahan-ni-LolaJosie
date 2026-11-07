import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IdempotencyService } from './idempotency.service.js';

describe('IdempotencyService', () => {
  const idempotencyRecord = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const transaction = { idempotencyRecord };
  const prisma = {
    $transaction: vi.fn(
      async (operation: (tx: typeof transaction) => Promise<unknown>) => operation(transaction),
    ),
    idempotencyRecord,
  };
  let service: IdempotencyService;

  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyRecord.findUnique.mockResolvedValue(null);
    idempotencyRecord.create.mockResolvedValue({ id: 'record-id' });
    idempotencyRecord.update.mockResolvedValue({});
    idempotencyRecord.delete.mockResolvedValue({});
    service = new IdempotencyService(prisma as never);
  });

  it('stores the successful response in the same transaction as the operation', async () => {
    const result = { id: 'transaction-id', amount: new Prisma.Decimal('25.50') };
    const operation = vi.fn().mockResolvedValue(result);

    await expect(
      service.execute('owner-id', 'key-1', 'POST', '/transactions', { amount: '25.50' }, operation),
    ).resolves.toBe(result);
    expect(operation).toHaveBeenCalledOnce();
    expect(idempotencyRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          responseStatus: 201,
          responseBody: { id: 'transaction-id', amount: '25.5' },
        }),
      }),
    );
  });

  it('replays a matching response without repeating the operation', async () => {
    const request = { amount: '25.50' };
    const operation = vi.fn().mockResolvedValue({ id: 'transaction-id' });
    await service.execute('owner-id', 'key-1', 'POST', '/transactions', request, operation);
    const createdRecord = idempotencyRecord.create.mock.calls[0][0].data;
    const savedResponse = idempotencyRecord.update.mock.calls[0][0].data;
    const replayOperation = vi.fn();
    idempotencyRecord.findUnique.mockResolvedValue({
      ...createdRecord,
      ...savedResponse,
      id: 'record-id',
    });

    await expect(
      service.execute('owner-id', 'key-1', 'POST', '/transactions', request, replayOperation),
    ).resolves.toEqual({ id: 'transaction-id' });
    expect(replayOperation).not.toHaveBeenCalled();
  });

  it('rejects reuse of a key for a different payload', async () => {
    idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: 'different-request-hash',
      method: 'POST',
      path: '/transactions',
      responseStatus: 201,
      responseBody: { id: 'transaction-id' },
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      service.execute(
        'owner-id',
        'key-1',
        'POST',
        '/transactions',
        { amount: '26.00' },
        vi.fn(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('replays a completed offline write even after the old 24-hour expiry', async () => {
    const operation = vi.fn().mockResolvedValue({ id: 'saved-debt' });
    const request = { amount: '40.00' };
    await service.execute('owner-id', 'offline-key', 'POST', '/transactions', request, operation);
    idempotencyRecord.findUnique.mockResolvedValue({
      ...idempotencyRecord.create.mock.calls[0][0].data,
      ...idempotencyRecord.update.mock.calls[0][0].data,
      expiresAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });
    const retry = vi.fn();
    await expect(service.execute('owner-id', 'offline-key', 'POST', '/transactions', request, retry)).resolves.toEqual({ id: 'saved-debt' });
    expect(retry).not.toHaveBeenCalled();
    expect(idempotencyRecord.delete).not.toHaveBeenCalled();
  });

  it('requires a valid idempotency key', async () => {
    await expect(
      service.execute('owner-id', ' ', 'POST', '/transactions', {}, vi.fn()),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
