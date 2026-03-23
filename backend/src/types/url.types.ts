// ── Domain entity ──────────────────────────────────────────
export interface UrlEntity {
  id: number;
  url: string;
  shortCode: string;
  createdAt: Date;
  updatedAt: Date;
  accessCount: number;
}

// ── Request / Response DTOs ──────────────────────────────────────────────────
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
