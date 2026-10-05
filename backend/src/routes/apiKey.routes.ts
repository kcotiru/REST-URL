import { Router } from "express";
import { ApiKeyController } from "../controllers/apiKey.controller";
import { validate, apiKeyBodySchema, apiKeyIdParamSchema } from "../middleware/validate";
import { forbidApiKeys } from "../middleware/sessionOnly";

export const createApiKeyRouter = (controller: ApiKeyController): Router => {
  const router = Router();

  // Key management is JWT-session only: a leaked key must not be able to mint or revoke keys.
  router.use(forbidApiKeys("manage API keys"));
  router.post("/", validate(apiKeyBodySchema), controller.create);
  router.get("/", controller.list);
  router.delete("/:id", validate(apiKeyIdParamSchema, "params"), controller.revoke);

  return router;
};
