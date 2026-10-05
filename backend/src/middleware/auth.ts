import { timingSafeEqual } from "node:crypto";
import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { ApiKeyRepository } from "../repositories/apiKey.repository";
import { UnauthorizedError } from "../utils/errors";
import { API_KEY_PREFIX, hashApiKey } from "../utils/apiKey";

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL environment variable is required");
}

// jose caches the keys and refetches on unknown kid.
const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

// lastUsedAt is bumped at most once per window so a busy key doesn't write on every request.
const LAST_USED_WINDOW_MS = 60_000;

export const createRequireAuth =
  (apiKeyRepository: ApiKeyRepository) =>
  async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      next(new UnauthorizedError());
      return;
    }
    const token = header.slice(7);

    if (token.startsWith(API_KEY_PREFIX)) {
      try {
        const hash = hashApiKey(token);
        const row = await apiKeyRepository.findActiveByHash(hash);
        // The indexed lookup already matched on the hash; the constant-time compare is the required belt-and-braces.
        if (!row || !timingSafeEqual(Buffer.from(row.keyHash), Buffer.from(hash))) {
          next(new UnauthorizedError("Invalid API key"));
          return;
        }
        if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_WINDOW_MS) {
          // Fire-and-forget: a failed bookkeeping write must not fail the request.
          apiKeyRepository.touch(row.id).catch((err) => console.error("Failed to update lastUsedAt:", err));
        }
        req.user = { id: row.ownerId, apiKeyId: row.id };
        next();
      } catch (err) {
        next(err);
      }
      return;
    }

    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `${SUPABASE_URL}/auth/v1`,
        audience: "authenticated",
      });
      if (!payload.sub) throw new Error("missing sub");
      req.user = { id: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
      next();
    } catch {
      next(new UnauthorizedError("Invalid or expired token"));
    }
  };
