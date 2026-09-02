import type { ProAiMemory } from '@kansoku/pro-api';

let activeMemory: ProAiMemory | null = null;

export function registerProAiMemory(memory: ProAiMemory): void {
  activeMemory = memory;
}

export function resetProAiMemoryForTests(): void {
  activeMemory = null;
}

export function proAiMemory(): ProAiMemory | null {
  return activeMemory;
}
