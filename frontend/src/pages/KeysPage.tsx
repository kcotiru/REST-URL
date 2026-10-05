import { useEffect, useState } from 'react'
import { KeyRound, TriangleAlert, X } from 'lucide-react'
import { api, errorMessages, SHORT_BASE, type ApiKeyInfo, type CreatedApiKey } from '../lib/api'
import { ConfirmButton, CopyButton, ErrorAlert, PageShell, cardClass, fmtDate, inputClass, labelClass, primaryBtn } from '../components/ui'

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKeyInfo[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [rowError, setRowError] = useState('')
  // The only copy of the full key lives here; dismissing the box drops it from state.
  const [fresh, setFresh] = useState<CreatedApiKey | null>(null)

  const load = () => api.listKeys().then(setKeys).catch((e) => setLoadError(e.message))
  useEffect(() => { load() }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    setFormErrors([])
    try {
      setFresh(await api.createKey(name.trim()))
      setName('')
      await load()
    } catch (err) {
      setFormErrors(errorMessages(err))
    } finally {
      setCreating(false)
    }
  }

  const revoke = async (id: string) => {
    setRowError('')
    try {
      await api.revokeKey(id)
      await load()
    } catch (err) {
      setRowError(errorMessages(err).join(' '))
    }
  }

  return (
    <PageShell title="API keys" intro="Call the API from scripts and CI without a browser session.">
      <form onSubmit={create} className={`${cardClass} mb-6`} noValidate>
        <label htmlFor="key-name" className={labelClass}>Key name</label>
        <div className="flex gap-3 flex-wrap">
          <input id="key-name" type="text" required maxLength={64} value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI deploy" className={`${inputClass} flex-1 min-w-[12rem]`} />
          <button type="submit" disabled={creating} className={primaryBtn}>
            <KeyRound className="w-4 h-4" aria-hidden="true" /> Create key
          </button>
        </div>
        {formErrors.length > 0 && <div className="mt-4"><ErrorAlert>{formErrors.map((m) => <p key={m}>{m}</p>)}</ErrorAlert></div>}
      </form>

      {fresh && (
        <div role="alert" className="rounded-2xl border border-accent/40 bg-accent/5 p-5 mb-6 glow-accent-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="flex items-start gap-2 text-sm font-body text-text-primary">
              <TriangleAlert className="w-4 h-4 text-accent mt-0.5 shrink-0" aria-hidden="true" />
              <span>Copy it now — you won't see it again. Key "{fresh.name}" was created.</span>
            </p>
            <button type="button" onClick={() => setFresh(null)} aria-label="Dismiss new key"
              className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-high transition-colors
              focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2 p-3 rounded-xl bg-surface border border-surface-border">
            <code className="flex-1 font-mono text-sm text-accent break-all select-all">{fresh.key}</code>
            <CopyButton text={fresh.key} label="Copy API key" />
          </div>
        </div>
      )}

      {rowError && <div className="mb-4"><ErrorAlert>{rowError}</ErrorAlert></div>}

      {loadError ? (
        <ErrorAlert>{loadError}</ErrorAlert>
      ) : keys === null ? (
        <p role="status" className="text-sm text-text-muted font-mono">Loading keys...</p>
      ) : keys.length === 0 ? (
        <p className="text-sm text-text-secondary font-body border border-dashed border-surface-border rounded-xl p-6 text-center">
          No API keys yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-surface-border bg-surface-raised">
          <table className="w-full text-sm font-body min-w-[34rem]">
            <thead>
              <tr className="text-xs font-mono text-text-muted uppercase tracking-wider text-left">
                <th scope="col" className="font-normal p-4">Name</th>
                <th scope="col" className="font-normal p-4">Key</th>
                <th scope="col" className="font-normal p-4">Created</th>
                <th scope="col" className="font-normal p-4">Last used</th>
                <th scope="col" className="font-normal p-4">Status</th>
                <th scope="col" className="font-normal p-4"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-surface-border">
                  <th scope="row" className="font-normal text-left p-4 text-text-primary">{k.name}</th>
                  <td className="p-4 font-mono text-xs text-text-secondary">{k.prefix}…</td>
                  <td className="p-4 text-text-secondary">{fmtDate(k.createdAt)}</td>
                  <td className="p-4 text-text-secondary">{k.lastUsedAt ? fmtDate(k.lastUsedAt) : 'Never'}</td>
                  <td className="p-4">
                    {k.revokedAt ? (
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-300">Revoked</span>
                    ) : (
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-accent/10 text-accent">Active</span>
                    )}
                  </td>
                  <td className="p-4 text-right whitespace-nowrap">
                    {!k.revokedAt && (
                      <ConfirmButton label="Revoke" confirmLabel="Confirm revoke?" ariaLabel={`Revoke key ${k.name}`} onConfirm={() => revoke(k.id)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-10">
        <h2 className="font-display text-sm font-semibold text-text-muted uppercase tracking-widest mb-3">Usage</h2>
        <pre className="rounded-xl border border-surface-border bg-surface-raised p-4 text-xs font-mono text-text-secondary overflow-x-auto">
{`curl -X POST ${SHORT_BASE}/api/v1/links \\
  -H "Authorization: Bearer ru_live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/very/long/path"}'`}
        </pre>
        <p className="text-xs text-text-muted font-body mt-2">
          Keys can create and read links and analytics. Managing keys and billing needs a signed-in session.
        </p>
      </section>
    </PageShell>
  )
}
