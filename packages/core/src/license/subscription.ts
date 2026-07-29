import { isDodoTestMode } from './dodoEnv.js';

const LIVE_PRODUCT_ID = 'pdt_0NjOBmGHl9IgFNR2f1Zod';
const TEST_PRODUCT_ID = 'pdt_0NjNvPDN6npGvZ1oScS9w';
const LIVE_ANNUAL_PRODUCT_ID = 'pdt_0NjRt0rcnR6TufaaKkwZ3';
const TEST_ANNUAL_PRODUCT_ID = 'pdt_0NjRs5OcJzWCoo7Mt35jM';

// Actual checkout price stays $9.9; list + discount are the conversion frame
// (anchor high → mark 50% off → pay the same). Yearly list is 2× so the badge is exact 5 折.
const LIST_PRICE_LABEL = '$20 / 月';
const PRICE_LABEL = '$9.9 / 月';
const DISCOUNT_LABEL = '限时 5 折';
const ANNUAL_LIST_PRICE_LABEL = '$199 / 年';
const ANNUAL_PRICE_LABEL = '$99 / 年';
const ANNUAL_DISCOUNT_LABEL = '限时 5 折';
const ANNUAL_SAVINGS_LABEL = '比月付再省 17%';
// Mirrors the Trial Period Days setting on all four Dodo products; keep in sync with the dashboard.
const TRIAL_DAYS = 7;

export interface SubscriptionPlan {
  url: string;
  priceLabel: string;
  listPriceLabel: string;
  discountLabel: string;
  trialDays: number;
}

export interface SubscriptionInfo extends SubscriptionPlan {
  yearly: SubscriptionPlan & { savingsLabel: string };
}

export function resolveSubscription(
  env: NodeJS.ProcessEnv = process.env,
  production?: boolean,
): SubscriptionInfo {
  const test = isDodoTestMode(env, production);
  const base = test ? 'https://test.checkout.dodopayments.com' : 'https://checkout.dodopayments.com';
  const monthlyId = test ? TEST_PRODUCT_ID : LIVE_PRODUCT_ID;
  const annualId = test ? TEST_ANNUAL_PRODUCT_ID : LIVE_ANNUAL_PRODUCT_ID;
  return {
    url: `${base}/buy/${monthlyId}?quantity=1`,
    priceLabel: PRICE_LABEL,
    listPriceLabel: LIST_PRICE_LABEL,
    discountLabel: DISCOUNT_LABEL,
    trialDays: TRIAL_DAYS,
    yearly: {
      url: `${base}/buy/${annualId}?quantity=1`,
      priceLabel: ANNUAL_PRICE_LABEL,
      listPriceLabel: ANNUAL_LIST_PRICE_LABEL,
      discountLabel: ANNUAL_DISCOUNT_LABEL,
      trialDays: TRIAL_DAYS,
      savingsLabel: ANNUAL_SAVINGS_LABEL,
    },
  };
}
