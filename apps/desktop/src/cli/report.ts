export function emit(payload: unknown): void {
  process.stdout.write(JSON.stringify(payload) + '\n');
}
