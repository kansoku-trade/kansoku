import { z } from 'zod';
import {
  clientMessageSchema,
  parseClientInput,
} from '../../platform/zodInput.js';
import { TITLE_MAX_CHARS } from './sessionTitle.js';

export { parseClientInput };
export { CLIENT_MESSAGE_MAX_CHARS as ASSISTANT_MESSAGE_MAX_CHARS } from '../../platform/zodInput.js';

const titleError = `\`title\` must be a non-empty string of at most ${TITLE_MAX_CHARS} characters`;

export const assistantTitleSchema = z
  .string({ error: titleError })
  .trim()
  .min(1, { error: titleError })
  .max(TITLE_MAX_CHARS, { error: titleError });

export const assistantOptionalTitleSchema = z.union([
  z.undefined(),
  z.string({ error: '`title` must be a string' }),
]);

export const assistantMessageSchema = clientMessageSchema;
