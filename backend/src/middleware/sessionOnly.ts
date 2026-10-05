import { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../utils/errors";

// JWT-session only: a leaked API key must not be able to do `what` (mint keys, touch billing).
export const forbidApiKeys =
  (what: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    next(req.user?.apiKeyId ? new ForbiddenError(`API keys cannot ${what}`) : undefined);
  };
