import { Config, OAuth } from "longbridge";
import { NoCredentialsError } from "../credentials/errors.js";
import { getCredentialProvider } from "../credentials/registry.js";

export async function resolveLongbridgeConfig(): Promise<Config> {
  const oauthId = process.env.LONGBRIDGE_OAUTH_CLIENT_ID;
  if (oauthId) {
    const oauth = await OAuth.build(oauthId, (err, url) => {
      if (err) {
        console.warn("[longbridge-stream] OAuth error", err.message);
        return;
      }
      console.log(
        `\n[longbridge-stream] 首次授权：在浏览器打开以下 URL 完成登录（授权后 token 会缓存到 ~/.longbridge/openapi/tokens/ 并自动 refresh）\n${url}\n`,
      );
    });
    return Config.fromOAuth(oauth);
  }
  const creds = await getCredentialProvider().getLongbridgeCredentials();
  if (!creds) throw new NoCredentialsError();
  return Config.fromApikey(creds.appKey, creds.appSecret, creds.accessToken);
}
