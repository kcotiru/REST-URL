const BASE = '/api'

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
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.message || 'Request failed')
  return json.data as T
}

export const api = {
  shorten: (url: string, customCode?: string) =>
    request<UrlRecord>('/shorten', {
      method: 'POST',
      body: JSON.stringify({ url, ...(customCode ? { customCode } : {}) }),
    }),

  get: (code: string) =>
    request<UrlRecord>(`/shorten/${code}`),

  update: (code: string, url: string) =>
    request<UrlRecord>(`/shorten/${code}`, {
      method: 'PUT',
      body: JSON.stringify({ url }),
    }),

  delete: async (code: string) => {
    const res = await fetch(`${BASE}/shorten/${code}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json()
      throw new Error(json.message || 'Delete failed')
    }
  },

  stats: (code: string) =>
    request<UrlStats>(`/shorten/${code}/stats`),
}
