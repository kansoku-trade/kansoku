import { createProvider, type OAuthCredential } from "@earendil-works/pi-ai";
import type { LobeHubCloudGateway } from "./types.js";
import { LOBEHUB_API, LOBEHUB_PROVIDER } from "./types.js";

export function createLobeHubProvider(gateway: LobeHubCloudGateway) {
  return createProvider<typeof LOBEHUB_API>({
    id: LOBEHUB_PROVIDER,
    name: "LobeHub Cloud",
    baseUrl: gateway.baseUrl,
    models: [],
    refreshModels: () => gateway.listModels(),
    auth: {
      oauth: {
        name: "LobeHub Cloud",
        async login() {
          throw new Error("请在 trade 设置页通过设备登录连接 LobeHub Cloud");
        },
        async refresh(credential: OAuthCredential) {
          return { ...(await gateway.refreshCredential(credential)), type: "oauth" };
        },
        async toAuth(credential: OAuthCredential) {
          return { apiKey: credential.access };
        },
      },
    },
    api: {
      stream: (model, context, options) => gateway.stream(model as never, context, options),
      streamSimple: (model, context, options) => gateway.stream(model as never, context, options),
    },
  });
}
