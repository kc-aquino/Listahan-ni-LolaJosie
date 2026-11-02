import { BadRequestException, Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, TransactionStatus, TransactionType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DailyReportQueryDto } from './dto/daily-report-query.dto.js';
import type { MonthlyReportQueryDto } from './dto/monthly-report-query.dto.js';
import type { ReportAsOfQueryDto } from './dto/report-as-of-query.dto.js';
import type { ReportCustomersQueryDto } from './dto/report-customers-query.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAILY_PERIOD_DAYS = 90;
const MAX_MONTHLY_PERIODS = 24;
const terminalActions = [
  'TRANSACTION_VOIDED',
  'TRANSACTION_REVERSED',
  'PAYMENT_VOIDED',
  'PAYMENT_REVERSED',
];

type CategoryTotals = {
  moneyLoan: Prisma.Decimal;
  storeItems: Prisma.Decimal;
};

type LedgerAllocation = {
  allocatedAmount: Prisma.Decimal;
  payment: {
    id: string;
    status: PaymentStatus;
    paidAt: Date;
  };
};

type LedgerTransaction = {
  id: string;
  customerId: string;
  type: TransactionType;
  totalAmount: Prisma.Decimal;
  status: TransactionStatus;
  occurredAt: Date;
  allocations: LedgerAllocation[];
};

type LedgerSnapshot = {
  transactions: LedgerTransaction[];
  terminalAt: Map<string, Date>;
};

type ReportPeriod = {
  period: string;
  start: Date;
  endExclusive: Date;
};

function emptyTotals(): CategoryTotals {
  return {
    moneyLoan: new Prisma.Decimal(0),
    storeItems: new Prisma.Decimal(0),
  };
}

function addAmount(totals: CategoryTotals, type: TransactionType, amount: Prisma.Decimal) {
  if (type === TransactionType.MONEY_LOAN) {
    totals.moneyLoan = totals.moneyLoan.plus(amount);
  } else {
    totals.storeItems = totals.storeItems.plus(amount);
  }
}

function formatTotals(totals: CategoryTotals) {
  return {
    moneyLoan: totals.moneyLoan.toFixed(2),
    storeItems: totals.storeItems.toFixed(2),
    combined: totals.moneyLoan.plus(totals.storeItems).toFixed(2),
  };
}

function wasActiveAt(
  currentStatus: TransactionStatus | PaymentStatus,
  activeStatus: typeof TransactionStatus.ACTIVE | typeof PaymentStatus.POSTED,
  terminalAt: Date | undefined,
  cutoffExclusive: Date,
) {
  return (
    currentStatus === activeStatus ||
    (terminalAt !== undefined && terminalAt.getTime() >= cutoffExclusive.getTime())
  );
}

function assertTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
  } catch (error) {
    if (error instanceof RangeError) {
      throw new BadRequestException('timeZone must be a valid IANA time zone.');
    }
    throw error;
  }
}

function parseCalendarDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Report dates must be valid calendar dates.');
  }
  return parsed;
}

function localMidnightToUtc(date: string, timeZone: string) {
  const targetUtc = parseCalendarDate(date).getTime();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const offsetAt = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const representedAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    return representedAsUtc - instant;
  };
  let result = targetUtc - offsetAt(targetUtc);
  result = targetUtc - offsetAt(result);
  return new Date(result);
}

function dailyPeriods(from: string, to: string, timeZone: string): ReportPeriod[] {
  const first = parseCalendarDate(from);
  const last = parseCalendarDate(to);
  const days = Math.floor((last.getTime() - first.getTime()) / DAY_MS) + 1;
  if (days < 1) {
    throw new BadRequestException('"from" must be earlier than or equal to "to".');
  }
  if (days > MAX_DAILY_PERIOD_DAYS) {
    throw new BadRequestException(`Daily reports are limited to ${MAX_DAILY_PERIOD_DAYS} days.`);
  }

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(first.getTime() + index * DAY_MS).toISOString().slice(0, 10);
    const nextDay = new Date(first.getTime() + (index + 1) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    return {
      period: day,
      start: localMidnightToUtc(day, timeZone),
      endExclusive: localMidnightToUtc(nextDay, timeZone),
    };
  });
}

function monthlyPeriods(from: string, to: string, timeZone: string): ReportPeriod[] {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  const firstIndex = fromYear * 12 + fromMonth - 1;
  const lastIndex = toYear * 12 + toMonth - 1;
  const count = lastIndex - firstIndex + 1;
  if (count < 1) {
    throw new BadRequestException('"from" must be earlier than or equal to "to".');
  }
  if (count > MAX_MONTHLY_PERIODS) {
    throw new BadRequestException(`Monthly reports are limited to ${MAX_MONTHLY_PERIODS} months.`);
  }

  return Array.from({ length: count }, (_, index) => {
    const absoluteMonth = firstIndex + index;
    const year = Math.floor(absoluteMonth / 12);
    const month = (absoluteMonth % 12) + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const period = `${year}-${String(month).padStart(2, '0')}`;
    const startDate = `${period}-01`;
    const nextDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    return {
      period,
      start: localMidnightToUtc(startDate, timeZone),
      endExclusive: localMidnightToUtc(nextDate, timeZone),
    };
  });
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: ReportAsOfQueryDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const cutoffExclusive = new Date(asOf.getTime() + 1);
    const snapshot = await this.loadLedger(cutoffExclusive);
    return {
      asOf: asOf.toISOString(),
      ...formatTotals(this.outstandingAt(snapshot, cutoffExclusive)),
    };
  }

  async customers(query: ReportCustomersQueryDto) {
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const cutoffExclusive = new Date(asOf.getTime() + 1);
    const search = query.q?.trim();
    const where: Prisma.CustomerWhereInput = {
      archivedAt: null,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { contactNumber: { contains: search } },
            ],
          }
        : {}),
    };
    const [customers, totalItems] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        select: { id: true, name: true, contactNumber: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.customer.count({ where }),
    ]);
    const snapshot = await this.loadLedger(
      cutoffExclusive,
      customers.map(({ id }) => id),
    );
    const balancesByCustomer = this.outstandingByCustomer(snapshot, cutoffExclusive);

    return {
      asOf: asOf.toISOString(),
      data: customers.map((customer) => ({
        ...customer,
        ...formatTotals(balancesByCustomer.get(customer.id) ?? emptyTotals()),
      })),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / query.pageSize),
      },
    };
  }

  async daily(query: DailyReportQueryDto) {
    assertTimeZone(query.timeZone);
    return this.periodReport(
      dailyPeriods(query.from, query.to, query.timeZone),
      query.timeZone,
      false,
    );
  }

  async monthly(query: MonthlyReportQueryDto) {
    assertTimeZone(query.timeZone);
    return this.periodReport(
      monthlyPeriods(query.from, query.to, query.timeZone),
      query.timeZone,
      true,
    );
  }

  private async periodReport(
    periods: ReportPeriod[],
    timeZone: string,
    monthly: boolean,
  ) {
    assertTimeZone(timeZone);
    const lastPeriod = periods[periods.length - 1];
    if (!lastPeriod) {
      throw new BadRequestException('The report period is empty.');
    }
    const snapshot = await this.loadLedger(lastPeriod.endExclusive);
    const data = periods.map((period) => {
      const debtAdded = emptyTotals();
      const paymentsReceived = emptyTotals();

      for (const debt of snapshot.transactions) {
        if (debt.occurredAt >= period.start && debt.occurredAt < period.endExclusive) {
          addAmount(debtAdded, debt.type, debt.totalAmount);
        }
        for (const allocation of debt.allocations) {
          if (
            allocation.payment.paidAt >= period.start &&
            allocation.payment.paidAt < period.endExclusive
          ) {
            addAmount(paymentsReceived, debt.type, allocation.allocatedAmount);
          }
        }
      }

      return {
        period: period.period,
        debtAdded: formatTotals(debtAdded),
        paymentsReceived: formatTotals(paymentsReceived),
        outstanding: formatTotals(this.outstandingAt(snapshot, period.endExclusive)),
      };
    });

    return {
      from: periods[0]?.period,
      to: periods[periods.length - 1]?.period,
      timeZone,
      measures: {
        debtAdded: 'Gross debt records created during the period.',
        paymentsReceived: 'Gross posted allocations recorded during the period.',
        outstanding: 'Active debt balance as of the period end.',
      },
      granularity: monthly ? 'month' : 'day',
      data,
    };
  }

  private async loadLedger(cutoffExclusive: Date, customerIds?: string[]) {
    return this.prisma.$transaction(
      async (transaction) => {
        const transactions = (await transaction.transaction.findMany({
          where: {
            occurredAt: { lt: cutoffExclusive },
            ...(customerIds === undefined ? {} : { customerId: { in: customerIds } }),
          },
          select: {
            id: true,
            customerId: true,
            type: true,
            totalAmount: true,
            status: true,
            occurredAt: true,
            allocations: {
              select: {
                allocatedAmount: true,
                payment: {
                  select: { id: true, status: true, paidAt: true },
                },
              },
            },
          },
        })) as LedgerTransaction[];

        if (transactions.length === 0) {
          return { transactions, terminalAt: new Map<string, Date>() };
        }
        const entityIds = [
          ...new Set([
            ...transactions.map(({ id }) => id),
            ...transactions.flatMap(({ allocations }) =>
              allocations.map(({ payment }) => payment.id),
            ),
          ]),
        ];
        const statusEvents = await transaction.auditLog.findMany({
          where: {
            entityId: { in: entityIds },
            entityType: { in: ['TRANSACTION', 'PAYMENT'] },
            action: { in: terminalActions },
          },
          select: { entityId: true, entityType: true, createdAt: true },
        });
        const terminalAt = new Map<string, Date>();
        for (const event of statusEvents) {
          const eventKey = `${event.entityType}:${event.entityId}`;
          const previous = terminalAt.get(eventKey);
          if (!previous || event.createdAt < previous) {
            terminalAt.set(eventKey, event.createdAt);
          }
        }

        return { transactions, terminalAt };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  private outstandingAt(snapshot: LedgerSnapshot, cutoffExclusive: Date) {
    const totals = emptyTotals();
    for (const debt of snapshot.transactions) {
      if (
        debt.occurredAt >= cutoffExclusive ||
        !wasActiveAt(
          debt.status,
          TransactionStatus.ACTIVE,
          snapshot.terminalAt.get(`TRANSACTION:${debt.id}`),
          cutoffExclusive,
        )
      ) {
        continue;
      }
      let outstanding = debt.totalAmount;
      for (const allocation of debt.allocations) {
        const payment = allocation.payment;
        if (
          payment.paidAt < cutoffExclusive &&
          wasActiveAt(
            payment.status,
            PaymentStatus.POSTED,
            snapshot.terminalAt.get(`PAYMENT:${payment.id}`),
            cutoffExclusive,
          )
        ) {
          outstanding = outstanding.minus(allocation.allocatedAmount);
        }
      }
      addAmount(totals, debt.type, outstanding);
    }
    return totals;
  }

  private outstandingByCustomer(snapshot: LedgerSnapshot, cutoffExclusive: Date) {
    const totals = new Map<string, CategoryTotals>();
    for (const debt of snapshot.transactions) {
      if (
        debt.occurredAt >= cutoffExclusive ||
        !wasActiveAt(
          debt.status,
          TransactionStatus.ACTIVE,
          snapshot.terminalAt.get(`TRANSACTION:${debt.id}`),
          cutoffExclusive,
        )
      ) {
        continue;
      }
      let outstanding = debt.totalAmount;
      for (const allocation of debt.allocations) {
        const payment = allocation.payment;
        if (
          payment.paidAt < cutoffExclusive &&
          wasActiveAt(
            payment.status,
            PaymentStatus.POSTED,
            snapshot.terminalAt.get(`PAYMENT:${payment.id}`),
            cutoffExclusive,
          )
        ) {
          outstanding = outstanding.minus(allocation.allocatedAmount);
        }
      }
      const customerTotals = totals.get(debt.customerId) ?? emptyTotals();
      addAmount(customerTotals, debt.type, outstanding);
      totals.set(debt.customerId, customerTotals);
    }
    return totals;
  }
}
