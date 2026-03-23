import { customAlphabet } from "nanoid";
import { UrlRepository } from "../repositories/url.repository";
import { CreateUrlDTO, UpdateUrlDTO, UrlEntity, UrlResponseDTO, UrlStatsDTO } from "../types/url.types";
import { NotFoundError, ValidationError } from "../utils/errors";

const SHORT_CODE_LENGTH = Number(process.env.SHORT_CODE_LENGTH) || 7;
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const generateCode = customAlphabet(ALPHABET, SHORT_CODE_LENGTH);

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
  constructor(private urlRepository: UrlRepository) {}

  async createShortUrl(dto: CreateUrlDTO): Promise<UrlResponseDTO> {
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
        await this.urlRepository.shortCodeExists(shortCode)
    );

    const entity = await this.urlRepository.create({ url: dto.url, shortCode });
    return toResponseDTO(entity);
  }

  async getByShortCode(shortCode: string): Promise<UrlResponseDTO> {
    const entity = await this.urlRepository.findByShortCode(shortCode);
    if (!entity) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
    return toResponseDTO(entity);
  }

  async updateShortUrl(
    shortCode: string,
    dto: UpdateUrlDTO,
  ): Promise<UrlResponseDTO> {
    const entity = await this.urlRepository.update(shortCode, dto);
    if (!entity) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
    return toResponseDTO(entity);
  }

  async deleteShortUrl(shortCode: string): Promise<void> {
    const deleted = await this.urlRepository.delete(shortCode);
    if (!deleted) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
  }

  async getStats(shortCode: string): Promise<UrlStatsDTO> {
    const entity = await this.urlRepository.findByShortCode(shortCode);
    if (!entity) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
    return toStatsDTO(entity);
  }

  async redirect(shortCode: string): Promise<string> {
    const entity = await this.urlRepository.findByShortCode(shortCode);
    if (!entity) 
      throw new NotFoundError(`Short code "${shortCode}" not found`);
    await this.urlRepository.incrementAccessCount(shortCode);
    return entity.url;
  }
}
