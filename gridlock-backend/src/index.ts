import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config, OPEN_PATHS } from "./config.js";
import { getRedis } from "./cache.js";
import { dbLoadJobs, dbLoadWorkers } from "./db.js";
import { chatRoutes } from "./routes/chat.js";
import { jobRoutes } from "./routes/jobs.js";
import { liveRoutes } from "./routes/live.js";
import { statsRoutes } from "./routes/stats.js";
import { workerRoutes } from "./routes/workers.js";
import { attachWebSocketServer } from "./ws/attach.js";
import { initWorkersAndJobs, startHeartbeatWatcher } from "./workers.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["*"],
  }),
);

app.use("*", async (c, next) => {
  if (!config.apiKeys.size || OPEN_PATHS.has(c.req.path)) {
    return next();
  }
  const key = (c.req.header("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!config.apiKeys.has(key)) {
    return c.json({ error: "Invalid or missing API key" }, 401);
  }
  return next();
});

app.route("/", chatRoutes);
app.route("/", jobRoutes);
app.route("/", workerRoutes);
app.route("/", statsRoutes);
app.route("/", liveRoutes);

async function bootstrap(): Promise<void> {
  await initWorkersAndJobs(dbLoadWorkers, dbLoadJobs);
  void getRedis();
  startHeartbeatWatcher();

  const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
    console.log(`Gridlock Router listening on http://localhost:${info.port}`);
  });
  attachWebSocketServer(server);
}

bootstrap().catch((error) => {
  console.error("[startup] failed:", error);
  process.exit(1);
});
