import { credentialsService } from '../credentials/credentials.service.js';
import {
  disposeMarketData,
  emitProviderRoutingChanged,
  getDefaultProviderName,
  setDefaultProviderName,
} from './registry.js';

export function restampFromCredentialStatus(configured: boolean): 'longbridge' | 'yahoo' {
  const name = configured ? 'longbridge' : 'yahoo';
  const previous = getDefaultProviderName();
  setDefaultProviderName(name);
  if (name !== previous) {
    disposeMarketData();
    emitProviderRoutingChanged();
  }
  return name;
}

export async function stampDefaultProvider(): Promise<'longbridge' | 'yahoo'> {
  try {
    const { configured } = await credentialsService.status();
    return restampFromCredentialStatus(configured);
  } catch {
    return restampFromCredentialStatus(false);
  }
}
