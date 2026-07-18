import type { TransportEnvelope } from '@kansoku/core/contract/index';
import { ApiError } from '../api';
import { isLicenseRequiredErrorCode, markLicenseRequired } from '../licenseRequiredMode';
import { isCredentialsErrorCode, markRestricted } from '../restrictedMode';

export function unwrapEnvelope<T>(
  envelope: TransportEnvelope<T>,
  status: number,
): { data: T; meta?: Record<string, unknown> } {
  if (!envelope.ok) {
    if (isCredentialsErrorCode(status, envelope.code)) markRestricted();
    if (isLicenseRequiredErrorCode(status, envelope.code)) markLicenseRequired();
    throw new ApiError(
      envelope.hint ? `${envelope.error} (${envelope.hint})` : envelope.error,
      status,
      envelope.code,
    );
  }
  return { data: envelope.data, meta: envelope.meta };
}
