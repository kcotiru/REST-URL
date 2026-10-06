# REST URL - frontend

React 18 + Vite + TypeScript + Tailwind app: landing, pricing, sign-in (Supabase), dashboard, link analytics, API keys and billing. See the [root README](../README.md); setup and env vars: [docs/setup.md](../docs/setup.md).

Vite proxies `/api/*` to the backend on `http://localhost:3000` in development. All backend calls live in `src/lib/api.ts`; Supabase auth in `src/lib/supabase.ts`.

| Script | |
|---|---|
| `npm run dev` | dev server on http://localhost:5173 |
| `npm run build` | typecheck, then build to `dist/` |
| `npm run preview` | serve the production build locally |
