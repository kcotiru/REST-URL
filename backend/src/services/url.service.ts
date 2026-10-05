import { customAlphabet } from "nanoid";
import type Redis from "ioredis";
import { UrlRepository } from "../repositories/url.repository";
import { CreateUrlDTO, UpdateUrlDTO, UrlEntity, UrlResponseDTO, UrlStatsDTO } from "../types/url.types";
import { NotFoundError, ValidationError } from "../utils/errors";
import { RESERVED_CODES } from "../middleware/validate";

const SHORT_CODE_LENGTH = Number(process.env.SHORT_CODE_LENGTH) || 7;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const generateCode = customAlphabet(ALPHABET, SHORT_CODE_LENGTH);

const CACHE_TTL_SECONDS = 3600;
const cacheKey = (shortCode: string) => `url:${shortCode}`;

const toResponseDTO = (entity: UrlEntity): UrlResponseDTO => ({
  id: entity.id,
  url: entity.url,
  shortCode: entity.shortCode,
  createdAt: entity.createdAt,
  updatedAt: entity.updatedAt,
});

const toStatsDTO = (entity: UrlEntity): UrlStatsDTO => ({
  ...toResponseDTO(entity),
  accessCount: entity.accessCount,
});

export class UrlService {
  constructor(
    private urlRepository: UrlRepository,
    private redis: Redis,
  ) {}

  async createShortUrl(ownerId: string, dto: CreateUrlDTO): Promise<UrlResponseDTO> {
    if (dto.customCode) {
      const taken = await this.urlRepository.shortCodeExists(dto.customCode);
      if (taken) {
        throw new ValidationError(
          `Custom code "${dto.customCode}" is already taken. Please choose a different one.`,
        );
      }
      const entity = await this.urlRepository.create({
        url: dto.url,
        shortCode: dto.customCode,
        ownerId,
      });
      return toResponseDTO(entity);
    }

    let shortCode: string;
    let attempts = 0;

    do {
      shortCode = generateCode();
      attempts++;
      if (attempts > 10) 
        throw new Error("Failed to generate unique short code");
    } while (
        RESERVED_CODES.has(shortCode.toLowerCase()) ||
        await this.urlRepository.shortCodeExists(shortCode)
    );

    const entity = await this.urlRepository.create({ url: dto.url, shortCode, ownerId });
    return toResponseDTO(entity);
  }

  async getByShortCode(ownerId: string, shortCode: string): Promise<UrlResponseDTO> {
    const entity = await this.urlRepository.findOwned(shortCode, ownerId);
    if (!entity) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
    return toResponseDTO(entity);
  }

  async updateShortUrl(
    ownerId: string,
    shortCode: string,
    dto: UpdateUrlDTO,
  ): Promise<UrlResponseDTO> {
    const entity = await this.urlRepository.update(shortCode, ownerId, dto);
    if (!entity) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
    await this.invalidate(shortCode);
    return toResponseDTO(entity);
  }

  async deleteShortUrl(ownerId: string, shortCode: string): Promise<void> {
    const deleted = await this.urlRepository.delete(shortCode, ownerId);
    if (!deleted) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
    await this.invalidate(shortCode);
  }

  async getStats(ownerId: string, shortCode: string): Promise<UrlStatsDTO> {
    const entity = await this.urlRepository.findOwned(shortCode, ownerId);
    if (!entity) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
    return toStatsDTO(entity);
  }

  // Redis is a cache only: every failure is logged and falls back to the DB.
  async redirect(shortCode: string): Promise<string> {
    let url: string | null = null;
    try {
      url = await this.redis.get(cacheKey(shortCode));
    } catch (err) {
      console.error("Redis GET failed, falling back to DB:", err);
    }

    if (!url) {
      const entity = await this.urlRepository.findByShortCode(shortCode);
      if (!entity) 
        throw new NotFoundError(`Short code "${shortCode}" not found`);
      url = entity.url;
      try {
        await this.redis.set(cacheKey(shortCode), url, "EX", CACHE_TTL_SECONDS);
      } catch (err) {
        console.error("Redis SET failed:", err);
      }
    }

    // A cache hit still has the shortCode, which is all this needs.
    await this.urlRepository.incrementAccessCount(shortCode);
    return url;
  }

  // Called after the DB write succeeds. ponytail: a concurrent miss can re-cache the old
  // URL right after this DEL; the 1h TTL bounds the staleness, upgrade to a short TTL or versioned keys.
  private async invalidate(shortCode: string): Promise<void> {
    try {
      await this.redis.del(cacheKey(shortCode));
    } catch (err) {
      console.error("Redis DEL failed, cache may be stale until TTL:", err);
    }
  }
}
