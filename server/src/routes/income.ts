import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { moneyPosIntSchema, paginationSchema, toSkipTake } from "../lib/validation.js";

const otherIncomeSchema = z.object({
  title: z.string().min(1),
  amount: moneyPosIntSchema,
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional().default("CASH"),
  receivedAt: z.coerce.date().optional(),
  note: z.string().optional().nullable(),
});

const expenseSchema = z.object({
  title: z.string().min(1),
  amount: moneyPosIntSchema,
  paidAt: z.coerce.date().optional(),
  note: z.string().optional().nullable(),
});

export const incomeRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/payments
  app.get("/payments", { preHandler: [app.authenticate] }, async (request) => {
    const { q, page, pageSize } = paginationSchema.parse(request.query);
    const { skip, take } = toSkipTake(page, pageSize);

    const where: any = {
      ...(q
        ? {
            OR: [
              { note: { contains: q, mode: "insensitive" as const } },
              { serviceOrder: { code: { contains: q, mode: "insensitive" as const } } },
              { serviceOrder: { customer: { name: { contains: q, mode: "insensitive" as const } } } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      app.prisma.payment.count({ where }),
      app.prisma.payment.findMany({
        where,
        orderBy: { paidAt: "desc" },
        skip,
        take,
        include: { serviceOrder: { include: { customer: true } } },
      }),
    ]);

    return { data, page, pageSize, total };
  });

  // Other income CRUD
  app.get("/other-income", { preHandler: [app.authenticate] }, async (request) => {
    const { q, page, pageSize } = paginationSchema.parse(request.query);
    const { skip, take } = toSkipTake(page, pageSize);

    const where: any = {
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    };

    const [total, data] = await Promise.all([
      app.prisma.otherIncome.count({ where }),
      app.prisma.otherIncome.findMany({ where, orderBy: { receivedAt: "desc" }, skip, take }),
    ]);

    return { data, page, pageSize, total };
  });

  app.post("/other-income", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = otherIncomeSchema.parse(request.body);
    const userId = (request.user as any)?.sub ?? null;
    const row = await app.prisma.otherIncome.create({
      data: {
        title: body.title,
        amount: body.amount.toString(),
        method: body.method,
        receivedAt: body.receivedAt ?? new Date(),
        note: body.note ?? null,
        receivedByUserId: userId,
      },
    });
    return reply.code(201).send(row);
  });

  app.put("/other-income/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = otherIncomeSchema.partial().parse(request.body);
    return app.prisma.otherIncome.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.amount !== undefined ? { amount: body.amount.toString() } : {}),
        ...(body.method !== undefined ? { method: body.method } : {}),
        ...(body.receivedAt !== undefined ? { receivedAt: body.receivedAt } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      },
    });
  });

  app.delete("/other-income/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    await app.prisma.otherIncome.delete({ where: { id: params.id } });
    return reply.code(204).send();
  });

  // Expenses CRUD
  app.get("/expenses", { preHandler: [app.authenticate] }, async (request) => {
    const { q, page, pageSize } = paginationSchema.parse(request.query);
    const { skip, take } = toSkipTake(page, pageSize);
    const where: any = {
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    };
    const [total, data] = await Promise.all([
      app.prisma.expense.count({ where }),
      app.prisma.expense.findMany({ where, orderBy: { paidAt: "desc" }, skip, take }),
    ]);
    return { data, page, pageSize, total };
  });

  app.post("/expenses", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = expenseSchema.parse(request.body);
    const userId = (request.user as any)?.sub ?? null;
    const row = await app.prisma.expense.create({
      data: {
        title: body.title,
        amount: body.amount.toString(),
        paidAt: body.paidAt ?? new Date(),
        note: body.note ?? null,
        paidByUserId: userId,
      },
    });
    return reply.code(201).send(row);
  });

  app.put("/expenses/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = expenseSchema.partial().parse(request.body);
    return app.prisma.expense.update({
      where: { id: params.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.amount !== undefined ? { amount: body.amount.toString() } : {}),
        ...(body.paidAt !== undefined ? { paidAt: body.paidAt } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
      },
    });
  });

  app.delete("/expenses/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    await app.prisma.expense.delete({ where: { id: params.id } });
    return reply.code(204).send();
  });
};
