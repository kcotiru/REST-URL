import { supabase } from './supabase'

const BASE = '/api/v1'

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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message || 'Request failed')
  return json.data as T
}

export const api = {
  shorten: (url: string, customCode?: string) =>
    request<UrlRecord>('/links', {
      method: 'POST',
      body: JSON.stringify({ url, ...(customCode ? { customCode } : {}) }),
    }),

  get: (code: string) =>
    request<UrlRecord>(`/links/${code}`),

  update: (code: string, url: string) =>
    request<UrlRecord>(`/links/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ url }),
    }),

  delete: async (code: string) => {
    const res = await fetch(`${BASE}/links/${code}`, { method: 'DELETE', headers: await authHeaders() })
    if (!res.ok) {
      const json = await res.json()
      throw new Error(json.message || 'Delete failed')
    }
  },

  stats: (code: string) =>
    request<UrlStats>(`/links/${code}/stats`),
}
