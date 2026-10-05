import { createHash } from "node:crypto";

export const API_KEY_PREFIX = "ru_live_";

// Plain SHA-256, no bcrypt/salt: keys are 256-bit random, so there is nothing to brute-force
// or rainbow-table, and a slow hash would only add latency to every authenticated request.
export const hashApiKey = (key: string): string => createHash("sha256").update(key).digest("hex");
