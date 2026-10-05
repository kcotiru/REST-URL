// ── Domain entity ──────────────────────────────────────────
export interface UrlEntity {
  id: number;
  url: string;
  shortCode: string;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
  ownerId: string | null;
}

// ── Request / Response DTOs ────────────────────────────────
export interface CreateUrlDTO {
  url: string;
  customCode?: string; // optional; 3–10 alphanumeric chars
}

export interface UpdateUrlDTO {
  url: string;
}

export interface UrlResponseDTO {
  id: number;
  url: string;
  shortCode: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UrlStatsDTO extends UrlResponseDTO {
  accessCount: number;
}

// ── Click tracking / analytics ─────────────────────────────
// The request headers a click event is built from (the service never sees `req`).
export interface ClickContext {
  referer?: string;
  country?: string;
  userAgent?: string;
}

export interface CountBy {
  value: string | null; // null = unknown
  count: number;
}

export interface AnalyticsDTO {
  from: string;
  to: string;
  granularity: "hour" | "day";
  total: number;
  series: { t: string; count: number }[];
  countries: CountBy[];
  referrers: CountBy[];
  devices: CountBy[];
}
