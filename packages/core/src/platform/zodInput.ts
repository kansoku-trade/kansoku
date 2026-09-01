import { z } from 'zod';
import { ClientError } from './errors.js';

export function parseClientInput<T>(
  schema: { parse: (input: unknown) => T },
  input: unknown,
  hint?: string,
): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ClientError) throw error;
    if (error instanceof z.ZodError) {
      throw new ClientError(error.issues[0]?.message ?? 'invalid input', hint, 400);
    }
    throw error;
  }
}

export const CLIENT_MESSAGE_MAX_CHARS = 4_000;

const messageError = `\`text\` must be a non-empty string of at most ${CLIENT_MESSAGE_MAX_CHARS} characters`;

export const clientMessageSchema = z
  .string({ error: messageError })
  .trim()
  .min(1, { error: messageError })
  .max(CLIENT_MESSAGE_MAX_CHARS, { error: messageError });

const licenseKeyError = '`key` must be a non-empty string';

export const licenseKeySchema = z.string({ error: licenseKeyError }).min(1, { error: licenseKeyError });

const DATE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export const dateYmdSchema = z.string().regex(DATE_YMD_RE);

export function parseDateYmd(date: unknown): string {
  try {
    return dateYmdSchema.parse(date);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ClientError(`invalid date: ${String(date)}`, 'expected YYYY-MM-DD');
    }
    throw error;
  }
}

const JOURNAL_NAME_RE = /^\d{4}-\d{2}-\d{2}-[\w-]+\.md$/;

export const journalNameSchema = z.string().regex(JOURNAL_NAME_RE);

export function parseJournalName(name: unknown): string {
  try {
    return journalNameSchema.parse(name);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ClientError(
        `invalid journal name: ${String(name)}`,
        'expected YYYY-MM-DD-<slug>.md',
      );
    }
    throw error;
  }
}
