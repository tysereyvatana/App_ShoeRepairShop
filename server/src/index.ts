import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const app = Fastify({
  logger: {
    transport: process.env.NODE_ENV === "development"
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

// JWT payload typing
declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; username: string; roles: string[] };
    user: { sub: string; username: string; roles: string[] };
  }
}

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

// Serve built client (optional)
// - In development you normally run: `npm run dev` (Vite on :5173)
// - For phone/other devices (no Vite), run:
//     1) `npm run build`
//     2) `npm run start -w server`
//   Then open: http://<LAN-IP>:4000

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
const hasClientBuild = fs.existsSync(path.join(clientDist, "index.html"));

if (hasClientBuild) {
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: "/",
  });

  // SPA fallback (only for non-API GETs that expect HTML)
  app.setNotFoundHandler(async (request, reply) => {
    const url = request.raw.url ?? "";
    const accept = request.headers.accept ?? "";

    if (
      request.raw.method === "GET" &&
      !url.startsWith("/api") &&
      !url.startsWith("/health") &&
      accept.includes("text/html")
    ) {
      return reply.type("text/html").sendFile("index.html");
    }

    return reply.code(404).send({ message: "Not Found" });
  });

  // Root loads the UI
  app.get("/", async (_req, reply) => reply.type("text/html").sendFile("index.html"));
} else {
  // Helpful message when someone opens the backend root in dev
  app.get("/", async (_req, reply) => {
    return reply.send({
      ok: true,
      message:
        "Backend is running. In development, open the UI on Vite (:5173). To serve UI from this port, run `npm run build` then `npm run start -w server`.",
      health: "/health",
    });
  });
}

const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: "0.0.0.0" });
