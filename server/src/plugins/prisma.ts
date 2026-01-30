import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin: FastifyPluginAsync = fp(
  async (app) => {
    // In serverless (Vercel), keep a single PrismaClient per runtime to avoid opening
    // many connections on warm invocations.
    const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };
    const prisma = globalForPrisma.__prisma ?? new PrismaClient();
    globalForPrisma.__prisma = prisma;
    app.decorate("prisma", prisma);

    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  },
  { name: "prismaPlugin" }
);
