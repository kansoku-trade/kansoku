import { Body, Controller, Get, Post } from "@tsuki-hono/common";
import { ClientError } from "@kansoku/core/platform/errors";
import { licenseService } from "@kansoku/core/license/license.service";

function requireKey(body: { key?: unknown } | null): string {
  if (typeof body?.key !== "string" || !body.key) {
    throw new ClientError("`key` must be a non-empty string", '{"key":"..."}');
  }
  return body.key;
}

@Controller("license")
export class LicenseController {
  @Get("/status")
  async status() {
    const data = await licenseService.status();
    return { ok: true, data };
  }

  @Post("/activate")
  async activate(@Body() body: { key?: unknown } | null) {
    const data = await licenseService.activate(requireKey(body));
    return { ok: true, data };
  }

  @Post("/deactivate")
  async deactivate() {
    const data = await licenseService.deactivate();
    return { ok: true, data };
  }
}
