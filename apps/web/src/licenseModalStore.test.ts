// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./client', () => ({ client: {} }));

const {
  closeLicenseModal,
  getLicenseModalStateForTests,
  openLicenseModal,
  resetLicenseModalStoreForTests,
} = await import('./licenseModalStore');

describe('licenseModalStore', () => {
  afterEach(() => {
    resetLicenseModalStoreForTests();
  });

  it('starts closed with no trigger', () => {
    expect(getLicenseModalStateForTests()).toEqual({ open: false, trigger: null });
  });

  it('openLicenseModal opens with the given trigger', () => {
    openLicenseModal('guard');
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'guard' });
  });

  it('openLicenseModal switches the trigger without stacking a second modal', () => {
    openLicenseModal('guard');
    openLicenseModal('runtime-403');
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: 'runtime-403' });
  });

  it('closeLicenseModal closes and clears the trigger, no-ops when already closed', () => {
    openLicenseModal('guard');
    closeLicenseModal();
    expect(getLicenseModalStateForTests()).toEqual({ open: false, trigger: null });
    closeLicenseModal();
    expect(getLicenseModalStateForTests()).toEqual({ open: false, trigger: null });
  });
});
