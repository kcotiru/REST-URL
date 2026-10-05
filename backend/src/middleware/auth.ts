import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { UnauthorizedError } from "../utils/errors";

const SUPABASE_URL = process.env.SUPABASE_URL;
if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL environment variable is required");
}

// jose caches the keys and refetches on unknown kid.
const jwks = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`));

export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next(new UnauthorizedError());
    return;
  }
  const token = header.slice(7);

  // Phase 2: branch here on `token.startsWith("ru_live_")` for API keys.
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    if (!payload.sub) throw new Error("missing sub");
    req.user = { id: payload.sub };
    next();
  } catch {
    next(new UnauthorizedError("Invalid or expired token"));
  }
};
