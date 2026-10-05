import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { api, type PlanInfo } from '../lib/api'
import { ErrorAlert } from '../components/ui'
import { useSession } from '../lib/supabase'

const history = (days: number) => (days >= 365 ? '1 year' : `${days} days`)

function PlanCard({ name, plan, cta, to, featured }: { name: string; plan: PlanInfo; cta: string; to: string; featured?: boolean }) {
  const features = [
    `${plan.linksPerMonth.toLocaleString()} new links per month`,
    `${plan.apiRequestsPerMinute.toLocaleString()} API requests per minute`,
    `${history(plan.analyticsDays)} of click analytics`,
  ]
  return (
    <section aria-labelledby={`plan-${name}`}
      className={`rounded-2xl border p-8 flex flex-col ${featured ? 'border-accent/40 bg-accent/5 glow-accent-sm' : 'border-surface-border bg-surface-raised'}`}>
      <h2 id={`plan-${name}`} className="font-display text-xl font-bold text-text-primary">{name}</h2>
      <p className="mt-4 font-display text-5xl font-extrabold text-text-primary">
        ${plan.priceUsdMonthly}<span className="text-base font-body font-normal text-text-muted">/mo</span>
      </p>
      <ul className="mt-6 space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-text-secondary font-body">
            <Check className="w-4 h-4 text-accent mt-0.5 shrink-0" aria-hidden="true" /> {f}
          </li>
        ))}
      </ul>
      {/* A signed-out Pro click should land on /billing after login. */}
      <Link to={to} state={featured && to === '/login' ? { from: { pathname: '/billing', search: '' } } : undefined}
        className={`mt-8 text-center px-6 py-3 rounded-xl font-semibold font-body transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
          featured ? 'bg-accent text-surface hover:bg-accent-dim' : 'bg-surface-high border border-surface-border text-text-primary hover:border-accent/30'}`}>
        {cta}
      </Link>
    </section>
  )
}

export default function PricingPage() {
  const session = useSession()
  const [plans, setPlans] = useState<{ free: PlanInfo; pro: PlanInfo } | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.plans().then(setPlans).catch((e) => setError(e.message))
  }, [])

  return (
    <div className="min-h-screen pt-28 pb-20 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <span className="font-mono text-xs text-accent uppercase tracking-widest">Pricing</span>
          <h1 className="font-display text-4xl md:text-5xl font-extrabold text-text-primary mt-3 mb-3">Simple plans</h1>
          <p className="text-text-secondary font-body">Start free. Upgrade when you need more links, history and API headroom.</p>
        </div>

        {error ? (
          <ErrorAlert>Couldn't load plans: {error}</ErrorAlert>
        ) : !plans ? (
          <p role="status" className="text-center text-sm text-text-muted font-mono">Loading plans...</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-6">
            <PlanCard name="Free" plan={plans.free} cta="Get started" to={session ? '/dashboard' : '/login'} />
            <PlanCard name="Pro" plan={plans.pro} cta="Upgrade" to={session ? '/billing' : '/login'} featured />
          </div>
        )}
      </div>
    </div>
  )
}
