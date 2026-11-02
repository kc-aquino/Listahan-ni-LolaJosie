import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type AuditEntry = {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Prisma.InputJsonValue;
  newValues?: Prisma.InputJsonValue;
};

@Injectable()
export class AuditLogsService {
  write(transaction: Prisma.TransactionClient, entry: AuditEntry) {
    return transaction.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        ...(entry.oldValues === undefined ? {} : { oldValues: entry.oldValues }),
        ...(entry.newValues === undefined ? {} : { newValues: entry.newValues }),
      },
    });
  }
}
