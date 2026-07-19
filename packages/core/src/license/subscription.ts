import { isDodoTestMode } from './dodoEnv.js';

const LIVE_PRODUCT_ID = 'pdt_0NjOBmGHl9IgFNR2f1Zod';
const TEST_PRODUCT_ID = 'pdt_0NjNvPDN6npGvZ1oScS9w';
const LIVE_ANNUAL_PRODUCT_ID = 'pdt_0NjRt0rcnR6TufaaKkwZ3';
const TEST_ANNUAL_PRODUCT_ID = 'pdt_0NjRs5OcJzWCoo7Mt35jM';
const PRICE_LABEL = '$9.9 / 月';
const ANNUAL_PRICE_LABEL = '$99 / 年';
const ANNUAL_SAVINGS_LABEL = '省 17%';
// Mirrors the Trial Period Days setting on all four Dodo products; keep in sync with the dashboard.
const TRIAL_DAYS = 7;

export interface SubscriptionPlan {
  url: string;
  priceLabel: string;
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
    trialDays: TRIAL_DAYS,
    yearly: {
      url: `${base}/buy/${annualId}?quantity=1`,
      priceLabel: ANNUAL_PRICE_LABEL,
      trialDays: TRIAL_DAYS,
      savingsLabel: ANNUAL_SAVINGS_LABEL,
    },
  };
}
