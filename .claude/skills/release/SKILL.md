---
name: release
description: Use when the user wants to release a new desktop app version (发版 / release / 发布新版本) — bumps apps/desktop version, writes user-facing release notes into CHANGELOG.md, and opens the release PR that drives the automated tag → build → publish pipeline
---

# Desktop Release

Opens a version-bump PR for the Kansoku desktop app. Everything after the PR merge is automated:

```
this skill → release PR (ci.yml gates it) → merge to main
  → desktop-tag.yml creates desktop-vX.Y.Z + dispatches desktop-release.yml
  → build, sign, appcast, publish GitHub Release (notes from CHANGELOG.md)
  → users receive the Sparkle update
```

Optional argument: `patch` | `minor` | `major` — skips the bump suggestion step.

## Steps

### 1. Preflight (stop with an explanation if any fails)

```bash
git status --porcelain        # must be empty
git branch --show-current     # must be main
git fetch origin main && git rev-list --count main..origin/main   # must be 0
```

### 2. Collect what shipped

```bash
LAST_TAG=$(git describe --tags --match 'desktop-v*' --abbrev=0)
git log "$LAST_TAG"..HEAD --oneline -- apps/ packages/ patches/ scripts/
```

If `git describe` finds no tag, this is the first release — use the full history of those paths. If there are no commits touching `apps/`, `packages/`, `patches/`, or `scripts/` since the last tag, stop: nothing to release.

Read the actual diffs of significant commits when the one-line messages aren't enough to describe user-visible changes.

### 3. Decide the version

Current version: `node -p "require('./apps/desktop/package.json').version"`.

If the user passed `patch`/`minor`/`major`, apply it directly. Otherwise suggest one — any `feat` → minor, only fixes/refactors/chores → patch, breaking changes to user data or workflows → major — and **ask the user to confirm the version number before continuing**.

### 4. Write the release notes

Prepend a section to `apps/desktop/CHANGELOG.md` (below the file header, above the previous version's section):

```markdown
## X.Y.Z — YYYY-MM-DD

- 更新点……
```

Rules for the notes (they become the GitHub Release body verbatim, and users read them):

- 中文白话, user-facing. Describe what the user will notice, not what the code did. "图表页新增指标开关" not "refactor indicator pipeline".
- Skip internal-only changes (refactors, CI, tests) unless they change behavior users can feel (e.g. faster startup).
- A handful of bullet points; group related commits into one bullet.
- Tickers, CLI/API names, file paths stay in English; no finance jargon without a plain-Chinese gloss.

### 5. Bump the version

Update `version` in `apps/desktop/package.json` to the confirmed `X.Y.Z`.

### 6. Open the PR

```bash
git checkout -b release/desktop-vX.Y.Z
git add apps/desktop/package.json apps/desktop/CHANGELOG.md
git commit -m "release(desktop): vX.Y.Z"
git push -u origin release/desktop-vX.Y.Z
gh pr create --title "release(desktop): vX.Y.Z" --body "<release notes section>"
```

PR body = the new CHANGELOG section, plus one line noting that merging will auto-tag and publish the release.

### 7. Hand off

Show the PR link and remind: merge = release. After merge, `desktop-tag.yml` tags and dispatches `desktop-release.yml`; the release publishes automatically and the Sparkle feed goes live immediately.

Then switch back to main: `git checkout main`.

## Guards

- Never tag manually here — tagging is desktop-tag.yml's job after merge.
- Never skip the CHANGELOG section — desktop-release.yml fails the build if the `## X.Y.Z` section is missing.
- Version in package.json and the CHANGELOG heading must match exactly (CI cross-checks tag vs package.json).
