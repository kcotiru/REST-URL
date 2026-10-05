import { readFileSync } from "node:fs";
import { createServer, Server } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { SignJWT, exportJWK, generateKeyPair, KeyLike } from "jose";
import type { Pool } from "pg";
import express from "express";
import type { Application } from "express";
import type Redis from "ioredis";
import type Stripe from "stripe";
import { rateLimit } from "../src/middleware/rateLimit";
import { addDays } from "../src/utils/date";
import { errorHandler } from "../src/middleware/errorHandler";
import { SubscriptionRepository } from "../src/repositories/subscription.repository";

const TEST_DB = process.env.TEST_DATABASE_URL;
const TEST_REDIS = process.env.TEST_REDIS_URL;
const migration = (f: string) => readFileSync(path.join(__dirname, "../db/migrations", f), "utf8");

let jwksServer: Server;
let origin: string;
let privateKey: KeyLike;
let app: Application;
let pool: Pool;
let redis: Redis;
let stripe: Stripe;

const ready = (c: Redis) => (c.status === "ready" ? undefined : new Promise((r) => c.once("ready", r)));

const sign = (sub: string, opts: { key?: KeyLike; aud?: string; email?: string } = {}) =>
  new SignJWT(opts.email ? { email: opts.email } : {})
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject(sub)
    .setIssuer(`${origin}/auth/v1`)
    .setAudience(opts.aud ?? "authenticated")
    .setExpirationTime("5m")
    .sign(opts.key ?? privateKey);

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
  jwksServer = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((r) => jwksServer.listen(0, "127.0.0.1", r));
  const addr = jwksServer.address();
  origin = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  process.env.SUPABASE_URL = origin;
  // Never the live DB: a placeholder keeps the pool lazy when no test DB is configured.
  process.env.DATABASE_URL = TEST_DB || "postgresql://unused:unused@127.0.0.1:1/unused";

  // Never the dev Redis: a dead port makes the app fail open when no test Redis is configured.
  process.env.REDIS_URL = TEST_REDIS || "redis://127.0.0.1:1";

  // Dummy test-mode values; every Stripe network call is mocked with vi.spyOn.
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  process.env.STRIPE_PRICE_PRO = "price_test_pro";

  app = (await import("../src/app")).default();
  stripe = (await import("../src/config/stripe")).default;
  pool = (await import("../src/config/database")).default;
  redis = (await import("../src/config/redis")).default;
  if (TEST_REDIS) await ready(redis);

  if (TEST_DB) {
    await pool.query("CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);");
    await pool.query(migration("001_init.sql"));
    await pool.query(migration("002_url_owner.sql"));
    await pool.query(migration("003_api_keys.sql"));
    await pool.query(migration("004_clicks.sql"));
    await pool.query(migration("005_billing.sql"));
    await pool.query(migration("006_enable_rls.sql"));
  }
});

beforeEach(async () => {
  if (TEST_REDIS) await redis.flushdb();
});

afterAll(async () => {
  jwksServer.close();
  redis.disconnect();
  if (TEST_DB) await pool.end();
});

// The DB and Redis suites skip when their env is missing; in CI that must fail the run, not hide it.
it("CI provides TEST_DATABASE_URL and TEST_REDIS_URL", () => {
  if (process.env.CI) {
    expect(TEST_DB, "TEST_DATABASE_URL").toBeTruthy();
    expect(TEST_REDIS, "TEST_REDIS_URL").toBeTruthy();
  }
});

it("GET /health returns 200", async () => {
  await request(app).get("/health").expect(200);
});

describe("auth", () => {
  const body = { url: "https://example.com" };

  it("rejects a missing token", async () => {
    await request(app).post("/api/v1/links").send(body).expect(401);
  });

  it("rejects a token signed by a different key", async () => {
    const other = await generateKeyPair("ES256");
    const token = await sign(randomUUID(), { key: other.privateKey });
    await request(app).post("/api/v1/links").set("Authorization", `Bearer ${token}`).send(body).expect(401);
  });

  it("rejects a wrong audience", async () => {
    const token = await sign(randomUUID(), { aud: "anon" });
    await request(app).post("/api/v1/links").set("Authorization", `Bearer ${token}`).send(body).expect(401);
  });
});

it("refuses to start with a live or missing Stripe key", async () => {
  const { assertTestKey } = await import("../src/config/stripe");
  expect(() => assertTestKey("sk_live_x")).toThrow(/test-mode/);
  expect(() => assertTestKey("rk_live_x")).toThrow(/test-mode/);
  expect(() => assertTestKey(undefined)).toThrow(/test-mode/);
  expect(assertTestKey("sk_test_x")).toBe("sk_test_x");
  expect(assertTestKey("rk_test_x")).toBe("rk_test_x");
});

it("GET /api/v1/plans is public and returns both plans with the display price", async () => {
  const res = await request(app).get("/api/v1/plans").expect(200);
  expect(res.body.data.free).toEqual({ linksPerMonth: 50, apiRequestsPerMinute: 60, analyticsDays: 30, priceUsdMonthly: 0 });
  expect(res.body.data.pro).toMatchObject({ linksPerMonth: 5000, priceUsdMonthly: 9 });
});

describe("validation", () => {
  it("rejects reserved custom codes (case-insensitive) and non-http(s) URLs", async () => {
    const h = { Authorization: `Bearer ${await sign(randomUUID())}` };
    await request(app).post("/api/v1/links").set(h).send({ url: "https://example.com", customCode: "Dashboard" }).expect(400);
    await request(app).post("/api/v1/links").set(h).send({ url: "javascript:alert(1)" }).expect(400);
  });
});

describe("rate limiter", () => {
  let t = 10 * 60_000 + 1_000;
  const miniApp = (client: Redis) => {
    const a = express();
    a.use(rateLimit({ redis: client, windowMs: 60_000, limit: () => 5, key: () => "unit", now: () => t }));
    a.get("/", (_req, res) => void res.send("ok"));
    a.use(errorHandler);
    return a;
  };

  it.skipIf(!TEST_REDIS)("allows N requests with a falling Remaining, then 429 with Retry-After, then recovers", async () => {
    const client = (await import("../src/config/redis")).createRedis(TEST_REDIS!);
    await ready(client);
    try {
      const a = miniApp(client);
      for (let i = 0; i < 5; i++) {
        const res = await request(a).get("/").expect(200);
        expect(res.headers["ratelimit-limit"]).toBe("5");
        expect(res.headers["ratelimit-remaining"]).toBe(String(4 - i));
        expect(Number(res.headers["ratelimit-reset"])).toBeGreaterThanOrEqual(1);
      }
      const blocked = await request(a).get("/").expect(429);
      expect(blocked.headers["retry-after"]).toMatch(/^[1-9]\d*$/);
      expect(blocked.headers["ratelimit-remaining"]).toBe("0");
      expect(blocked.body.status).toBe("error");

      t += 2 * 60_000; // two full windows later nothing is carried over
      await request(a).get("/").expect(200);
    } finally {
      client.disconnect();
    }
  });

  it("fails open when Redis is unreachable", async () => {
    const client = (await import("../src/config/redis")).createRedis("redis://127.0.0.1:6390");
    try {
      const a = miniApp(client);
      for (let i = 0; i < 7; i++) await request(a).get("/").expect(200);
    } finally {
      client.disconnect();
    }
  });
});

describe.skipIf(!TEST_DB)("with database", () => {
  const A = randomUUID();
  const B = randomUUID();
  const auth = async (id: string) => ({ Authorization: `Bearer ${await sign(id)}` });

  beforeEach(async () => {
    await pool.query("TRUNCATE urls, api_keys, clicks, clicks_daily, subscriptions, stripe_events");
    await pool.query("INSERT INTO auth.users (id) VALUES ($1), ($2) ON CONFLICT DO NOTHING", [A, B]);
  });

  it("scopes get/update/delete/stats to the owner; redirect stays public", async () => {
    const created = await request(app)
      .post("/api/v1/links")
      .set(await auth(A))
      .send({ url: "https://example.com/a" })
      .expect(201);
    const code = created.body.data.shortCode;
    expect(created.body.data).not.toHaveProperty("ownerId");

    const asB = await auth(B);
    await request(app).get(`/api/v1/links/${code}`).set(asB).expect(404);
    await request(app).put(`/api/v1/links/${code}`).set(asB).send({ url: "https://evil.com" }).expect(404);
    await request(app).delete(`/api/v1/links/${code}`).set(asB).expect(404);
    await request(app).get(`/api/v1/links/${code}/stats`).set(asB).expect(404);

    await request(app).get(`/api/v1/links/${code}`).set(await auth(A)).expect(200);
    await request(app).get(`/${code}`).expect(302).expect("Location", "https://example.com/a");

    // B's failed attempts changed nothing.
    const row = await pool.query(`SELECT "url" FROM urls WHERE "shortCode" = $1`, [code]);
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].url).toBe("https://example.com/a");
  });

  it("RLS: a non-owner role sees no rows in urls, while the owner connection still does", async () => {
    await pool.query(`DO $$ BEGIN CREATE ROLE rls_probe NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await pool.query("GRANT SELECT ON urls TO rls_probe");
    await request(app).post("/api/v1/links").set(await auth(A)).send({ url: "https://example.com/rls" }).expect(201);

    const client = await pool.connect();
    try {
      await client.query("SET ROLE rls_probe");
      expect((await client.query("SELECT count(*)::int AS n FROM urls")).rows[0].n).toBe(0);
      await client.query("RESET ROLE");
      expect((await client.query("SELECT count(*)::int AS n FROM urls")).rows[0].n).toBeGreaterThanOrEqual(1);
    } finally {
      await client.query("RESET ROLE").catch(() => undefined);
      client.release();
    }
  });

  it("GET /links lists only the caller's links, newest first, with accessCount", async () => {
    const h = await auth(A);
    for (const n of ["one", "two", "three"]) {
      await request(app).post("/api/v1/links").set(h).send({ url: `https://example.com/${n}` }).expect(201);
    }
    await request(app).post("/api/v1/links").set(await auth(B)).send({ url: "https://example.com/b-only" }).expect(201);
    await pool.query(`UPDATE urls SET "accessCount" = 7 WHERE "url" = 'https://example.com/one'`);

    const res = await request(app).get("/api/v1/links").set(h).expect(200);
    expect(res.body.data.map((l: { url: string }) => l.url)).toEqual([
      "https://example.com/three", "https://example.com/two", "https://example.com/one",
    ]);
    expect(res.body.data[2].accessCount).toBe(7);
    expect(res.body.data[0]).not.toHaveProperty("ownerId");
    // The /:code route still resolves next to the list route.
    await request(app).get(`/api/v1/links/${res.body.data[0].shortCode}`).set(h).expect(200);
    await request(app).get("/api/v1/links").expect(401);
  });

  it("legacy rows with NULL ownerId are read-only: 404 for everyone, redirect works", async () => {
    await pool.query(`INSERT INTO urls ("url", "shortCode") VALUES ('https://legacy.example', 'legacy1')`);
    await request(app).put("/api/v1/links/legacy1").set(await auth(A)).send({ url: "https://x.example" }).expect(404);
    await request(app).delete("/api/v1/links/legacy1").set(await auth(A)).expect(404);
    await request(app).get("/legacy1").expect(302).expect("Location", "https://legacy.example");
  });

  describe.skipIf(!TEST_REDIS)("redis", () => {
    it("redirect cache is populated on first hit and invalidated on update and delete", async () => {
      const h = await auth(A);
      const { shortCode: code } = (await request(app).post("/api/v1/links").set(h).send({ url: "https://example.com/a" }).expect(201)).body.data;
      expect(await redis.exists(`url:${code}`)).toBe(0);

      await request(app).get(`/${code}`).expect(302).expect("Location", "https://example.com/a");
      expect(JSON.parse((await redis.get(`url:${code}`))!)).toEqual({ id: expect.any(Number), url: "https://example.com/a" });

      await request(app).put(`/api/v1/links/${code}`).set(h).send({ url: "https://example.com/b" }).expect(200);
      expect(await redis.exists(`url:${code}`)).toBe(0);
      await request(app).get(`/${code}`).expect(302).expect("Location", "https://example.com/b");

      await request(app).delete(`/api/v1/links/${code}`).set(h).expect(204);
      await request(app).get(`/${code}`).expect(404);
    });

    it("a redirect after an update serves the new URL, even when the old one was cached", async () => {
      const h = await auth(A);
      const { shortCode: code } = (await request(app).post("/api/v1/links").set(h).send({ url: "https://example.com/old" }).expect(201)).body.data;
      await request(app).get(`/${code}`).expect(302).expect("Location", "https://example.com/old"); // caches it
      await request(app).put(`/api/v1/links/${code}`).set(h).send({ url: "https://example.com/new" }).expect(200);
      await request(app).get(`/${code}`).expect(302).expect("Location", "https://example.com/new");
    });

    it("API requests carry the free-plan rate limit headers", async () => {
      const res = await request(app).post("/api/v1/links").set(await auth(A)).send({ url: "https://example.com/rl" }).expect(201);
      expect(res.headers["ratelimit-limit"]).toBe("60");
      expect(res.headers["ratelimit-remaining"]).toBe("59");
    });
  });

  describe.skipIf(!TEST_REDIS)("click analytics", () => {
    const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
    const today = new Date().toISOString().slice(0, 10);
    let flushOnce: (r: Redis, p: Pool) => Promise<number>;
    beforeAll(async () => {
      flushOnce = (await import("../src/worker")).flushOnce;
    });

    const link = async (id: string, url: string) =>
      (await request(app).post("/api/v1/links").set(await auth(id)).send({ url }).expect(201)).body.data as { id: number; shortCode: string };
    const hnClick = (code: string) =>
      request(app).get(`/${code}`).set({ Referer: "https://news.ycombinator.com/item?id=1", "cf-ipcountry": "de", "User-Agent": IPHONE }).expect(302);
    const event = (u: number) => ({ i: randomUUID(), t: Date.now(), u, r: null, c: null, d: "desktop" });
    const counts = async () => ({
      clicks: (await pool.query("SELECT count(*)::int AS n FROM clicks")).rows[0].n as number,
      access: (await pool.query('SELECT "accessCount" AS n FROM urls ORDER BY id')).rows.map((r) => r.n as number),
      daily: (await pool.query("SELECT coalesce(sum(count), 0)::int AS n FROM clicks_daily")).rows[0].n as number,
    });

    it("flush writes clicks, accessCount and the daily rollup, and empties both lists", async () => {
      const a = await link(A, "https://example.com/a");
      const b = await link(A, "https://example.com/b");
      for (let i = 0; i < 3; i++) await hnClick(a.shortCode);
      await request(app).get(`/${b.shortCode}`).set("User-Agent", DESKTOP).expect(302);
      expect(await redis.llen("clicks:queue")).toBe(4);

      expect(await flushOnce(redis, pool)).toBe(4);

      const perLink = (await pool.query('SELECT "urlId", count(*)::int AS n FROM clicks GROUP BY 1 ORDER BY 1')).rows;
      expect(perLink).toEqual([{ urlId: a.id, n: 3 }, { urlId: b.id, n: 1 }]);
      const access = (await pool.query('SELECT id, "accessCount" FROM urls ORDER BY id')).rows;
      expect(access).toEqual([{ id: a.id, accessCount: 3 }, { id: b.id, accessCount: 1 }]);
      const daily = (await pool.query(`SELECT "urlId", to_char(day, 'YYYY-MM-DD') AS day, country, "referrerHost", device, count FROM clicks_daily ORDER BY 1`)).rows;
      expect(daily).toEqual([
        { urlId: a.id, day: today, country: "DE", referrerHost: "news.ycombinator.com", device: "mobile", count: 3 },
        { urlId: b.id, day: today, country: "", referrerHost: "", device: "desktop", count: 1 },
      ]);
      expect(await redis.llen("clicks:queue")).toBe(0);
      expect(await redis.llen("clicks:processing")).toBe(0);
    });

    it("is idempotent: duplicate events in a batch and a replay after a crash between COMMIT and DEL do not double-count", async () => {
      const a = await link(A, "https://example.com/a");
      const ev = JSON.stringify(event(a.id));
      await redis.lpush("clicks:queue", ev, ev); // same event twice in one batch
      expect(await flushOnce(redis, pool)).toBe(2);
      expect(await counts()).toEqual({ clicks: 1, access: [1], daily: 1 });

      await redis.lpush("clicks:processing", ev); // crashed after COMMIT, before DEL
      expect(await flushOnce(redis, pool)).toBe(1);
      expect(await counts()).toEqual({ clicks: 1, access: [1], daily: 1 });
    });

    it("re-processes a leftover processing list before moving anything new, losing nothing", async () => {
      const a = await link(A, "https://example.com/a");
      await redis.lpush("clicks:processing", JSON.stringify(event(a.id)), JSON.stringify(event(a.id)));
      await redis.lpush("clicks:queue", JSON.stringify(event(a.id)), JSON.stringify(event(a.id)), JSON.stringify(event(a.id)));

      expect(await flushOnce(redis, pool)).toBe(2);
      expect(await redis.llen("clicks:queue")).toBe(3); // untouched until recovery is done
      expect((await counts()).clicks).toBe(2);

      expect(await flushOnce(redis, pool)).toBe(3);
      expect(await counts()).toEqual({ clicks: 5, access: [5], daily: 5 });
      expect(await redis.llen("clicks:processing")).toBe(0);
    });

    it("drops events of a deleted link and still lands the rest of the batch", async () => {
      const gone = await link(A, "https://example.com/gone");
      const kept = await link(A, "https://example.com/kept");
      await request(app).get(`/${gone.shortCode}`).expect(302);
      await request(app).delete(`/api/v1/links/${gone.shortCode}`).set(await auth(A)).expect(204);
      await request(app).get(`/${kept.shortCode}`).expect(302);

      expect(await flushOnce(redis, pool)).toBe(2);
      const rows = (await pool.query('SELECT "urlId" FROM clicks')).rows;
      expect(rows).toEqual([{ urlId: kept.id }]);
      expect((await counts()).access).toEqual([1]);
      expect(await redis.llen("clicks:processing")).toBe(0);
    });

    it("skips a malformed event without poisoning the batch", async () => {
      const a = await link(A, "https://example.com/a");
      await redis.lpush("clicks:queue", "{not json", JSON.stringify(event(a.id)));
      expect(await flushOnce(redis, pool)).toBe(2);
      expect((await counts()).clicks).toBe(1);
    });

    it("the redirect only enqueues: no DB write before the flush, compact event, no IP", async () => {
      const a = await link(A, "https://example.com/a");
      await hnClick(a.shortCode);
      await request(app).get(`/${a.shortCode}`).set({ "x-vercel-ip-country": "zz1", "User-Agent": "Googlebot/2.1" }).expect(302);

      expect((await counts()).access).toEqual([0]);
      const raw = await redis.lrange("clicks:queue", 0, -1);
      expect(raw).toHaveLength(2);
      for (const r of raw) {
        expect(Object.keys(JSON.parse(r)).sort()).toEqual(["c", "d", "i", "r", "t", "u"]);
        expect(r).not.toMatch(/127\.0\.0\.1|::1/);
      }
      const [bot, human] = raw.map((r) => JSON.parse(r)); // LPUSH: newest first
      expect(human).toMatchObject({ u: a.id, r: "news.ycombinator.com", c: "DE", d: "mobile" });
      expect(bot).toMatchObject({ c: null, r: null, d: "bot" }); // "ZZ1" is not a country code
    });

    it("analytics: hourly for a short range, daily from the rollup for a long one, plan-clamped, owner-scoped, validated", async () => {
      const a = await link(A, "https://example.com/a");
      for (let i = 0; i < 3; i++) await hnClick(a.shortCode);
      await flushOnce(redis, pool);
      const get = async (id: string, code: string, qs = "", status = 200) => {
        const res = await request(app).get(`/api/v1/links/${code}/analytics${qs}`).set(await auth(id));
        expect(res.status, JSON.stringify(res.body)).toBe(status);
        return res;
      };
      const sum = (s: { count: number }[]) => s.reduce((n, x) => n + x.count, 0);

      const week = (await get(A, a.shortCode)).body.data;
      expect(week).toMatchObject({
        to: today, granularity: "hour", total: 3,
        countries: [{ value: "DE", count: 3 }],
        referrers: [{ value: "news.ycombinator.com", count: 3 }],
        devices: [{ value: "mobile", count: 3 }],
      });
      expect(week.series).toHaveLength(7 * 24);
      expect(sum(week.series)).toBe(3);

      const month = (await get(A, a.shortCode, `?from=${addDays(today, -29)}&to=${today}`)).body.data;
      expect(month).toMatchObject({ granularity: "day", total: 3, countries: [{ value: "DE", count: 3 }] });
      expect(month.series).toHaveLength(30);
      expect(sum(month.series)).toBe(3);
      expect(month.series.at(-1)).toEqual({ t: today, count: 3 });

      // The free plan reaches back 30 days: the 40-day-old rollup row is out of range and `from` is clamped.
      await pool.query(`INSERT INTO clicks_daily ("urlId", day, device, count) VALUES ($1, $2, 'desktop', 9)`, [a.id, addDays(today, -40)]);
      const clamped = (await get(A, a.shortCode, `?from=${addDays(today, -60)}&to=${today}`)).body.data;
      expect(clamped).toMatchObject({ from: addDays(today, -30), granularity: "day", total: 3 });

      // Unknown country/referrer come back as null.
      const b = await link(A, "https://example.com/b");
      await request(app).get(`/${b.shortCode}`).expect(302);
      await flushOnce(redis, pool);
      expect((await get(A, b.shortCode)).body.data).toMatchObject({ total: 1, countries: [{ value: null, count: 1 }], referrers: [{ value: null, count: 1 }], devices: [{ value: "desktop", count: 1 }] });

      await get(B, a.shortCode, "", 404);
      await get(A, a.shortCode, `?from=${today}&to=${addDays(today, -1)}`, 400);
      await get(A, a.shortCode, "?from=2026-02-30", 400);
      await get(A, a.shortCode, "?to=2026-13-45", 400);
      await get(A, a.shortCode, "?from=yesterday", 400);
    });
  });

  describe("api keys", () => {
    const makeKey = async (id: string, name = "ci") => {
      const res = await request(app).post("/api/v1/keys").set(await auth(id)).send({ name }).expect(201);
      return res.body.data as { id: string; name: string; prefix: string; createdAt: string; key: string };
    };
    const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
    const lastUsed = async (id: string) =>
      (await pool.query(`SELECT "lastUsedAt" FROM api_keys WHERE id = $1`, [id])).rows[0].lastUsedAt as Date | null;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    it("create -> use on /links as the owner -> revoke -> 401", async () => {
      const k = await makeKey(A);
      expect(k.key.startsWith("ru_live_")).toBe(true);
      expect(k.prefix).toBe(k.key.slice(0, 16));
      expect(k.name).toBe("ci");

      const created = await request(app).post("/api/v1/links").set(bearer(k.key)).send({ url: "https://example.com/k" }).expect(201);
      // The link is owned by the key owner: A's JWT sees it, B's does not.
      await request(app).get(`/api/v1/links/${created.body.data.shortCode}`).set(await auth(A)).expect(200);
      await request(app).get(`/api/v1/links/${created.body.data.shortCode}`).set(await auth(B)).expect(404);

      await request(app).delete(`/api/v1/keys/${k.id}`).set(await auth(A)).expect(204);
      await request(app).post("/api/v1/links").set(bearer(k.key)).send({ url: "https://example.com/k2" }).expect(401);
      // Soft revoke: the row stays, and revoking again is a 404.
      expect((await pool.query(`SELECT "revokedAt" FROM api_keys WHERE id = $1`, [k.id])).rows[0].revokedAt).not.toBeNull();
      await request(app).delete(`/api/v1/keys/${k.id}`).set(await auth(A)).expect(404);
    });

    it("list never exposes the key or hash; the DB stores only the sha256", async () => {
      const k = await makeKey(A);
      const list = await request(app).get("/api/v1/keys").set(await auth(A)).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(Object.keys(list.body.data[0]).sort()).toEqual(["createdAt", "id", "lastUsedAt", "name", "prefix", "revokedAt"]);
      expect(JSON.stringify(list.body)).not.toContain(k.key);

      const row = (await pool.query(`SELECT * FROM api_keys WHERE id = $1`, [k.id])).rows[0];
      expect(row.keyHash).toBe(createHash("sha256").update(k.key).digest("hex"));
      expect(JSON.stringify(row)).not.toContain(k.key);
    });

    it("lists only the caller's keys, newest first", async () => {
      const first = await makeKey(A, "first");
      const second = await makeKey(A, "second");
      await makeKey(B, "other");
      const list = await request(app).get("/api/v1/keys").set(await auth(A)).expect(200);
      expect(list.body.data.map((x: { id: string }) => x.id)).toEqual([second.id, first.id]);
    });

    it("validates name and id", async () => {
      const h = await auth(A);
      await request(app).post("/api/v1/keys").set(h).send({ name: "" }).expect(400);
      await request(app).post("/api/v1/keys").set(h).send({ name: "x".repeat(65) }).expect(400);
      await request(app).delete("/api/v1/keys/not-a-uuid").set(h).expect(400);
    });

    it("another user cannot revoke the key (404) and it keeps working; garbage keys get 401", async () => {
      const k = await makeKey(A);
      await request(app).delete(`/api/v1/keys/${k.id}`).set(await auth(B)).expect(404);
      await request(app).post("/api/v1/links").set(bearer(k.key)).send({ url: "https://example.com/still" }).expect(201);
      await request(app).post("/api/v1/links").set(bearer("ru_live_xxx")).send({ url: "https://example.com/x" }).expect(401);
    });

    it("an API key cannot manage API keys (403) but a JWT can", async () => {
      const k = await makeKey(A);
      await request(app).post("/api/v1/keys").set(bearer(k.key)).send({ name: "child" }).expect(403);
      await request(app).get("/api/v1/keys").set(bearer(k.key)).expect(403);
      await request(app).delete(`/api/v1/keys/${k.id}`).set(bearer(k.key)).expect(403);
      expect((await pool.query("SELECT count(*)::int AS n FROM api_keys")).rows[0].n).toBe(1);
    });

    it("sets lastUsedAt on first use and does not rewrite it within a minute", async () => {
      const k = await makeKey(A);
      expect(await lastUsed(k.id)).toBeNull();
      const use = () => request(app).post("/api/v1/links").set(bearer(k.key)).send({ url: "https://example.com/u" }).expect(201);

      await use();
      let first: Date | null = null;
      for (let i = 0; i < 40 && !first; i++) {
        await sleep(25);
        first = await lastUsed(k.id);
      }
      expect(first).not.toBeNull();

      await sleep(50); // so a (wrongly) rewritten now() would differ
      await use();
      await sleep(300); // fire-and-forget: give a wrong update time to land
      expect((await lastUsed(k.id))!.getTime()).toBe(first!.getTime());
    });
  });

  describe("billing", () => {
    const C = randomUUID(); // a Pro user, seeded by SQL
    const proSub = (userId: string) =>
      pool.query(`INSERT INTO subscriptions ("userId", "stripeCustomerId", "stripeSubscriptionId", plan, status) VALUES ($1, $2, 'sub_seed', 'pro', 'active')`, [userId, `cus_${userId}`]);
    const subRow = async (userId: string) =>
      (await pool.query(`SELECT plan, status, "stripeCustomerId", "currentPeriodEnd" FROM subscriptions WHERE "userId" = $1`, [userId])).rows[0];
    const eventCount = async () => (await pool.query("SELECT count(*)::int AS n FROM stripe_events")).rows[0].n as number;
    const fakeSub = (o: { status?: string; price?: string; userId?: string | null } = {}) => ({
      id: "sub_1",
      status: o.status ?? "active",
      customer: "cus_1",
      metadata: o.userId === null ? {} : { userId: o.userId ?? A },
      items: { data: [{ price: { id: o.price ?? "price_test_pro" }, current_period_end: 1893456000 }] },
    });
    // Signed with the real Stripe helper, so the real signature verification runs.
    const deliver = (id: string, type = "customer.subscription.updated", object: object = { id: "sub_1" }, secret = "whsec_test_secret") => {
      const payload = JSON.stringify({ id, object: "event", type, data: { object } });
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
      return request(app).post("/api/v1/billing/webhook").set({ "Content-Type": "application/json", "Stripe-Signature": signature }).send(payload);
    };
    const retrieve = (sub: object) => vi.spyOn(stripe.subscriptions, "retrieve").mockResolvedValue(sub as never);

    beforeEach(async () => {
      await pool.query("TRUNCATE subscriptions, stripe_events");
      await pool.query("INSERT INTO auth.users (id) VALUES ($1) ON CONFLICT DO NOTHING", [C]);
    });
    afterEach(() => vi.restoreAllMocks());

    it("a redelivered event changes state only once", async () => {
      const get = retrieve(fakeSub());
      expect((await deliver("evt_1").expect(200)).body).toEqual({ received: true });
      expect(await subRow(A)).toMatchObject({ plan: "pro", status: "active", stripeCustomerId: "cus_1" });
      expect((await subRow(A)).currentPeriodEnd.toISOString()).toBe("2030-01-01T00:00:00.000Z");

      get.mockResolvedValue(fakeSub({ status: "canceled" }) as never);
      expect((await deliver("evt_1").expect(200)).body).toEqual({ received: true, duplicate: true });
      expect(get).toHaveBeenCalledTimes(1); // the fast path skipped Stripe
      expect(await subRow(A)).toMatchObject({ plan: "pro", status: "active" });
      expect(await eventCount()).toBe(1);

      // Two deliveries racing past the fast path: the transaction's ON CONFLICT must still stop the second.
      vi.spyOn(SubscriptionRepository.prototype, "hasEvent").mockResolvedValueOnce(false);
      expect((await deliver("evt_1").expect(200)).body).toEqual({ received: true, duplicate: true });
      expect(await subRow(A)).toMatchObject({ plan: "pro", status: "active" });
      expect(await eventCount()).toBe(1);
    });

    it("rejects a bad or missing signature with 400 and records nothing", async () => {
      const get = retrieve(fakeSub());
      await deliver("evt_bad", "customer.subscription.updated", { id: "sub_1" }, "whsec_wrong").expect(400);
      await request(app).post("/api/v1/billing/webhook").set("Content-Type", "application/json").send("{}").expect(400);
      expect(get).not.toHaveBeenCalled();
      expect(await eventCount()).toBe(0);
      expect(await subRow(A)).toBeUndefined();
    });

    it("rolls back on a DB failure (500, event not recorded) and a redelivery applies", async () => {
      const ghost = randomUUID(); // not in auth.users: the subscriptions FK fails inside the transaction
      retrieve(fakeSub({ userId: ghost }));
      vi.spyOn(console, "error").mockImplementation(() => undefined);
      await deliver("evt_rb").expect(500);
      expect(await eventCount()).toBe(0);
      expect((await pool.query("SELECT count(*)::int AS n FROM subscriptions")).rows[0].n).toBe(0);

      await pool.query("INSERT INTO auth.users (id) VALUES ($1)", [ghost]);
      expect((await deliver("evt_rb").expect(200)).body).toEqual({ received: true });
      expect(await subRow(ghost)).toMatchObject({ plan: "pro", status: "active" });
      expect(await eventCount()).toBe(1);
    });

    it("syncs current Stripe state, not the event: an old 'deleted' for a live subscription downgrades nothing", async () => {
      const get = retrieve(fakeSub());
      await deliver("evt_a", "customer.subscription.updated").expect(200);
      await deliver("evt_old", "customer.subscription.deleted").expect(200); // arrives late, subscription is still active
      expect(await subRow(A)).toMatchObject({ plan: "pro", status: "active" });

      get.mockResolvedValue(fakeSub({ status: "past_due" }) as never);
      await deliver("evt_pf", "invoice.payment_failed", { parent: { subscription_details: { subscription: "sub_1" } } }).expect(200);
      expect(await subRow(A)).toMatchObject({ plan: "pro", status: "past_due" }); // keeps Pro during retries

      get.mockResolvedValue(fakeSub({ price: "price_other" }) as never);
      await deliver("evt_price", "customer.subscription.updated").expect(200);
      expect(await subRow(A)).toMatchObject({ plan: "free", status: "active" }); // wrong price is not Pro

      get.mockResolvedValue(fakeSub({ userId: null }) as never); // no metadata: resolved by stripeCustomerId
      await deliver("evt_cus", "customer.subscription.updated").expect(200);
      expect(await subRow(A)).toMatchObject({ plan: "pro" });
    });

    it("checkout.session.completed uses client_reference_id; ignored events are 200 and not recorded", async () => {
      const get = retrieve(fakeSub({ userId: null }));
      await deliver("evt_co", "checkout.session.completed", { subscription: "sub_1", client_reference_id: B }).expect(200);
      expect(await subRow(B)).toMatchObject({ plan: "pro" });
      expect(get).toHaveBeenCalledWith("sub_1");

      await deliver("evt_ign", "charge.succeeded", { id: "ch_1" }).expect(200);
      await deliver("evt_pay", "checkout.session.completed", { subscription: null, client_reference_id: B }).expect(200);
      expect(await eventCount()).toBe(1);
    });

    it("the webhook needs no Authorization header and is not rate limited", async () => {
      retrieve(fakeSub());
      const res = await deliver("evt_open").expect(200);
      expect(res.headers).not.toHaveProperty("ratelimit-limit");
      await request(app).post("/api/v1/billing/checkout").expect(401); // the rest of /billing is protected
    });

    it.skipIf(!TEST_REDIS)("a downgrade shows up on the very next request (plan cache invalidated)", async () => {
      await proSub(A);
      const h = await auth(A);
      expect((await request(app).get("/api/v1/billing").set(h).expect(200)).headers["ratelimit-limit"]).toBe("600");
      expect(await redis.get(`plan:${A}`)).toBe("pro");

      retrieve(fakeSub({ status: "canceled" }));
      await deliver("evt_del", "customer.subscription.deleted").expect(200);
      expect(await subRow(A)).toMatchObject({ plan: "free", status: "canceled" });
      expect(await redis.exists(`plan:${A}`)).toBe(0);
      expect((await request(app).get("/api/v1/billing").set(h).expect(200)).headers["ratelimit-limit"]).toBe("60");
    });

    it("GET /billing reports plan, status, period end and usage", async () => {
      const free = await request(app).get("/api/v1/billing").set(await auth(A)).expect(200);
      expect(free.body.data).toEqual({ plan: "free", status: "none", currentPeriodEnd: null, usage: { linksThisMonth: 0, linksPerMonth: 50 } });
      await request(app).post("/api/v1/links").set(await auth(A)).send({ url: "https://example.com/u" }).expect(201);
      await proSub(C);
      const pro = await request(app).get("/api/v1/billing").set(await auth(C)).expect(200);
      expect(pro.body.data).toMatchObject({ plan: "pro", status: "active", usage: { linksThisMonth: 0, linksPerMonth: 5000 } });
      expect((await request(app).get("/api/v1/billing").set(await auth(A)).expect(200)).body.data.usage.linksThisMonth).toBe(1);
    });

    describe("quota", () => {
      const seed = (userId: string, n: number, createdAt: string) =>
        pool.query(
          `INSERT INTO urls (url, "shortCode", "ownerId", "createdAt")
           SELECT 'https://example.com/' || g, $1::text || g, $2, ${createdAt} FROM generate_series(1, $3::int) g`,
          [`${n}x${randomUUID().slice(0, 4)}`, userId, n],
        );
      const create = async (id: string) => request(app).post("/api/v1/links").set(await auth(id)).send({ url: "https://example.com/new" });

      it("402s a free user at 50 links this month, with the upgrade link", async () => {
        await seed(A, 49, "now()");
        expect((await create(A)).status).toBe(201);
        const res = await create(A);
        expect(res.status).toBe(402);
        expect(res.body.message).toBe("Monthly link limit reached (50 on the Free plan). Upgrade at http://localhost:5173/pricing");
        expect(res.body.errors).toEqual({ upgradeUrl: "http://localhost:5173/pricing" });
        expect((await pool.query(`SELECT count(*)::int AS n FROM urls WHERE "ownerId" = $1`, [A])).rows[0].n).toBe(50);
      });

      it("does not count links from before the start of the UTC month", async () => {
        const monthStart = `date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`;
        await seed(B, 50, `${monthStart} - interval '1 second'`);
        expect((await create(B)).status).toBe(201);
        await seed(B, 49, monthStart); // the first instant of the month does count
        expect((await create(B)).status).toBe(402);
      });

      it("lets a Pro user past 50 (but not past 5000)", async () => {
        await proSub(C);
        await seed(C, 50, "now()");
        expect((await create(C)).status).toBe(201);
        await seed(C, 4949, "now()");
        const res = await create(C);
        expect(res.status).toBe(402);
        expect(res.body.message).toContain("5000 on the Pro plan");
      });
    });

    describe("checkout and portal", () => {
      it("creates the customer once, then a subscription checkout session for it", async () => {
        const customers = vi.spyOn(stripe.customers, "create").mockResolvedValue({ id: "cus_new" } as never);
        const sessions = vi.spyOn(stripe.checkout.sessions, "create").mockResolvedValue({ url: "https://checkout.stripe.test/s" } as never);
        const h = { Authorization: `Bearer ${await sign(A, { email: "a@example.com" })}` };

        const res = await request(app).post("/api/v1/billing/checkout").set(h).expect(200);
        expect(res.body.data).toEqual({ url: "https://checkout.stripe.test/s" });
        expect(customers).toHaveBeenCalledWith({ email: "a@example.com", metadata: { userId: A } }, { idempotencyKey: `customer-${A}` });
        expect(sessions).toHaveBeenCalledWith({
          mode: "subscription",
          customer: "cus_new",
          line_items: [{ price: "price_test_pro", quantity: 1 }],
          client_reference_id: A,
          subscription_data: { metadata: { userId: A } },
          success_url: "http://localhost:5173/billing?checkout=success",
          cancel_url: "http://localhost:5173/billing?checkout=cancel",
        });
        expect(await subRow(A)).toMatchObject({ plan: "free", status: "none", stripeCustomerId: "cus_new" });

        await request(app).post("/api/v1/billing/checkout").set(h).expect(200);
        expect(customers).toHaveBeenCalledTimes(1);
        expect(sessions).toHaveBeenCalledTimes(2);
        expect(sessions).toHaveBeenLastCalledWith(expect.objectContaining({ customer: "cus_new" }));
      });

      it("409s when already Pro, and does not call Stripe", async () => {
        await proSub(C);
        const sessions = vi.spyOn(stripe.checkout.sessions, "create");
        const res = await request(app).post("/api/v1/billing/checkout").set(await auth(C)).expect(409);
        expect(res.body.message).toContain("billing portal");
        expect(sessions).not.toHaveBeenCalled();
      });

      it("portal: 404 without a customer, then a portal session for the customer", async () => {
        await request(app).post("/api/v1/billing/portal").set(await auth(A)).expect(404);
        await proSub(A);
        const portal = vi.spyOn(stripe.billingPortal.sessions, "create").mockResolvedValue({ url: "https://portal.stripe.test/p" } as never);
        const res = await request(app).post("/api/v1/billing/portal").set(await auth(A)).expect(200);
        expect(res.body.data).toEqual({ url: "https://portal.stripe.test/p" });
        expect(portal).toHaveBeenCalledWith({ customer: `cus_${A}`, return_url: "http://localhost:5173/billing" });
      });

      it("API keys get 403 on every billing endpoint", async () => {
        const key = (await request(app).post("/api/v1/keys").set(await auth(A)).send({ name: "ci" }).expect(201)).body.data.key;
        const h = { Authorization: `Bearer ${key}` };
        const customers = vi.spyOn(stripe.customers, "create");
        await request(app).get("/api/v1/billing").set(h).expect(403);
        await request(app).post("/api/v1/billing/checkout").set(h).expect(403);
        await request(app).post("/api/v1/billing/portal").set(h).expect(403);
        expect(customers).not.toHaveBeenCalled();
      });
    });
  });
});
