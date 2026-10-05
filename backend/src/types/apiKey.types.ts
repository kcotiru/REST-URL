// Safe to return to clients: never carries the key or its hash.
export interface ApiKeyResponseDTO {
  id: string;
  name: string;
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

// POST response only: the one time the full key is visible.
export interface ApiKeyCreatedDTO extends Pick<ApiKeyResponseDTO, "id" | "name" | "prefix" | "createdAt"> {
  key: string;
}

// What the auth middleware needs to check a presented key.
export interface ApiKeyAuthRow {
  id: string;
  ownerId: string;
  keyHash: string;
  lastUsedAt: Date | null;
}
