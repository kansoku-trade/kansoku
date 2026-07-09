export function createRunLock(): {
  tryAcquire(key: string): boolean;
  release(key: string): void;
  isLocked(key: string): boolean;
} {
  const locked = new Set<string>();
  return {
    tryAcquire(key: string): boolean {
      if (locked.has(key)) return false;
      locked.add(key);
      return true;
    },
    release(key: string): void {
      locked.delete(key);
    },
    isLocked(key: string): boolean {
      return locked.has(key);
    },
  };
}
