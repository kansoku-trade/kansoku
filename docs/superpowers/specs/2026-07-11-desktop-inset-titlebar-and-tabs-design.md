# Desktop inset titlebar + in-window tabs

Date: 2026-07-11
Scope: `apps/desktop`, `apps/web` (Electron-only behavior; web/browser mode unaffected)

## Problem

The desktop shell (`apps/desktop`) currently uses the default macOS window chrome — a native title bar plus a separate `GlobalTopbar` overlay (new-chart button, settings link) rendered by the web app. This looks like a web page in a window, not a native macOS app. There is also no way to have more than one route open at once; navigating away loses the previous page's place.

## Goals

- Native-feeling macOS window: no system title bar, inset traffic lights, everything below them is our own draggable UI.
- Browser/VS-Code-style in-window tabs: any route (home, a stock's detail page, settings, a chart) can be opened in its own tab, multiple of the same kind allowed (e.g. two settings tabs, or NVDA + MRVL side by side).
- Titlebar and tab strip are one merged row, not two stacked bars.
- Tabs persist across app restarts.
- Desktop-only. The web/browser build (`pnpm dev`, non-Electron) is untouched — no tabs, no custom titlebar, existing `GlobalTopbar` + single-route `Router` stay exactly as they are.

## Non-goals

- No cross-platform (Windows/Linux) titlebar work — this app ships `--mac` only (`desktop/package.json`'s `package` script, and `main.ts:310`'s `process.platform !== "darwin"` quit guard confirm this).
- No true OS-level tab merging (`window.mergeAllWindows` / one `BrowserWindow` per tab). Tabs are a single `BrowserWindow`, one shared renderer/DOM, our own UI — matches "browser-style in-window tabs," not "multi-window."
- No in-tab back/forward history stack. `navigate()` within a tab replaces that tab's current route; there is no per-tab history beyond "current route."
- No keeping background tabs mounted/live (see Approach below) — this is a deliberate trade-off, not a missing feature.

## Approach: single active tab mounted, background tabs inert

Two mounting strategies were considered:

1. **(chosen) Only the active tab's page tree is mounted.** Switching tabs unmounts the previous tab's components and mounts the new tab's route fresh (brief refetch/loading). Inactive tabs remember only `{ route, title, scrollY }`. `scrollY` is captured on deactivate and restored on reactivate to soften the "not actually alive" feeling.
2. **All opened tabs stay mounted, hidden via CSS.** Instant switching, live background data. Rejected: `Home`/`SymbolCockpit` use `useSSE`/`useIntervalFetch` on the assumption that there is exactly one live instance; keeping N tabs mounted multiplies SSE/WS subscriptions and polling against the Longbridge-backed kernel for tabs the user isn't even looking at, for a data class (quotes, positions) that's stale the moment it's not being watched anyway. The refactor surface is also much larger (every realtime hook has to become multi-instance-safe).

Approach 1 keeps the diff small and matches how this app's data should behave (fetch when looked at, not before).

## 1. Window chrome (`desktop/src/main.ts`)

`createWindow()`'s `BrowserWindow` constructor options gain:

```js
titleBarStyle: "hiddenInset",
trafficLightPosition: { x: 12, y: 12 },
```

No other window-creation behavior changes. This has no effect when the same web bundle runs in a real browser (`titleBarStyle` is an Electron-only `BrowserWindow` option).

## 2. Tab data model + persistence

New files under `web/src/desktop/`: `tabsStore.ts` (state + persistence), `TabsProvider.tsx` (React context + provider).

```ts
type TabState = {
  id: string;       // crypto.randomUUID()
  route: string;     // pathname + search, e.g. "/symbol/NVDA"
  title: string;      // mirrors useTitle's pageName, defaults to "Kansoku"
  scrollY: number;
};
```

`TabsProvider` holds `tabs: TabState[]` and `activeTabId`, mounted only when `isDesktopRealtime()` is true (`web/src/portTransport.ts`'s existing detection).

- **Persistence:** every change to `tabs`/`activeTabId` is written to `localStorage` (Electron's `app://` origin renderer already has durable storage — no new IPC channel or main-process file needed). On startup, state is read back; if missing or malformed, falls back to a single home tab.
- **Closing the last tab** immediately opens a new home tab — closing to zero tabs is not a reachable state.

## 3. Routing (existing page components are unmodified)

`router.ts` currently reads/writes `window.location` directly. It gains a pluggable-store indirection:

```ts
interface RouteStore {
  getRoute(): string;                 // pathname + search
  subscribe(cb: () => void): () => void;
  push(route: string): void;
  replace(route: string): void;
}
```

- `windowStore`: the existing `window.location`/`pushState`/`popstate` implementation, unchanged in behavior. This remains the default.
- A new internal `__setActiveRouteStore(store: RouteStore | null)`, called only by `TabsProvider` when the active tab changes. It points router.ts's global functions at an in-memory `RouteStore` scoped to that one tab (desktop mode has no real address bar, so no `pushState` is involved).
- `useRoute()`, `navigate()`, `useQueryParam()` resolve against `activeStore ?? windowStore` internally. **Public signatures do not change.**
- Consequence: `Home.tsx`, `SymbolCockpit.tsx`, `SettingsPage.tsx`, `QuickBar.tsx`, `CrossSectionCharts.tsx`, `NewChartDialog.tsx`, `RestrictedBanner.tsx`, `App.tsx` require zero changes — they keep calling `navigate()`/`useRoute()`/`useQueryParam()` exactly as today.
- Clicking a link inside a tab still navigates within that same tab (no new tab). New tabs are created only via explicit actions (⌘T, the `+` button, "open in new tab").
- `useTitle.ts` gains an equivalent optional title sink: when set (desktop mode, active tab), `useTitle` also writes the tab's `title` field, for the tab strip's label. Non-desktop behavior (`document.title = ...`) is unchanged.

## 4. Titlebar UI

New `web/src/desktop/DesktopTitlebar.tsx`, swapped in for `GlobalTopbar` only when `isDesktopRealtime()`:

```
[traffic-light spacer ~78px] [tab] [tab] [tab] [+]  ...(drag region)...  [新建图表] [⚙]
```

- The whole row is `-webkit-app-region: drag`; every interactive element (tabs, `+`, action buttons) is individually `-webkit-app-region: no-drag`.
- Visual language matches the existing dark/minimal aesthetic (`--radius: 2px`, 1px borders, `--fs-sm`) — flat VS-Code-style tabs, not overlapping rounded Chrome tabs. Active tab: bottom `--accent` underline + slightly brighter background. Inactive: dimmed text. Close button (×) appears on hover.
- The settings button opens/focuses a settings tab (creates one if none is open, otherwise switches to the existing one) instead of navigating the current tab.
- `GlobalTopbar`'s existing `route === "/settings"` special-case (hiding itself on the settings route) goes away — the titlebar is chrome, always present regardless of which tab/route is active.
- `SettingsBackLink` (`SettingsPage.tsx`, currently `window.history.back()`) simplifies to `navigate("/")` in desktop mode — no per-tab back/forward stack (non-goal, see above).

## 5. Keyboard shortcuts / menu

`main.ts`'s `buildAppMenu()` gains a "Window" menu (Safari/Chrome convention), each item sent to the renderer over IPC and handled by `TabsProvider`:

| Menu item | Shortcut | Action |
|---|---|---|
| New Tab | ⌘T | open a new home tab, activate it |
| Close Tab | ⌘W | close the active tab (last tab → replaced by a home tab) |
| Show Next Tab | ⌘⇧] | activate the tab to the right, wrapping |
| Show Previous Tab | ⌘⇧[ | activate the tab to the left, wrapping |

`preload.ts` gains one read-only subscription channel, `desktopApi.tabs.onCommand(cb)`, gated by the existing `isPrivilegedOrigin` check (same tier as `credentials`/`externalApi`). No new writable IPC surface — the menu only announces intent; `TabsProvider` in the renderer owns all tab state mutation.

## 6. Web/browser mode

When `isDesktopRealtime() === false`: `App.tsx` takes its existing branch (`GlobalTopbar` + the single-route `Router`). `TabsProvider`/`DesktopTitlebar` never mount, `router.ts`'s `activeStore` stays `null` forever, and every existing behavior (including tests that exercise `router.ts`/`portTransport.ts`) is unchanged.

## Testing

- `router.ts`: unit tests for the store-swap indirection — `windowStore` behavior is unchanged when no active store is set; `navigate()`/`useRoute()`/`useQueryParam()` route to the active store when one is set.
- `tabsStore.ts`: unit tests for tab open/close/switch, last-tab-closed-reopens-home, localStorage round-trip (including malformed/missing state falling back to a single home tab).
- No new E2E/manual-only surface beyond what `verify`/manual desktop smoke-testing already covers for `pnpm dev:desktop`.
