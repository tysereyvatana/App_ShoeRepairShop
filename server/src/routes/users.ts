import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";
import { paginationSchema, toSkipTake } from "../lib/validation.js";

const userCreateSchema = z.object({
  username: z.string().min(3),
  email: z.string().email().optional().nullable(),
  password: z.string().min(4),
  status: z.enum(["ACTIVE", "DISABLED"]).optional().default("ACTIVE"),
  roles: z.array(z.string().min(1)).optional().default([]),
});

const userUpdateSchema = z.object({
  username: z.string().min(3).optional(),
  email: z.string().email().nullable().optional(),
  status: z.enum(["ACTIVE", "DISABLED"]).optional(),
  roles: z.array(z.string().min(1)).optional(),
});

const passwordSchema = z.object({
  password: z.string().min(4),
});

export const userRoutes: FastifyPluginAsync = async (app) => {
  // GET /api/roles
  app.get("/roles", { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] }, async () => {
    const roles = await app.prisma.role.findMany({ orderBy: { name: "asc" } });
    return { data: roles };
  });

  // GET /api/users?q=&page=&pageSize=
  app.get(
    "/users",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request) => {
      const { q, page, pageSize } = paginationSchema.parse(request.query);
      const { skip, take } = toSkipTake(page, pageSize);

      const where: any = {
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { username: { contains: q, mode: "insensitive" as const } },
                { email: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      };

      const [total, data] = await Promise.all([
        app.prisma.user.count({ where }),
        app.prisma.user.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take,
          select: {
            id: true,
            username: true,
            email: true,
            status: true,
            createdAt: true,
            roles: { include: { role: true } },
          },
        }),
      ]);

      return {
        data: data.map((u) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          status: u.status,
          createdAt: u.createdAt,
          roles: u.roles.map((r) => r.role.name),
        })),
        page,
        pageSize,
        total,
      };
    }
  );

  // POST /api/users
  app.post(
    "/users",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request, reply) => {
      const body = userCreateSchema.parse(request.body);

      const roleNames = Array.from(new Set(body.roles));
      const roles = await Promise.all(
        roleNames.map((name) =>
          app.prisma.role.upsert({ where: { name }, update: {}, create: { name } })
        )
      );

      const passwordHash = await bcrypt.hash(body.password, 10);

      const user = await app.prisma.user.create({
        data: {
          username: body.username,
          email: body.email ?? null,
          password: passwordHash,
          status: body.status,
          roles: {
            create: roles.map((r) => ({ roleId: r.id })),
          },
        },
        select: {
          id: true,
          username: true,
          email: true,
          status: true,
          createdAt: true,
          roles: { include: { role: true } },
        },
      });

      return reply.code(201).send({
        id: user.id,
        username: user.username,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
        roles: user.roles.map((r) => r.role.name),
      });
    }
  );

  // PUT /api/users/:id
  app.put(
    "/users/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = userUpdateSchema.parse(request.body);

      const result = await app.prisma.$transaction(async (tx) => {
        if (body.roles) {
          await tx.userRole.deleteMany({ where: { userId: params.id } });
          const roleNames = Array.from(new Set(body.roles));
          const roles = await Promise.all(
            roleNames.map((name) =>
              tx.role.upsert({ where: { name }, update: {}, create: { name } })
            )
          );
          await tx.userRole.createMany({
            data: roles.map((r) => ({ userId: params.id, roleId: r.id })),
          });
        }

        return tx.user.update({
          where: { id: params.id },
          data: {
            ...(body.username !== undefined ? { username: body.username } : {}),
            ...(body.email !== undefined ? { email: body.email } : {}),
            ...(body.status !== undefined ? { status: body.status } : {}),
          },
          select: {
            id: true,
            username: true,
            email: true,
            status: true,
            createdAt: true,
            roles: { include: { role: true } },
          },
        });
      });

      return {
        id: result.id,
        username: result.username,
        email: result.email,
        status: result.status,
        createdAt: result.createdAt,
        roles: result.roles.map((r) => r.role.name),
      };
    }
  );

  const setPassword = async (userId: string, password: string) => {
    const passwordHash = await bcrypt.hash(password, 10);
    await app.prisma.user.update({ where: { id: userId }, data: { password: passwordHash } });
  };

  // PUT /api/users/:id/password
  app.put(
    "/users/:id/password",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = passwordSchema.parse(request.body);
      await setPassword(params.id, body.password);
      return reply.code(204).send();
    }
  );

  // POST /api/users/:id/reset-password (compat with client UI)
  app.post(
    "/users/:id/reset-password",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = passwordSchema.parse(request.body);
      await setPassword(params.id, body.password);
      return reply.code(204).send();
    }
  );

  // DELETE /api/users/:id (soft delete)
  app.delete(
    "/users/:id",
    { preHandler: [app.authenticate, app.requireRole(["ADMIN"]) ] },
    async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      await app.prisma.user.update({ where: { id: params.id }, data: { deletedAt: new Date() } });
      return reply.code(204).send();
    }
  );
};
