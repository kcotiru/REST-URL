import { Link } from 'react-router-dom'
import {
  Zap, ArrowRight, Link2, BarChart3, Pencil, Trash2,
  Lock, Globe, Timer, ChevronRight, Terminal, Copy
} from 'lucide-react'
import { useState } from 'react'

const endpoints = [
  { method: 'POST', path: '/shorten', desc: 'Create a short URL', color: 'text-emerald-400 bg-emerald-400/10' },
  { method: 'GET', path: '/shorten/:code', desc: 'Retrieve URL metadata', color: 'text-sky-400 bg-sky-400/10' },
  { method: 'PUT', path: '/shorten/:code', desc: 'Update destination URL', color: 'text-amber-400 bg-amber-400/10' },
  { method: 'DELETE', path: '/shorten/:code', desc: 'Remove a short URL', color: 'text-rose-400 bg-rose-400/10' },
  { method: 'GET', path: '/shorten/:code/stats', desc: 'Access counts & timestamps', color: 'text-sky-400 bg-sky-400/10' },
]

const features = [
  {
    icon: Link2,
    title: 'Custom Short Codes',
    desc: 'Define your own memorable slug (3–10 alphanumeric chars) or let the API generate one.',
  },
  {
    icon: BarChart3,
    title: 'Access Analytics',
    desc: 'Track every redirect. Get access counts, creation dates, and update timestamps per code.',
  },
  {
    icon: Pencil,
    title: 'Mutable Destinations',
    desc: 'Update where a short code points at any time — without changing the short URL itself.',
  },
  {
    icon: Trash2,
    title: 'Full CRUD Control',
    desc: 'Create, read, update and delete short URLs programmatically through a clean REST interface.',
  },
  {
    icon: Lock,
    title: 'Input Validation',
    desc: 'All inputs are validated with Zod. Invalid URLs and malformed codes get clear 400 errors.',
  },
  {
    icon: Timer,
    title: 'O(1) Lookups',
    desc: 'PostgreSQL index on shortCode ensures constant-time redirects regardless of table size.',
  },
]

const sampleResponse = `{
  "status": "success",
  "data": {
    "id": 42,
    "url": "https://example.com/very/long/path",
    "shortCode": "mylink",
    "createdAt": "2024-06-01T08:00:00.000Z",
    "updatedAt": "2024-06-01T08:00:00.000Z"
  }
}`

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors font-mono"
    >
      <Copy className="w-3 h-3" />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Hero ── */}
      <section className="relative pt-36 pb-28 px-6 overflow-hidden grid-bg noise-bg">
        {/* Radial glow */}
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] 
        rounded-full bg-accent/5 blur-[100px] pointer-events-none" 
        />

        <div className="relative max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/25 
          bg-accent/5 mb-8 animate-fade-in"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse-slow" />
            <span className="text-xs font-mono text-accent tracking-widest uppercase">REST API Service</span>
          </div>

          <h1 className="font-display text-6xl md:text-7xl font-extrabold leading-[1.05] tracking-tight mb-6 
          opacity-0-init animate-fade-up stagger-1"
          >
            URL Shortening
            <br />
            <span className="text-gradient">Built for Developers</span>
          </h1>

          <p className="font-body text-text-secondary text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10 
          opacity-0-init animate-fade-up stagger-2"
          >
            A clean, fast REST API to shorten URLs, track access stats, and manage links programmatically.
            No signup required. Just hit the endpoint.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap opacity-0-init animate-fade-up stagger-3">
            <Link
              to="/shorten"
              className="flex items-center gap-2 px-6 py-3 bg-accent text-surface rounded-xl font-medium 
              hover:bg-accent-dim transition-all hover:scale-105 active:scale-95 glow-accent-sm font-body"
            >
              Try It Now <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/stats"
              className="flex items-center gap-2 px-6 py-3 bg-surface-high border border-surface-border 
              text-text-primary rounded-xl font-medium hover:border-accent/30 transition-all font-body"
            >
              View Stats <BarChart3 className="w-4 h-4" />
            </Link>
          </div>

          {/* Pill stats */}
          <div className="flex items-center justify-center gap-8 mt-14 flex-wrap opacity-0-init animate-fade-up 
          stagger-4"
          >
            {[['5', 'Endpoints'], ['O(1)', 'Lookups'], ['10', 'Char limit'], ['Supabase', 'Powered']].map(([val, lbl]) => (
              <div key={lbl} className="text-center">
                <div className="font-display font-bold text-2xl text-accent">{val}</div>
                <div className="text-xs text-text-muted font-mono uppercase tracking-wider mt-0.5">{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── API Endpoints reference ── */}
      <section className="py-24 px-6 bg-surface-raised">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-3 mb-3">
            <Terminal className="w-5 h-5 text-accent" />
            <span className="font-mono text-xs text-accent uppercase tracking-widest">API Reference</span>
          </div>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-text-primary mb-12">
            Five endpoints. Full control.
          </h2>

          <div className="space-y-2">
            {endpoints.map(({ method, path, desc, color }) => (
              <div
                key={path + method}
                className="flex items-center gap-4 p-4 rounded-xl bg-surface border border-surface-border 
                hover:border-surface-high transition-all group cursor-default"
              >
                <span className={`font-mono text-xs font-bold px-2.5 py-1 rounded-md min-w-[60px] text-center ${color}`}>
                  {method}
                </span>
                <code className="font-mono text-sm text-text-primary flex-1">{path}</code>
                <span className="text-sm text-text-secondary hidden sm:block group-hover:text-text-primary transition-colors">{desc}</span>
                <ChevronRight className="w-4 h-4 text-text-muted group-hover:text-accent transition-colors ml-auto" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Code sample ── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="font-mono text-xs text-accent uppercase tracking-widest">Example</span>
            <h2 className="font-display text-3xl font-bold text-text-primary mt-3 mb-5">
              One request.<br />Your link, shortened.
            </h2>
            <p className="text-text-secondary font-body leading-relaxed mb-6">
              POST a URL — optionally with a custom code — and get back a structured JSON response with your short code, timestamps, and ID.
            </p>
            <Link to="/shorten" className="inline-flex items-center gap-2 text-accent text-sm font-medium hover:gap-3 
            transition-all font-body"
            >
              Open the shortener <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="rounded-2xl border border-surface-border bg-surface-raised overflow-hidden">
            {/* Request */}
            <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono bg-emerald-400/10 text-emerald-400 px-2 py-0.5 rounded">POST</span>
                <span className="text-xs font-mono text-text-muted">/shorten</span>
              </div>
              <CopyButton text={`{"url":"https://example.com/very/long/path","customCode":"mylink"}`} />
            </div>
            <pre className="px-4 py-4 text-xs font-mono text-text-secondary border-b border-surface-border 
            overflow-x-auto"
            >
              {`{
                "url": "https://example.com/very/long/path",
                "customCode": "mylink"
              }`}
            </pre>

            {/* Response */}
            <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-xs font-mono text-text-muted">201 Created</span>
              </div>
              <CopyButton text={sampleResponse} />
            </div>
            <pre className="px-4 py-4 text-xs font-mono text-text-secondary overflow-x-auto leading-relaxed">
              {sampleResponse}
            </pre>
          </div>
        </div>
      </section>

      {/* ── Features grid ── */}
      <section className="py-24 px-6 bg-surface-raised border-y border-surface-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <span className="font-mono text-xs text-accent uppercase tracking-widest">Features</span>
            <h2 className="font-display text-3xl md:text-4xl font-bold text-text-primary mt-3">
              Everything you need in a URL shortener
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map(({ icon: Icon, title, desc }, i) => (
              <div
                key={title}
                className="p-6 rounded-2xl bg-surface border border-surface-border hover:border-accent/25 
                transition-all group"
                style={{ animationDelay: `${i * 0.08}s` }}
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 border border-accent/20 flex items-center 
                justify-center mb-4 group-hover:bg-accent/15 transition-colors"
                >
                  <Icon className="w-5 h-5 text-accent" />
                </div>
                <h3 className="font-display font-semibold text-text-primary mb-2">{title}</h3>
                <p className="text-sm text-text-secondary font-body leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-28 px-6 text-center relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-50" />
        <div className="relative max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full border border-surface-border 
          bg-surface-raised"
          >
            <Globe className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-mono text-text-muted">Supabase-powered PostgreSQL</span>
          </div>
          <h2 className="font-display text-4xl md:text-5xl font-extrabold text-text-primary mb-5 leading-tight">
            Ready to shorten<br />
            <span className="text-gradient">your first URL?</span>
          </h2>
          <p className="text-text-secondary font-body mb-10">
            Start using the REST URL API in seconds. No auth required — just call the endpoint.
          </p>
          <Link
            to="/shorten"
            className="inline-flex items-center gap-2 px-8 py-4 bg-accent text-surface rounded-xl font-semibold 
            text-lg hover:bg-accent-dim transition-all hover:scale-105 active:scale-95 glow-accent font-body"
          >
            Start Shortening <Zap className="w-5 h-5" />
          </Link>
        </div>
      </section>
    </div>
  )
}
