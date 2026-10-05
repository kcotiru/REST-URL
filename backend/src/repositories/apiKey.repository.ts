import { Pool } from "pg";
import { ApiKeyAuthRow, ApiKeyResponseDTO } from "../types/apiKey.types";

const PUBLIC_COLUMNS = `id, name, prefix, "createdAt", "lastUsedAt", "revokedAt"`;

export class ApiKeyRepository {
  constructor(private db: Pool) {}

  async create(dto: { ownerId: string; name: string; prefix: string; keyHash: string }): Promise<ApiKeyResponseDTO> {
    const { rows } = await this.db.query<ApiKeyResponseDTO>(
      `INSERT INTO api_keys ("ownerId", name, prefix, "keyHash") VALUES ($1, $2, $3, $4)
       RETURNING ${PUBLIC_COLUMNS}`,
      [dto.ownerId, dto.name, dto.prefix, dto.keyHash],
    );
    return rows[0];
  }

  async listByOwner(ownerId: string): Promise<ApiKeyResponseDTO[]> {
    const { rows } = await this.db.query<ApiKeyResponseDTO>(
      `SELECT ${PUBLIC_COLUMNS} FROM api_keys WHERE "ownerId" = $1 ORDER BY "createdAt" DESC`,
      [ownerId],
    );
    return rows;
  }

  // Owner-scoped; false when not yours, missing, or already revoked.
  async revoke(id: string, ownerId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `UPDATE api_keys SET "revokedAt" = now() WHERE id = $1 AND "ownerId" = $2 AND "revokedAt" IS NULL`,
      [id, ownerId],
    );
    return (rowCount ?? 0) > 0;
  }

  // Auth lookup: revoked keys never match.
  async findActiveByHash(keyHash: string): Promise<ApiKeyAuthRow | null> {
    const { rows } = await this.db.query<ApiKeyAuthRow>(
      `SELECT id, "ownerId", "keyHash", "lastUsedAt" FROM api_keys WHERE "keyHash" = $1 AND "revokedAt" IS NULL`,
      [keyHash],
    );
    return rows[0] ?? null;
  }

  async touch(id: string): Promise<void> {
    await this.db.query(`UPDATE api_keys SET "lastUsedAt" = now() WHERE id = $1`, [id]);
  }
}
