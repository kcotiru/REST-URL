# REST URL — Frontend

The React/TypeScript frontend for the **REST URL** URL shortening service. Built with Vite, Tailwind CSS, and React Router — styled with a clean dark-gray theme built for an API-first audience.

---

## Tech Stack

| Tool | Purpose |
|---|---|
| [Vite](https://vitejs.dev/) | Build tool & dev server |
| [React 18](https://react.dev/) | UI framework |
| [TypeScript](https://www.typescriptlang.org/) | Type safety |
| [React Router v6](https://reactrouter.com/) | Client-side routing |
| [Tailwind CSS v3](https://tailwindcss.com/) | Utility-first styling |
| [Lucide React](https://lucide.dev/) | Icon library |

**Fonts (via Google Fonts):** `Syne` (display) · `DM Sans` (body) · `Space Mono` (monospace/code)

---

## Project Structure

```
frontend/
├── public/
│   └── favicon.svg
├── src/
│   ├── lib/
│   │   └── api.ts            
│   ├── components/
│   │   ├── Navbar.tsx        
│   │   └── Footer.tsx
│   └── pages/
│       ├── HomePage.tsx       
│       ├── ShortenPage.tsx  
│       └── StatsPage.tsx    
├── index.html
├── vite.config.ts            
├── tailwind.config.js
└── .env.example
```

---

## Pages

### `/` — Home
Marketing-style landing page showcasing the API's capabilities. Includes:
- Hero section with animated entry
- Full API endpoint reference table
- Live request/response code sample with copy button
- Feature grid (6 cards)
- Call-to-action

### `/shorten` — Shorten
The core tool page. Features:
- URL input with validation
- Optional custom short code toggle (3–10 alphanumeric chars, live char counter)
- Result card with one-click copy and direct link
- Session history with per-entry copy and delete

### `/stats` — Stats
Analytics lookup page. Features:
- Short code search input
- Recent lookups as quick-access chips
- Stat cards: total clicks, code ID, created date, age
- Relative activity bar visualisation
- Full timestamp display (created at, last updated)

---

## Setup

### Prerequisites
- Node.js 18+
- The [backend](../backend/README.md) running on `http://localhost:3000`

### Install & run

```bash
cd frontend
npm install
npm run dev
```

The app runs at **http://localhost:5173**.

Vite proxies all `/api/*` requests to `http://localhost:3000`, so no CORS issues in development — both servers just need to be running at the same time.

### Build for production

```bash
npm run build     # outputs to dist/
npm run preview   # preview the production build locally
```

In production, point your web server (Nginx, Caddy, etc.) to serve the `dist/` folder and proxy `/api` to the backend.

---

## Environment

```bash
cp .env.example .env
```

```env
# Only needed if you change the backend port
VITE_API_URL=http://localhost:3000
```

The Vite proxy is configured in `vite.config.ts` and handles API routing automatically in development — you typically don't need to change anything.

---

## API Integration

All backend communication lives in `src/lib/api.ts`. The client is a thin typed wrapper around `fetch`:

```ts
// Shorten a URL (with optional custom code)
const result = await api.shorten('https://example.com', 'mylink')

// Look up metadata
const record = await api.get('mylink')

// Get stats
const stats = await api.stats('mylink')

// Update destination
await api.update('mylink', 'https://new-destination.com')

// Delete
await api.delete('mylink')
```

All methods throw an `Error` with the server's `message` on non-2xx responses.

---

## Design System

Colours are defined as Tailwind custom tokens in `tailwind.config.js`:

| Token | Hex | Usage |
|---|---|---|
| `surface` | `#1e2025` | Page background |
| `surface-raised` | `#252830` | Cards, navbar |
| `surface-high` | `#2d3038` | Hover states |
| `surface-border` | `#363a45` | Borders |
| `accent` | `#00d4aa` | Primary actions, highlights |
| `text-primary` | `#f0f2f5` | Headings, labels |
| `text-secondary` | `#9aa0b0` | Body text |
| `text-muted` | `#5d6478` | Placeholders, captions |
