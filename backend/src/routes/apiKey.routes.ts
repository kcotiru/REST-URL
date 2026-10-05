import { Router, Request, Response, NextFunction } from "express";
import { ApiKeyController } from "../controllers/apiKey.controller";
import { validate, apiKeyBodySchema, apiKeyIdParamSchema } from "../middleware/validate";
import { ForbiddenError } from "../utils/errors";

// Key management is JWT-session only: a leaked key must not be able to mint or revoke keys.
const forbidApiKeys = (req: Request, _res: Response, next: NextFunction): void => {
  next(req.user?.apiKeyId ? new ForbiddenError("API keys cannot manage API keys") : undefined);
};

export const createApiKeyRouter = (controller: ApiKeyController): Router => {
  const router = Router();

  router.use(forbidApiKeys);
  router.post("/", validate(apiKeyBodySchema), controller.create);
  router.get("/", controller.list);
  router.delete("/:id", validate(apiKeyIdParamSchema, "params"), controller.revoke);

  return router;
};
