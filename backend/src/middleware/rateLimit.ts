import { Request, Response, NextFunction } from "express";
import type Redis from "ioredis";
import { TooManyRequestsError } from "../utils/errors";

// Sliding-window COUNTER (two-window approximation), not a sorted-set log: two integer
// keys per client (O(1) memory) vs one entry per request (O(limit)) for a sorted set,
// which matters for per-IP limiting of public redirects. The estimate assumes the
// previous window's requests were evenly spread, so it is slightly off only near window
// boundaries.
//
// One Lua script keeps read -> compare -> INCR atomic. A rejected request is NOT counted.
// Returns { allowed, currentCount, previousCount } (currentCount includes this request).
const SCRIPT = `
local curr = tonumber(redis.call('GET', KEYS[1]) or '0')
local prev = tonumber(redis.call('GET', KEYS[2]) or '0')
local limit, window, elapsed = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3])
local estimate = prev * (1 - elapsed / window) + curr
if estimate >= limit then
  return { 0, curr, prev }
end
redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], window * 2)
return { 1, curr + 1, prev }
`;

type Limiter = Redis & {
  slidingWindow(curr: string, prev: string, limit: number, window: number, elapsed: number): Promise<[number, number, number]>;
};

interface Options {
  redis: Redis;
  windowMs: number;
  limit: (req: Request) => number | Promise<number>;
  key: (req: Request) => string;
  now?: () => number; // injectable so tests can pin the clock
}

export const rateLimit = ({ redis, windowMs, limit, key, now = Date.now }: Options) => {
  redis.defineCommand("slidingWindow", { numberOfKeys: 2, lua: SCRIPT });
  const r = redis as Limiter;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    let max: number, allowed: number, curr: number, prev: number, elapsed: number;
    try {
      const t = now();
      const idx = Math.floor(t / windowMs);
      elapsed = t - idx * windowMs;
      max = await limit(req);
      const k = `rl:${key(req)}:`;
      [allowed, curr, prev] = await r.slidingWindow(k + idx, k + (idx - 1), max, windowMs, elapsed);
    } catch (err) {
      // Fail open: a Redis outage must not take the API down with it.
      console.error("Rate limiter failed, allowing request:", err);
      next();
      return;
    }

    const estimate = prev * (1 - elapsed / windowMs) + curr;
    const untilWindowEnd = windowMs - elapsed;
    let resetMs = untilWindowEnd;
    if (!allowed) {
      // Time until the estimate drops below the limit: inside this window if the previous
      // window's weight can still decay enough, otherwise in the next one (where this
      // window's count becomes the previous one and nothing new has been counted).
      const inWindow = prev > 0 ? windowMs * (1 - (max - curr) / prev) : windowMs;
      resetMs = inWindow < windowMs ? inWindow - elapsed : untilWindowEnd + windowMs * (1 - max / curr);
    }
    const resetSec = Math.max(1, Math.ceil(resetMs / 1000));

    res.set({
      "RateLimit-Limit": String(max),
      "RateLimit-Remaining": String(Math.max(0, Math.floor(max - estimate))),
      "RateLimit-Reset": String(resetSec),
    });
    if (allowed) {
      next();
      return;
    }
    res.set("Retry-After", String(resetSec));
    next(new TooManyRequestsError());
  };
};
