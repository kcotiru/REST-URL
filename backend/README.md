# REST URL - backend

Express + TypeScript API, click worker, SQL migrations (`db/migrations`), tests and benchmark. See the [root README](../README.md); setup and env vars: [docs/setup.md](../docs/setup.md), API: [docs/api.md](../docs/api.md), design: [docs/design.md](../docs/design.md).

```
src/config/        pg pool, Redis client, Stripe client, plan limits
src/controllers/   HTTP layer          src/services/   business logic
src/repositories/  SQL                 src/middleware/ auth, rate limiter, validation, errors
src/app.ts         app wiring          src/index.ts    server        src/worker.ts   click worker
test/              Vitest + supertest  bench/          autocannon redirect benchmark
```

| Script | |
|---|---|
| `npm run dev` | API with hot reload |
| `npm run worker` | click worker with hot reload (needs Redis) |
| `npm run build` / `npm start` / `npm run start:worker` | production build and run |
| `npm test` | test suite (needs `TEST_DATABASE_URL` and `TEST_REDIS_URL`, see [docs/setup.md](../docs/setup.md)) |
| `npm run typecheck` | `tsc` on `src`, then on `src` + `test` |
| `npm run bench` | redirect benchmark (see [docs/design.md](../docs/design.md)) |
