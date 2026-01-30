import "dotenv/config";
import fastifyStatic from "@fastify/static";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

const app = await buildApp();

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
