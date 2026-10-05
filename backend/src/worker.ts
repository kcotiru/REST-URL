import dotenv from "dotenv";
dotenv.config();

import type { Pool } from "pg";
import type Redis from "ioredis";
import pool from "./config/database";
import redis from "./config/redis";
import { RAW_CLICK_DAYS } from "./config/plans";

const QUEUE = "clicks:queue";
const PROCESSING = "clicks:processing";
const BATCH_SIZE = 1000;
const FLUSH_INTERVAL_MS = 2000;
const PURGE_INTERVAL_MS = 60 * 60_000;

// Atomically moves up to ARGV[1] events queue -> processing (oldest first), but only when the
// processing list is empty: leftovers from a crashed flush are re-processed before anything new.
// ponytail: assumes a single worker (one shared processing list), for several workers use a processing key per worker.
const MOVE = `
if redis.call('LLEN', KEYS[2]) == 0 then
  for i = 1, tonumber(ARGV[1]) do
    if not redis.call('LMOVE', KEYS[1], KEYS[2], 'RIGHT', 'LEFT') then break end
  end
end
`;

// One statement per flush; the events come in as one jsonb array (no 65k bind-param limit).
// The JOIN drops events whose link was deleted before the flush instead of failing the batch on the FK.
// ON CONFLICT + RETURNING means only rows actually inserted are counted, so a batch replayed after a crash
// between COMMIT and DEL is a no-op. All data-modifying CTEs run even if the final statement ignores them.
// Rollup days are UTC. '' is the "unknown" sentinel (see 004_clicks.sql).
const WRITE = `
WITH ins AS (
  INSERT INTO clicks (id, "urlId", "clickedAt", "referrerHost", country, device)
  SELECT e.i, e.u, to_timestamp(e.t / 1000.0), e.r, e.c, e.d
  FROM jsonb_to_recordset($1::jsonb) AS e(i uuid, t bigint, u integer, r text, c text, d text)
  JOIN urls ON urls.id = e.u
  ON CONFLICT (id) DO NOTHING
  RETURNING "urlId", "clickedAt", "referrerHost", country, device
), bump AS (
  UPDATE urls SET "accessCount" = "accessCount" + n.n
  FROM (SELECT "urlId", count(*)::int AS n FROM ins GROUP BY 1) n
  WHERE urls.id = n."urlId"
)
INSERT INTO clicks_daily ("urlId", day, country, "referrerHost", device, count)
SELECT "urlId", ("clickedAt" AT TIME ZONE 'UTC')::date, coalesce(country, ''), coalesce("referrerHost", ''), device, count(*)
FROM ins
GROUP BY 1, 2, 3, 4, 5
ON CONFLICT ("urlId", day, country, "referrerHost", device) DO UPDATE SET count = clicks_daily.count + EXCLUDED.count`;

// Returns the number of events taken off the queue. A single statement is its own transaction, and
// the processing list is only deleted after it commits.
export const flushOnce = async (redis: Redis, pool: Pool): Promise<number> => {
  await redis.eval(MOVE, 2, QUEUE, PROCESSING, BATCH_SIZE);
  const raw = await redis.lrange(PROCESSING, 0, -1);
  if (!raw.length) return 0;

  const events: unknown[] = [];
  for (const s of raw) {
    try {
      events.push(JSON.parse(s));
    } catch {
      console.error("Skipping malformed click event:", s.slice(0, 200));
    }
  }
  if (events.length) await pool.query(WRITE, [JSON.stringify(events)]);
  await redis.del(PROCESSING);
  return raw.length;
};

const run = async (): Promise<void> => {
  let stopping = false;
  const stop = (signal: string) => {
    console.log(`${signal} received, finishing the current flush...`);
    stopping = true;
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));

  let lastPurge = 0;
  console.log("Click worker started");
  while (!stopping) {
    try {
      const n = await flushOnce(redis, pool);
      if (Date.now() - lastPurge >= PURGE_INTERVAL_MS) {
        // ponytail: one unbatched DELETE, batch it or partition clicks by month at scale. Rollups are kept.
        await pool.query(`DELETE FROM clicks WHERE "clickedAt" < now() - make_interval(days => $1)`, [RAW_CLICK_DAYS]);
        lastPurge = Date.now();
      }
      if (n >= BATCH_SIZE) continue; // backlog: drain without waiting
    } catch (err) {
      // A bad flush is retried next tick: the events stay in the processing list.
      console.error("Click flush failed, retrying:", err);
    }
    await new Promise((r) => setTimeout(r, FLUSH_INTERVAL_MS));
  }

  await redis.quit().catch(() => redis.disconnect());
  await pool.end();
  console.log("Click worker stopped");
};

if (require.main === module) {
  run().catch((err) => {
    console.error("Fatal worker error:", err);
    process.exit(1);
  });
}
