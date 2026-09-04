#!/usr/bin/env python3
"""Two-way skill projection between .claude/skills and .agents/skills.

First-party skills (in .claude/skills, not pinned in skills-lock.json) are
symlinked into .agents/skills. Third-party installs (lock entries, restored
into .agents/skills by `skills experimental_install`, which creates no
.claude/skills projection itself) are symlinked back into .claude/skills so
the app dev runtime and Claude Code sessions can see them. Those projections
point into the git-ignored .agents/skills, so they must never be committed —
they are appended to the local git info/exclude instead of .gitignore.
Real-dir copies of first-party skills are replaced — a copy is guaranteed to
drift; real dirs colliding with lock names are left alone and reported.
"""

import json
import os
import shutil
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLAUDE_ROOT = os.path.join(REPO, ".claude", "skills")
AGENTS_ROOT = os.path.join(REPO, ".agents", "skills")
AGENTS_TARGET_PREFIX = os.path.join("..", "..", ".agents", "skills")


def locked() -> set[str]:
    with open(os.path.join(REPO, "skills-lock.json")) as f:
        return set(json.load(f)["skills"].keys())


def first_party() -> list[str]:
    names = set()
    for name in os.listdir(CLAUDE_ROOT):
        path = os.path.join(CLAUDE_ROOT, name)
        if os.path.islink(path) and os.readlink(path).startswith(AGENTS_TARGET_PREFIX):
            continue
        names.add(name)
    return sorted(names - locked())


def ensure_link(dst: str, target: str) -> bool:
    if os.path.islink(dst):
        if os.readlink(dst) == target and os.path.exists(dst):
            return False
        os.remove(dst)
    os.symlink(target, dst)
    return True


def sync_first_party() -> int:
    os.makedirs(AGENTS_ROOT, exist_ok=True)
    changed = 0
    for name in first_party():
        dst = os.path.join(AGENTS_ROOT, name)
        if not os.path.islink(dst) and os.path.isdir(dst):
            shutil.rmtree(dst)
        if ensure_link(dst, os.path.join("..", "..", ".claude", "skills", name)):
            print(f"linked .agents/skills/{name}")
            changed += 1
    return changed


def sync_third_party() -> int:
    changed = 0
    for name in sorted(locked()):
        dst = os.path.join(CLAUDE_ROOT, name)
        if not os.path.islink(dst) and os.path.exists(dst):
            print(f"skip {name}: .claude/skills/{name} is a real path, not touching it")
            continue
        if not os.path.isfile(os.path.join(AGENTS_ROOT, name, "SKILL.md")):
            print(f"skip {name}: not installed in .agents/skills (run pnpm skills:install)")
            continue
        if ensure_link(dst, os.path.join(AGENTS_TARGET_PREFIX, name)):
            print(f"linked .claude/skills/{name}")
            changed += 1
    return changed


CLAUDE_TARGET_PREFIX = os.path.join("..", "..", ".claude", "skills")


def prune_dangling() -> int:
    """Both projections rot, not just one.

    A skill that moves out of .claude/skills (an app-only skill relocating to
    packages/core/skills, say) leaves .agents/skills/<name> pointing at nothing,
    and nothing recreates or removes it — external agents then read a broken link.
    """
    removed = 0
    for root, label, prefix in (
        (CLAUDE_ROOT, ".claude/skills", AGENTS_TARGET_PREFIX),
        (AGENTS_ROOT, ".agents/skills", CLAUDE_TARGET_PREFIX),
    ):
        if not os.path.isdir(root):
            continue
        for name in os.listdir(root):
            dst = os.path.join(root, name)
            if not os.path.islink(dst):
                continue
            if not os.readlink(dst).startswith(prefix):
                continue
            if not os.path.exists(dst):
                os.remove(dst)
                print(f"pruned dangling {label}/{name}")
                removed += 1
    return removed


def exclude_projections() -> None:
    try:
        path = subprocess.run(
            ["git", "rev-parse", "--git-path", "info/exclude"],
            cwd=REPO,
            capture_output=True,
            text=True,
            check=True,
        ).stdout.strip()
        if not os.path.isabs(path):
            path = os.path.join(REPO, path)
        existing: set[str] = set()
        if os.path.isfile(path):
            with open(path) as f:
                existing = {line.strip() for line in f}
        os.makedirs(os.path.dirname(path), exist_ok=True)
        missing = [
            f".claude/skills/{name}"
            for name in sorted(locked())
            if f".claude/skills/{name}" not in existing
        ]
        if missing:
            with open(path, "a") as f:
                f.write("".join(f"{line}\n" for line in missing))
            print(f"excluded {len(missing)} projection(s) in local git info/exclude")
    except Exception as err:
        print(f"warning: could not update git info/exclude: {err}", file=sys.stderr)


def main() -> int:
    pruned = prune_dangling()
    changed = sync_first_party() + sync_third_party()
    exclude_projections()
    print(f"done: {changed} link(s) updated, {pruned} pruned")
    return 0


if __name__ == "__main__":
    sys.exit(main())
