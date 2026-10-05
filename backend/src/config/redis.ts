import Redis from "ioredis";

// Fail fast when Redis is down: no offline queue and one retry per command, so callers
// get a rejection immediately (and fall open) instead of hanging. ioredis keeps
// reconnecting in the background.
export const createRedis = (url: string): Redis => {
  const client = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2_000,
  });
  // Without a listener an "error" event would crash the process.
  client.on("error", (err) => console.error("Redis error:", err.message));
  return client;
};

const redis = createRedis(process.env.REDIS_URL || "redis://localhost:6379");

export default redis;
