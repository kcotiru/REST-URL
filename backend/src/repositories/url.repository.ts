import { Pool } from "pg";
import { UrlEntity, CreateUrlDTO, UpdateUrlDTO } from "../types/url.types";

export class UrlRepository {
  constructor(private db: Pool) {}

  async create(dto: CreateUrlDTO & { shortCode: string; ownerId: string }): Promise<UrlEntity> {
    const { rows } = await this.db.query<UrlEntity>(
      `INSERT INTO urls ("url", "shortCode", "ownerId") VALUES ($1, $2, $3) RETURNING *`,
      [dto.url, dto.shortCode, dto.ownerId],
    );
    return rows[0];
  }

  // Owner-scoped: a NULL ownerId (legacy row) never matches.
  async findOwned(shortCode: string, ownerId: string): Promise<UrlEntity | null> {
    const { rows } = await this.db.query<UrlEntity>(
      `SELECT * FROM urls WHERE "shortCode" = $1 AND "ownerId" = $2`,
      [shortCode, ownerId],
    );
    return rows[0] ?? null;
  }

  // Public, unscoped: used by the redirect only.
  async findByShortCode(shortCode: string): Promise<UrlEntity | null> {
    const { rows } = await this.db.query<UrlEntity>(
      `SELECT * FROM urls WHERE "shortCode" = $1`,
      [shortCode],
    );
    return rows[0] ?? null;
  }

  async update(shortCode: string, ownerId: string, dto: UpdateUrlDTO): Promise<UrlEntity | null> {
    const { rows } = await this.db.query<UrlEntity>(
      `UPDATE urls
       SET "url" = $1, "updatedAt" = CURRENT_TIMESTAMP WHERE "shortCode" = $2 AND "ownerId" = $3
       RETURNING *`,
      [dto.url, shortCode, ownerId],
    );
    return rows[0] ?? null;
  }

  async delete(shortCode: string, ownerId: string): Promise<boolean> {
    const { rowCount } = await this.db.query(
      `DELETE FROM urls WHERE "shortCode" = $1 AND "ownerId" = $2`,
      [shortCode, ownerId],
    );
    return (rowCount ?? 0) > 0;
  }

  async incrementAccessCount(shortCode: string): Promise<void> {
    await this.db.query(
      `UPDATE urls
       SET "accessCount" = "accessCount" + 1, "updatedAt" = CURRENT_TIMESTAMP
       WHERE "shortCode" = $1`,
      [shortCode],
    );
  }

  async shortCodeExists(shortCode: string): Promise<boolean> {
    const { rows } = await this.db.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM urls WHERE "shortCode" = $1) AS exists`,
      [shortCode],
    );
    return rows[0].exists;
  }
}
