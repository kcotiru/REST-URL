import { Request, Response, NextFunction } from "express";
import { UrlService } from "../services/url.service";
import { ApiResponse } from "../utils/response";

export class UrlController {
  constructor(private urlService: UrlService) {}

  createShortUrl = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.urlService.createShortUrl(req.body);
      ApiResponse.success(res, result, 201);
    } catch (err) {
      next(err);
    }
  };

  getByShortCode = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.urlService.getByShortCode(req.params.code);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  updateShortUrl = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.urlService.updateShortUrl(
        req.params.code,
        req.body,
      );
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  deleteShortUrl = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await this.urlService.deleteShortUrl(req.params.code);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  getStats = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const result = await this.urlService.getStats(req.params.code);
      ApiResponse.success(res, result);
    } catch (err) {
      next(err);
    }
  };

  redirect = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const targetUrl = await this.urlService.redirect(req.params.code);
      res.redirect(302, targetUrl);
    } catch (err) {
      next(err);
    }
  };
}
