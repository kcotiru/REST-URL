import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, ExternalLink, Pencil, RefreshCw, Trash2, Zap } from 'lucide-react'
import { api, ApiError, errorMessages, SHORT_BASE, type UrlStats } from '../lib/api'
import {
  ConfirmButton, CopyButton, ErrorAlert, PageShell, cardClass, fmtDate, ghostBtn, inputClass, labelClass, primaryBtn,
} from '../components/ui'

function LinkRow({ link, onChange, onDelete }: {
  link: UrlStats
  onChange: (l: UrlStats) => void
  onDelete: (code: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [url, setUrl] = useState(link.url)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string[]>([])
  const short = `${SHORT_BASE}/${link.shortCode}`

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError([])
    try {
      const updated = await api.update(link.shortCode, url.trim())
      onChange({ ...link, ...updated })
      setEditing(false)
    } catch (err) {
      setError(errorMessages(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError([])
    try {
      await api.delete(link.shortCode)
      onDelete(link.shortCode)
    } catch (err) {
      setError(errorMessages(err))
      setBusy(false)
    }
  }

  return (
    <li className="p-4 rounded-xl bg-surface-raised border border-surface-border">
      <div className="flex items-center gap-2 flex-wrap">
        <code className="font-mono text-sm text-accent break-all">{short}</code>
        <CopyButton text={short} label={`Copy short URL ${short}`} />
        <a href={short} target="_blank" rel="noopener noreferrer" aria-label={`Open ${short} in a new tab`}
          className="shrink-0 p-2 rounded-lg hover:bg-surface-high text-text-muted hover:text-accent transition-colors
          focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
          <ExternalLink className="w-4 h-4" aria-hidden="true" />
        </a>
        <span className="ml-auto text-xs font-mono text-text-muted">
          <span className="text-text-primary">{link.accessCount.toLocaleString()}</span> clicks · {fmtDate(link.createdAt)}
        </span>
      </div>

      {editing ? (
        <form onSubmit={save} className="mt-3 flex gap-2 flex-wrap">
          <label htmlFor={`edit-${link.shortCode}`} className="sr-only">Destination URL for {link.shortCode}</label>
          <input id={`edit-${link.shortCode}`} type="url" required value={url} autoFocus
            onChange={(e) => setUrl(e.target.value)} className={`${inputClass} flex-1 min-w-[14rem]`} />
          <button type="submit" disabled={busy} className={primaryBtn.replace('px-5 py-3', 'px-4 py-2 text-sm')}>Save</button>
          <button type="button" onClick={() => { setEditing(false); setUrl(link.url); setError([]) }} className={ghostBtn}>Cancel</button>
        </form>
      ) : (
        <p className="mt-2 text-sm text-text-secondary font-body break-all">{link.url}</p>
      )}

      {error.length > 0 && <div className="mt-3"><ErrorAlert>{error.join(' ')}</ErrorAlert></div>}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} aria-label={`Edit destination of ${link.shortCode}`}
            className={`${ghostBtn} inline-flex items-center gap-1.5`}>
            <Pencil className="w-3 h-3" aria-hidden="true" /> Edit
          </button>
        )}
        <Link to={`/links/${link.shortCode}`} aria-label={`Analytics for ${link.shortCode}`}
          className={`${ghostBtn} inline-flex items-center gap-1.5`}>
          <BarChart3 className="w-3 h-3" aria-hidden="true" /> Analytics
        </Link>
        <ConfirmButton label="Delete" confirmLabel="Confirm delete?" ariaLabel={`Delete ${link.shortCode}`} busy={busy} onConfirm={remove}>
          <Trash2 className="w-3 h-3" aria-hidden="true" />
        </ConfirmButton>
      </div>
    </li>
  )
}

export default function DashboardPage() {
  const [links, setLinks] = useState<UrlStats[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [url, setUrl] = useState('')
  const [customCode, setCustomCode] = useState('')
  const [creating, setCreating] = useState(false)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [quota, setQuota] = useState<string | null>(null)

  useEffect(() => {
    api.listLinks().then(setLinks).catch((e) => setLoadError(e.message))
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setFormErrors([])
    setQuota(null)
    try {
      const made = await api.shorten(url.trim(), customCode.trim() || undefined)
      setLinks((l) => [{ ...made, accessCount: 0 }, ...(l ?? [])])
      setUrl('')
      setCustomCode('')
    } catch (err) {
      // Quota errors carry errors.upgradeUrl; the in-app pricing page is the same destination.
      if (err instanceof ApiError && err.status === 402) setQuota(err.message)
      else setFormErrors(errorMessages(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <PageShell title="Dashboard" intro="Create short links and see how they perform.">
      {/* noValidate: let the backend's 400 messages show instead of the browser's tooltip. */}
      <form onSubmit={create} className={`${cardClass} mb-8 space-y-4`} noValidate>
        <div>
          <label htmlFor="new-url" className={labelClass}>Destination URL</label>
          <input id="new-url" type="url" required value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://your-very-long-url.com/goes/here" className={inputClass} />
        </div>
        <div>
          <label htmlFor="new-code" className={labelClass}>Custom code (optional)</label>
          <input id="new-code" type="text" value={customCode} maxLength={10} aria-describedby="code-hint"
            onChange={(e) => setCustomCode(e.target.value.replace(/[^A-Za-z0-9]/g, ''))}
            placeholder="mylink" className={`${inputClass} font-mono`} />
          <p id="code-hint" className="text-xs text-text-muted font-mono mt-1.5">
            3-10 characters, letters and numbers only. Leave empty for a random code.
          </p>
        </div>

        {formErrors.length > 0 && <ErrorAlert>{formErrors.map((m) => <p key={m}>{m}</p>)}</ErrorAlert>}
        {quota && (
          <ErrorAlert>
            <p>{quota}</p>
            <Link to="/pricing" className="underline text-rose-200 hover:text-white">See plans and upgrade</Link>
          </ErrorAlert>
        )}

        <button type="submit" disabled={creating} className={`${primaryBtn} w-full`}>
          {creating ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Zap className="w-4 h-4" aria-hidden="true" />}
          {creating ? 'Shortening...' : 'Shorten URL'}
        </button>
      </form>

      <h2 className="font-display text-sm font-semibold text-text-muted uppercase tracking-widest mb-3">Your links</h2>
      {loadError ? (
        <ErrorAlert>{loadError}</ErrorAlert>
      ) : links === null ? (
        <p role="status" className="text-sm text-text-muted font-mono">Loading links...</p>
      ) : links.length === 0 ? (
        <p className="text-sm text-text-secondary font-body border border-dashed border-surface-border rounded-xl p-6 text-center">
          No links yet. Paste a URL above to create your first one.
        </p>
      ) : (
        <ul className="space-y-3">
          {links.map((l) => (
            <LinkRow key={l.shortCode} link={l}
              onChange={(u) => setLinks((all) => all!.map((x) => (x.shortCode === u.shortCode ? u : x)))}
              onDelete={(code) => setLinks((all) => all!.filter((x) => x.shortCode !== code))} />
          ))}
        </ul>
      )}
    </PageShell>
  )
}
