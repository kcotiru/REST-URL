import { createHash } from "node:crypto";
import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pool from "./config/database";
import redis from "./config/redis";
import { getUserPlan, PLANS } from "./config/plans";
import { UrlRepository } from "./repositories/url.repository";
import { UrlService } from "./services/url.service";
import { UrlController } from "./controllers/url.controller";
import { createUrlRouter } from "./routes/url.routes";
import { ApiKeyRepository } from "./repositories/apiKey.repository";
import { ApiKeyService } from "./services/apiKey.service";
import { ApiKeyController } from "./controllers/apiKey.controller";
import { createApiKeyRouter } from "./routes/apiKey.routes";
import { errorHandler } from "./middleware/errorHandler";
import { createRequireAuth } from "./middleware/auth";
import { rateLimit } from "./middleware/rateLimit";
import { validate, shortCodeParamSchema } from "./middleware/validate";

const REDIRECT_LIMIT_PER_MIN = 600;

const createApp = (): Application => {
  const app = express();

  // Without TRUST_PROXY (hops, e.g. 1) every client behind a reverse proxy shares one IP,
  // and so one redirect rate-limit bucket.
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) app.set("trust proxy", /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN || "http://localhost:5173" }));
  app.use(compression());
  app.use(express.json());

  // ── Dependency wiring ──────────────────────────────────────────────────────
  const urlRepository = new UrlRepository(pool);
  const urlService = new UrlService(urlRepository, redis);
  const urlController = new UrlController(urlService);
  const apiKeyRepository = new ApiKeyRepository(pool);
  const apiKeyService = new ApiKeyService(apiKeyRepository);
  const apiKeyController = new ApiKeyController(apiKeyService);
  const requireAuth = createRequireAuth(apiKeyRepository);
  // Runs after auth: bucket per API key if present, else per user; limit comes from the plan.
  const apiRateLimit = rateLimit({
    redis,
    windowMs: 60_000,
    limit: async (req) => PLANS[await getUserPlan(req.user!.id)].apiRequestsPerMinute,
    key: (req) => (req.user!.apiKeyId ? `api:key:${req.user!.apiKeyId}` : `api:user:${req.user!.id}`),
  });
  // Public redirects are limited per client IP; only a truncated hash of it goes into Redis.
  const redirectRateLimit = rateLimit({
    redis,
    windowMs: 60_000,
    limit: () => REDIRECT_LIMIT_PER_MIN,
    key: (req) => `ip:${createHash("sha256").update(req.ip ?? "").digest("hex").slice(0, 16)}`,
  });

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });
  app.use("/api/v1", requireAuth, apiRateLimit);
  app.use("/api/v1/links", createUrlRouter(urlController));
  app.use("/api/v1/keys", createApiKeyRouter(apiKeyController));
  app.get("/:code", redirectRateLimit, validate(shortCodeParamSchema, "params"), urlController.redirect);
  
  app.use(errorHandler);

  return app;
};

export default createApp;
