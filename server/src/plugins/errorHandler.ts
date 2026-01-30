import fp from "fastify-plugin";
import type { FastifyPluginAsync } from "fastify";
import { ZodError } from "zod";

// Ensure Zod validation errors show up as 400 (not 500)
// so the client can display a clear message.
export const errorHandlerPlugin: FastifyPluginAsync = fp(
  async (app) => {
    app.setErrorHandler((err, request, reply) => {
      // Zod validation -> 400
      if (err instanceof ZodError) {
        return reply.status(400).send({
          message: "Validation error",
          issues: err.issues,
        });
      }

      const statusCode = (err as any)?.statusCode ?? 500;

      if (statusCode >= 500) {
        request.log.error({ err }, "Unhandled error");
        return reply.status(500).send({ message: "Internal Server Error" });
      }

      return reply.status(statusCode).send({
        message: (err as any)?.message ?? "Request error",
      });
    });
  },
  { name: "errorHandlerPlugin" }
);
