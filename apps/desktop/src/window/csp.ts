import type { Session } from 'electron';

export const CSP_HEADER_NAME = 'Content-Security-Policy';

export interface CspOptions {
  // Extra origins the renderer's own <script src="..."> tags need beyond
  // 'self' and the pro-asset: scheme — e.g. an external telemetry script
  // still present in apps/web/index.html.
  extraScriptSrcOrigins?: string[];
  // Nonce for the inline <script type="importmap"> bootstrapWebEditionHost
  // injects to alias react/react-dom/client to blob: URLs re-exporting the
  // host's already-loaded React singleton into the pro edition's externalized
  // chunk. Without it, an unnonced inline script is blocked outright and the
  // pro page can never mount under this CSP.
  scriptNonce?: string;
}

export function buildContentSecurityPolicy(options: CspOptions = {}): string {
  const scriptSrc = [
    "'self'",
    'pro-asset:',
    'blob:',
    ...(options.scriptNonce ? [`'nonce-${options.scriptNonce}'`] : []),
    ...(options.extraScriptSrcOrigins ?? []),
  ];

  return [
    `default-src 'self'`,
    `script-src ${scriptSrc.join(' ')}`,
    // The initial index.html ships a <style> block for the boot skeleton —
    // that predates this CSP and is not part of the script-src hardening
    // this policy exists for, so style-src stays permissive rather than
    // breaking the existing boot screen.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data:`,
    `font-src 'self' data:`,
    `connect-src 'self' pro-asset: ws: wss:`,
    `object-src 'none'`,
    `base-uri 'self'`,
  ].join('; ');
}

export function applyContentSecurityPolicy(target: Session, options: CspOptions = {}): void {
  const policy = buildContentSecurityPolicy(options);
  target.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        [CSP_HEADER_NAME]: [policy],
      },
    });
  });
}
