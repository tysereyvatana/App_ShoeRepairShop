import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { paginationSchema, toSkipTake } from "../lib/validation.js";

const customerSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const customerRoutes: FastifyPluginAsync = async (app) => {
  app.get("/customers/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const customer = await app.prisma.customer.findFirst({
      where: { id: params.id, deletedAt: null },
    });
    if (!customer) return reply.code(404).send({ message: "Customer not found" });
    return customer;
  });

  // Customer history + summary (Phase 2)
  app.get("/customers/:id/overview", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const q = z
      .object({
        limit: z.coerce.number().min(5).max(200).optional().default(50),
      })
      .parse(request.query);

    const customer = await app.prisma.customer.findFirst({
      where: { id: params.id, deletedAt: null },
    });

    if (!customer) return reply.code(404).send({ message: "Customer not found" });

    const orders = await app.prisma.serviceOrder.findMany({
      where: { customerId: params.id, deletedAt: null },
      orderBy: { receivedAt: "desc" },
      take: q.limit,
      include: {
        payments: { select: { amount: true, paidAt: true, id: true, method: true, note: true } },
      },
    });

    const allCount = await app.prisma.serviceOrder.count({
      where: { customerId: params.id, deletedAt: null },
    });

    let totalSpent = 0;
    let totalPaid = 0;
    let outstanding = 0;
    let lastVisit: (lastVisit as Date | null)?.toISOString() ?? null,

    const orderRows = orders.map((o) => {
      const total = Number(o.total);
      const paid = (o.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
      const balance = total - paid;

      if (o.status !== "CANCELLED") totalSpent += total;
      totalPaid += paid;
      if (balance > 0) outstanding += balance;
      if (!lastVisit || o.receivedAt > lastVisit) lastVisit = o.receivedAt;

      return {
        id: o.id,
        code: o.code,
        status: o.status,
        paymentStatus: o.paymentStatus,
        receivedAt: o.receivedAt,
        promisedAt: o.promisedAt,
        total: o.total.toString(),
        paid: paid.toString(),
        balance: balance.toString(),
      };
    });

    const repeatCustomer = allCount >= 2;

    return {
      customer,
      stats: {
        tickets: allCount,
        totalSpent: totalSpent.toString(),
        totalPaid: totalPaid.toString(),
        outstanding: outstanding.toString(),
        lastVisit: lastVisit?.toISOString() ?? null,
        repeatCustomer,
      },
      recentOrders: orderRows,
    };
  });

  app.get("/customers", { preHandler: [app.authenticate] }, async (request) => {
    const { q, page, pageSize } = paginationSchema.parse(request.query);
    const { skip, take } = toSkipTake(page, pageSize);

    const where = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q, mode: "insensitive" as const } },
              { code: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      app.prisma.customer.count({ where }),
      app.prisma.customer.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    return { data, page, pageSize, total };
  });

  app.post("/customers", { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"]) ] }, async (request, reply) => {
    const body = customerSchema.parse(request.body);
    const customer = await app.prisma.customer.create({ data: body });
    return reply.code(201).send(customer);
  });

  app.put("/customers/:id", { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"]) ] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = customerSchema.partial().parse(request.body);

    return app.prisma.customer.update({ where: { id: params.id }, data: body });
  });

  app.delete("/customers/:id", { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    await app.prisma.customer.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return reply.code(204).send();
  });
};
