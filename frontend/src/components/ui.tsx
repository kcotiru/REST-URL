import { useState, type ReactNode } from 'react'
import { AlertCircle, Check, Copy } from 'lucide-react'

export const inputClass =
  'w-full px-4 py-3 bg-surface border border-surface-border rounded-xl text-text-primary ' +
  'placeholder:text-text-muted font-body text-sm focus:outline-none focus:border-accent/50 ' +
  'focus:ring-1 focus:ring-accent/20 transition-all'
export const labelClass = 'block text-xs font-mono text-text-muted uppercase tracking-wider mb-2'
export const primaryBtn =
  'px-5 py-3 bg-accent text-surface rounded-xl font-semibold font-body hover:bg-accent-dim transition-all ' +
  'disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-surface'
export const ghostBtn =
  'px-3 py-1.5 rounded-lg text-xs font-mono text-text-secondary border border-surface-border ' +
  'hover:text-text-primary hover:bg-surface-high transition-colors focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-accent/60'
export const cardClass = 'rounded-2xl border border-surface-border bg-surface-raised p-6'

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'

export function PageShell({ title, intro, children, wide }: { title: string; intro?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen pt-28 pb-20 px-6">
      <div className={`${wide ? 'max-w-5xl' : 'max-w-3xl'} mx-auto`}>
        <h1 className="font-display text-4xl font-extrabold text-text-primary mb-2">{title}</h1>
        {intro && <p className="text-text-secondary font-body mb-8">{intro}</p>}
        {children}
      </div>
    </div>
  )
}

export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/25">
      <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" aria-hidden="true" />
      <div className="text-sm text-rose-300 font-body">{children}</div>
    </div>
  )
}

// Icon-only copy button; the sr-only live region announces "Copied" to screen readers.
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1800)
      })
      .catch(() => {})
  return (
    <>
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="shrink-0 p-2 rounded-lg hover:bg-surface-high transition-colors text-text-muted hover:text-accent
        focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        {copied ? <Check className="w-4 h-4 text-accent" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{copied ? 'Copied' : ''}</span>
    </>
  )
}

// Inline two-step action (replaces window.confirm): first click arms it, second runs it.
export function ConfirmButton({
  label, confirmLabel, onConfirm, ariaLabel, busy, children,
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  ariaLabel: string
  busy?: boolean
  children?: ReactNode
}) {
  const [armed, setArmed] = useState(false)
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} aria-label={ariaLabel}
        className={`${ghostBtn} inline-flex items-center gap-1.5 hover:text-rose-400`}>
        {children}{label}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button type="button" disabled={busy} onClick={onConfirm} autoFocus
        className="px-3 py-1.5 rounded-lg text-xs font-mono bg-rose-500/15 text-rose-300 border border-rose-500/30
        hover:bg-rose-500/25 transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/60">
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setArmed(false)} className={ghostBtn}>Cancel</button>
    </span>
  )
}
