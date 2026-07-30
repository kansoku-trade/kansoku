#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRO_DIR="$ROOT_DIR/apps/pro"

if [ -z "${KANSOKU_PRO_REPO_URL:-}" ]; then
  echo "fetch-pro: KANSOKU_PRO_REPO_URL is not set — nothing to fetch, staying in free mode" >&2
  exit 1
fi

# The workspace superproject makes apps/pro a linked worktree of kansoku-pro, whose .git is a file
# rather than a directory. The clone path below would fail on a non-empty dir and the pull path would
# move the checkout the superproject's pin refers to — neither belongs to this script.
if [ -e "$PRO_DIR/.git" ] && [ ! -d "$PRO_DIR/.git" ]; then
  echo "fetch-pro: apps/pro is a linked worktree — bootstrap.sh owns it here, refusing to touch it" >&2
  exit 1
fi

# With no ref the build tracks pro's default branch, which is what nightly and branch builds want.
# A release should pass the commit the workspace superproject pinned, so the artifact matches a
# combination that was actually verified. Nothing kept the two in step before: v0.30.0 shipped from
# a pro commit two ahead of the recorded pin, so reading the pin afterwards described a build that
# was never cut.
REF="${KANSOKU_PRO_REF:-}"

if [ -n "$REF" ]; then
  echo "fetch-pro: pinning apps/pro to $REF"
  if [ ! -d "$PRO_DIR/.git" ]; then
    git init -q "$PRO_DIR"
    git -C "$PRO_DIR" remote add origin "$KANSOKU_PRO_REPO_URL"
  fi
  # A bare commit SHA is not a ref, so `clone --branch` cannot take one. Asking for the object
  # directly is the cheap path and GitHub serves it, but a server with uploadpack.allowAnySHA1InWant
  # off (the default, including plain file:// remotes) refuses — fall back to the full history there
  # rather than leaving the pin unusable outside GitHub.
  if git -C "$PRO_DIR" fetch --depth 1 origin "$REF" 2>/dev/null; then
    git -C "$PRO_DIR" checkout -q --detach FETCH_HEAD
  else
    # --depth=2147483647 rather than a plain fetch: the attempt above leaves the repo marked shallow
    # even though it failed, and a shallow repo keeps that depth on every later fetch — the refs
    # would arrive while the commit the pin names stayed missing. It also beats --unshallow, which
    # is fatal on a repo that was never shallow.
    echo "fetch-pro: server would not serve $REF directly, fetching full history"
    git -C "$PRO_DIR" fetch --tags --depth=2147483647 origin '+refs/heads/*:refs/remotes/origin/*'
    git -C "$PRO_DIR" checkout -q --detach "$REF"
  fi
elif [ -d "$PRO_DIR/.git" ]; then
  echo "fetch-pro: apps/pro already present, pulling latest"
  git -C "$PRO_DIR" pull --ff-only
else
  echo "fetch-pro: cloning $KANSOKU_PRO_REPO_URL into apps/pro"
  git clone --depth 1 "$KANSOKU_PRO_REPO_URL" "$PRO_DIR"
fi

# Every "which pro was this built from" question ends up here, and the log used to record only that
# a fetch happened.
git -C "$PRO_DIR" --no-pager log -1 --format='fetch-pro: apps/pro at %H %s'
