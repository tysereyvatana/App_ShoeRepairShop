import type { FastifyPluginAsync } from "fastify";
import bcrypt from "bcrypt";
import { z } from "zod";

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post("/auth/login", async (request, reply) => {
    const body = z.object({
      username: z.string().min(1),
      password: z.string().min(1),
    }).parse(request.body);

    const user = await app.prisma.user.findFirst({
      where: { username: body.username, deletedAt: null },
      include: { roles: { include: { role: true } } },
    });

    if (!user) return reply.code(401).send({ message: "Invalid username or password" });
    if (user.status !== "ACTIVE") return reply.code(403).send({ message: "User disabled" });

    const ok = await bcrypt.compare(body.password, user.password);
    if (!ok) return reply.code(401).send({ message: "Invalid username or password" });

    const roles = user.roles.map((ur) => ur.role.name);

    const token = await reply.jwtSign(
      { sub: user.id, username: user.username, roles },
      { expiresIn: process.env.JWT_EXPIRES_IN ?? "7d" }
    );

    return { token, user: { id: user.id, username: user.username, roles } };
  });

  // Optional: allow admin to create users later; for now keep this route disabled by default.
  app.get("/auth/me", { preHandler: [app.authenticate] }, async (request) => {
    return { user: request.user };
  });
};
