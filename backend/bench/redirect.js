// Redirect benchmark: `npm run bench`. See "Benchmark" in the root README.
//
// Needs a running backend (BENCH_URL, default http://localhost:3000) wired to a Postgres seeded with:
//   cached0001            one link (the CACHED scenario hits only this)
//   k0000001..k<N>        N links for the measured UNCACHED run, one distinct code per request
//   w0000001..w<M>        M links used only for warmup, so they never pollute the measured range
// and REDIS_URL set to the same Redis the backend uses. That Redis DB is FLUSHED before each scenario.
// Run the backend with REDIRECT_LIMIT_PER_MIN set high, or the per-IP limiter answers 429.
const autocannon = require("autocannon");
const Redis = require("ioredis");

const BASE = process.env.BENCH_URL || "http://localhost:3000";
const SECONDS = Number(process.env.BENCH_SECONDS) || 10;
const WARMUP_SECONDS = Number(process.env.BENCH_WARMUP_SECONDS) || 3;
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS) || 50;
const ROUNDS = Number(process.env.BENCH_ROUNDS) || 2;
if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required (that Redis DB is flushed)");
const redis = new Redis(process.env.REDIS_URL);

const code = (prefix, n) => `${prefix}${String(n).padStart(7, "0")}`;
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

// Rotating codes: each request gets the next one, so none repeats within a run.
const run = (title, duration, nextPath) => {
  const times = [];
  const instance = autocannon({
    url: BASE,
    connections: CONNECTIONS,
    duration,
    title,
    requests: [{ setupRequest: (req) => ({ ...req, path: nextPath() }) }],
  });
  instance.on("response", (_client, _status, _bytes, ms) => times.push(ms));
  return new Promise((resolve, reject) => {
    instance.on("done", (r) => resolve({ r, times }));
    instance.on("error", reject);
  });
};

const urlKeys = async () => {
  let n = 0;
  const stream = redis.scanStream({ match: "url:k*", count: 10_000 });
  for await (const keys of stream) n += keys.length;
  return n;
};

const scenarios = {
  cached: async () => {
    await redis.flushdb();
    await run("warmup", WARMUP_SECONDS, () => "/cached0001"); // first request fills the cache
    return run("cached", SECONDS, () => "/cached0001");
  },
  uncached: async () => {
    await redis.flushdb();
    let w = 0;
    await run("warmup", WARMUP_SECONDS, () => `/${code("w", ++w)}`);
    let k = 0;
    const res = await run("uncached", SECONDS, () => `/${code("k", ++k)}`);
    // Every measured request used a distinct code, so each was a cache miss and left one url:k* key behind:
    // keys ~= responses means no code was hit twice (the few in flight at the end never get cached).
    return { ...res, misses: await urlKeys(), codesIssued: k };
  },
};

(async () => {
  for (const name of Object.keys(scenarios)) {
    for (let round = 1; round <= ROUNDS; round++) {
      const { r, times, misses, codesIssued } = await scenarios[name]();
      const sorted = times.slice().sort((a, b) => a - b);
      const status = Object.fromEntries(Object.entries(r.statusCodeStats).map(([c, s]) => [c, s.count]));
      console.log(
        JSON.stringify({
          scenario: name, round, connections: CONNECTIONS, seconds: SECONDS,
          requests: r.requests.total, reqPerSec: Math.round(r.requests.total / r.duration),
          // Exact percentiles from per-response timings (autocannon's own histogram has 1 ms buckets and no p95).
          latencyMs: { p50: pct(sorted, 50), p95: pct(sorted, 95), p99: pct(sorted, 99), max: sorted[sorted.length - 1] },
          autocannonLatencyMs: { p50: r.latency.p50, p97_5: r.latency.p97_5, p99: r.latency.p99 },
          status, errors: r.errors, timeouts: r.timeouts,
          ...(name === "uncached" ? { codesIssued, urlKeysInRedis: misses, missRatio: Number((misses / times.length).toFixed(4)) } : {}),
        }),
      );
    }
  }
  redis.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
