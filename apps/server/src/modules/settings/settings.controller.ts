import { Body, Controller, Delete, Get, Param, Post, Put } from '@tsuki-hono/common';
import { settingsService } from '@kansoku/core/settings/settings.service';
import { jsonResponse } from '../../httpResponse.js';

@Controller('settings')
export class SettingsController {
  @Get('/ai')
  async getAi() {
    const data = await settingsService.getAi();
    return { ok: true, data };
  }

  @Put('/ai/roles/:role')
  async putRole(@Param('role') role: string, @Body() body: Record<string, unknown> | null) {
    const data = await settingsService.putRole({ role, ...body });
    return { ok: true, data };
  }

  @Delete('/ai/roles/:role')
  async deleteRole(@Param('role') role: string) {
    const data = await settingsService.deleteRole({ role });
    return { ok: true, data };
  }

  @Put('/ai/credentials/:provider')
  async putCredential(@Param('provider') provider: string, @Body() body: { key?: unknown } | null) {
    const data = await settingsService.putCredential({ provider, key: body?.key });
    return { ok: true, data };
  }

  @Delete('/ai/credentials/:provider')
  async deleteCredential(@Param('provider') provider: string) {
    const data = await settingsService.deleteCredential({ provider });
    return { ok: true, data };
  }

  @Get('/ai/catalog')
  async getCatalog() {
    const data = await settingsService.getCatalog();
    return { ok: true, data };
  }

  @Post('/ai/test')
  async postTest(@Body() body: Record<string, unknown> | null) {
    const result = await settingsService.testConnection(body ?? {});
    if (result.ok) return { ok: true, data: result };
    return jsonResponse(result.status, { ok: false, error: result.error, hint: result.hint });
  }

  @Get('/ai/usage-today')
  async getUsageToday() {
    const data = await settingsService.getUsageToday();
    return { ok: true, data };
  }

  @Post('/ai/reset-credentials')
  async postResetCredentials() {
    const data = await settingsService.resetCredentials();
    return { ok: true, data };
  }

  @Get('/watched-markets')
  async getWatchedMarkets() {
    const data = await settingsService.getWatchedMarkets();
    return { ok: true, data };
  }

  @Put('/watched-markets')
  async putWatchedMarkets(@Body() body: { markets?: unknown } | null) {
    const data = await settingsService.putWatchedMarkets({ markets: body?.markets });
    return { ok: true, data };
  }

  @Get('/subscribe-url')
  async getSubscribeUrl() {
    const data = await settingsService.getSubscribeUrl();
    return { ok: true, data };
  }
}
