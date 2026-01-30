import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { moneyIntSchema, paginationSchema, toSkipTake } from "../lib/validation.js";

const itemCreateSchema = z.object({
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  name: z.string().min(1),
  categoryId: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  cost: moneyIntSchema.default(0),
  price: moneyIntSchema.default(0),
  reorderLevel: z.coerce.number().int().min(0).default(0),
  active: z.coerce.boolean().default(true),
});

export const itemRoutes: FastifyPluginAsync = async (app) => {
  app.get("/items", { preHandler: [app.authenticate] }, async (request) => {
    const { q, page, pageSize } = paginationSchema.parse(request.query);
    const { skip, take } = toSkipTake(page, pageSize);

    const where = {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { sku: { contains: q, mode: "insensitive" as const } },
              { barcode: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      app.prisma.item.count({ where }),
      app.prisma.item.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { category: true },
      }),
    ]);

    return { data, page, pageSize, total };
  });

  // STAFF can create/update; only ADMIN can delete
  app.post(
    "/items",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"])] },
    async (request, reply) => {
      const body = itemCreateSchema.parse(request.body);

      const item = await app.prisma.item.create({
        data: {
          ...body,
          cost: body.cost.toString(),
          price: body.price.toString(),
        },
        include: { category: true },
      });

      return reply.code(201).send(item);
    }
  );

  app.put(
    "/items/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN", "STAFF"])] },
    async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = itemCreateSchema.partial().parse(request.body);

      const updated = await app.prisma.item.update({
        where: { id: params.id },
        data: {
          ...body,
          ...(body.cost !== undefined ? { cost: body.cost.toString() } : {}),
          ...(body.price !== undefined ? { price: body.price.toString() } : {}),
        },
        include: { category: true },
      });

      return updated;
    }
  );

  app.delete(
    "/items/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"])] },
    async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);

      await app.prisma.item.update({
        where: { id: params.id },
        data: { deletedAt: new Date() },
      });

      return reply.code(204).send();
    }
  );
};
