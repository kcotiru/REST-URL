import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { ApiResponse } from "../utils/response";

export const validate =
  (schema: ZodSchema, source: "body" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      ApiResponse.error(res, "Validation failed", 400, result.error.format());
      return;
    }
    req[source] = result.data;
    next();
  };

// Paths the frontend or API own at the root; they must never be shortcodes.
export const RESERVED_CODES = new Set([
  "api", "health", "login", "logout", "signup", "register", "dashboard", "pricing", "billing",
  "keys", "links", "shorten", "stats", "settings", "account", "admin", "auth", "static",
  "assets", "favicon", "docs",
]);

// ── Shared Zod schemas ────────────────────────────────────────────────────────
export const urlBodySchema = z.object({
  url: z
    .string()
    .url({ message: "Must be a valid URL" })
    .refine((u) => ["http:", "https:"].includes(new URL(u).protocol), "URL must use http or https"),
  customCode: z
    .string()
    .min(3, "Custom code must be at least 3 characters")
    .max(10, "Custom code cannot exceed 10 characters")
    .regex(/^[A-Za-z0-9]+$/, "Custom code must be alphanumeric only")
    .refine((c) => !RESERVED_CODES.has(c.toLowerCase()), "That custom code is reserved")
    .optional(),
});

export const shortCodeParamSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(10)
    .regex(/^[A-Za-z0-9]+$/, "Short code must be alphanumeric"),
});
