import { Request, Response, NextFunction } from "express";
import { BillingService } from "../services/billing.service";
import { ApiResponse } from "../utils/response";

export class BillingController {
  constructor(private billingService: BillingService) {}

  get = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      ApiResponse.success(res, await this.billingService.getBilling(req.user!.id));
    } catch (err) {
      next(err);
    }
  };

  checkout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      ApiResponse.success(res, await this.billingService.checkout(req.user!.id, req.user!.email));
    } catch (err) {
      next(err);
    }
  };

  portal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      ApiResponse.success(res, await this.billingService.portal(req.user!.id));
    } catch (err) {
      next(err);
    }
  };

  // req.body is the raw Buffer (express.raw), which the signature is computed over.
  webhook = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const duplicate = await this.billingService.handleWebhook(req.body, req.get("stripe-signature"));
      res.json({ received: true, ...(duplicate && { duplicate: true }) });
    } catch (err) {
      next(err);
    }
  };
}
