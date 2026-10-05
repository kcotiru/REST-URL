import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowLeft, Info } from 'lucide-react'
import { api, ApiError, errorMessages, SHORT_BASE, type Analytics, type CountBy } from '../lib/api'
import { ErrorAlert, PageShell, cardClass, inputClass, labelClass } from '../components/ui'

// Chart colours: one series, so the brand accent (#00d4aa, 7.6:1 on the card surface) carries it.
// Grid and axes are recessive hairlines; axis text uses the secondary text token, never the series colour.
const SERIES = '#00d4aa'
const SURFACE = '#252830'
const GRID = '#363a45'
const AXIS_TEXT = '#9aa0b0'

const DAY_MS = 86_400_000
const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => isoDay(new Date(Date.parse(day) + n * DAY_MS))

// Backend buckets are UTC: daily "YYYY-MM-DD", hourly "YYYY-MM-DDTHH:00:00Z".
const fmtTick = (t: string, hourly: boolean) =>
  hourly
    ? new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' })
    : new Date(`${t}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function ChartTooltip({ active, payload, hourly }: { active?: boolean; payload?: { payload: { t: string; count: number } }[]; hourly: boolean }) {
  if (!active || !payload?.length) return null
  const { t, count } = payload[0].payload
  return (
    <div className="rounded-lg border border-surface-border bg-surface-high px-3 py-2 shadow-lg">
      <div className="text-xs font-mono text-text-secondary">{fmtTick(t, hourly)}{hourly && ' UTC'}</div>
      <div className="flex items-center gap-2 mt-1">
        <span className="inline-block w-3 h-0.5 rounded" style={{ background: SERIES }} aria-hidden="true" />
        <span className="text-sm font-semibold text-text-primary">{count.toLocaleString()}</span>
        <span className="text-xs text-text-secondary">{count === 1 ? 'click' : 'clicks'}</span>
      </div>
    </div>
  )
}

function TopTable({ title, rows, unknown, label }: { title: string; rows: CountBy[]; unknown: string; label: string }) {
  return (
    <div className={cardClass}>
      <table className="w-full text-sm font-body">
        <caption className="text-left font-display text-sm font-semibold text-text-primary mb-3">{title}</caption>
        <thead>
          <tr className="text-xs font-mono text-text-muted uppercase tracking-wider">
            <th scope="col" className="text-left font-normal pb-2">{label}</th>
            <th scope="col" className="text-right font-normal pb-2">Clicks</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={2} className="py-2 text-text-muted">No clicks in this range.</td></tr>
          ) : rows.map((r) => (
            <tr key={r.value ?? '__null'} className="border-t border-surface-border">
              <th scope="row" className="text-left font-normal py-2 text-text-secondary break-all">{r.value ?? unknown}</th>
              <td className="text-right py-2 font-mono text-text-primary tabular-nums">{r.count.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LinkAnalyticsPage() {
  const { code = '' } = useParams()
  const today = isoDay(new Date())
  const [from, setFrom] = useState(addDays(today, -6))
  const [to, setTo] = useState(today)
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState<ApiError | Error | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stale = false
    setLoading(true)
    api.analytics(code, from, to)
      .then((d) => { if (!stale) { setData(d); setError(null) } })
      .catch((e) => { if (!stale) setError(e) })
      .finally(() => { if (!stale) setLoading(false) })
    return () => { stale = true }
  }, [code, from, to])

  const notFound = error instanceof ApiError && error.status === 404
  const hourly = data?.granularity === 'hour'
  // The response's `from` is later than what was asked for only when the plan clamped it.
  // ponytail: the plan is inferred from the clamp size (30 = Free, 365 = Pro) instead of a second /billing call.
  const clampedDays = data && data.from > from ? Math.round((Date.parse(today) - Date.parse(data.from)) / DAY_MS) : 0

  return (
    <PageShell title="Link analytics" wide
      intro={`${SHORT_BASE}/${code}`}>
      <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-accent mb-6 font-body">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to dashboard
      </Link>

      {notFound ? (
        <ErrorAlert>This link doesn't exist, or it isn't yours.</ErrorAlert>
      ) : (
        <>
          {/* Filters: one row above everything they scope. */}
          <div className="flex flex-wrap gap-4 mb-6">
            <div>
              <label htmlFor="from" className={labelClass}>From</label>
              <input id="from" type="date" value={from} max={to} required
                onChange={(e) => e.target.value && setFrom(e.target.value)} className={`${inputClass} w-auto`} />
            </div>
            <div>
              <label htmlFor="to" className={labelClass}>To</label>
              <input id="to" type="date" value={to} min={from} max={today} required
                onChange={(e) => e.target.value && setTo(e.target.value)} className={`${inputClass} w-auto`} />
            </div>
          </div>

          {error && <div className="mb-6"><ErrorAlert>{errorMessages(error).join(' ')}</ErrorAlert></div>}

          {clampedDays > 0 && (
            <p role="status" className="flex items-start gap-2 px-4 py-3 mb-6 rounded-xl bg-accent/5 border border-accent/25 text-sm text-text-secondary font-body">
              <Info className="w-4 h-4 text-accent mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {clampedDays < 365
                  ? <>Free plan shows the last {clampedDays} days, so this range starts on {data!.from}. <Link to="/pricing" className="text-accent underline">Upgrade for 1 year</Link>.</>
                  : <>Your plan shows the last {clampedDays} days, so this range starts on {data!.from}.</>}
              </span>
            </p>
          )}

          {!data && loading && <p role="status" className="text-sm text-text-muted font-mono">Loading analytics...</p>}

          {data && (
            // Refetch keeps the frame: previous data stays, dimmed, until the new response lands.
            <div className={`transition-opacity ${loading ? 'opacity-50' : ''}`} aria-busy={loading}>
              <div className={`${cardClass} mb-6`}>
                <div className="flex items-end justify-between flex-wrap gap-2 mb-4">
                  <div>
                    <div className="text-xs font-mono text-text-muted uppercase tracking-wider">Total clicks</div>
                    <div className="font-display text-5xl font-extrabold text-text-primary">{data.total.toLocaleString()}</div>
                  </div>
                  <div className="text-xs font-mono text-text-muted">
                    Clicks per {hourly ? 'hour' : 'day'}, {data.from} to {data.to}{hourly && ' (UTC)'}
                  </div>
                </div>

                <div role="img" aria-label={`Clicks per ${hourly ? 'hour' : 'day'} from ${data.from} to ${data.to}, ${data.total} in total. A table with the same values follows the chart.`}
                  className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
                      <CartesianGrid vertical={false} stroke={GRID} strokeWidth={1} />
                      <XAxis dataKey="t" tickFormatter={(t: string) => fmtTick(t, hourly)} minTickGap={hourly ? 48 : 24}
                        tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} />
                      <YAxis allowDecimals={false} width={40} tickFormatter={(n: number) => n.toLocaleString()}
                        tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip hourly={hourly} />} cursor={{ stroke: AXIS_TEXT, strokeWidth: 1 }} />
                      <Area type="monotone" dataKey="count" stroke={SERIES} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                        fill={SERIES} fillOpacity={0.1} isAnimationActive={false}
                        activeDot={{ r: 4, fill: SERIES, stroke: SURFACE, strokeWidth: 2 }} dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <details className="mt-4">
                  <summary className="text-xs font-mono text-text-secondary cursor-pointer hover:text-accent
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded w-fit">View as table</summary>
                  <div className="max-h-64 overflow-y-auto mt-3">
                    <table className="w-full text-sm font-body">
                      <thead>
                        <tr className="text-xs font-mono text-text-muted uppercase tracking-wider">
                          <th scope="col" className="text-left font-normal pb-2">{hourly ? 'Hour (UTC)' : 'Day'}</th>
                          <th scope="col" className="text-right font-normal pb-2">Clicks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.series.map((p) => (
                          <tr key={p.t} className="border-t border-surface-border">
                            <th scope="row" className="text-left font-normal py-1.5 text-text-secondary">{fmtTick(p.t, hourly)}</th>
                            <td className="text-right py-1.5 font-mono text-text-primary tabular-nums">{p.count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>

              <div className="grid md:grid-cols-3 gap-5">
                <TopTable title="Countries" label="Country" rows={data.countries} unknown="Unknown" />
                <TopTable title="Referrers" label="Referrer" rows={data.referrers} unknown="Direct" />
                <TopTable title="Devices" label="Device" rows={data.devices} unknown="Unknown" />
              </div>
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
