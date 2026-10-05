import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CreditCard, RefreshCw, Sparkles } from 'lucide-react'
import { api, errorMessages, type Billing } from '../lib/api'
import { ErrorAlert, PageShell, cardClass, fmtDate, primaryBtn } from '../components/ui'

const POLL_MS = 2000
const POLL_TRIES = 10

export default function BillingPage() {
  const [params] = useSearchParams()
  const checkout = params.get('checkout')
  const [billing, setBilling] = useState<Billing | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [waiting, setWaiting] = useState(checkout === 'success')

  const load = useCallback(() => api.billing().then((b) => { setBilling(b); return b }), [])

  useEffect(() => {
    load().catch((e) => setError(e.message))
  }, [load])

  // The webhook is the source of truth for the plan; the success redirect only triggers a refresh.
  // The webhook may land a moment after the redirect, so poll until the plan flips (or give up).
  useEffect(() => {
    if (checkout !== 'success') return
    let tries = 0
    const id = setInterval(async () => {
      tries++
      try {
        if ((await load()).plan === 'pro') {
          setWaiting(false)
          clearInterval(id)
          return
        }
      } catch { /* keep polling */ }
      if (tries >= POLL_TRIES) {
        setWaiting(false)
        clearInterval(id)
      }
    }, POLL_MS)
    return () => clearInterval(id)
  }, [checkout, load])

  // Both buttons leave for a Stripe-hosted page.
  const go = async (start: () => Promise<{ url: string }>) => {
    setBusy(true)
    setError('')
    try {
      window.location.href = (await start()).url
    } catch (err) {
      setError(errorMessages(err).join(' '))
      setBusy(false)
    }
  }

  const used = billing?.usage.linksThisMonth ?? 0
  const limit = billing?.usage.linksPerMonth ?? 0
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const pro = billing?.plan === 'pro'

  return (
    <PageShell title="Billing" intro="Your plan, this month's usage and payment settings.">
      {checkout === 'success' && (
        <p role="status" className="px-4 py-3 mb-6 rounded-xl bg-accent/5 border border-accent/30 text-sm text-accent font-body">
          {waiting ? 'Payment received — your plan will update in a few seconds' : pro ? 'You are on Pro. Thanks!' : 'Payment received. Your plan is taking longer than usual to update; refresh in a minute.'}
        </p>
      )}
      {checkout === 'cancel' && (
        <p role="status" className="px-4 py-3 mb-6 rounded-xl bg-surface-raised border border-surface-border text-sm text-text-secondary font-body">
          Checkout was canceled. You haven't been charged.
        </p>
      )}
      {error && <div className="mb-6"><ErrorAlert>{error}</ErrorAlert></div>}

      {!billing ? (
        !error && <p role="status" className="text-sm text-text-muted font-mono">Loading billing...</p>
      ) : (
        <div className="space-y-6">
          <section className={cardClass} aria-labelledby="plan-h">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <h2 id="plan-h" className="text-xs font-mono text-text-muted uppercase tracking-wider mb-1">Current plan</h2>
                <p className="font-display text-3xl font-extrabold text-text-primary capitalize">{billing.plan}</p>
                <p className="text-sm text-text-secondary font-body mt-1">
                  Status: <span className="font-mono text-text-primary">{billing.status}</span>
                  {billing.currentPeriodEnd && <> · {pro ? 'Renews' : 'Period ends'} {fmtDate(billing.currentPeriodEnd)}</>}
                </p>
              </div>
              {pro ? (
                <button type="button" disabled={busy} onClick={() => go(api.portal)} className={primaryBtn}>
                  <CreditCard className="w-4 h-4" aria-hidden="true" /> Manage billing
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => go(api.checkout)} className={primaryBtn}>
                  {busy ? <RefreshCw className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                  Upgrade to Pro
                </button>
              )}
            </div>
          </section>

          <section className={cardClass} aria-labelledby="usage-h">
            <h2 id="usage-h" className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">Links created this month</h2>
            <div role="progressbar" aria-labelledby="usage-h" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}
              aria-valuetext={`${used} of ${limit} links`} className="h-3 rounded-full bg-surface-high overflow-hidden">
              {/* Meter: accent until 80%, then amber, then rose at the limit. */}
              <div className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-rose-400' : pct >= 80 ? 'bg-amber-400' : 'bg-accent'}`}
                style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-2 text-sm font-mono text-text-secondary">
              <span className="text-text-primary">{used.toLocaleString()}</span> / {limit.toLocaleString()} links
            </p>
            {!pro && pct >= 80 && (
              <p className="mt-2 text-sm text-text-secondary font-body">
                Running low? <Link to="/pricing" className="text-accent underline">Compare plans</Link>.
              </p>
            )}
          </section>
        </div>
      )}
    </PageShell>
  )
}
