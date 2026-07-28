import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getLicenseModalStateForTests,
  resetLicenseModalStoreForTests,
} from '../edition/licenseModalStore';
import { requestTrainerWindow } from './requestTrainerWindow';

const openTrainer = vi.fn(async () => {});

afterEach(() => {
  resetLicenseModalStoreForTests();
  openTrainer.mockClear();
});

describe('requestTrainerWindow', () => {
  it('opens the window when pro and licensed', () => {
    requestTrainerWindow({ openTrainer }, { pro: true, licensed: true });

    expect(openTrainer).toHaveBeenCalledTimes(1);
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('prompts for a license instead of opening when unlicensed', () => {
    requestTrainerWindow({ openTrainer }, { pro: true, licensed: false });

    expect(openTrainer).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('prompts for a license when the build carries no pro module', () => {
    requestTrainerWindow({ openTrainer }, { pro: false, licensed: false });

    expect(openTrainer).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('stays silent while capabilities are still loading', () => {
    requestTrainerWindow({ openTrainer }, { pro: null, licensed: false });

    expect(openTrainer).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it('does nothing without a desktop bridge', () => {
    requestTrainerWindow(null, { pro: true, licensed: true });

    expect(getLicenseModalStateForTests().open).toBe(false);
  });
});
