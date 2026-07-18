import { envCredentialProvider } from './envCredentialProvider.js';
import type { CredentialProvider } from './types.js';

let current: CredentialProvider = envCredentialProvider;

export function initCredentialProvider(provider: CredentialProvider = envCredentialProvider): void {
  current = provider;
}

export function getCredentialProvider(): CredentialProvider {
  return current;
}

export function setCredentialProviderForTests(provider: CredentialProvider | null): void {
  current = provider ?? envCredentialProvider;
}
