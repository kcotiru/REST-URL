import { supabase } from './supabase'

const BASE = '/api/v1'

// Short links are served by the backend (GET /:code), not by the Vite dev server or the SPA host.
export const SHORT_BASE = (import.meta.env.VITE_SHORT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}
}

export interface UrlRecord {
  id: number
  url: string
  shortCode: string
  createdAt: string
  updatedAt: string
}

export interface UrlStats extends UrlRecord {
  accessCount: number
}

export interface CountBy {
  value: string | null
  count: number
}

export interface Analytics {
  from: string
  to: string
  granularity: 'hour' | 'day'
  total: number
  series: { t: string; count: number }[]
  countries: CountBy[]
  referrers: CountBy[]
  devices: CountBy[]
}

export interface ApiKeyInfo {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export interface CreatedApiKey {
  id: string
  name: string
  prefix: string
  createdAt: string
  key: string
}

export interface Billing {
  plan: 'free' | 'pro'
  status: string
  currentPeriodEnd: string | null
  usage: { linksThisMonth: number; linksPerMonth: number }
}

export interface PlanInfo {
  linksPerMonth: number
  apiRequestsPerMinute: number
  analyticsDays: number
  priceUsdMonthly: number
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public errors?: unknown) {
    super(message)
  }

  // Quota errors (402) carry errors.upgradeUrl.
  get upgradeUrl(): string | undefined {
    return (this.errors as { upgradeUrl?: string } | undefined)?.upgradeUrl
  }
}

// 400s carry a zod .format() tree: { field: { _errors: [msg] }, _errors: [] }. Flatten to messages.
export function errorMessages(err: unknown): string[] {
  if (!(err instanceof ApiError)) return [err instanceof Error ? err.message : 'Something went wrong']
  const out: string[] = []
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    for (const [k, v] of Object.entries(node)) {
      if (k === '_errors' && Array.isArray(v)) out.push(...v.filter((m): m is string => typeof m === 'string'))
      else walk(v)
    }
  }
  if (err.status === 400) walk(err.errors)
  return out.length ? out : [err.message]
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  })
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.message || 'Request failed', res.status, json.errors)
  return json.data as T
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', ...(body !== undefined && { body: JSON.stringify(body) }) })

export const api = {
  listLinks: () => request<UrlStats[]>('/links'),

  shorten: (url: string, customCode?: string) =>
    post<UrlRecord>('/links', { url, ...(customCode ? { customCode } : {}) }),

  update: (code: string, url: string) =>
    request<UrlRecord>(`/links/${code}`, { method: 'PUT', body: JSON.stringify({ url }) }),

  delete: (code: string) => request<void>(`/links/${code}`, { method: 'DELETE' }),

  analytics: (code: string, from: string, to: string) =>
    request<Analytics>(`/links/${code}/analytics?from=${from}&to=${to}`),

  listKeys: () => request<ApiKeyInfo[]>('/keys'),
  createKey: (name: string) => post<CreatedApiKey>('/keys', { name }),
  revokeKey: (id: string) => request<void>(`/keys/${id}`, { method: 'DELETE' }),

  billing: () => request<Billing>('/billing'),
  checkout: () => post<{ url: string }>('/billing/checkout'),
  portal: () => post<{ url: string }>('/billing/portal'),

  plans: () => request<{ free: PlanInfo; pro: PlanInfo }>('/plans'),
}
