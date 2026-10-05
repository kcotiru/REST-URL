import { Router } from "express";
import { BillingController } from "../controllers/billing.controller";
import { forbidApiKeys } from "../middleware/sessionOnly";

// The webhook is NOT here: it is unauthenticated and needs a raw body, so app.ts registers it first.
export const createBillingRouter = (controller: BillingController): Router => {
  const router = Router();

  // Billing is JWT-session only: a leaked API key must not be able to open checkout or the portal.
  router.use(forbidApiKeys("manage billing"));
  router.get("/", controller.get);
  router.post("/checkout", controller.checkout);
  router.post("/portal", controller.portal);

  return router;
};
