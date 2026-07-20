import { Controller, Delete, Get, Post } from '@tsuki-hono/common';
import { lobehubService } from '@kansoku/core/ai/lobehub/lobehub.service';

export { setLobeHubDepsForTests } from '@kansoku/core/ai/lobehub/lobehub.deps';

@Controller('ai/providers/lobehub')
export class LobeHubController {
  @Post('/device-login')
  async startDeviceLogin() {
    const data = await lobehubService.startDeviceLogin();
    return { ok: true, data };
  }

  @Post('/device-login/poll')
  async pollDeviceLogin() {
    const data = await lobehubService.pollDeviceLogin();
    return { ok: true, data };
  }

  @Get('/account')
  async getAccount() {
    const data = await lobehubService.getAccount();
    return { ok: true, data };
  }

  @Get('/credits')
  async getCredits() {
    const data = await lobehubService.getCredits();
    return { ok: true, data };
  }

  @Delete('/session')
  async deleteSession() {
    const data = await lobehubService.deleteSession();
    return { ok: true, data };
  }
}
