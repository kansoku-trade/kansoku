#!/usr/bin/env python3
"""Symlink every first-party skill from .claude/skills into .agents/skills.

First-party = present in .claude/skills but not pinned in skills-lock.json.
Third-party installs (lock entries) are left untouched. Real-dir copies of
first-party skills are replaced — a copy is guaranteed to drift.
"""

import json
import os
import shutil
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def first_party() -> list[str]:
    with open(os.path.join(REPO, "skills-lock.json")) as f:
        lock = set(json.load(f)["skills"].keys())
    claude = set(os.listdir(os.path.join(REPO, ".claude", "skills")))
    return sorted(claude - lock)


def main() -> int:
    agents_root = os.path.join(REPO, ".agents", "skills")
    os.makedirs(agents_root, exist_ok=True)
    changed = 0
    for name in first_party():
        dst = os.path.join(agents_root, name)
        target = os.path.join("..", "..", ".claude", "skills", name)
        if os.path.islink(dst):
            if os.readlink(dst) == target:
                continue
            os.remove(dst)
        elif os.path.isdir(dst):
            shutil.rmtree(dst)
        os.symlink(target, dst)
        print(f"linked {name} -> {target}")
        changed += 1
    print(f"done: {changed} link(s) updated, {len(first_party())} first-party skills total")
    return 0


if __name__ == "__main__":
    sys.exit(main())
