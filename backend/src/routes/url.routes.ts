import { Router } from "express";
import { UrlController } from "../controllers/url.controller";
import { validate, urlBodySchema, shortCodeParamSchema } from "../middleware/validate";

export const createUrlRouter = (controller: UrlController): Router => {
  const router = Router();

  const codeParam = validate(shortCodeParamSchema, "params");

  router.post("/", validate(urlBodySchema), controller.createShortUrl);
  router.get("/:code", codeParam, controller.getByShortCode);
  router.put("/:code", codeParam, validate(urlBodySchema), controller.updateShortUrl);
  router.delete("/:code", codeParam, controller.deleteShortUrl);
  router.get("/:code/stats", codeParam, controller.getStats);

  return router;
};
