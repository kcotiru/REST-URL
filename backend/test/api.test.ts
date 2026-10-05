import { readFileSync } from "node:fs";
import { createServer, Server } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { SignJWT, exportJWK, generateKeyPair, KeyLike } from "jose";
import type { Pool } from "pg";
import express from "express";
import type { Application } from "express";
import type Redis from "ioredis";
import { rateLimit } from "../src/middleware/rateLimit";
import { errorHandler } from "../src/middleware/errorHandler";

const TEST_DB = process.env.TEST_DATABASE_URL;
const TEST_REDIS = process.env.TEST_REDIS_URL;
const migration = (f: string) => readFileSync(path.join(__dirname, "../db/migrations", f), "utf8");

let jwksServer: Server;
let origin: string;
let privateKey: KeyLike;
let app: Application;
let pool: Pool;
let redis: Redis;

const ready = (c: Redis) => (c.status === "ready" ? undefined : new Promise((r) => c.once("ready", r)));

const sign = (sub: string, opts: { key?: KeyLike; aud?: string } = {}) =>
  new SignJWT({})
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

  app = (await import("../src/app")).default();
  pool = (await import("../src/config/database")).default;
  redis = (await import("../src/config/redis")).default;
  if (TEST_REDIS) await ready(redis);

  if (TEST_DB) {
    await pool.query("CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);");
    await pool.query(migration("001_init.sql"));
    await pool.query(migration("002_url_owner.sql"));
    await pool.query(migration("003_api_keys.sql"));
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
    await pool.query("TRUNCATE urls, api_keys");
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
      expect(await redis.get(`url:${code}`)).toBe("https://example.com/a");

      await request(app).put(`/api/v1/links/${code}`).set(h).send({ url: "https://example.com/b" }).expect(200);
      expect(await redis.exists(`url:${code}`)).toBe(0);
      await request(app).get(`/${code}`).expect(302).expect("Location", "https://example.com/b");

      await request(app).delete(`/api/v1/links/${code}`).set(h).expect(204);
      await request(app).get(`/${code}`).expect(404);
    });

    it("API requests carry the free-plan rate limit headers", async () => {
      const res = await request(app).post("/api/v1/links").set(await auth(A)).send({ url: "https://example.com/rl" }).expect(201);
      expect(res.headers["ratelimit-limit"]).toBe("60");
      expect(res.headers["ratelimit-remaining"]).toBe("59");
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
});
