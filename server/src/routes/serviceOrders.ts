import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { moneyIntSchema, moneyPosIntSchema, paginationSchema, toSkipTake } from "../lib/validation.js";
import { clampMinorNonNegative, minorToDecimalString, toMinor } from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";

function pad(n: number, len: number) {
  return n.toString().padStart(len, "0");
}

async function generateServiceCode(app: any) {
  const d = new Date();
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1, 2);
  const day = pad(d.getDate(), 2);
  for (let attempt = 0; attempt < 5; attempt++) {
    const rand = pad(Math.floor(Math.random() * 10000), 4);
    const code = `SR-${y}${m}${day}-${rand}`;
    const exists = await app.prisma.serviceOrder.findUnique({ where: { code } });
    if (!exists) return code;
  }
  // fallback
  return `SR-${Date.now()}`;
}

const createSchema = z.object({
  code: z.string().min(3).optional(),
  customerId: z.string().min(1),
  assignedStaffId: z.string().optional().nullable(),

  // Optional VET shipping code (printed on VET label)
  vetCode: z.string().optional().nullable(),
  // Shoe details
  shoeBrand: z.string().optional().nullable(),
  shoeColor: z.string().optional().nullable(),
  shoeSize: z.string().optional().nullable(),
  shoeType: z.string().optional().nullable(),
  pairCount: z.coerce.number().int().min(1).max(10).optional().default(1),
  urgent: z.coerce.boolean().optional().default(false),
  beforePhotoUrl: z.string().url().optional().nullable(),
  afterPhotoUrl: z.string().url().optional().nullable(),

  // Notes
  problemDesc: z.string().optional().nullable(),
  promisedAt: z.coerce.date().optional().nullable(),

  // Optional initial service lines at intake
  lines: z
    .array(
      z.object({
        repairServiceId: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        qty: z.coerce.number().int().min(1).default(1),
        price: moneyIntSchema.nullable().optional(),
      })
    )
    .optional()
    .default([]),

  // Deposit at intake (optional)
  depositAmount: moneyIntSchema.optional().default(0),
  depositMethod: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional().default("CASH"),
  depositNote: z.string().optional().nullable(),
});

const updateSchema = createSchema.partial();

const serviceLineSchema = z.object({
  repairServiceId: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  qty: z.coerce.number().int().min(1).default(1),
  price: moneyIntSchema.nullable().optional(),
});

const partSchema = z.object({
  itemId: z.string().min(1),
  qty: z.coerce.number().int().min(1),
  unitPrice: moneyIntSchema,
});

const statusSchema = z.object({
  status: z.enum(["RECEIVED", "CLEANING", "REPAIRING", "READY", "DELIVERED", "CANCELLED"]),
  note: z.string().optional().nullable(),
});

const paymentSchema = z.object({
  amount: moneyPosIntSchema,
  method: z.enum(["CASH", "CARD", "TRANSFER", "OTHER"]).optional().default("CASH"),
  paidAt: z.coerce.date().optional(),
  note: z.string().optional().nullable(),
});

const refundSchema = z.object({
  amount: moneyPosIntSchema.optional(),
  reason: z.string().min(1),
});

async function recomputeTotals(tx: any, serviceOrderId: string) {
  const [lines, parts, order] = await Promise.all([
    tx.serviceLine.findMany({ where: { serviceOrderId } }),
    tx.servicePart.findMany({ where: { serviceOrderId } }),
    tx.serviceOrder.findUnique({ where: { id: serviceOrderId } }),
  ]);
  if (!order) throw new Error("Service order not found");

  const subTotalMinor =
    lines.reduce((s: number, l: any) => s + toMinor(l.price) * l.qty, 0) +
    parts.reduce((s: number, p: any) => s + toMinor(p.unitPrice) * p.qty, 0);

  const discountMinor = toMinor((order as any).discount);
  const totalMinor = clampMinorNonNegative(subTotalMinor - discountMinor);

  await tx.serviceOrder.update({
    where: { id: serviceOrderId },
    data: {
      subTotal: minorToDecimalString(subTotalMinor),
      total: minorToDecimalString(totalMinor),
    },
  });
}

async function recomputePaymentStatus(tx: any, serviceOrderId: string) {
  const order = await tx.serviceOrder.findUnique({ where: { id: serviceOrderId } });
  if (!order) throw new Error("Service order not found");

  const payments = await tx.payment.findMany({ where: { serviceOrderId } });
  const paidMinor = payments.reduce((s: number, p: any) => s + toMinor(p.amount), 0);
  const totalMinor = toMinor((order as any).total);

  // IMPORTANT (shoe-repair workflow):
  // When a ticket is first created, total may still be 0 because services/materials
  // haven't been added yet. If the customer gives a deposit at intake, we must NOT
  // mark the ticket as PAID while total is 0. We'll treat any positive deposit as PARTIAL.
  let paymentStatus: "UNPAID" | "PARTIAL" | "PAID" = "UNPAID";

  if (totalMinor <= 0) {
    paymentStatus = paidMinor > 0 ? "PARTIAL" : "UNPAID";
  } else if (paidMinor <= 0) {
    paymentStatus = "UNPAID";
  } else if (paidMinor < totalMinor) {
    paymentStatus = "PARTIAL";
  } else {
    paymentStatus = "PAID";
  }

  await tx.serviceOrder.update({ where: { id: serviceOrderId }, data: { paymentStatus } });
}


export const serviceOrderRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/service-orders
  app.get("/service-orders", { preHandler: [app.authenticate] }, async (request) => {
    const { q, page, pageSize } = paginationSchema.parse(request.query);
    const { skip, take } = toSkipTake(page, pageSize);

    const where: any = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" as const } },
              { customer: { name: { contains: q, mode: "insensitive" as const } } },
              { customer: { phone: { contains: q, mode: "insensitive" as const } } },
              { shoeBrand: { contains: q, mode: "insensitive" as const } },
              { shoeType: { contains: q, mode: "insensitive" as const } },
              { problemDesc: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      app.prisma.serviceOrder.count({ where }),
      app.prisma.serviceOrder.findMany({
        where,
        orderBy: { receivedAt: "desc" },
        skip,
        take,
        include: {
          customer: true,
          assignedStaff: true,
        },
      }),
    ]);

    return { data, page, pageSize, total };
  });

  // GET /api/service-orders/:id
  app.get("/service-orders/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const order = await app.prisma.serviceOrder.findFirst({
      where: { id: params.id, deletedAt: null },
      include: {
        customer: true,
        assignedStaff: true,
        lines: { include: { repairService: true } },
        parts: { include: { item: true } },
        history: {
          orderBy: { changedAt: "asc" },
          include: { changedByUser: { select: { id: true, username: true } } },
        },
        payments: {
          orderBy: { paidAt: "desc" },
          include: { receivedBy: { select: { id: true, username: true } } },
        },
      },
    });
    if (!order) throw (app as any).httpErrors.notFound("Service order not found");
    return order;
  });


// GET /api/service-orders/:id/audit
app.get("/service-orders/:id/audit", { preHandler: [app.authenticate] }, async (request) => {
  const params = z.object({ id: z.string() }).parse(request.params);

  const exists = await app.prisma.serviceOrder.findFirst({
    where: { id: params.id, deletedAt: null },
    select: { id: true },
  });
  if (!exists) throw (app as any).httpErrors.notFound("Service order not found");

  const logs = await app.prisma.auditLog.findMany({
    where: { entity: "ServiceOrder", entityId: params.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { user: { select: { id: true, username: true } } },
  });

  return logs;
});

  // POST /api/service-orders
  app.post("/service-orders", { preHandler: [app.authenticate] }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const code = body.code ?? (await generateServiceCode(app));
    const userId = (request.user as any)?.sub ?? null;

    const created = await app.prisma.$transaction(async (tx) => {
      const o = await tx.serviceOrder.create({
        data: {
          code,
          vetCode: body.vetCode ? String(body.vetCode).trim() : null,
          customerId: body.customerId,
          assignedStaffId: body.assignedStaffId ?? null,
          shoeBrand: body.shoeBrand ?? null,
          shoeColor: body.shoeColor ?? null,
          shoeSize: body.shoeSize ?? null,
          shoeType: body.shoeType ?? null,
          pairCount: body.pairCount ?? 1,
          urgent: body.urgent ?? false,
          beforePhotoUrl: body.beforePhotoUrl ?? null,
          afterPhotoUrl: body.afterPhotoUrl ?? null,
          problemDesc: body.problemDesc ?? null,
          promisedAt: body.promisedAt ?? null,
          status: "RECEIVED",
          paymentStatus: "UNPAID",
        },
        include: { customer: true, assignedStaff: true },
      });

      await tx.serviceStatusHistory.create({
        data: {
          serviceOrderId: o.id,
          status: "RECEIVED",
          note: "Created",
          changedByUserId: userId,
        },
      });

      await writeAudit(tx, {
        userId,
        action: "SERVICE_ORDER_CREATE",
        entity: "ServiceOrder",
        entityId: o.id,
        meta: {
          code: o.code,
          customerId: o.customerId,
          assignedStaffId: o.assignedStaffId,
          vetCode: o.vetCode,
        },
      });

      // Optional initial service lines at intake
      const lines = (body as any).lines ?? [];
      if (lines.length) {
        for (const li of lines) {
          let description = (li.description ?? "").trim();
          let price = li.price ?? null;

          if (li.repairServiceId) {
            const svc = await tx.repairService.findFirst({ where: { id: li.repairServiceId, deletedAt: null, active: true } });
            if (!svc) throw (app as any).httpErrors.badRequest("Repair service not found");
            if (!description) description = svc.name;
            if (price === null) price = Number(svc.defaultPrice);
          }

          if (!description) throw (app as any).httpErrors.badRequest("Line description required");
          if (price === null) throw (app as any).httpErrors.badRequest("Price required");

          await tx.serviceLine.create({
            data: {
              serviceOrderId: o.id,
              repairServiceId: li.repairServiceId ?? null,
              description,
              qty: li.qty ?? 1,
              price: minorToDecimalString(toMinor(price)),
            },
          });

          await writeAudit(tx, {
            userId,
            action: "SERVICE_ORDER_LINE_ADD",
            entity: "ServiceOrder",
            entityId: o.id,
            meta: {
              description,
              qty: li.qty ?? 1,
              priceMinor: toMinor(price),
              repairServiceId: li.repairServiceId ?? null,
            },
          });
        }
        await recomputeTotals(tx, o.id);
      }

      // Optional deposit at intake
      const depMinor = toMinor(body.depositAmount ?? 0);
      if (depMinor > 0) {
        const depAmount = minorToDecimalString(depMinor);

        const p = await tx.payment.create({
          data: {
            serviceOrderId: o.id,
            amount: depAmount,
            method: body.depositMethod ?? "CASH",
            paidAt: new Date(),
            note: body.depositNote ?? "Deposit",
            receivedByUserId: userId,
          },
        });

        await tx.aRTransaction.create({
          data: {
            customerId: o.customerId,
            serviceOrderId: o.id,
            type: "PAYMENT",
            amount: depAmount,
            refType: "Payment",
            refId: p.id,
            note: body.depositNote ?? "Deposit",
            createdByUserId: userId,
          },
        });

await writeAudit(tx, {
  userId,
  action: "SERVICE_ORDER_DEPOSIT",
  entity: "ServiceOrder",
  entityId: o.id,
  meta: {
    amountMinor: depMinor,
    method: body.depositMethod ?? "CASH",
    note: body.depositNote ?? "Deposit",
  },
});


        await recomputePaymentStatus(tx, o.id);
      }

      const updated = await tx.serviceOrder.findUnique({ where: { id: o.id }, include: { customer: true, assignedStaff: true } });


      if (!updated) throw (app as any).httpErrors.internalServerError("Order not found after create");
      return updated;
    });

    return reply.code(201).send(created);
  });

  // PUT /api/service-orders/:id
  app.put("/service-orders/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = updateSchema.parse(request.body);

    const updated = await app.prisma.serviceOrder.update({
      where: { id: params.id },
      data: {
        ...(body.customerId !== undefined ? { customerId: body.customerId } : {}),
        ...(body.assignedStaffId !== undefined ? { assignedStaffId: body.assignedStaffId } : {}),
        ...(body.vetCode !== undefined ? { vetCode: body.vetCode ? String(body.vetCode).trim() : null } : {}),
        ...(body.shoeBrand !== undefined ? { shoeBrand: body.shoeBrand } : {}),
        ...(body.shoeColor !== undefined ? { shoeColor: body.shoeColor } : {}),
        ...(body.shoeSize !== undefined ? { shoeSize: body.shoeSize } : {}),
        ...(body.shoeType !== undefined ? { shoeType: body.shoeType } : {}),
        ...(body.pairCount !== undefined ? { pairCount: body.pairCount } : {}),
        ...(body.urgent !== undefined ? { urgent: body.urgent } : {}),
        ...(body.beforePhotoUrl !== undefined ? { beforePhotoUrl: body.beforePhotoUrl } : {}),
        ...(body.afterPhotoUrl !== undefined ? { afterPhotoUrl: body.afterPhotoUrl } : {}),
        ...(body.problemDesc !== undefined ? { problemDesc: body.problemDesc } : {}),
        ...(body.promisedAt !== undefined ? { promisedAt: body.promisedAt } : {}),
      },
      include: { customer: true, assignedStaff: true },
    });


// Audit changed fields (lightweight enterprise trace)
const userId = (request.user as any)?.sub ?? null;
const changedFields = Object.entries(body as any)
  .filter(([, v]) => v !== undefined)
  .map(([k]) => k);

await writeAudit(app.prisma as any, {
  userId,
  action: "SERVICE_ORDER_UPDATE",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: { changedFields },
});

    return updated;
  });



  // POST /api/service-orders/:id/lines
  app.post("/service-orders/:id/lines", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = serviceLineSchema.parse(request.body);

    const line = await app.prisma.$transaction(async (tx) => {
      let description = (body.description ?? "").trim();
      let price: number | null = body.price ?? null;

      if (body.repairServiceId) {
        const svc = await tx.repairService.findFirst({ where: { id: body.repairServiceId, deletedAt: null, active: true } });
        if (!svc) throw (app as any).httpErrors.badRequest("Repair service not found");
        if (!description) description = svc.name;
        if (price === null) price = Number(svc.defaultPrice);
      }

      if (!description) throw (app as any).httpErrors.badRequest("Line description required");
      if (price === null) throw (app as any).httpErrors.badRequest("Price required");

      const l = await tx.serviceLine.create({
        data: {
          serviceOrderId: params.id,
          repairServiceId: body.repairServiceId ?? null,
          description,
          qty: body.qty,
          price: minorToDecimalString(toMinor(price)),
        },
      });

await writeAudit(tx, {
  userId: (request.user as any)?.sub ?? null,
  action: "SERVICE_ORDER_LINE_ADD",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: {
    description,
    qty: body.qty,
    priceMinor: toMinor(price),
    repairServiceId: body.repairServiceId ?? null,
  },
});
      await recomputeTotals(tx, params.id);
      await recomputePaymentStatus(tx, params.id);
      return l;
    });

    return reply.code(201).send(line);
  });

  // DELETE /api/service-lines/:id
  app.delete("/service-lines/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const line = await app.prisma.serviceLine.findUnique({ where: { id: params.id } });
    if (!line) throw (app as any).httpErrors.notFound("Line not found");
    await app.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        userId: (request.user as any)?.sub ?? null,
        action: "SERVICE_ORDER_LINE_DELETE",
        entity: "ServiceOrder",
        entityId: line.serviceOrderId,
        meta: { lineId: line.id, description: line.description, qty: line.qty, price: line.price },
      });

await tx.serviceLine.delete({ where: { id: params.id } });
      await recomputeTotals(tx, line.serviceOrderId);
      await recomputePaymentStatus(tx, line.serviceOrderId);
    });
    return reply.code(204).send();
  });



  // POST /api/service-orders/:id/parts
  app.post("/service-orders/:id/parts", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = partSchema.parse(request.body);
    const userId = (request.user as any)?.sub ?? null;

    const part = await app.prisma.$transaction(async (tx) => {
      const p = await tx.servicePart.create({
        data: {
          serviceOrderId: params.id,
          itemId: body.itemId,
          qty: body.qty,
          unitPrice: minorToDecimalString(toMinor(body.unitPrice)),
        },
      });


await writeAudit(tx, {
  userId,
  action: "SERVICE_ORDER_PART_ADD",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: { itemId: body.itemId, qty: body.qty, unitPriceMinor: toMinor(body.unitPrice) },
});

      // stock deduction
      await tx.stockMovement.create({
        data: {
          itemId: body.itemId,
          type: "SERVICE_OUT",
          qty: body.qty,
          unitCost: null,
          refType: "ServiceOrder",
          refId: params.id,
          note: "Service part used",
          createdByUserId: userId,
        },
      });

      await recomputeTotals(tx, params.id);
      await recomputePaymentStatus(tx, params.id);
      return p;
    });

    return reply.code(201).send(part);
  });

  // DELETE /api/service-parts/:id
  app.delete("/service-parts/:id", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const part = await app.prisma.servicePart.findUnique({ where: { id: params.id } });
    if (!part) throw (app as any).httpErrors.notFound("Part not found");
    await app.prisma.$transaction(async (tx) => {
      await writeAudit(tx, {
        userId: (request.user as any)?.sub ?? null,
        action: "SERVICE_ORDER_PART_DELETE",
        entity: "ServiceOrder",
        entityId: part.serviceOrderId,
        meta: { partId: part.id, itemId: part.itemId, qty: part.qty, unitPrice: part.unitPrice },
      });

await tx.servicePart.delete({ where: { id: params.id } });
      // NOTE: We do not auto-revert stock movements for MVP.
      await recomputeTotals(tx, part.serviceOrderId);
      await recomputePaymentStatus(tx, part.serviceOrderId);
    });
    return reply.code(204).send();
  });



  // POST /api/service-orders/:id/status
  app.post("/service-orders/:id/status", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = statusSchema.parse(request.body);

    // Guardrails: READY and DELIVERED should use their dedicated endpoints
    if (body.status === "READY") throw (app as any).httpErrors.badRequest("Use Mark READY");
    if (body.status === "DELIVERED") throw (app as any).httpErrors.badRequest("Use Deliver");

    const userId = (request.user as any)?.sub ?? null;

    const updated = await app.prisma.$transaction(async (tx) => {
      const o = await tx.serviceOrder.update({
        where: { id: params.id },
        data: { status: body.status },
      });

      await tx.serviceStatusHistory.create({
        data: {
          serviceOrderId: params.id,
          status: body.status,
          note: body.note ?? null,
          changedByUserId: userId,
        },
      });


await writeAudit(tx, {
  userId,
  action: "SERVICE_ORDER_STATUS_SET",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: { status: body.status, note: body.note ?? null },
});

      return o;
    });

    return updated;
  });



  // POST /api/service-orders/:id/payments
  app.post("/service-orders/:id/payments", { preHandler: [app.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = paymentSchema.parse(request.body);
    const userId = (request.user as any)?.sub ?? null;

    const payment = await app.prisma.$transaction(async (tx) => {
      const o = await tx.serviceOrder.findUnique({ where: { id: params.id }, include: { customer: true } });
      if (!o) throw (app as any).httpErrors.notFound("Service order not found");

      const p = await tx.payment.create({
        data: {
          serviceOrderId: params.id,
          amount: minorToDecimalString(toMinor(body.amount)),
          method: body.method,
          paidAt: body.paidAt ?? new Date(),
          note: body.note ?? null,
          receivedByUserId: userId,
        },
      });


await writeAudit(tx, {
  userId,
  action: "SERVICE_ORDER_PAYMENT_ADD",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: { amountMinor: toMinor(body.amount), method: body.method, note: body.note ?? null },
});

      await tx.aRTransaction.create({
        data: {
          customerId: o.customerId,
          serviceOrderId: o.id,
          type: "PAYMENT",
          amount: minorToDecimalString(toMinor(body.amount)),
          refType: "Payment",
          refId: p.id,
          note: body.note ?? null,
          createdByUserId: userId,
        },
      });

      await recomputePaymentStatus(tx, params.id);
      return p;
    });

    return reply.code(201).send(payment);
  });


// POST /api/service-orders/:id/payments/:paymentId/refund
app.post(
  "/service-orders/:id/payments/:paymentId/refund",
  { preHandler: [app.authenticate] },
  async (request, reply) => {
    const params = z.object({ id: z.string(), paymentId: z.string() }).parse(request.params);
    const body = refundSchema.parse(request.body ?? {});
    const userId = (request.user as any)?.sub ?? null;

    const refundPayment = await app.prisma.$transaction(async (tx) => {
      const o = await tx.serviceOrder.findUnique({ where: { id: params.id }, include: { customer: true } });
      if (!o) throw (app as any).httpErrors.notFound("Service order not found");

      const original = await tx.payment.findUnique({ where: { id: params.paymentId } });
      if (!original || original.serviceOrderId !== params.id) {
        throw (app as any).httpErrors.notFound("Payment not found");
      }
      const originalMinor = toMinor(original.amount);
      if (!(originalMinor > 0)) throw (app as any).httpErrors.badRequest("Only positive payments can be refunded");

      const refundMinor = body.amount !== undefined ? toMinor(body.amount) : originalMinor;
      if (!(refundMinor > 0)) throw (app as any).httpErrors.badRequest("Refund amount must be greater than 0");
      if (refundMinor > originalMinor) throw (app as any).httpErrors.badRequest("Refund amount exceeds original payment");

      const note = `REFUND: ${body.reason}`;

      const p = await tx.payment.create({
        data: {
          serviceOrderId: params.id,
          amount: minorToDecimalString(-refundMinor),
          method: original.method,
          paidAt: new Date(),
          note,
          receivedByUserId: userId,
        },
      });

      await tx.aRTransaction.create({
        data: {
          customerId: o.customerId,
          serviceOrderId: o.id,
          type: "REFUND",
          amount: minorToDecimalString(refundMinor),
          refType: "PaymentRefund",
          refId: p.id,
          note: body.reason,
          createdByUserId: userId,
        },
      });


await writeAudit(tx, {
  userId,
  action: "SERVICE_ORDER_PAYMENT_REFUND",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: { originalPaymentId: original.id, refundMinor, reason: body.reason },
});


      await recomputePaymentStatus(tx, params.id);
      return p;
    });

    return reply.code(201).send(refundPayment);
  }
);



  // POST /api/service-orders/:id/discount
  // Update discount without changing status (useful while still repairing)
  app.post("/service-orders/:id/discount", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ discount: moneyIntSchema }).parse(request.body ?? {});

    const updated = await app.prisma.$transaction(async (tx) => {
      const o = await tx.serviceOrder.findUnique({ where: { id: params.id } });
      if (!o) throw (app as any).httpErrors.notFound("Service order not found");

      await tx.serviceOrder.update({ where: { id: params.id }, data: { discount: minorToDecimalString(toMinor(body.discount)) } });
      await recomputeTotals(tx, params.id);


await writeAudit(tx, {
  userId: (request.user as any)?.sub ?? null,
  action: "SERVICE_ORDER_DISCOUNT_UPDATE",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: { discountMinor: toMinor(body.discount) },
});

      // Clamp discount to subtotal (prevents negative totals and keeps data sane)
      const o2 = await tx.serviceOrder.findUnique({ where: { id: params.id } });
      if (!o2) throw (app as any).httpErrors.notFound("Service order not found");
      const subTotalMinor = toMinor((o2 as any).subTotal);
      const discountMinor = toMinor((o2 as any).discount);
      if (discountMinor > subTotalMinor) {
        await tx.serviceOrder.update({ where: { id: params.id }, data: { discount: minorToDecimalString(subTotalMinor) } });
        await recomputeTotals(tx, params.id);
      }

      await recomputePaymentStatus(tx, params.id);

      return tx.serviceOrder.findUnique({
        where: { id: params.id },
        include: { customer: true, assignedStaff: true },
      });
    });

    return updated;
  });



  // POST /api/service-orders/:id/ready (alias: /close)
  const markReadyHandler = async (request: any) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ discount: moneyIntSchema.optional() }).parse(request.body ?? {});
    const userId = (request.user as any)?.sub ?? null;

    const updated = await app.prisma.$transaction(async (tx) => {
      if (body.discount !== undefined) {
        await tx.serviceOrder.update({ where: { id: params.id }, data: { discount: minorToDecimalString(toMinor(body.discount)) } });
      }

      await recomputeTotals(tx, params.id);

      // Clamp discount to subtotal (server guardrail)
      const oAfterTotals = await tx.serviceOrder.findUnique({ where: { id: params.id } });
      if (!oAfterTotals) throw (app as any).httpErrors.notFound("Service order not found");
      const subTotalMinor2 = toMinor((oAfterTotals as any).subTotal);
      const discountMinor2 = toMinor((oAfterTotals as any).discount);
      if (discountMinor2 > subTotalMinor2) {
        await tx.serviceOrder.update({ where: { id: params.id }, data: { discount: minorToDecimalString(subTotalMinor2) } });
        await recomputeTotals(tx, params.id);
      }

      const o = await tx.serviceOrder.findUnique({ where: { id: params.id } });
      if (!o) throw (app as any).httpErrors.notFound("Service order not found");

      await tx.serviceOrder.update({ where: { id: params.id }, data: { status: "READY" } });


await writeAudit(tx, {
  userId,
  action: "SERVICE_ORDER_MARK_READY",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: {
    discountMinor: toMinor((oAfterTotals as any).discount),
    totalMinor: toMinor((oAfterTotals as any).total),
  },
});

      // create AR charge once (when marking READY)
      const existingCharge = await tx.aRTransaction.findFirst({ where: { serviceOrderId: o.id, type: "CHARGE" } });
      if (!existingCharge) {
        await tx.aRTransaction.create({
          data: {
            customerId: o.customerId,
            serviceOrderId: o.id,
            type: "CHARGE",
            amount: o.total,
            refType: "ServiceOrder",
            refId: o.id,
            note: "Service charge",
            createdByUserId: userId,
          },
        });
      }

      await tx.serviceStatusHistory.create({
        data: {
          serviceOrderId: o.id,
          status: "READY",
          note: "Marked READY",
          changedByUserId: userId,
        },
      });

      await recomputePaymentStatus(tx, params.id);

      return tx.serviceOrder.findUnique({
        where: { id: params.id },
        include: { customer: true, assignedStaff: true },
      });
    });

    return updated;
  };

  app.post("/service-orders/:id/ready", { preHandler: [app.authenticate] }, markReadyHandler);
  app.post("/service-orders/:id/close", { preHandler: [app.authenticate] }, markReadyHandler);



  // POST /api/service-orders/:id/deliver
  app.post("/service-orders/:id/deliver", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ note: z.string().optional().nullable() }).parse(request.body ?? {});
    const userId = (request.user as any)?.sub ?? null;

    const updated = await app.prisma.$transaction(async (tx) => {
      const o = await tx.serviceOrder.findUnique({ where: { id: params.id } });
      if (!o) throw (app as any).httpErrors.notFound("Service order not found");

      await recomputePaymentStatus(tx, params.id);
      const o2 = await tx.serviceOrder.findUnique({ where: { id: params.id } });
      if (!o2) throw (app as any).httpErrors.notFound("Service order not found");
      if (o2.paymentStatus !== "PAID") throw (app as any).httpErrors.badRequest("Cannot deliver: payment not complete");

      await tx.serviceOrder.update({ where: { id: params.id }, data: { status: "DELIVERED" } });
await writeAudit(tx, {
  userId,
  action: "SERVICE_ORDER_DELIVER",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: { note: body.note ?? "Delivered" },
});
      await tx.serviceStatusHistory.create({
        data: {
          serviceOrderId: params.id,
          status: "DELIVERED",
          note: body.note ?? "Delivered",
          changedByUserId: userId,
        },
      });

      return tx.serviceOrder.findUnique({
        where: { id: params.id },
        include: { customer: true, assignedStaff: true },
      });
    });

    return updated;
  });

  // DELETE /api/service-orders/:id (ADMIN)
  app.delete(
    "/service-orders/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      await app.prisma.serviceOrder.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
await writeAudit(app.prisma as any, {
  userId: (request.user as any)?.sub ?? null,
  action: "SERVICE_ORDER_SOFT_DELETE",
  entity: "ServiceOrder",
  entityId: params.id,
  meta: {},
});
      return reply.code(204).send();
    }
  );
};
