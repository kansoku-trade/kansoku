import {
  appendFileSync,
  closeSync,
  existsSync,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { inspect } from 'node:util';

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

export type FileLoggerOptions = {
  logFilePath: string;
  maxBytes?: number;
  now?: () => Date;
};

export type FileLogger = {
  path: string;
  append(level: LogLevel, args: unknown[]): void;
  writeLine(line: string): void;
  tail(maxBytes?: number): string;
  dispose(): void;
};

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_TAIL_BYTES = 256 * 1024;

const SECRET_PATTERNS: RegExp[] = [
  /\bbearer\s+[\w+./=-]+/gi,
  /\bsk-[\dA-Za-z]{10,}/g,
  /\boidc-auth:\s*\S+/gi,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token)\s*[:=]\s*["']?[^\s"',}]+/gi,
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out;
}

export function formatLogArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      if (arg instanceof Error) return arg.stack ?? arg.message;
      try {
        return inspect(arg, { depth: 4, breakLength: 120, colors: false });
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

export function formatLogLine(level: LogLevel, args: unknown[], now: Date): string {
  const stamp = now.toISOString();
  const body = redactSecrets(formatLogArgs(args));
  return `${stamp} [${level}] ${body}\n`;
}

export function resolveMainLogPath(logsDir: string): string {
  return join(logsDir, 'main.log');
}

export function createFileLogger(options: FileLoggerOptions): FileLogger {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const now = options.now ?? (() => new Date());
  const logFilePath = options.logFilePath;

  mkdirSync(dirname(logFilePath), { recursive: true });
  if (!existsSync(logFilePath)) {
    writeFileSync(logFilePath, '', 'utf8');
  }

  const writeLine = (line: string): void => {
    try {
      rotateIfNeeded(logFilePath, maxBytes, Buffer.byteLength(line, 'utf8'));
      appendFileSync(logFilePath, line, 'utf8');
    } catch {
      // Never let logging take down the app.
    }
  };

  return {
    path: logFilePath,
    append(level, args) {
      writeLine(formatLogLine(level, args, now()));
    },
    writeLine,
    tail(maxBytes = DEFAULT_TAIL_BYTES) {
      return readTail(logFilePath, maxBytes);
    },
    dispose() {},
  };
}

export function installConsoleBridge(logger: FileLogger): () => void {
  const levels: LogLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
  const originals = new Map<LogLevel, (...args: unknown[]) => void>();

  for (const level of levels) {
    const original = console[level].bind(console) as (...args: unknown[]) => void;
    originals.set(level, original);
    console[level] = (...args: unknown[]) => {
      original(...args);
      logger.append(level, args);
    };
  }

  return () => {
    for (const level of levels) {
      const original = originals.get(level);
      if (original) console[level] = original as typeof console.log;
    }
  };
}

function rotateIfNeeded(logFilePath: string, maxBytes: number, nextWriteBytes: number): void {
  if (!existsSync(logFilePath)) return;
  let size = 0;
  try {
    const fd = openSync(logFilePath, 'r');
    try {
      size = fstatSync(fd).size;
    } finally {
      closeSync(fd);
    }
  } catch {
    return;
  }
  if (size + nextWriteBytes <= maxBytes) return;

  const backup = `${logFilePath}.1`;
  try {
    if (existsSync(backup)) unlinkSync(backup);
    renameSync(logFilePath, backup);
  } catch {
    try {
      writeFileSync(logFilePath, '', 'utf8');
    } catch {
      // ignore
    }
  }
}

export function readTail(filePath: string, maxBytes: number): string {
  if (!existsSync(filePath)) return '';
  const fd = openSync(filePath, 'r');
  try {
    const size = fstatSync(fd).size;
    if (size === 0) return '';
    const start = Math.max(0, size - maxBytes);
    const length = size - start;
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, start);
    let text = buf.toString('utf8');
    if (start > 0) {
      const nl = text.indexOf('\n');
      if (nl >= 0 && nl < text.length - 1) text = text.slice(nl + 1);
    }
    return text;
  } finally {
    closeSync(fd);
  }
}
