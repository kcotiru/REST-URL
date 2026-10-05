import { Request, Response, NextFunction } from "express";
import { z, ZodSchema } from "zod";
import { ApiResponse } from "../utils/response";
import { addDays, isoDay } from "../utils/date";

export const validate =
  (schema: ZodSchema, source: "body" | "params" | "query" = "body") =>
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

// Real calendar dates only ("2026-02-30" round-trips to a different day and is rejected).
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date like 2026-01-31")
  .refine((s) => !isNaN(Date.parse(s)) && isoDay(new Date(s)) === s, "Not a real calendar date");

// Defaults: to = today (UTC), from = to - 6 days. Both ends are inclusive days.
export const analyticsQuerySchema = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .transform(({ from, to }) => {
    const end = to ?? isoDay();
    return { from: from ?? addDays(end, -6), to: end };
  })
  .refine((q) => q.from <= q.to, "from must not be after to");

export const apiKeyBodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(64, "Name cannot exceed 64 characters"),
});

export const apiKeyIdParamSchema = z.object({
  id: z.string().uuid({ message: "Must be a valid uuid" }),
});
