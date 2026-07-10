let lastError: string | null = null;

export function recordCredentialRejection(message: string): void {
  lastError = message;
}

export function clearCredentialRejection(): void {
  lastError = null;
}

export function getLastCredentialError(): string | null {
  return lastError;
}

export function resetCredentialStatusForTests(): void {
  lastError = null;
}
