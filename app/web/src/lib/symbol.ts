export function normalizeSymbol(raw: string): string | null {
  let sym = raw.trim().toUpperCase();
  if (!sym) return null;
  if (!sym.includes(".")) sym += ".US";
  return /^[A-Z0-9.]+$/.test(sym) ? sym : null;
}

export function symbolFromRoute(route: string): string | null {
  const queryIndex = route.indexOf("?");
  const pathname = queryIndex === -1 ? route : route.slice(0, queryIndex);
  const match = pathname.match(/^\/symbol\/(.+)$/);
  if (!match) return null;
  try {
    return normalizeSymbol(decodeURIComponent(match[1]));
  } catch {
    return null;
  }
}
