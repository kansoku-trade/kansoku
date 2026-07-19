import { describe, expect, it } from 'vitest';
import { allRoutes } from '@kansoku/core/contract/index';
import { IPC_GROUPS, KERNEL_IPC_GROUPS, SHELL_IPC_GROUPS } from '@desktop/kernel/ipc/groups.js';

describe('IPC_GROUPS', () => {
  it("kernel groups match the contract's AppApi group keys exactly", () => {
    expect([...KERNEL_IPC_GROUPS].sort()).toEqual(Object.keys(allRoutes).sort());
  });

  it('is the union of kernel and shell groups with no overlap', () => {
    expect(IPC_GROUPS).toEqual([...KERNEL_IPC_GROUPS, ...SHELL_IPC_GROUPS]);
    expect(new Set(IPC_GROUPS).size).toBe(IPC_GROUPS.length);
  });
});
