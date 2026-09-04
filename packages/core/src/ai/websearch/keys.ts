export async function readSearchApiKey(
  providerId: string,
  envVar: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | null> {
  // The credential store lives behind the AI runtime singleton, which is absent in tests and in
  // one-shot CLI paths; the env var is the only source there.
  try {
    const { getAiRuntime } = await import('../settings/initAiSettings.js');
    const credential = await getAiRuntime().credentials.read(providerId);
    if (credential?.type === 'api_key' && credential.key) return credential.key;
  } catch {
    // No AI runtime here; fall through to the env var.
  }
  return env[envVar]?.trim() || null;
}
