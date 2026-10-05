import { readFileSync } from "node:fs";
import { createServer, Server } from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { SignJWT, exportJWK, generateKeyPair, KeyLike } from "jose";
import type { Pool } from "pg";
import type { Application } from "express";

const TEST_DB = process.env.TEST_DATABASE_URL;
const migration = (f: string) => readFileSync(path.join(__dirname, "../db/migrations", f), "utf8");

let jwksServer: Server;
let origin: string;
let privateKey: KeyLike;
let app: Application;
let pool: Pool;

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

  app = (await import("../src/app")).default();
  pool = (await import("../src/config/database")).default;

  if (TEST_DB) {
    await pool.query("CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);");
    await pool.query(migration("001_init.sql"));
    await pool.query(migration("002_url_owner.sql"));
  }
});

afterAll(async () => {
  jwksServer.close();
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

describe.skipIf(!TEST_DB)("with database", () => {
  const A = randomUUID();
  const B = randomUUID();
  const auth = async (id: string) => ({ Authorization: `Bearer ${await sign(id)}` });

  beforeEach(async () => {
    await pool.query("TRUNCATE urls");
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
});
