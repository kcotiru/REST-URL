import { useState } from 'react'
import { Link2, Zap, Copy, Check, ExternalLink, RefreshCw, Trash2, AlertCircle, Shuffle } from 'lucide-react'
import { api, type UrlRecord } from '../lib/api'

type Status = 'idle' | 'loading' | 'success' | 'error'

export default function ShortenPage() {
  const [url, setUrl] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const [result, setResult] = useState<UrlRecord | null>(null)
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<UrlRecord[]>([])

  const shortUrl = result ? `${window.location.origin}/${result.shortCode}` : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) return
    setStatus('loading')
    setError('')
    try {
      const data = await api.shorten(url.trim(), useCustom && customCode ? customCode : undefined)
      setResult(data)
      setHistory((h) => [data, ...h.filter((x) => x.shortCode !== data.shortCode)])
      setStatus('success')
      setUrl('')
      setCustomCode('')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const reset = () => {
    setResult(null)
    setStatus('idle')
    setError('')
  }

  const deleteEntry = async (code: string) => {
    try {
      await api.delete(code)
      setHistory((h) => h.filter((x) => x.shortCode !== code))
      if (result?.shortCode === code) reset()
    } catch { /* silent */ }
  }

  return (
    <div className="min-h-screen pt-28 pb-20 px-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-10 animate-fade-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-accent/25 bg-accent/5 mb-5">
            <Link2 className="w-3.5 h-3.5 text-accent" />
            <span className="text-xs font-mono text-accent uppercase tracking-widest">URL Shortener</span>
          </div>
          <h1 className="font-display text-4xl font-extrabold text-text-primary mb-2">
            Shorten a URL
          </h1>
          <p className="text-text-secondary font-body">
            Paste your long URL below. Optionally define a custom short code (3–10 chars, alphanumeric).
          </p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl border border-surface-border bg-surface-raised p-6 mb-6 animate-fade-up stagger-1">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* URL input */}
            <div>
              <label className="block text-xs font-mono text-text-muted uppercase tracking-wider mb-2">
                Destination URL
              </label>
              <div className="relative">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://your-very-long-url.com/goes/here"
                  required
                  className="w-full pl-10 pr-4 py-3 bg-surface border border-surface-border rounded-xl 
                  text-text-primary placeholder:text-text-muted font-body text-sm focus:outline-none 
                  focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                />
              </div>
            </div>

            {/* Custom code toggle */}
            <div>
              <button
                type="button"
                onClick={() => setUseCustom(!useCustom)}
                className="flex items-center gap-2 text-sm text-text-secondary hover:text-accent 
                transition-colors font-body"
              >
                <div className={`w-4 h-4 rounded border transition-all flex items-center justify-center 
                  ${useCustom ? 'bg-accent border-accent' : 'border-surface-border'}`}
                  >
                  {useCustom && <Check className="w-2.5 h-2.5 text-surface" />}
                </div>
                Use a custom short code
                <Shuffle className="w-3.5 h-3.5 text-text-muted" />
              </button>

              {useCustom && (
                <div className="mt-3 animate-slide-in">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono 
                    text-text-muted pointer-events-none"
                    >
                      {window.location.host}/
                    </span>
                    <input
                      type="text"
                      value={customCode}
                      onChange={(e) => setCustomCode(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
                      placeholder="mylink"
                      minLength={3}
                      maxLength={10}
                      className="w-full pl-[calc(0.875rem+6ch+0.5rem)] pr-4 py-3 bg-surface border 
                      border-surface-border rounded-xl text-text-primary placeholder:text-text-muted 
                      font-mono text-sm focus:outline-none focus:border-accent/50 focus:ring-1 
                      focus:ring-accent/20 transition-all"
                      style={{ paddingLeft: `${window.location.host.length * 7.5 + 14 + 8}px` }}
                    />
                  </div>
                  <p className="text-xs text-text-muted font-mono mt-1.5">
                    3–10 characters · alphanumeric only · {customCode.length}/10
                  </p>
                </div>
              )}
            </div>

            {/* Error */}
            {status === 'error' && (
              <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border 
              border-rose-500/25 animate-slide-in"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <p className="text-sm text-rose-300 font-body">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={status === 'loading'}
              className="w-full py-3.5 bg-accent text-surface rounded-xl font-semibold font-body 
              hover:bg-accent-dim transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 
              disabled:cursor-not-allowed glow-accent-sm flex items-center justify-center gap-2"
            >
              {status === 'loading' ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> Shortening...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" /> Shorten URL
                </>
              )}
            </button>
          </form>
        </div>

        {/* Result card */}
        {result && status === 'success' && (
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 mb-6 animate-fade-up glow-accent-sm">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-mono text-accent uppercase tracking-widest">Short URL Created</span>
              <button onClick={reset} className="text-xs text-text-muted hover:text-text-secondary font-mono 
              transition-colors">
                + New
              </button>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface border border-surface-border mb-3">
              <code className="flex-1 font-mono text-sm text-accent break-all">{shortUrl}</code>
              <button
                onClick={() => copy(shortUrl)}
                className="shrink-0 p-2 rounded-lg hover:bg-surface-high transition-colors text-text-muted 
                hover:text-accent"
              >
                {copied ? <Check className="w-4 h-4 text-accent" /> : <Copy className="w-4 h-4" />}
              </button>
              <a
                href={shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-2 rounded-lg hover:bg-surface-high transition-colors text-text-muted 
                hover:text-accent"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-surface border border-surface-border">
                <div className="text-text-muted mb-1">Short Code</div>
                <div className="text-text-primary">{result.shortCode}</div>
              </div>
              <div className="p-3 rounded-lg bg-surface border border-surface-border">
                <div className="text-text-muted mb-1">Created</div>
                <div className="text-text-primary">{new Date(result.createdAt).toLocaleDateString()}</div>
              </div>
            </div>

            <div className="mt-3 p-3 rounded-lg bg-surface border border-surface-border text-xs font-mono">
              <div className="text-text-muted mb-1">Original URL</div>
              <div className="text-text-secondary break-all">{result.url}</div>
            </div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="animate-fade-up stagger-2">
            <h2 className="font-display text-sm font-semibold text-text-muted uppercase tracking-widest mb-3">
              Session History
            </h2>
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry.shortCode}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-surface-raised border 
                  border-surface-border hover:border-surface-high transition-all group"
                >
                  <code className="font-mono text-xs text-accent bg-accent/10 px-2 py-1 rounded-md shrink-0">
                    /{entry.shortCode}
                  </code>
                  <span className="text-sm text-text-secondary font-body truncate flex-1">{entry.url}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => copy(`${window.location.origin}/${entry.shortCode}`)}
                      className="p-1.5 rounded-lg hover:bg-surface-high text-text-muted hover:text-accent transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteEntry(entry.shortCode)}
                      className="p-1.5 rounded-lg hover:bg-rose-500/10 text-text-muted hover:text-rose-400 
                      transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
