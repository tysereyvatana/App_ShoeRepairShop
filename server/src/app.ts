import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";

import { prismaPlugin } from "./plugins/prisma.js";
import { authPlugin } from "./plugins/auth.js";
import { errorHandlerPlugin } from "./plugins/errorHandler.js";

import { authRoutes } from "./routes/auth.js";
import { itemRoutes } from "./routes/items.js";
import { customerRoutes } from "./routes/customers.js";
import { supplierRoutes } from "./routes/suppliers.js";
import { staffRoutes } from "./routes/staff.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { purchaseRoutes } from "./routes/purchases.js";
import { serviceOrderRoutes } from "./routes/serviceOrders.js";
import { repairServiceRoutes } from "./routes/repairServices.js";
import { incomeRoutes } from "./routes/income.js";
import { userRoutes } from "./routes/users.js";
import { reportRoutes } from "./routes/reports.js";

// JWT payload typing
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; username: string; roles: string[] };
    user: { sub: string; username: string; roles: string[] };
  }
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      transport:
        process.env.NODE_ENV === "development"
          ? { target: "pino-pretty", options: { colorize: true } }
          : undefined,
    },
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(sensible);

  // Make validation errors return 400 (not 500)
  await app.register(errorHandlerPlugin);

  await app.register(jwt, {
    secret: process.env.JWT_SECRET ?? "supersecret_change_me",
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.get("/health", async () => ({ ok: true }));

  await app.register(async (api) => {
    api.register(authRoutes, { prefix: "/api" });

    api.register(itemRoutes, { prefix: "/api" });
    api.register(customerRoutes, { prefix: "/api" });
    api.register(supplierRoutes, { prefix: "/api" });
    api.register(staffRoutes, { prefix: "/api" });
    api.register(dashboardRoutes, { prefix: "/api" });
    api.register(purchaseRoutes, { prefix: "/api" });
    api.register(serviceOrderRoutes, { prefix: "/api" });
    api.register(repairServiceRoutes, { prefix: "/api" });
    api.register(incomeRoutes, { prefix: "/api" });
    api.register(userRoutes, { prefix: "/api" });
    api.register(reportRoutes, { prefix: "/api" });
  });

  return app;
}
