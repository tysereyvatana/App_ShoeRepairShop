import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { moneyIntSchema, paginationSchema, toSkipTake } from "../lib/validation.js";

const createSchema = z.object({
  name: z.string().min(1),
  defaultPrice: moneyIntSchema.default(0),
  defaultDurationMin: z.coerce.number().int().min(0).optional().nullable(),
  active: z.coerce.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

export const repairServiceRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/repair-services
  app.get("/repair-services", { preHandler: [app.authenticate] }, async (request) => {
    const { q, page, pageSize } = paginationSchema.parse(request.query);
    const { skip, take } = toSkipTake(page, pageSize);

    const where: any = {
      deletedAt: null,
      ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}),
    };

    const [total, data] = await Promise.all([
      app.prisma.repairService.count({ where }),
      app.prisma.repairService.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take,
      }),
    ]);

    return { data, page, pageSize, total };
  });

  // GET /api/repair-services/:id
  app.get("/repair-services/:id", { preHandler: [app.authenticate] }, async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const svc = await app.prisma.repairService.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!svc) throw (app as any).httpErrors.notFound("Repair service not found");
    return svc;
  });

  // POST /api/repair-services (ADMIN)
  app.post(
    "/repair-services",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request, reply) => {
      const body = createSchema.parse(request.body);
      const created = await app.prisma.repairService.create({
        data: {
          name: body.name,
          defaultPrice: body.defaultPrice.toString(),
          defaultDurationMin: body.defaultDurationMin ?? null,
          active: body.active,
        },
      });
      return reply.code(201).send(created);
    }
  );

  // PUT /api/repair-services/:id (ADMIN)
  app.put(
    "/repair-services/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = updateSchema.parse(request.body);

      const updated = await app.prisma.repairService.update({
        where: { id: params.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.defaultPrice !== undefined ? { defaultPrice: body.defaultPrice.toString() } : {}),
          ...(body.defaultDurationMin !== undefined ? { defaultDurationMin: body.defaultDurationMin ?? null } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
        },
      });

      return updated;
    }
  );

  // DELETE /api/repair-services/:id (ADMIN)
  app.delete(
    "/repair-services/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      await app.prisma.repairService.update({ where: { id: params.id }, data: { deletedAt: new Date(), active: false } });
      return reply.code(204).send();
    }
  );
};
