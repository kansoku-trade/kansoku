import type { Env } from "./env.js";
import { handleActivate, handleDeactivate, handleValidate, type ProxyDeps } from "./dodoProxy.js";
import { createThrottle } from "./throttle.js";

const sharedThrottle = createThrottle();

export function createRequestHandler(deps: ProxyDeps): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return new Response("method not allowed", { status: 405 });

    const url = new URL(request.url);
    switch (url.pathname) {
      case "/activate":
        return handleActivate(request, deps);
      case "/validate":
        return handleValidate(request, deps);
      case "/deactivate":
        return handleDeactivate(request, deps);
      default:
        return new Response("not found", { status: 404 });
    }
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const handler = createRequestHandler({
      // 裸引用会丢 this 绑定，workerd 运行时抛 Illegal invocation（注入 stub 的测试测不出）
      fetch: globalThis.fetch.bind(globalThis),
      env,
      throttle: sharedThrottle,
      now: () => Date.now(),
    });
    return handler(request);
  },
};
