import { resolveSubscription } from '../../../../packages/core/src/license/subscription';

export const subscription = resolveSubscription(process.env, true);
