import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function toJsonObject(value: unknown): Prisma.InputJsonObject {
  const serialized = JSON.stringify(value);
  if (!serialized) {
    throw new TypeError('The operation returned a value that cannot be stored as JSON.');
  }

  const parsed: unknown = JSON.parse(serialized);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('An idempotent operation must return a JSON object.');
  }

  return parsed as Prisma.InputJsonObject;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async execute<T>(
    userId: string,
    key: string | undefined,
    method: string,
    path: string,
    request: unknown,
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!key?.trim() || key.length > 255) {
      throw new BadRequestException('A valid Idempotency-Key header is required.');
    }

    const requestHash = createHash('sha256')
      .update(stableStringify({ method, path, request }))
      .digest('hex');
    const trimmedKey = key.trim();

    let operationStarted = false;
    try {
      return await this.prisma.$transaction(
        async (transaction) => {
          const existing = await transaction.idempotencyRecord.findUnique({
            where: { userId_key: { userId, key: trimmedKey } },
          });

          if (existing && existing.expiresAt > new Date()) {
            return this.readStoredResult<T>(existing, requestHash, method, path);
          }
          if (existing) {
            await transaction.idempotencyRecord.delete({ where: { id: existing.id } });
          }

          const record = await transaction.idempotencyRecord.create({
            data: {
              userId,
              key: trimmedKey,
              method,
              path,
              requestHash,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
          });
          operationStarted = true;
          const result = await operation(transaction);

          await transaction.idempotencyRecord.update({
            where: { id: record.id },
            data: {
              responseStatus: 201,
              responseBody: toJsonObject(result),
            },
          });

          return result;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2034')
      ) {
        const existing = await this.prisma.idempotencyRecord.findUnique({
          where: { userId_key: { userId, key: trimmedKey } },
        });

        if (error.code === 'P2002' && operationStarted) {
          throw error;
        }
        if (existing && existing.expiresAt > new Date()) {
          return this.readStoredResult<T>(existing, requestHash, method, path);
        }

        throw new ServiceUnavailableException(
          'The request could not be safely completed. Please retry with the same key.',
        );
      }

      throw error;
    }
  }

  private readStoredResult<T>(
    record: {
      requestHash: string;
      method: string;
      path: string;
      responseStatus: number | null;
      responseBody: Prisma.JsonValue | null;
    },
    requestHash: string,
    method: string,
    path: string,
  ): T {
    if (record.requestHash !== requestHash || record.method !== method || record.path !== path) {
      throw new ConflictException('This Idempotency-Key was already used for a different request.');
    }
    if (record.responseStatus !== 201 || record.responseBody === null) {
      throw new ServiceUnavailableException(
        'The original request is still being processed. Please retry with the same key.',
      );
    }

    return record.responseBody as T;
  }
}
