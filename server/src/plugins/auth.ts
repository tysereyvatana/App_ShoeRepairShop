import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>;
    requireRole: (roles: string[]) => (request: any, reply: any) => Promise<void>;
  }
}

export const authPlugin: FastifyPluginAsync = fp(
  async (app) => {
    app.decorate("authenticate", async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ message: "Unauthorized" });
      }
    });

    app.decorate("requireRole", (roles: string[]) => {
      return async (request, reply) => {
        const userRoles: string[] = (request.user as any)?.roles ?? [];
        const ok = roles.some((r) => userRoles.includes(r));
        if (!ok) return reply.code(403).send({ message: "Forbidden" });
      };
    });
  },
  { name: "authPlugin", dependencies: ["@fastify/jwt"] }
);
