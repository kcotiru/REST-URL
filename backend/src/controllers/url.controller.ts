import { Request, Response, NextFunction } from "express";
import { UrlService } from "../services/url.service";
import { ApiResponse } from "../utils/response";

export class UrlController {
  constructor(private urlService: UrlService) {}

  createShortUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.urlService.createShortUrl(req.user!.id, req.body);
      ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  };

  getByShortCode = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.urlService.getByShortCode(req.user!.id, req.params.code);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  updateShortUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.urlService.updateShortUrl(
        req.user!.id,
        req.params.code,
        req.body,
      );
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  deleteShortUrl = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.urlService.deleteShortUrl(req.user!.id, req.params.code);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.urlService.getStats(req.user!.id, req.params.code);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  redirect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetUrl = await this.urlService.redirect(req.params.code);
      // 302, not 301: browsers cache a 301 permanently, which would hide repeat clicks from analytics and ignore link edits.
      res.redirect(302, targetUrl);
    } catch (err) {
      next(err);
    }
  };
}
