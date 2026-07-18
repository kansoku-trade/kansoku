import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { Value } from 'typebox/value';
import { type EpisodeAnswer, episodeAnswerSchema } from '../schema/episode.js';
import { resumeKey } from '../baseline/results.js';

export function assertEpisodeAnswer(answer: EpisodeAnswer): EpisodeAnswer {
  if (Value.Check(episodeAnswerSchema, answer)) return answer;
  const first = Value.Errors(episodeAnswerSchema, answer)[0];
  throw new Error(
    `invalid EpisodeAnswer: ${first?.instancePath ?? '(root)'} ${first?.message ?? 'schema mismatch'}`,
  );
}

export async function appendEpisodeAnswer(file: string, answer: EpisodeAnswer): Promise<void> {
  assertEpisodeAnswer(answer);
  await fs.mkdir(dirname(file), { recursive: true });
  const handle = await fs.open(file, 'a');
  try {
    await handle.write(`${JSON.stringify(answer)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function loadEpisodeResumeKeys(file: string): Promise<Set<string>> {
  const raw = await fs.readFile(file, 'utf8').catch(() => null);
  const keys = new Set<string>();
  if (raw == null) return keys;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: EpisodeAnswer;
    try {
      parsed = JSON.parse(trimmed) as EpisodeAnswer;
    } catch {
      continue;
    }
    if (!Value.Check(episodeAnswerSchema, parsed) || parsed.status === 'api_error') continue;
    keys.add(resumeKey(parsed.model, parsed.questionId, parsed.mode, parsed.rep));
  }
  return keys;
}

export async function readEpisodeAnswers(file: string): Promise<EpisodeAnswer[]> {
  const raw = await fs.readFile(file, 'utf8');
  const answers: EpisodeAnswer[] = [];
  for (const [index, line] of raw.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`invalid episode JSONL at line ${index + 1}`);
    }
    if (!Value.Check(episodeAnswerSchema, parsed)) {
      const first = Value.Errors(episodeAnswerSchema, parsed)[0];
      throw new Error(
        `invalid EpisodeAnswer at line ${index + 1}: ${first?.instancePath ?? '(root)'} ${first?.message ?? 'schema mismatch'}`,
      );
    }
    answers.push(parsed);
  }
  return answers;
}

export function createEpisodeAppendQueue(): (file: string, answer: EpisodeAnswer) => Promise<void> {
  let tail: Promise<unknown> = Promise.resolve();
  return (file, answer) => {
    const next = tail.then(() => appendEpisodeAnswer(file, answer));
    tail = next.catch(() => undefined);
    return next;
  };
}
