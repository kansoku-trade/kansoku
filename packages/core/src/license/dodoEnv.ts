let productionHost = false;

export function setProductionHost(value: boolean): void {
  productionHost = value;
}

// Dev defaults to Dodo's test environment so a casual `pnpm dev` can never
// hit live checkout or burn live activation slots; production hosts
// (packaged desktop, NODE_ENV=production server) default to live.
// KANSOKU_DODO_LIVE=1 is the explicit dev escape hatch; KANSOKU_DODO_TEST=1
// still forces test anywhere (packaged QA).
export function isDodoTestMode(env: NodeJS.ProcessEnv = process.env, production: boolean = productionHost): boolean {
  if (env.KANSOKU_DODO_TEST === "1") return true;
  if (env.KANSOKU_DODO_LIVE === "1") return false;
  return !production;
}
