import { Controller, Delete, Get, Post } from "@tsuki-hono/common";
import { lobehubService } from "../../../../packages/core/src/modules/lobehub/lobehub.service.js";

export { setLobeHubDepsForTests } from "../../../../packages/core/src/modules/lobehub/lobehub.deps.js";

@Controller("ai/providers/lobehub")
export class LobeHubController {
  @Post("/device-login")
  async startDeviceLogin() {
    const data = await lobehubService.startDeviceLogin();
    return { ok: true, data };
  }

  @Post("/device-login/poll")
  async pollDeviceLogin() {
    const data = await lobehubService.pollDeviceLogin();
    return { ok: true, data };
  }

  @Get("/account")
  async getAccount() {
    const data = await lobehubService.getAccount();
    return { ok: true, data };
  }

  @Get("/credits")
  async getCredits() {
    const data = await lobehubService.getCredits();
    return { ok: true, data };
  }

  @Delete("/session")
  async deleteSession() {
    const data = await lobehubService.deleteSession();
    return { ok: true, data };
  }
}
