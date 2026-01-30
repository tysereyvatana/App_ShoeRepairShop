import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { minorToDecimalString, toMinor } from "../lib/money.js";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function startOfWeek(d: Date) {
  // Week starts on Monday for Cambodia shops (common).
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day); // move back to Monday
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

const reportQuerySchema = z
  .object({
    range: z.enum(["today", "week", "month"]).optional(),
    start: z.string().datetime().optional(),
    end: z.string().datetime().optional(),
  })
  .refine(
    (v) => {
      if (v.range) return true;
      return !!v.start && !!v.end;
    },
    { message: "Provide either `range` or both `start` and `end`" }
  );

function resolveRange(q: z.infer<typeof reportQuerySchema>) {
  const now = new Date();
  if (q.range === "today") return { start: startOfDay(now), end: endOfDay(now) };
  if (q.range === "week") return { start: startOfWeek(now), end: endOfDay(now) };
  if (q.range === "month") return { start: startOfMonth(now), end: endOfDay(now) };

  // custom
  const start = new Date(q.start!);
  const end = new Date(q.end!);
  return { start, end };
}

export const reportRoutes: FastifyPluginAsync = async (app) => {
  // Summary report for UI (sales, tickets, top services, unpaid list)
  app.get("/reports/summary", { preHandler: [app.authenticate] }, async (request) => {
    const q = reportQuerySchema.parse(request.query);
    const { start, end } = resolveRange(q);

    // Reporting basis:
    // - The selected range represents DELIVERED date (not received date)
    // - Payments are counted for orders delivered in-range, including deposits made earlier
    //   (payments/refunds are included up to `end`)
    const deliveredOrderWhere: any = {
      deletedAt: null,
      history: {
        some: {
          status: "DELIVERED" as const,
          changedAt: { gte: start, lte: end },
        },
      },
    };

    const [
      ordersReceived,
      ordersDelivered,
      paymentNet,
      paymentPositive,
      paymentNegative,
      topLines,
      unpaidOrders,
    ] = await Promise.all([
      app.prisma.serviceOrder.count({
        where: { deletedAt: null, receivedAt: { gte: start, lte: end } },
      }),
      app.prisma.serviceOrder.count({
        where: deliveredOrderWhere,
      }),
      app.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paidAt: { lte: end },
          serviceOrder: { is: deliveredOrderWhere },
        },
      }),
      app.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paidAt: { lte: end },
          amount: { gt: "0" },
          serviceOrder: { is: deliveredOrderWhere },
        },
      }),
      app.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          paidAt: { lte: end },
          amount: { lt: "0" },
          serviceOrder: { is: deliveredOrderWhere },
        },
      }),
      app.prisma.serviceLine.findMany({
        where: {
          serviceOrder: { is: deliveredOrderWhere },
        },
        select: { description: true, qty: true, price: true },
      }),
      app.prisma.serviceOrder.findMany({
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
          paymentStatus: { in: ["UNPAID", "PARTIAL"] },
        },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          payments: { select: { amount: true } },
        },
        orderBy: { receivedAt: "desc" },
        take: 300,
      }),
    ]);

    const deliveredCount = ordersDelivered;
    // Prisma returns Decimal values; keep everything in safe minor units and then format.
    const netPaymentsMinor = toMinor((paymentNet._sum.amount ?? 0).toString());
    const grossPaymentsMinor = toMinor((paymentPositive._sum.amount ?? 0).toString());
    const refundsMinor = toMinor((paymentNegative._sum.amount ?? 0).toString()); // negative

    const netPayments = minorToDecimalString(netPaymentsMinor);
    const grossPayments = minorToDecimalString(grossPaymentsMinor);
    const refunds = minorToDecimalString(refundsMinor);

    // Top services (by revenue) within date range
    const byDesc = new Map<string, { description: string; qty: number; revenueMinor: number }>();
    for (const l of topLines) {
      const key = (l.description ?? "").trim() || "(no description)";
      const qty = l.qty ?? 0;
      const revenueMinor = toMinor(l.price) * qty;
      const curr = byDesc.get(key) ?? { description: key, qty: 0, revenueMinor: 0 };
      curr.qty += qty;
      curr.revenueMinor += revenueMinor;
      byDesc.set(key, curr);
    }
    const topServices = Array.from(byDesc.values())
      .sort((a, b) => b.revenueMinor - a.revenueMinor)
      .slice(0, 12)
      .map((x) => ({
        description: x.description,
        qty: x.qty,
        revenue: minorToDecimalString(x.revenueMinor),
      }));

    // Unpaid list (computed balances)
    const unpaid = unpaidOrders
      .map((o) => {
        const totalMinor = toMinor(o.total);
        const paidMinor = (o.payments ?? []).reduce((s, p) => s + toMinor(p.amount), 0);
        const balanceMinor = totalMinor - paidMinor;
        return {
          id: o.id,
          code: o.code,
          status: o.status,
          receivedAt: o.receivedAt,
          customer: o.customer,
          total: o.total.toString(),
          paid: minorToDecimalString(paidMinor),
          balance: minorToDecimalString(balanceMinor),
        };
      })
      .filter((x) => toMinor(x.balance) > 0)
      .sort((a, b) => toMinor(b.balance) - toMinor(a.balance))
      .slice(0, 50);

    return {
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        mode: q.range ?? "custom",
      },
      kpis: {
        ordersReceived,
        ordersDelivered: deliveredCount,
        netPayments,
        grossPayments,
        refunds,
        unpaidCount: unpaid.length,
        unpaidTotal: minorToDecimalString(unpaid.reduce((s, x) => s + toMinor(x.balance), 0)),
      },
      topServices,
      unpaid,
      generatedAt: new Date().toISOString(),
    };
  });

  // Cashier report (payments + other income - expenses) based on transaction dates.
  // This is what you use to close cash drawer for the day.
  app.get("/reports/cashier", { preHandler: [app.authenticate] }, async (request) => {
    const q = reportQuerySchema.parse(request.query);
    const { start, end } = resolveRange(q);

    const methods = ["CASH", "CARD", "TRANSFER", "OTHER"] as const;
    const methodMap = new Map<
      (typeof methods)[number],
      {
        paymentsNetMinor: number;
        paymentsGrossMinor: number;
        paymentsRefundMinor: number;
        otherIncomeMinor: number;
      }
    >();
    for (const m of methods) {
      methodMap.set(m, {
        paymentsNetMinor: 0,
        paymentsGrossMinor: 0,
        paymentsRefundMinor: 0,
        otherIncomeMinor: 0,
      });
    }


    const [payments, paymentCount, ticketsWithPaymentsGroup, otherIncomeAgg, expensesAgg] = await Promise.all([
      app.prisma.payment.findMany({
        where: {
          paidAt: { gte: start, lte: end },
          serviceOrder: { is: { deletedAt: null } },
        },
        select: { amount: true, method: true },
      }),
      app.prisma.payment.count({
        where: {
          paidAt: { gte: start, lte: end },
          serviceOrder: { is: { deletedAt: null } },
        },
      }),

      // Prisma "count" does not support "distinct" in some client versions.
      // Use groupBy and count the groups instead.
      app.prisma.payment.groupBy({
        by: ["serviceOrderId"],
        where: {
          paidAt: { gte: start, lte: end },
          serviceOrder: { is: { deletedAt: null } },
        },
      }),
      app.prisma.otherIncome.groupBy({
        by: ["method"],
        where: { receivedAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      app.prisma.expense.aggregate({
        where: { paidAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),

    ]);

    const ticketsWithPayments = ticketsWithPaymentsGroup.length;

    let paymentsNetMinor = 0;
    let paymentsGrossMinor = 0;
    let paymentsRefundAbsMinor = 0;

    for (const p of payments) {
      const m = (p.method as any) as (typeof methods)[number];
      const bucket = methodMap.get(m) ?? methodMap.get("CASH")!;
      const amtMinor = toMinor(p.amount);
      bucket.paymentsNetMinor += amtMinor;
      paymentsNetMinor += amtMinor;

      if (amtMinor >= 0) {
        bucket.paymentsGrossMinor += amtMinor;
        paymentsGrossMinor += amtMinor;
      } else {
        const abs = -amtMinor;
        bucket.paymentsRefundMinor += abs;
        paymentsRefundAbsMinor += abs;
      }
    }

    // Other income
    let otherIncomeMinor = 0;
    for (const row of otherIncomeAgg) {
      const m = (row.method as any) as (typeof methods)[number];
      const bucket = methodMap.get(m) ?? methodMap.get("CASH")!;
      const amtMinor = toMinor((row._sum.amount ?? 0).toString());
      bucket.otherIncomeMinor += amtMinor;
      otherIncomeMinor += amtMinor;
    }

    const expensesMinor = toMinor((expensesAgg._sum.amount ?? 0).toString());
    const netCashMinor = paymentsNetMinor + otherIncomeMinor - expensesMinor;

    const byMethod = methods.map((m) => {
      const b = methodMap.get(m)!;
      const inflowNetMinor = b.paymentsNetMinor + b.otherIncomeMinor;
      return {
        method: m,
        paymentsNet: minorToDecimalString(b.paymentsNetMinor),
        paymentsGross: minorToDecimalString(b.paymentsGrossMinor),
        paymentsRefunds: minorToDecimalString(-b.paymentsRefundMinor), // show refunds as negative
        otherIncome: minorToDecimalString(b.otherIncomeMinor),
        inflowNet: minorToDecimalString(inflowNetMinor),
      };
    });

    return {
      range: {
        start: start.toISOString(),
        end: end.toISOString(),
        mode: q.range ?? "custom",
      },
      kpis: {
        paymentCount,
        ticketsWithPayments,
        paymentsNet: minorToDecimalString(paymentsNetMinor),
        paymentsGross: minorToDecimalString(paymentsGrossMinor),
        refunds: minorToDecimalString(-paymentsRefundAbsMinor), // negative
        otherIncome: minorToDecimalString(otherIncomeMinor),
        expenses: minorToDecimalString(expensesMinor),
        netCash: minorToDecimalString(netCashMinor),
      },
      byMethod,
      generatedAt: new Date().toISOString(),
    };
  });
};
