import express, { Application, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import pool from "./config/database";
import { UrlRepository } from "./repositories/url.repository";
import { UrlService } from "./services/url.service";
import { UrlController } from "./controllers/url.controller";
import { createUrlRouter } from "./routes/url.routes";
import { errorHandler } from "./middleware/errorHandler";
import { validate, shortCodeParamSchema } from "./middleware/validate";

const createApp = (): Application => {
  const app = express();

  // ── Global middleware ──────────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors());
  app.use(compression());
  app.use(express.json());

  // ── Dependency wiring ──────────────────────────────────────────────────────
  const urlRepository = new UrlRepository(pool);
  const urlService = new UrlService(urlRepository);
  const urlController = new UrlController(urlService);

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use("/shorten", createUrlRouter(urlController));

  // Redirect shorthand: GET /:code  →  302 to original URL
  app.get(
    "/:code",
    validate(shortCodeParamSchema, "params"),
    urlController.redirect,
  );

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ── Error handler (must be last) ───────────────────────────────────────────
  app.use(errorHandler);

  return app;
};

export default createApp;
