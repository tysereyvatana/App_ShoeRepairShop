import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { paginationSchema, toSkipTake } from "../lib/validation.js";

const supplierSchema = z.object({
  code: z.string().optional().nullable(),
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  address: z.string().optional().nullable(),
});

export const supplierRoutes: FastifyPluginAsync = async (app) => {
  app.get("/suppliers", { preHandler: [app.authenticate] }, async (request) => {
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
      app.prisma.supplier.count({ where }),
      app.prisma.supplier.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    ]);

    return { data, page, pageSize, total };
  });

  app.post("/suppliers", { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"]) ] }, async (request, reply) => {
    const body = supplierSchema.parse(request.body);
    const supplier = await app.prisma.supplier.create({ data: body });
    return reply.code(201).send(supplier);
  });

  app.put("/suppliers/:id", { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"]) ] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = supplierSchema.partial().parse(request.body);
    return app.prisma.supplier.update({ where: { id: params.id }, data: body });
  });

  app.delete("/suppliers/:id", { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    await app.prisma.supplier.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
    return reply.code(204).send();
  });
};
