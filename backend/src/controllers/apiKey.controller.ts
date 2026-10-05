import { Request, Response, NextFunction } from "express";
import { ApiKeyService } from "../services/apiKey.service";
import { ApiResponse } from "../utils/response";

export class ApiKeyController {
  constructor(private apiKeyService: ApiKeyService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.apiKeyService.create(req.user!.id, req.body.name);
      ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  };

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.apiKeyService.list(req.user!.id);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  revoke = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.apiKeyService.revoke(req.user!.id, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
