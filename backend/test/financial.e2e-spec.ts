import { randomUUID } from 'node:crypto';
import { ValidationPipe } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Financial workflows (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let accessToken: string;
  let ownerId: string;
  let customerId: string | undefined;
  const idempotencyKeys: string[] = [];

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);

    const username = process.env.OWNER_USERNAME;
    const password = process.env.OWNER_PASSWORD;
    if (!username || !password) {
      throw new Error('Configure OWNER_USERNAME and OWNER_PASSWORD in backend/.env before running e2e tests.');
    }

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username, password })
      .expect(201);
    accessToken = login.body.accessToken as string;
    ownerId = login.body.user.id as string;
  });

  afterAll(async () => {
    if (customerId) {
      await prisma.$transaction(async (transaction) => {
        const [debts, payments] = await Promise.all([
          transaction.transaction.findMany({
            where: { customerId },
            select: { id: true },
          }),
          transaction.payment.findMany({
            where: { customerId },
            select: { id: true },
          }),
        ]);
        const debtIds = debts.map(({ id }) => id);
        const paymentIds = payments.map(({ id }) => id);

        await transaction.paymentAllocation.deleteMany({
          where: { paymentId: { in: paymentIds } },
        });
        await transaction.transactionItem.deleteMany({
          where: { transactionId: { in: debtIds } },
        });
        await transaction.auditLog.deleteMany({
          where: { entityId: { in: [customerId!, ...debtIds, ...paymentIds] } },
        });
        await transaction.idempotencyRecord.deleteMany({
          where: { userId: ownerId, key: { in: idempotencyKeys } },
        });
        await transaction.payment.deleteMany({
          where: { id: { in: paymentIds } },
        });
        await transaction.transaction.deleteMany({
          where: { id: { in: debtIds } },
        });
        await transaction.customer.deleteMany({
          where: { id: customerId },
        });
      });
    }

    await app?.close();
  });

  it(
    'records debt, accepts archived-customer payments, allocates payments, and reconciles reversals',
    async () => {
      const authorization = `Bearer ${accessToken}`;
      const customer = await request(app.getHttpServer())
        .post('/api/customers')
        .set('Authorization', authorization)
        .send({ name: `E2E ledger ${randomUUID()}` })
        .expect(201);
      customerId = customer.body.id as string;

      const moneyKey = randomUUID();
      idempotencyKeys.push(moneyKey);
      const moneyDebtRequest = {
        type: 'MONEY_LOAN',
        totalAmount: '500.00',
        description: 'Temporary e2e debt',
      };
      const moneyDebt = await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/transactions`)
        .set('Authorization', authorization)
        .set('Idempotency-Key', moneyKey)
        .send(moneyDebtRequest)
        .expect(201);
      const replayedMoneyDebt = await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/transactions`)
        .set('Authorization', authorization)
        .set('Idempotency-Key', moneyKey)
        .send(moneyDebtRequest)
        .expect(201);
      expect(replayedMoneyDebt.body.id).toBe(moneyDebt.body.id);

      const goodsKey = randomUUID();
      idempotencyKeys.push(goodsKey);
      const goodsDebt = await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/transactions`)
        .set('Authorization', authorization)
        .set('Idempotency-Key', goodsKey)
        .send({
          type: 'STORE_ITEMS',
          entryMode: 'ITEMIZED',
          items: [
            { itemName: 'E2E rice', quantity: '2', unitPrice: '150.00' },
          ],
          description: 'Temporary itemized e2e debt',
        })
        .expect(201);
      expect(goodsDebt.body.totalAmount).toBe('300');

      await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/archive`)
        .set('Authorization', authorization)
        .expect(201);

      const archivedDebtKey = randomUUID();
      idempotencyKeys.push(archivedDebtKey);
      await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/transactions`)
        .set('Authorization', authorization)
        .set('Idempotency-Key', archivedDebtKey)
        .send({ type: 'MONEY_LOAN', totalAmount: '10.00' })
        .expect(409);

      const archivedPaymentKey = randomUUID();
      idempotencyKeys.push(archivedPaymentKey);
      const archivedCustomerPayment = await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/payments`)
        .set('Authorization', authorization)
        .set('Idempotency-Key', archivedPaymentKey)
        .send({
          amount: '50.00',
          allocations: [
            { transactionId: goodsDebt.body.id, allocatedAmount: '50.00' },
          ],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/restore`)
        .set('Authorization', authorization)
        .expect(201);

      const splitPaymentKey = randomUUID();
      idempotencyKeys.push(splitPaymentKey);
      const splitPayment = await request(app.getHttpServer())
        .post(`/api/customers/${customerId}/payments`)
        .set('Authorization', authorization)
        .set('Idempotency-Key', splitPaymentKey)
        .send({
          amount: '150.00',
          allocations: [
            { transactionId: moneyDebt.body.id, allocatedAmount: '100.00' },
            { transactionId: goodsDebt.body.id, allocatedAmount: '50.00' },
          ],
        })
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/customers/${customerId}/balances`)
        .set('Authorization', authorization)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            moneyLoan: '400.00',
            storeItems: '200.00',
            combined: '600.00',
          }),
        );

      await request(app.getHttpServer())
        .post(`/api/transactions/${moneyDebt.body.id}/reverse`)
        .set('Authorization', authorization)
        .expect(409);

      await request(app.getHttpServer())
        .post(`/api/payments/${splitPayment.body.id}/reverse`)
        .set('Authorization', authorization)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/payments/${archivedCustomerPayment.body.id}/void`)
        .set('Authorization', authorization)
        .expect(201);

      await request(app.getHttpServer())
        .post(`/api/transactions/${moneyDebt.body.id}/reverse`)
        .set('Authorization', authorization)
        .expect(201);
      await request(app.getHttpServer())
        .post(`/api/transactions/${goodsDebt.body.id}/reverse`)
        .set('Authorization', authorization)
        .expect(201);

      await request(app.getHttpServer())
        .get(`/api/customers/${customerId}/transactions`)
        .set('Authorization', authorization)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toHaveLength(2);
          expect(body.data.map((entry: { status: string }) => entry.status)).toEqual([
            'REVERSED',
            'REVERSED',
          ]);
        });
      await request(app.getHttpServer())
        .get(`/api/customers/${customerId}/payments`)
        .set('Authorization', authorization)
        .expect(200)
        .expect(({ body }) => {
          expect(body.data).toHaveLength(2);
          expect(body.data.map((payment: { status: string }) => payment.status).sort()).toEqual([
            'REVERSED',
            'VOIDED',
          ]);
        });
      await request(app.getHttpServer())
        .get(`/api/customers/${customerId}/balances`)
        .set('Authorization', authorization)
        .expect(200)
        .expect(({ body }) =>
          expect(body).toMatchObject({
            moneyLoan: '0.00',
            storeItems: '0.00',
            combined: '0.00',
          }),
        );
    },
    30_000,
  );
});
