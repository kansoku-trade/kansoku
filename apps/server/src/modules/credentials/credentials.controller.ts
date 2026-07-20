import { Controller, Get } from '@tsuki-hono/common';
import { credentialsService } from '@kansoku/core/credentials/credentials.service';

@Controller('credentials')
export class CredentialsController {
  @Get('/status')
  async getStatus() {
    const data = await credentialsService.status();
    return { ok: true, data };
  }

  @Get('/opencli')
  async getOpencliStatus() {
    const data = await credentialsService.opencliStatus();
    return { ok: true, data };
  }
}
