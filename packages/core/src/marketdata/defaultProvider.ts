import { credentialsService } from '../credentials/credentials.service.js';
import { setDefaultProviderName } from './registry.js';

export async function stampDefaultProvider(): Promise<'longbridge' | 'yahoo'> {
  try {
    const { configured } = await credentialsService.status();
    const name = configured ? 'longbridge' : 'yahoo';
    setDefaultProviderName(name);
    return name;
  } catch {
    setDefaultProviderName('yahoo');
    return 'yahoo';
  }
}
