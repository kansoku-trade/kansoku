# AI Platform Slim Refactor — Design Spec

Date: 2026-07-22  
Scope: `kansoku` monorepo (primary: `packages/core/src/ai`, pro AI surfaces, web chat shells; secondary: charts UI extract, LOC hygiene)  
Status: **draft for review** — no implementation until this document is approved  
Related prior work:

| Spec | What it already did |
| --- | --- |
| `2026-07-15-chat-unification-design.md` | Extracted `conversationEngine` + `conversationStore`; merged chart chat vs research chat lifecycle glue; shared `ChatComposer` |
| `2026-07-16-agent-tooling-unification-design.md` | Shared `buildResearchTools` + `SkillCatalogProvider`; chart/assistant/research tooling parity |
| `2026-07-20-core-src-domain-regroup-design.md` | Domain layout under `packages/core/src` (including `ai/` subdomains) |
| `2026-07-11-transport-core-refactor-design.md` | Dual transport (HTTP + IPC) over one core — **out of scope to redesign** |

This document is the **next wave**: stop AI surface proliferation, finish runner unification for one-shot personas/pro jobs, extract the remaining turn-assembly boilerplate, slim the frontend agent session shell, and isolate non-product LOC from "how big is the product" narratives.

---

## 1. Problem statement

Kansoku product TypeScript is on the order of ~70k lines (excluding tests). A large and still-growing share is an **AI agent platform** (runtime, multi-surface turn assembly, credentials, streaming UI, bench), not market/domain thickness.

Diagnosis (2026-07-22 scan):

| Bucket | Approx. lines | Notes |
| --- | ---: | --- |
| `packages/core/src/ai` | ~7.7k | Largest single core domain |
| Web AI UI (cockpit + assistant + research) | ~8.6k | Session shells, stream UX, settings credentials |
| Bench + report-ui | ~15k+ | Evaluation OS; not end-user product path |
| Analysis + marketdata + realtime | ~9k | Closer to "business" |
| Generated `credits.ts` | ~2.2k | Not hand-written product logic |
| Golden JSON fixtures | ~37k | Inflates repo / cloc, not runtime |

**What already improved**

- Multi-turn chat surfaces largely share `createConversationEngine`.
- Research tooling and skill catalog injection are partly shared.

**What still hurts**

1. **Turn assembly is still copy-pasted** on every surface that uses the engine: discipline load → system prompt → `prepareProAiTurn` → `MessagesEngine([pro…, SkillCatalog…])` → research tools merge.
2. **One-shot / job agents still roll their own runner**: analyst, commentator, deepDive, researchRefresh, eventFilter, chatSuggestions — each reimplements session create, timeout, optional gate/retry, event mapping.
3. **Product surface count keeps growing as new files**, not as modes on a stable skeleton (`researchChat`, `deepDive`, `researchRefresh`, `recap`, `scheduler`, …).
4. **Frontend** still has parallel stream/session orchestration between chart chat and full-page assistant.
5. **Perceived bloat** is worsened by counting bench, fixtures, and generated credits as "product code".

---

## 2. Goals and non-goals

### Goals

1. **One turn-assembly path** for every multi-turn conversation surface (chart chat, assistant, research chat, and any future peer).
2. **One job-runner path** for one-shot / scheduled / gated agent jobs (analyst, commentator, deepDive, researchRefresh, recap, eventFilter, suggestions).
3. **Hard product policy**: new AI capability = new **mode / tool pack / prompt**, not a new parallel stack file unless an exception is approved in a design note.
4. **Frontend**: one reusable agent-turn session hook + shared transcript primitives for chart and assistant UIs.
5. **Measurable slimness**: a product LOC dashboard that excludes bench, generated credits, and optional fixture blobs; CI or script can report it.
6. **Behavior parity**: contracts, HTTP/IPC routes, WS channel kinds, and user-visible streaming semantics stay stable unless a phase explicitly documents a break.

### Non-goals

- Rewriting pi-ai / pi-agent-core integration.
- Merging Longbridge credential store with AI credential store (different domains).
- Collapsing HTTP and IPC into one adapter generation system (transport tax stays; optional later phase only).
- Deleting bench, episode mode, or report UI.
- Rewriting SEPA / intraday / chanlun algorithms.
- Unifying discipline injection channel for analyst vs chat (analyst may keep MessagesEngine providers; document, do not force in phase 1).
- Merging SQLite session tables into one physical table (logical store factory already exists; schema migration is optional and late).
- Mass CSS redesign of the whole app (styles.css split is optional phase).
- Changing public/private repo boundaries or pro overlay rules.

---

## 3. Confirmed design decisions (proposed — confirm on review)

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Keep **two user-facing conversation products**: (A) chart-context chat, (B) global/document assistant family | Matches mental model; research-doc chat is (B) with document binding, not a third engine |
| D2 | Treat deepDive / researchRefresh / recap / scheduler as **jobs** on the job runner, not conversation engines | Different UX (fire-and-progress), same agent primitives |
| D3 | Extract `assembleAgentTurn(...)` (name bikeshed OK) as the single place that applies pro extension + skill catalog + default processors | Eliminates 5+ copy blocks today |
| D4 | Extract `createAgentJobRunner` (or extend conversation engine with a `mode: 'job'`) for one-shot gated runs | Stops persona/pro from forking lifecycle again |
| D5 | Thin wrappers `AnalystMessagesEngine` / `EpisodeMessagesEngine` become **presets** over `MessagesEngine`, not separate public classes long-term | Less indirection, same behavior |
| D6 | Do **not** merge desktop Longbridge `CredentialStore` with AI `credentialStore` | Name collision only; keep separate |
| D7 | Product LOC script defaults exclude: `packages/bench/**`, `packages/bench-report-ui/**`, `packages/shared/credits.ts`, `packages/shared/licenseText.ts`, `**/test/fixtures/**`, generated drizzle meta snapshots | Fixes narrative before large deletes |
| D8 | Phases ship behind green existing tests; each phase is independently mergeable | Avoid big-bang branch |

Open for review (pick one per row):

| # | Option A (recommended) | Option B |
| --- | --- | --- |
| O1 | Job runner is a **sibling** module next to `conversationEngine` | Job runner is a **mode flag** inside `conversationEngine` |
| O2 | Research chat stays in `apps/pro` as thin surface config | Research chat moves next to core assistant as a binding variant |
| O3 | Frontend shared hook lives under `apps/web/src/features/chat-session/` | Lives under `apps/web/src/features/cockpit/chat/` and assistant imports it |

Recommendation: **O1-A, O2-A (leave package placement), O3-A (neutral folder)**.

---

## 4. Target architecture

### 4.1 Runtime layers (core)

```text
┌─────────────────────────────────────────────────────────────┐
│  Surfaces (thin)                                            │
│  chart-chat │ assistant │ research-chat │ (future: config)│
└───────────────────────────┬─────────────────────────────────┘
                            │ assembleAgentTurn + store adapter
┌───────────────────────────▼─────────────────────────────────┐
│  conversationEngine   — multi-turn, busy lock, stream events │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  agentJobRunner       — one-shot / gate / retry / progress   │
│  (analyst, commentator, deepDive, refresh, recap, …)         │
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────┐
│  agentSession + tools + MessagesEngine presets               │
│  prepareProAiTurn · buildResearchTools · promptPolicy        │
└─────────────────────────────────────────────────────────────┘
```

**Rule:** Surfaces and jobs may only:

- choose model / layer label for usage logging,
- build **domain** system prompt body (before discipline compose),
- select **tool packs**,
- supply **session store adapter** or "ephemeral" for jobs,
- supply **gate** / progress hooks when needed.

They must not reimplement: run lock, partial stream state, default pro/skill processor wiring, failure persistence patterns (conversation), or timeout defaults (except override).

### 4.2 `assembleAgentTurn` (extract)

New module (proposed path):

`packages/core/src/ai/conversation/assembleAgentTurn.ts`

Responsibilities:

```ts
export interface AssembleAgentTurnInput {
  surface: ProAiTurnContext['surface'] | string; // extend pro-api union carefully
  sessionId: string;
  symbol?: string;
  market?: Market;
  repoRoot: string;
  exec?: ExecFn;
  extraProcessors?: MessageProcessor[];
  /** Domain tools already built by the surface (data pack, drawings, propose_edit, …) */
  domainTools: AgentTool[];
  /** When false, skip buildResearchTools (rare; default true for interactive) */
  includeResearchTools?: boolean;
  readMountsExtra?: FsReadMount[];
}

export interface AssembledAgentTurn {
  tools: AgentTool[];
  transformContext: (messages: AgentMessage[], signal?: AbortSignal) => Promise<AgentMessage[]>;
  onTurnComplete?: (messages: readonly AgentMessage[]) => void;
  skillIndex: SkillMeta[];
}
```

Implementation outline:

1. `prepareProAiTurn({ surface, sessionId, symbol, market })`.
2. `buildResearchTools({ repoRoot, exec, readMounts: [...pro.readMounts, ...extra] })` if enabled.
3. `new MessagesEngine([...pro.processors, ...extraProcessors, new SkillCatalogProvider(...)])`.
4. Return merged tools + `transformContext` + `onTurnComplete`.

**Migration targets (must call this, not hand-wire):**

- `ai/chat/chat.ts`
- `ai/assistant/assistantChat.ts`
- `apps/pro/src/ai/researchChat.ts`
- any other multi-turn surface added later

**Not required in first cut for jobs** that intentionally omit skill catalog (document if so); prefer still using assemble with flags rather than forking.

### 4.3 `createAgentJobRunner` (extract / simplify)

New module (proposed):

`packages/core/src/ai/agents/agentJobRunner.ts`

Covers the shared shape of analyst / commentator / deepDive / researchRefresh:

| Concern | Behavior |
| --- | --- |
| Create session | `createAgentSession({ model, systemPrompt, tools, transformContext })` |
| Run | `runTurn(prompt, timeoutMs)` |
| Optional gate | If `gate.answer()` null after first turn → retry instruction once → fail-closed message |
| Timeout | Map `AgentTimeoutError` to structured failure |
| Progress | Optional `onEvent` / tool wrappers (analyst already wraps exec) |
| Cleanup | Always dispose session |

```ts
export interface AgentJobPlan {
  systemPrompt: string;
  tools: AgentTool[];
  transformContext?: ConversationTurnPlan['transformContext'];
  prompt: string;
  gate?: ConversationTurnGate; // reuse type from conversationEngine
  timeoutMs?: number;
  onAfterMessages?: (messages: readonly AgentMessage[]) => void | Promise<void>;
}

export interface AgentJobRunner {
  run(plan: AgentJobPlan): Promise<AgentJobResult>;
}
```

**Migration order for jobs:**

1. `personas/analyst/run.ts` (gate + tools most complex — golden tests exist)
2. `personas/commentator.ts`
3. `apps/pro/src/ai/deepDive.ts`
4. `apps/pro/src/ai/researchRefresh.ts` (largest file; split plan build vs runner call in same phase)
5. `personas/eventFilter.ts`, `chat/chatSuggestions.ts` (simple one-shot)

**Explicit non-migration:** bench episode runner may keep its own session wrapper if parity tests are heavy; optionally adopt job runner in a late phase only.

### 4.4 MessagesEngine presets (simplify)

Today:

- `AnalystMessagesEngine` — wraps `MessagesEngine` + analyst-specific providers
- `EpisodeMessagesEngine` (pro bench) — similar

Target:

```ts
// packages/core/src/ai/conversation/messages/presets.ts
export function createAnalystMessagesEngine(config: AnalystMessagesEngineConfig): MessagesEngine
export function createEpisodeMessagesEngine(config: EpisodeMessagesEngineConfig): MessagesEngine
```

Deprecate class wrappers: re-export thin adapters for one release cycle if external imports exist (pro-api / pro only — grep before delete).

### 4.5 Product surface policy (process, not only code)

Add a short rule to `packages/core/src/ai/AGENTS.md` or root `CLAUDE.md` AI section:

> New interactive AI UX must register as a **surface config** on `conversationEngine` + `assembleAgentTurn`, or as a **job** on `agentJobRunner`.  
> Do not add a new top-level `*Chat.ts` / `*Session.ts` lifecycle.  
> Exceptions require a design note under `docs/superpowers/specs/`.

Surface registry (documentation table, not necessarily runtime):

| Surface id | Kind | Key | Package |
| --- | --- | --- | --- |
| `chart-chat` | conversation | chartId | core |
| `assistant` | conversation | sessionId | core |
| `research-chat` | conversation | document path | pro |
| `analyst` | job | symbol run | core |
| `commentator` | job | symbol/event | core |
| `deep-dive` | job | symbol | pro |
| `research-refresh` | job | document | pro |
| `recap` | job | date/symbols | pro |
| `chat-suggestions` | job | chart | core |
| `event-filter` | job | event | core |

### 4.6 Frontend extract

Proposed folder: `apps/web/src/features/agent-session/`

| Export | Role |
| --- | --- |
| `useAgentTurnSession` | subscribe init + events, busy/partial, abort, send; transport-agnostic via adapters |
| `smoothStream` helpers | move from cockpit/chat if not already shared |
| Re-export transcript helpers | timeline merge already partly shared — finish consolidation |

Adapters:

```ts
interface AgentTurnTransport {
  getState(key: string): Promise<{ busy: boolean; partial: string; messages: DisplayMessage[] }>;
  subscribe(key: string, onEvent: (e: ChatWsEvent) => void): () => void;
  send(key: string, text: string): Promise<void>;
  abort(key: string): Promise<void>;
}
```

Chart chat and assistant supply different transports (WS kind / IPC channel) but share hook logic.

**Out of scope for UI parity:** assistant session list, @mention, research edit review — stay feature-local.

### 4.7 Optional: charts host extract (secondary track)

Not blocking AI slim. When scheduled:

- `useLwChartHost` — create/destroy Lightweight Charts, resize, apply series
- `markerFilters` — pure functions currently inlined in `useIntradayCharts`
- Leave SEPA vs intraday domain series code in feature folders

### 4.8 LOC hygiene (isolate)

Add `scripts/product-loc.mjs` (or extend existing tooling):

**Default include:** `apps/*/src`, `packages/core/src`, `packages/shared` (except generated), `packages/pro-api`, pro worktree `src` if present.

**Default exclude:**

- `**/node_modules/**`, `**/dist/**`, `**/test/**`, `**/*.test.ts`
- `packages/bench/**`, `packages/bench-report-ui/**`
- `packages/shared/credits.ts`, `packages/shared/licenseText.ts`
- `**/fixtures/**`
- `packages/core/drizzle/meta/**`

Output: table by top-level domain + AI subdomain. Document in README or `docs/` that "product LOC" means this script, not raw cloc.

Optional later: stop committing `credits.ts` and generate in build — only if release/about page pipeline allows.

Optional later: golden fixtures as compressed artifacts or content-hashed blobs — separate design; do not block AI refactor.

---

## 5. Phased delivery

Each phase: implement → existing relevant tests green → optional new unit tests for extracted API → reviewable PR-sized commit series. Prefer not to mix phases in one PR.

### Phase 0 — Baseline metrics and policy (0.5 day)

- Add `scripts/product-loc.mjs` and sample output committed or documented.
- Add AI surface policy blurb to agent docs.
- Freeze: no new parallel chat lifecycle files while this program is open.

**Exit:** script runs in CI or `pnpm product-loc`; policy text merged.

### Phase 1 — `assembleAgentTurn` (1–2 days)

- Implement module + unit tests (pro extension on/off, skill catalog present, tools merge order).
- Migrate chart chat, assistant, research chat.
- Delete duplicated MessagesEngine construction blocks.

**Exit:** three surfaces call assemble; chat/assistant/research tests green; no behavior change in WS payloads.

### Phase 2 — `createAgentJobRunner` + analyst/commentator (2–3 days)

- Implement job runner with gate/retry parity to conversation engine semantics where applicable.
- Migrate analyst + commentator first (strong existing tests).
- Migrate eventFilter + chatSuggestions.

**Exit:** persona tests green; no user-visible change to analyst run events if contract frozen.

### Phase 3 — Pro jobs on job runner (2–4 days)

- Migrate deepDive, researchRefresh; optionally recap.
- Split `researchRefresh.ts` into `researchRefreshPlan.ts` (prompt/tools/doc) + thin `researchRefresh.ts` (runner entry) if still >400 lines after migration.
- Pro test suite green.

**Exit:** pro AI jobs share runner; no new hand-rolled `createAgentSession` in pro AI except bench (documented exception).

### Phase 4 — MessagesEngine presets (0.5–1 day)

- Replace class wrappers with factory presets; update imports in core + pro + bench.

**Exit:** grep shows no `new AnalystMessagesEngine` / `new EpisodeMessagesEngine` (or only deprecated aliases).

### Phase 5 — Frontend `useAgentTurnSession` (2–3 days)

- Extract hook + transports for chart chat and assistant.
- Keep visual CSS classes stable unless incidental.

**Exit:** streaming UX parity; existing web chat tests / manual smoke on desktop + web.

### Phase 6 — Secondary (optional backlog)

| Item | Priority |
| --- | --- |
| Chart `useLwChartHost` extract | Medium |
| Settings provider rows table-driven | Medium |
| styles.css split by feature | Low (hygiene) |
| `types.ts` domain split | Low |
| Fixture compression | Medium (repo size) |
| Transport descriptor codegen for IPC/HTTP | Low (high risk) |
| Physical DB session table merge | Avoid unless product needs |

---

## 6. Public API and compatibility

### Must not break without explicit version note

- `@kansoku/core` service methods used by server controllers and desktop IPC
- Contract types under `packages/core/src/contract`
- WS channel kinds and chat event shapes (`delta` / `tool` / `done` / `error` / `aborted`)
- Pro overlay entrypoints and `prepareProAiTurn` surface string union (extend carefully; do not rename existing values)
- Analyst run state / cockpit analyst UI events

### Allowed internal churn

- File moves within `ai/conversation/` and `ai/agents/`
- Private helpers inlined into assemble/job runner
- Test-only dependency injection hooks retained or renamed with test updates

### Pro / public boundary

- Job runner and assemble live in **public core** if free surfaces need them; pro-only prompts/tools stay in `apps/pro` (or pro worktree).
- Do not move license, memory mounts, or paid prompts into public core.

---

## 7. Testing strategy

| Layer | Requirement |
| --- | --- |
| Unit | `assembleAgentTurn`: processor order, empty pro extension, research tools flag |
| Unit | `agentJobRunner`: busy N/A, gate pass, gate fail-closed, timeout, onAfterMessages |
| Existing | `chat.test.ts`, `assistantChat.test.ts`, `conversationEngine.test.ts`, `analyst.test.ts`, `commentator.test.ts` |
| Pro | research chat / refresh / deepDive / scheduler tests as present |
| Manual smoke | Desktop: chart chat stream + abort; assistant page; one analyst run; one research refresh |
| Regression bar | Phase merge requires scoped test files green; full `verify.sh --typecheck` before pin-push if multi-repo |

Do not add large new golden JSON fixtures in this program.

---

## 8. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Subtle gate/retry drift in analyst or chart chat | Port tests first; compare event sequences; keep gate types shared |
| Pro surface strings mismatch in `prepareProAiTurn` | Centralize surface id constants; type against pro-api union |
| Over-abstracted "god" config object | Keep assemble + job runner as two APIs; surfaces stay explicit functions |
| Scope creep into bench / transport / CSS | Phases 0–5 only unless re-opened |
| Parallel work adds another `*Chat.ts` mid-refactor | Phase 0 policy + review checklist |
| Large PRs | One phase per PR series; no drive-by refactors |

---

## 9. Success metrics

After Phases 0–5:

1. **Zero** hand-built `new MessagesEngine([...prepareProAiTurn...])` blocks outside `assembleAgentTurn` (grep gate).
2. **Zero** new multi-turn lifecycle files; jobs use `agentJobRunner` except documented bench exception.
3. Chart chat / assistant / research chat each **≤ ~150 lines of surface-specific code** excluding prompts/tools domain logic (soft target; measure after extract).
4. `pnpm product-loc` published number used in size discussions instead of raw cloc 200k.
5. No intentional contract or WS breaks.
6. Subjective: adding a new one-shot agent is "plan + tools + prompt", not a new engine.

Non-metrics: absolute line count of the whole monorepo (bench/docs will still dominate raw cloc).

---

## 10. Implementation checklist (for later planning)

Use as the seed for a `writing-plans` / SDD plan after approval — not a substitute for task-level plans.

- [ ] Phase 0: product-loc script + AI surface policy
- [ ] Phase 1: `assembleAgentTurn` + migrate 3 conversation surfaces
- [ ] Phase 2: `agentJobRunner` + core personas/jobs
- [ ] Phase 3: pro jobs migration + refresh split
- [ ] Phase 4: MessagesEngine presets
- [ ] Phase 5: web `useAgentTurnSession`
- [ ] Phase 6+: backlog items only with separate go-ahead
- [ ] Final grep gates + product-loc snapshot in PR description
- [ ] Update this spec status to `approved` / `implemented` as phases land

---

## 11. Review questions for the owner

Please answer before implementation:

1. Confirm **D1–D8** (especially D1 two conversation products and D7 exclude list).
2. Choose **O1** job runner sibling vs mode (recommend sibling).
3. Is **researchRefresh** allowed to stay >500 lines temporarily if behavior-critical, or must Phase 3 include file split?
4. Should Phase 0 product-loc run in CI (soft warn) or docs-only first?
5. Any surface that must **never** get research tools / skill catalog via assemble defaults?
6. Priority: ship Phases 0–1 only first, or commit to 0–5 as one program?

---

## 12. Appendix — current duplication map (pre-refactor)

### Conversation surfaces (engine ✓, assemble ✗)

| File | Engine | Hand-wired pro+skills |
| --- | --- | --- |
| `packages/core/src/ai/chat/chat.ts` | yes | yes |
| `packages/core/src/ai/assistant/assistantChat.ts` | yes | yes |
| `apps/pro/src/ai/researchChat.ts` | yes | yes |

### Jobs (engine ✗)

| File | Notes |
| --- | --- |
| `packages/core/src/ai/personas/analyst/run.ts` | gate + AnalystMessagesEngine |
| `packages/core/src/ai/personas/commentator.ts` | retry prompt |
| `packages/core/src/ai/personas/eventFilter.ts` | single turn |
| `packages/core/src/ai/chat/chatSuggestions.ts` | single turn |
| `apps/pro/src/ai/deepDive.ts` | tools + MessagesEngine |
| `apps/pro/src/ai/researchRefresh.ts` | large job |
| `apps/pro/src/ai/recap.ts` | job-like |
| `apps/pro/src/ai/scheduler.ts` | orchestration around jobs |

### Frontend shells

| Area | Overlap |
| --- | --- |
| `features/cockpit/chat/useChatSession.ts` | stream + busy + events |
| `features/assistant/AssistantConversation.tsx` | parallel session UX |
| Shared already | `ChatComposer`, partial transcript helpers (from 2026-07-15) |

### Do not treat as AI slim targets

- `packages/shared/credits.ts` (generated)
- `packages/bench/**` (product-loc exclude)
- Longbridge protocol stack
- Dual IPC + HTTP adapters (architecture tax)

---

## 13. Document history

| Date | Change |
| --- | --- |
| 2026-07-22 | Initial draft from monorepo bloat scan + AI surface audit |
