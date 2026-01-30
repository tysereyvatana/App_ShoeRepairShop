import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { moneyIntSchema, paginationSchema, toSkipTake } from "../lib/validation.js";

const lineSchema = z.object({
  itemId: z.string().min(1),
  qty: z.coerce.number().int().min(1),
  unitCost: moneyIntSchema,
});

const purchaseCreateSchema = z.object({
  supplierId: z.string().min(1),
  invoiceNo: z.string().optional().nullable(),
  purchasedAt: z.coerce.date().optional(),
  discount: moneyIntSchema.optional().default(0),
  lines: z.array(lineSchema).min(1),
});

const purchaseUpdateSchema = purchaseCreateSchema.partial().extend({
  lines: z.array(lineSchema).optional(),
});

function calcTotals(lines: Array<{ qty: number; unitCost: number }>, discount: number) {
  const subTotal = lines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const discountClamped = Math.min(Math.max(0, discount), subTotal);
  const total = subTotal - discountClamped;
  return { subTotal, total, discount: discountClamped };
}

export const purchaseRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/purchases?q=&page=&pageSize=
  app.get("/purchases", { preHandler: [app.authenticate] }, async (request) => {
    const { q, page, pageSize } = paginationSchema.parse(request.query);
    const { skip, take } = toSkipTake(page, pageSize);

    const where: any = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { invoiceNo: { contains: q, mode: "insensitive" as const } },
              { supplier: { name: { contains: q, mode: "insensitive" as const } } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      app.prisma.purchase.count({ where }),
      app.prisma.purchase.findMany({
        where,
        orderBy: { purchasedAt: "desc" },
        skip,
        take,
        include: {
          supplier: true,
          lines: { include: { item: true } },
        },
      }),
    ]);

    return { data, page, pageSize, total };
  });

  // GET /api/purchases/:id
  app.get("/purchases/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const purchase = await app.prisma.purchase.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        supplier: true,
        lines: { include: { item: true } },
      },
    });
    if (!purchase) throw (app as any).httpErrors.notFound("Purchase not found");
    return purchase;
  });

  // POST /api/purchases (ADMIN)
  app.post(
    "/purchases",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"]) ] },
    async (request, reply) => {
      const body = purchaseCreateSchema.parse(request.body);
      const purchasedAt = body.purchasedAt ?? new Date();
      const totals = calcTotals(body.lines, body.discount);
      const createdByUserId = (request.user as any)?.sub ?? null;

      const purchase = await app.prisma.$transaction(async (tx) => {
        const p = await tx.purchase.create({
          data: {
            supplierId: body.supplierId,
            invoiceNo: body.invoiceNo ?? null,
            purchasedAt,
            discount: totals.discount.toString(),
            subTotal: totals.subTotal.toString(),
            total: totals.total.toString(),
            createdByUserId,
            status: "DRAFT",
            lines: {
              create: body.lines.map((l) => ({
                itemId: l.itemId,
                qty: l.qty,
                unitCost: l.unitCost.toString(),
                lineTotal: (l.qty * l.unitCost).toString(),
              })),
            },
          },
          include: { supplier: true, lines: { include: { item: true } } },
        });
        return p;
      });

      return reply.code(201).send(purchase);
    }
  );

  // PUT /api/purchases/:id (ADMIN)
  app.put(
    "/purchases/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"]) ] },
    async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = purchaseUpdateSchema.parse(request.body);

      const updated = await app.prisma.$transaction(async (tx) => {
        const current = await tx.purchase.findFirst({
          where: { id: params.id, deletedAt: null },
          include: { lines: true },
        });
        if (!current) throw (app as any).httpErrors.notFound("Purchase not found");
        if (current.status !== "DRAFT") throw (app as any).httpErrors.badRequest("Only DRAFT can be edited");

        let lines = current.lines.map((l) => ({ qty: l.qty, unitCost: Number(l.unitCost) }));
        let discount = body.discount !== undefined ? body.discount : Number(current.discount);

        if (body.lines) {
          await tx.purchaseLine.deleteMany({ where: { purchaseId: params.id } });
          await tx.purchaseLine.createMany({
            data: body.lines.map((l) => ({
              purchaseId: params.id,
              itemId: l.itemId,
              qty: l.qty,
              unitCost: l.unitCost.toString(),
              lineTotal: (l.qty * l.unitCost).toString(),
            })),
          });
          lines = body.lines.map((l) => ({ qty: l.qty, unitCost: l.unitCost }));
        }

        const totals = calcTotals(lines, discount);

        return tx.purchase.update({
          where: { id: params.id },
          data: {
            ...(body.supplierId !== undefined ? { supplierId: body.supplierId } : {}),
            ...(body.invoiceNo !== undefined ? { invoiceNo: body.invoiceNo } : {}),
            ...(body.purchasedAt !== undefined ? { purchasedAt: body.purchasedAt } : {}),
            discount: totals.discount.toString(),
            subTotal: totals.subTotal.toString(),
            total: totals.total.toString(),
          },
          include: { supplier: true, lines: { include: { item: true } } },
        });
      });

      return updated;
    }
  );

  // POST /api/purchases/:id/receive (ADMIN)
  app.post(
    "/purchases/:id/receive",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"]) ] },
    async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const userId = (request.user as any)?.sub ?? null;

      const purchase = await app.prisma.$transaction(async (tx) => {
        const p = await tx.purchase.findFirst({
          where: { id: params.id, deletedAt: null },
          include: { lines: true },
        });
        if (!p) throw (app as any).httpErrors.notFound("Purchase not found");
        if (p.status !== "DRAFT") throw (app as any).httpErrors.badRequest("Only DRAFT can be received");

        // Create stock movements
        await tx.stockMovement.createMany({
          data: p.lines.map((l) => ({
            itemId: l.itemId,
            type: "IN",
            qty: l.qty,
            unitCost: l.unitCost,
            refType: "Purchase",
            refId: p.id,
            note: p.invoiceNo ?? null,
            createdByUserId: userId,
          })),
        });

        return tx.purchase.update({
          where: { id: p.id },
          data: { status: "RECEIVED", receivedAt: new Date() },
          include: { supplier: true, lines: { include: { item: true } } },
        });
      });

      return purchase;
    }
  );

  // DELETE /api/purchases/:id (ADMIN)
  app.delete(
    "/purchases/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      await app.prisma.purchase.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
      return reply.code(204).send();
    }
  );
};
