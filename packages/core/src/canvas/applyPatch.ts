export interface PatchChunk {
  anchor: string | null;
  oldLines: string[];
  newLines: string[];
  atEnd: boolean;
}

export interface PatchFile {
  path: string;
  chunks: PatchChunk[];
}

export class PatchError extends Error {}

const BEGIN = '*** Begin Patch';
const END = '*** End Patch';
const UPDATE = '*** Update File: ';
const END_OF_FILE = '*** End of File';

export function parsePatch(text: string): PatchFile[] {
  const lines = text.replaceAll(/\r\n/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
  if (lines[0]?.trim() !== BEGIN) throw new PatchError(`patch must start with "${BEGIN}"`);
  if (lines[lines.length - 1]?.trim() !== END) throw new PatchError(`patch must end with "${END}"`);

  const files: PatchFile[] = [];
  let file: PatchFile | null = null;
  let chunk: PatchChunk | null = null;

  const openChunk = (anchor: string | null): PatchChunk => {
    if (!file) throw new PatchError('hunk appears before any "*** Update File:" line');
    const next: PatchChunk = { anchor, oldLines: [], newLines: [], atEnd: false };
    file.chunks.push(next);
    return next;
  };

  for (let i = 1; i < lines.length - 1; i++) {
    const line = lines[i];
    if (line.startsWith(UPDATE)) {
      file = { path: line.slice(UPDATE.length).trim(), chunks: [] };
      chunk = null;
      files.push(file);
      continue;
    }
    if (line.startsWith('*** Add File:') || line.startsWith('*** Delete File:')) {
      throw new PatchError(
        `${line.split(':')[0]} is not supported here; use save_canvas to create or replace a canvas`,
      );
    }
    if (line.startsWith('*** Move to:')) throw new PatchError('*** Move to is not supported');
    if (line.startsWith('@@')) {
      const anchor = line.slice(2).trim();
      chunk = openChunk(anchor || null);
      continue;
    }
    if (line === END_OF_FILE) {
      if (!chunk) throw new PatchError(`"${END_OF_FILE}" without a hunk`);
      chunk.atEnd = true;
      continue;
    }
    chunk ??= openChunk(null);
    const marker = line[0];
    const body = line.slice(1);
    if (marker === '+') chunk.newLines.push(body);
    else if (marker === '-') chunk.oldLines.push(body);
    else if (marker === ' ' || line === '') {
      chunk.oldLines.push(body);
      chunk.newLines.push(body);
    } else {
      throw new PatchError(`line ${i + 1} must start with " ", "-", "+", or "@@": ${line}`);
    }
  }
  if (!files.length) throw new PatchError('patch contains no "*** Update File:" section');
  for (const f of files) {
    if (!f.chunks.length) throw new PatchError(`${f.path}: no hunks`);
  }
  return files;
}

const NORMALIZERS: ((s: string) => string)[] = [(s) => s, (s) => s.trimEnd(), (s) => s.trim()];

function matchesAt(
  haystack: string[],
  needle: string[],
  start: number,
  norm: (s: string) => string,
): boolean {
  for (let j = 0; j < needle.length; j++) {
    if (norm(haystack[start + j]) !== norm(needle[j])) return false;
  }
  return true;
}

function findLines(haystack: string[], needle: string[], from: number, atEnd: boolean): number {
  if (!needle.length) return atEnd ? haystack.length : from;
  const last = haystack.length - needle.length;
  for (const norm of NORMALIZERS) {
    if (atEnd) {
      if (last >= from && matchesAt(haystack, needle, last, norm)) return last;
      continue;
    }
    for (let start = from; start <= last; start++) {
      if (matchesAt(haystack, needle, start, norm)) return start;
    }
  }
  return -1;
}

export function applyChunks(source: string, chunks: PatchChunk[]): string {
  const lines = source.split('\n');
  let cursor = 0;
  chunks.forEach((chunk, index) => {
    const label = `hunk ${index + 1}`;
    if (chunk.anchor) {
      const at = findLines(lines, [chunk.anchor], cursor, false);
      if (at < 0) throw new PatchError(`${label}: context "@@ ${chunk.anchor}" not found`);
      cursor = at + 1;
    }
    const at = findLines(lines, chunk.oldLines, cursor, chunk.atEnd);
    if (at < 0) {
      const first = chunk.oldLines[0] ?? '';
      throw new PatchError(`${label}: lines not found starting at "${first}"`);
    }
    lines.splice(at, chunk.oldLines.length, ...chunk.newLines);
    cursor = at + chunk.newLines.length;
  });
  return lines.join('\n');
}
