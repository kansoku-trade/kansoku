import { isDodoTestMode } from "./dodoEnv.js";

const LIVE_PRODUCT_ID = "pdt_0NjOBmGHl9IgFNR2f1Zod";
const TEST_PRODUCT_ID = "pdt_0NjNvPDN6npGvZ1oScS9w";
const PRICE_LABEL = "$9.9 / 月";

export interface SubscriptionInfo {
  url: string;
  priceLabel: string;
}

export function resolveSubscription(env: NodeJS.ProcessEnv = process.env, production?: boolean): SubscriptionInfo {
  const url = isDodoTestMode(env, production)
    ? `https://test.checkout.dodopayments.com/buy/${TEST_PRODUCT_ID}?quantity=1`
    : `https://checkout.dodopayments.com/buy/${LIVE_PRODUCT_ID}?quantity=1`;
  return { url, priceLabel: PRICE_LABEL };
}
