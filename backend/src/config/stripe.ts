import Stripe from "stripe";

// Test mode only: a live key is refused at startup, so this code can never move real money.
export const assertTestKey = (key: string | undefined): string => {
  if (!key || !/^[sr]k_test_/.test(key)) {
    throw new Error("STRIPE_SECRET_KEY must be set to a test-mode key (sk_test_... or rk_test_...); live keys are refused");
  }
  return key;
};

const key = assertTestKey(process.env.STRIPE_SECRET_KEY);
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const pricePro = process.env.STRIPE_PRICE_PRO;
if (!webhookSecret || !pricePro) {
  throw new Error("STRIPE_WEBHOOK_SECRET and STRIPE_PRICE_PRO environment variables are required");
}

export const STRIPE_WEBHOOK_SECRET: string = webhookSecret;
export const STRIPE_PRICE_PRO: string = pricePro;

const stripe = new Stripe(key);

export default stripe;
