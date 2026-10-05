import { randomBytes } from "node:crypto";
import { ApiKeyRepository } from "../repositories/apiKey.repository";
import { ApiKeyCreatedDTO, ApiKeyResponseDTO } from "../types/apiKey.types";
import { NotFoundError } from "../utils/errors";
import { API_KEY_PREFIX, hashApiKey } from "../utils/apiKey";

export class ApiKeyService {
  constructor(private apiKeyRepository: ApiKeyRepository) {}

  // The full key leaves this method exactly once (the POST response); only its hash is stored.
  async create(ownerId: string, name: string): Promise<ApiKeyCreatedDTO> {
    const key = API_KEY_PREFIX + randomBytes(32).toString("base64url");
    const { id, createdAt } = await this.apiKeyRepository.create({
      ownerId,
      name,
      // First 16 chars, not 8: the literal first 8 are always "ru_live_", so this is prefix + 8 random chars.
      prefix: key.slice(0, 16),
      keyHash: hashApiKey(key),
    });
    return { id, name, prefix: key.slice(0, 16), createdAt, key };
  }

  list(ownerId: string): Promise<ApiKeyResponseDTO[]> {
    return this.apiKeyRepository.listByOwner(ownerId);
  }

  async revoke(ownerId: string, id: string): Promise<void> {
    if (!(await this.apiKeyRepository.revoke(id, ownerId))) throw new NotFoundError("API key not found");
  }
}
