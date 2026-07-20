# core/src Domain Regroup — Design

Date: 2026-07-20
Scope: `packages/core/src` in `kansoku-trade/kansoku`
Status: approved design, pending implementation plan

## Goal

Reorganize `packages/core/src` (166 files, ~20k lines) from the current mixed
scheme (`services/` grab-bag + `modules/*.service.ts` + `ai/` monolith + loose
root files) into a pure domain-first top-level layout, then split files that
exceed the 500-line limit. This continues the domain regroup already applied to
`apps/desktop` (`boot/data/kernel/platform/shell`) and `apps/pro`.

## Decisions

1. **Pure domain top level.** Every top-level directory is a domain. The
   `services/` vs `modules/` split is dissolved; each `modules/X/X.service.ts`
   moves into its domain next to the logic it fronts.
2. **`ai/` remains one domain with subdomains.** It is ~1/3 of the package with
   dense internal imports; splitting it into several top-level domains would
   scatter shared runtime (models, prompts, usage, conversation store).
3. **`platform/` holds cross-cutting infrastructure** (mirrors desktop's
   `platform/`): files with no business meaning that many domains depend on.
4. **`realtime/` stays whole.** Channel definitions and transport mechanics
   stay together as the "realtime push" domain (13 files, 1.5k lines, already
   cohesive).
5. **Move first, split after — same effort, separate commits.** Phase 1 is a
   pure relocation (behavior-identical, verifiable by typecheck + tests).
   Phase 2 splits the oversized files.

## Target layout

```
packages/core/src/
  platform/     env, errors, secretCrypto, staleness, chartUrl
  contract/     (unchanged)
  db/           (unchanged: schema, index, snowflake)
  pro/          (unchanged)
  license/      license/* + modules/license/license.service
  realtime/     (unchanged)
  marketdata/   services/marketdata/* + longbridgeCli, longbridgeToken,
                session, events, watchedMarketsStore
  symbols/      symbol.utils, securityName + modules/symbols
  analysis/     intraday, sepa, candlePatterns, zones, fvg, indicators,
                macdStructure, pattern123, patternScoring, secondBreakout,
                dayLevels, optionsLevels, vwap, relvol, predictionRules,
                simple, history
  charts/       build, store, annotations + modules/charts, modules/annotations
  cockpit/      services/cockpit/* + modules/positions
  credentials/  services/credentials/* + opencli + modules/credentials
  research/     modules/research
  overview/     modules/overview
  health/       modules/health
  capabilities/ modules/capabilities
  ai/           see subdomains below
```

### `ai/` subdomains

```
ai/
  chat/          chat, chatStore, chatSuggestions + modules/chat
  assistant/     assistantChat, assistantChatStore + modules/assistant
  agents/        agentSession, agentTools, dataTools, researchLibraryTools,
                 datapack, runLock, verifyRead, skills, lessons
  personas/      analyst, commentator, comments, follows, notices, triggers,
                 eventFilter
  conversation/  conversationEngine, conversationShared, conversationStore,
                 messages/* (messageEngine, analystMessagesEngine, injectors,
                 sharedProviders)
  runtime/       models, modelsRuntime, usage, usageStore, prompts,
                 promptPolicy
  settings/      settingsStore, initAiSettings, credentialStore, secretBox
                 + modules/settings/* (settings.service, aiSettings.service,
                 settings.deps, settings.testConnection, settingsValidation)
  lobehub/       lobehub/* + modules/lobehub/*
```

Placement notes:

- `skills.ts` / `lessons.ts` read agent skill and lesson files — they serve the
  agent loop, hence `ai/agents/`.
- `eventFilter.ts` filters macro events using AI settings and is consumed by
  `marketdata/events.ts`; it stays in `ai/personas/` (cross-domain import is
  acceptable, direction: marketdata → ai).
- `secretCrypto.ts` (generic crypto helper) goes to `platform/`; `secretBox.ts`
  (AI credential encryption) stays beside `credentialStore` in `ai/settings/`.
- If during implementation `modules/settings` turns out to contain app-wide
  (non-AI) settings, promote it to a top-level `settings/` domain instead;
  everything else in the mapping is fixed.
- `X.service.ts` filenames keep their names after the move (e.g.
  `charts/charts.service.ts`); only directories change.

## Import strategy

- `package.json` keeps the `./*` wildcard export — no export map changes.
- ~150 external files import `@kansoku/core/<deep path>`. All internal relative
  imports and external deep imports are rewritten mechanically (ast-grep /
  scripted sed), verified by `tsc --noEmit` in core and every consumer package,
  plus `vitest run` in core.
- Consumers include `apps/pro` (worktree of kansoku-pro): its import updates
  are a separate commit in the pro repo, coordinated via the workspace pin flow.

## Phase 2 — file splits (after the move lands)

Files over the 500-line limit, split targets:

| File (post-move path) | Lines | Split direction |
| --- | --- | --- |
| `analysis/intraday.ts` | 1092 | orchestrator vs per-signal builders vs shared types |
| `ai/lobehub/gateway.ts` | 814 | transport/session vs request handlers |
| `ai/agents/agentTools.ts` | 619 | one file per tool group |
| `ai/personas/analyst.ts` | 616 | run loop vs output assembly |
| `analysis/candlePatterns.ts` | 548 | pattern detectors grouped by family |
| `analysis/sepa.ts` | 487 | near limit — split only if it grows during the move |

Each split is behavior-preserving: same exported API from a barrel or from the
original path, no logic edits mixed in.

## Verification

- Phase 1: `pnpm --filter @kansoku/core typecheck && pnpm --filter @kansoku/core test`,
  then typecheck all consumer packages (`desktop`, `pro`, `bench`, others that
  import core), then `./scripts/verify.sh --typecheck` at the workspace root.
- Phase 2: same, per split commit.

## Out of scope

- No logic changes, no renames beyond directory moves (except the splits).
- No changes to `contract/` shape or the public export map.
- No changes to `apps/pro` internals beyond import-path updates.
