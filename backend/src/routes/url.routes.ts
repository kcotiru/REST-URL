import { Router } from "express";
import { UrlController } from "../controllers/url.controller";
import { validate, urlBodySchema, shortCodeParamSchema } from "../middleware/validate";

export const createUrlRouter = (controller: UrlController): Router => {
  const router = Router();

  const codeParam = validate(shortCodeParamSchema, "params");

  // POST /shorten – create a short URL
  router.post("/", validate(urlBodySchema), controller.createShortUrl);

  // GET /shorten/:code – retrieve metadata
  router.get("/:code", codeParam, controller.getByShortCode);

  // PUT /shorten/:code – update destination URL
  router.put(
    "/:code",
    codeParam,
    validate(urlBodySchema),
    controller.updateShortUrl,
  );

  // DELETE /shorten/:code – remove mapping
  router.delete("/:code", codeParam, controller.deleteShortUrl);

  // GET /shorten/:code/stats – access counts & timestamps
  router.get("/:code/stats", codeParam, controller.getStats);

  return router;
};
