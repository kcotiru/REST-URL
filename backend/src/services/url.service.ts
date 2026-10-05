import { randomUUID } from "node:crypto";
import { customAlphabet } from "nanoid";
import UAParser from "ua-parser-js";
import type Redis from "ioredis";
import { UrlRepository } from "../repositories/url.repository";
import { ClickRepository } from "../repositories/click.repository";
import {
  AnalyticsDTO, ClickContext, CreateUrlDTO, UpdateUrlDTO, UrlEntity, UrlResponseDTO, UrlStatsDTO,
} from "../types/url.types";
import { BillingService } from "./billing.service";
import { NotFoundError, QuotaExceededError, ValidationError } from "../utils/errors";
import { RESERVED_CODES } from "../middleware/validate";
import { FRONTEND_ORIGIN, PLANS, RAW_CLICK_DAYS } from "../config/plans";
import { addDays, isoDay } from "../utils/date";

const SHORT_CODE_LENGTH = Number(process.env.SHORT_CODE_LENGTH) || 7;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const generateCode = customAlphabet(ALPHABET, SHORT_CODE_LENGTH);

const CACHE_TTL_SECONDS = 3600;
const cacheKey = (shortCode: string) => `url:${shortCode}`;
export const CLICK_QUEUE = "clicks:queue";

const BOT = /bot|crawl|spider|slurp|preview/i;
const COUNTRY = /^[A-Z]{2}$/;

// Referrer host only: the path and query can carry anything.
const referrerHost = (referer?: string): string | null => {
  try {
    return referer ? new URL(referer).hostname : null;
  } catch {
    return null;
  }
};

const deviceClass = (ua = ""): "bot" | "mobile" | "tablet" | "desktop" => {
  if (BOT.test(ua)) return "bot";
  const type = new UAParser(ua).getDevice().type;
  return type === "mobile" || type === "tablet" ? type : "desktop";
};

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
    private clickRepository: ClickRepository,
    private billing: BillingService,
  ) {}

  async createShortUrl(ownerId: string, dto: CreateUrlDTO): Promise<UrlResponseDTO> {
    // ponytail: deleting a link refunds quota, and concurrent creates can overshoot by a few;
    // upgrade to a per-month usage counter row updated atomically.
    const plan = await this.billing.getPlan(ownerId);
    const limit = PLANS[plan].linksPerMonth;
    if ((await this.urlRepository.countThisMonth(ownerId)) >= limit) {
      throw new QuotaExceededError(
        `Monthly link limit reached (${limit} on the ${plan === "pro" ? "Pro" : "Free"} plan). Upgrade at ${FRONTEND_ORIGIN}/pricing`,
        `${FRONTEND_ORIGIN}/pricing`,
      );
    }

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

  async list(ownerId: string): Promise<UrlStatsDTO[]> {
    return (await this.urlRepository.listOwned(ownerId)).map(toStatsDTO);
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
  // The cached value is {id, url}: the click event needs the id, so a hit never touches the DB.
  async redirect(shortCode: string, ctx: ClickContext): Promise<string> {
    let hit: { id: number; url: string } | null = null;
    try {
      const raw = await this.redis.get(cacheKey(shortCode));
      // An entry from before click tracking is a bare URL: JSON.parse throws, so it is a miss.
      if (raw) hit = JSON.parse(raw);
    } catch (err) {
      console.error("Redis GET failed or entry unreadable, falling back to DB:", err);
    }

    if (!hit) {
      const entity = await this.urlRepository.findByShortCode(shortCode);
      if (!entity) 
        throw new NotFoundError(`Short code "${shortCode}" not found`);
      hit = { id: entity.id, url: entity.url };
      try {
        await this.redis.set(cacheKey(shortCode), JSON.stringify(hit), "EX", CACHE_TTL_SECONDS);
      } catch (err) {
        console.error("Redis SET failed:", err);
      }
    }

    this.trackClick(hit.id, ctx);
    return hit.url;
  }

  // Never awaited: the redirect must not wait on analytics. The worker (src/worker.ts) drains the queue
  // into Postgres. The client IP is deliberately not part of the event.
  // ponytail: clicks are dropped while Redis is down, upgrade to a local in-memory buffer or a direct DB fallback.
  private trackClick(urlId: number, ctx: ClickContext): void {
    const country = ctx.country?.toUpperCase();
    const event = {
      i: randomUUID(), // idempotency key: the worker can safely re-process an event
      t: Date.now(),
      u: urlId,
      r: referrerHost(ctx.referer),
      c: country && COUNTRY.test(country) ? country : null,
      d: deviceClass(ctx.userAgent),
    };
    this.redis.lpush(CLICK_QUEUE, JSON.stringify(event)).catch((err) => console.error("Click enqueue failed:", err));
  }

  async getAnalytics(ownerId: string, shortCode: string, range: { from: string; to: string }): Promise<AnalyticsDTO> {
    const entity = await this.urlRepository.findOwned(shortCode, ownerId);
    if (!entity) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);

    // The plan caps how far back a range may start; the clamped range is what the response reports.
    const today = isoDay();
    const floor = addDays(today, -PLANS[await this.billing.getPlan(ownerId)].analyticsDays);
    const from = range.from < floor ? floor : range.from;
    const days = (Date.parse(range.to) - Date.parse(from)) / 86_400_000 + 1;
    // Hourly detail needs raw rows: short range that still lies inside raw retention, else the rollup.
    const hourly = days <= 7 && from > addDays(today, -RAW_CLICK_DAYS);
    return this.clickRepository.analytics(entity.id, from, range.to, hourly ? "hour" : "day");
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
