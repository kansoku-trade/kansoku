import type { CommentLevel, Notice } from "../../../../packages/shared/types";

export type NotifyEnvelope =
  | { type: "comment"; live: boolean; symbol: string; level: CommentLevel; text: string }
  | { type: "notice"; live: boolean; notice: Notice };

export interface NotifyContext {
  hidden: boolean;
  permission: NotificationPermission | "unsupported";
  activeSymbol?: string | null;
}

export interface NotifyContent {
  title: string;
  body: string;
}

export function decideNotification(env: NotifyEnvelope, ctx: NotifyContext): NotifyContent | null {
  if (!env.live) return null;
  if (ctx.permission !== "granted") return null;
  const symbol = env.type === "comment" ? env.symbol : env.notice.symbol;
  const activeSymbol = ctx.activeSymbol?.trim().toUpperCase();
  if (!ctx.hidden && (ctx.activeSymbol === undefined || activeSymbol === symbol.trim().toUpperCase())) return null;
  if (env.type === "comment") {
    if (env.level !== "alert") return null;
    return { title: `${env.symbol} 盘中警报`, body: env.text };
  }
  return { title: env.notice.title, body: env.notice.body };
}

let permissionRequested = false;

export function requestNotificationPermissionOnce(): void {
  if (permissionRequested) return;
  permissionRequested = true;
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

export function notify(content: NotifyContent): void {
  if (typeof Notification === "undefined") return;
  const n = new Notification(content.title, { body: content.body });
  n.onclick = () => {
    window.focus();
    n.close();
  };
}

export function currentNotifyContext(activeSymbol?: string | null): NotifyContext {
  return {
    hidden: document.hidden || document.visibilityState !== "visible",
    permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    activeSymbol,
  };
}

export function maybeNotify(env: NotifyEnvelope, activeSymbol?: string | null): void {
  const content = decideNotification(env, currentNotifyContext(activeSymbol));
  if (content) notify(content);
}
