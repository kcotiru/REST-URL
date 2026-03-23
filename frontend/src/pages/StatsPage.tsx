import { useState } from 'react'
import { BarChart3, Search, RefreshCw, AlertCircle, Calendar, Clock, MousePointerClick, Hash, ExternalLink, TrendingUp } from 'lucide-react'
import { api, type UrlStats } from '../lib/api'

type Status = 'idle' | 'loading' | 'success' | 'error'

function StatCard({ icon: Icon, label, value, accent = false }: {
  icon: React.ElementType
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className={`p-5 rounded-xl border ${accent ? 'border-accent/30 bg-accent/5' : 'border-surface-border bg-surface'}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${accent ? 'text-accent' : 'text-text-muted'}`} />
        <span className="text-xs font-mono text-text-muted uppercase tracking-wider">{label}</span>
      </div>
      <div className={`font-display text-2xl font-bold ${accent ? 'text-accent' : 'text-text-primary'}`}>
        {value}
      </div>
    </div>
  )
}

function ActivityBar({ count }: { count: number }) {
  const max = Math.max(count, 1)
  const segments = 20
  const filled = Math.round((count / max) * segments)
  return (
    <div className="flex items-end gap-0.5 h-8">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all duration-500"
          style={{
            height: `${20 + Math.sin(i * 0.8) * 40 + (i < filled ? 30 : 0)}%`,
            background: i < filled ? 'rgba(0,212,170,0.6)' : 'rgba(255,255,255,0.05)',
          }}
        />
      ))}
    </div>
  )
}

export default function StatsPage() {
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [stats, setStats] = useState<UrlStats | null>(null)
  const [history, setHistory] = useState<string[]>([])

  const lookup = async (e?: React.FormEvent, overrideCode?: string) => {
    e?.preventDefault()
    const target = overrideCode ?? code.trim().replace(/^\//, '')
    if (!target) return
    setStatus('loading')
    setError('')
    try {
      const data = await api.stats(target)
      setStats(data)
      setStatus('success')
      setHistory((h) => [target, ...h.filter((c) => c !== target)].slice(0, 8))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Not found')
      setStatus('error')
      setStats(null)
    }
  }

  const fmt = (d: string) =>
    new Date(d).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const age = (d: string) => {
    const diff = Date.now() - new Date(d).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    return `${days} days ago`
  }

  return (
    <div className="min-h-screen pt-28 pb-20 px-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-10 animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/25 bg-accent/5 mb-5">
            <BarChart3 className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-mono text-accent uppercase tracking-widest">Analytics</span>
          </div>
          <h1 className="font-display text-4xl font-extrabold text-text-primary mb-2">
            URL Statistics
          </h1>
          <p className="text-text-secondary font-body">
            Enter a short code to see its access count, creation date, and redirect history.
          </p>
        </div>

        {/* Search */}
        <div className="rounded-2xl border border-surface-border bg-surface-raised p-6 mb-6 animate-fade-up stagger-1">
          <form onSubmit={lookup} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
                Short Code
              </label>
              <div className="flex gap-3">
                <div className="relative flex-1">
                  <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="mylink"
                    className="w-full pl-10 pr-4 py-3 bg-surface border border-surface-border rounded-xl 
                    text-text-primary placeholder:text-text-muted font-mono text-sm focus:outline-none 
                    focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="px-5 py-3 bg-accent text-surface rounded-xl font-semibold font-body 
                  hover:bg-accent-dim transition-all hover:scale-105 active:scale-95 disabled:opacity-60 
                  disabled:cursor-not-allowed flex items-center gap-2 glow-accent-sm"
                >
                  {status === 'loading'
                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                    : <Search className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Recent lookups */}
            {history.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-text-muted font-mono">Recent:</span>
                {history.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setCode(c); lookup(undefined, c) }}
                    className="text-xs font-mono px-2 py-1 rounded-md bg-surface border border-surface-border 
                    text-text-secondary hover:text-accent hover:border-accent/30 transition-all"
                  >
                    /{c}
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        {/* Error */}
        {status === 'error' && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/25 
          mb-6 animate-slide-in">
            <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <p className="text-sm text-rose-300 font-body">{error}</p>
          </div>
        )}

        {/* Stats result */}
        {stats && status === 'success' && (
          <div className="space-y-4 animate-fade-up">
            {/* Code header */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-surface-raised border 
            border-surface-border">
              <div>
                <div className="text-xs font-mono text-text-muted mb-1">Short Code</div>
                <code className="font-mono text-lg font-bold text-accent">/{stats.shortCode}</code>
              </div>
              <a
                href={stats.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent 
                transition-colors font-mono"
              >
                Visit origin <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={MousePointerClick} label="Total Clicks" value={stats.accessCount.toLocaleString()} accent />
              <StatCard icon={Hash} label="Code ID" value={`#${stats.id}`} />
              <StatCard icon={Calendar} label="Created" value={fmtDate(stats.createdAt)} />
              <StatCard icon={Clock} label="Age" value={age(stats.createdAt)} />
            </div>

            {/* Activity visualisation */}
            <div className="p-5 rounded-xl border border-surface-border bg-surface">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-text-muted" />
                  <span className="text-xs font-mono text-text-muted uppercase tracking-wider">Access Activity</span>
                </div>
                <span className="text-xs font-mono text-accent">{stats.accessCount} total</span>
              </div>
              <ActivityBar count={stats.accessCount} />
              <p className="text-xs text-text-muted font-mono mt-2">Relative activity visualisation based on total click count</p>
            </div>

            {/* Destination URL */}
            <div className="p-5 rounded-xl border border-surface-border bg-surface">
              <div className="text-xs font-mono text-text-muted uppercase tracking-wider mb-2">Destination URL</div>
              <p className="text-sm text-text-secondary font-body break-all leading-relaxed">{stats.url}</p>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-1 gap-3">
              {[
                { label: 'Created At', value: fmt(stats.createdAt), icon: Calendar },
                { label: 'Last Updated', value: fmt(stats.updatedAt), icon: Clock },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center gap-4 p-4 rounded-xl border border-surface-border 
                bg-surface">
                  <Icon className="w-4 h-4 text-text-muted shrink-0" />
                  <div>
                    <div className="text-xs font-mono text-text-muted mb-0.5">{label}</div>
                    <div className="text-sm font-mono text-text-primary">{value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {status === 'idle' && (
          <div className="text-center py-20 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-surface-raised border border-surface-border 
            flex items-center justify-center mx-auto mb-4">
              <BarChart3 className="w-7 h-7 text-text-muted" />
            </div>
            <p className="text-text-muted font-body text-sm">Enter a short code above to see its stats</p>
          </div>
        )}
      </div>
    </div>
  )
}
