export type AuthUrlOpener = (url: string) => void;

let current: AuthUrlOpener = (url) => {
  console.log(
    `\n[longbridge-stream] 首次授权：在浏览器打开以下 URL 完成登录（授权后 token 会缓存到 ~/.longbridge/openapi/tokens/ 并自动 refresh）\n${url}\n`,
  );
};

export function initAuthUrlOpener(opener?: AuthUrlOpener): void {
  if (opener) current = opener;
}

export function getAuthUrlOpener(): AuthUrlOpener {
  return current;
}
