import { ipcMain } from 'electron';
import type { BrowserWindow } from 'electron';
import {
  RENDERER_CALL_REQUEST_CHANNEL,
  RENDERER_CALL_RESPONSE_CHANNEL,
  type RendererCallRequest,
  type RendererCallResponse,
} from './channels.js';

const DEFAULT_TIMEOUT_MS = 1500;

export class RendererCallTimeoutError extends Error {}

interface PendingCall {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface RendererCallClient {
  call(win: BrowserWindow, method: string, args?: unknown, timeoutMs?: number): Promise<unknown>;
}

export function createRendererCallClient(): RendererCallClient {
  const pending = new Map<string, PendingCall>();

  ipcMain.on(RENDERER_CALL_RESPONSE_CHANNEL, (_event, payload: RendererCallResponse) => {
    if (!payload || typeof payload.id !== 'string') return;
    const entry = pending.get(payload.id);
    if (!entry) return;
    pending.delete(payload.id);
    clearTimeout(entry.timer);
    if (payload.ok) entry.resolve(payload.result);
    else
      entry.reject(
        new Error(typeof payload.error === 'string' ? payload.error : 'renderer call failed'),
      );
  });

  return {
    call(win, method, args, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new RendererCallTimeoutError(`renderer call timed out: ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        const request: RendererCallRequest = { id, method, args };
        win.webContents.send(RENDERER_CALL_REQUEST_CHANNEL, request);
      });
    },
  };
}
