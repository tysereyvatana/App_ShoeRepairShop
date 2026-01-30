import type { FastifyPluginAsync } from "fastify";

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get("/dashboard/summary", { preHandler: [app.authenticate] }, async () => {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const [
      items,
      customers,
      suppliers,
      staff,
      users,
      purchases,
      serviceOrders,
      statusGroups,
      overdueRepairs,
      paymentsToday,
      otherIncomeToday,
      expensesToday,
      deliveredTodayCount,
      deliveredTodayRevenue,
      recentOrders,
      unpaidOrders,
    ] = await Promise.all([
      app.prisma.item.count({ where: { deletedAt: null } }),
      app.prisma.customer.count({ where: { deletedAt: null } }),
      app.prisma.supplier.count({ where: { deletedAt: null } }),
      app.prisma.staff.count({ where: { deletedAt: null } }),
      app.prisma.user.count({ where: { deletedAt: null } }),
      app.prisma.purchase.count({ where: { deletedAt: null } }),
      app.prisma.serviceOrder.count({ where: { deletedAt: null } }),
      app.prisma.serviceOrder.groupBy({
        by: ["status"],
        _count: { _all: true },
        where: { deletedAt: null },
      }),
      app.prisma.serviceOrder.count({
        where: {
          deletedAt: null,
          promisedAt: { lt: now },
          status: { notIn: ["DELIVERED", "CANCELLED"] },
        },
      }),
      app.prisma.payment.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: startOfDay } } }),
      app.prisma.otherIncome.aggregate({ _sum: { amount: true }, where: { receivedAt: { gte: startOfDay } } }),
      app.prisma.expense.aggregate({ _sum: { amount: true }, where: { paidAt: { gte: startOfDay } } }),
      app.prisma.serviceOrder.count({
        where: {
          deletedAt: null,
          history: { some: { status: "DELIVERED", changedAt: { gte: startOfDay, lt: endOfDay } } },
        },
      }),
      app.prisma.serviceOrder.aggregate({
        _sum: { total: true },
        where: {
          deletedAt: null,
          history: { some: { status: "DELIVERED", changedAt: { gte: startOfDay, lt: endOfDay } } },
        },
      }),
      app.prisma.serviceOrder.findMany({
        where: { deletedAt: null },
        orderBy: { receivedAt: "desc" },
        take: 8,
        include: { customer: true, payments: { select: { amount: true } } },
      }),
      app.prisma.serviceOrder.findMany({
        where: {
          deletedAt: null,
          status: { not: "CANCELLED" },
          paymentStatus: { in: ["UNPAID", "PARTIAL"] },
        },
        select: { id: true, total: true, payments: { select: { amount: true } } },
      }),
    ]);

    const statusCounts: Record<string, number> = {};
    for (const g of statusGroups) statusCounts[g.status] = g._count._all;

    const recent = recentOrders.map((o) => {
      const paid = (o.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
      const total = Number(o.total);
      const balance = total - paid;
      return {
        id: o.id,
        code: o.code,
        status: o.status,
        paymentStatus: o.paymentStatus,
        receivedAt: o.receivedAt.toISOString(),
        promisedAt: o.promisedAt ? o.promisedAt.toISOString() : null,
        customer: o.customer ? { id: o.customer.id, name: o.customer.name, phone: o.customer.phone ?? null } : null,
        total: o.total.toString(),
        paid: paid.toString(),
        balance: balance.toString(),
      };
    });

    const unpaidCount = unpaidOrders.length;
    const unpaidTotal = unpaidOrders.reduce((s, o) => {
      const paid = (o.payments ?? []).reduce((ps, p) => ps + Number(p.amount), 0);
      const total = Number(o.total);
      const bal = total - paid;
      return s + (bal > 0 ? bal : 0);
    }, 0);

    return {
      counts: { items, customers, suppliers, staff, users, purchases, serviceOrders },
      repair: {
        statusCounts,
        overdueRepairs,
      },
      kpis: {
        paymentsToday: (paymentsToday._sum.amount ?? 0).toString(),
        otherIncomeToday: (otherIncomeToday._sum.amount ?? 0).toString(),
        expensesToday: (expensesToday._sum.amount ?? 0).toString(),
        deliveredTodayCount: deliveredTodayCount,
        deliveredTodayRevenue: (deliveredTodayRevenue._sum.total ?? 0).toString(),
        unpaidCount,
        unpaidTotal: unpaidTotal.toString(),
      },
      recentOrders: recent,
      generatedAt: new Date().toISOString(),
    };
  });
};
