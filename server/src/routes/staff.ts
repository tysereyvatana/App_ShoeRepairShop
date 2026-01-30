import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { moneyIntSchema, paginationSchema, toSkipTake } from "../lib/validation.js";

const staffSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  position: z.string().optional().nullable(),
  salary: moneyIntSchema.default(0),
  status: z.enum(["ACTIVE", "INACTIVE"]).default("ACTIVE"),
  userId: z.string().optional().nullable(),
});

export const staffRoutes: FastifyPluginAsync = async (app) => {
  app.get("/staff", { preHandler: [app.authenticate] }, async (request) => {
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
      app.prisma.staff.count({ where }),
      app.prisma.staff.findMany({ where, orderBy: { createdAt: "desc" }, skip, take, include: { user: true } }),
    ]);

    return { data, page, pageSize, total };
  });

  app.post("/staff", { preHandler: [app.authenticate, app.requireRole(["ADMIN"])] }, async (request, reply) => {
    const body = staffSchema.parse(request.body);

    const staff = await app.prisma.staff.create({
      data: {
        ...body,
        salary: body.salary.toString(),
      },
      include: { user: true },
    });

    return reply.code(201).send(staff);
  });

  app.put("/staff/:id", { preHandler: [app.authenticate, app.requireRole(["ADMIN"])] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = staffSchema.partial().parse(request.body);

    return app.prisma.staff.update({
      where: { id: params.id },
      data: {
        ...body,
        ...(body.salary !== undefined ? { salary: body.salary.toString() } : {}),
      },
      include: { user: true },
    });
  });

  app.delete("/staff/:id", { preHandler: [app.authenticate, app.requireRole(["ADMIN"])] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    await app.prisma.staff.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return reply.code(204).send();
  });
};
